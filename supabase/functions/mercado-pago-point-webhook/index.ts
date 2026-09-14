import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const parseSig=(value:string)=>Object.fromEntries(value.split(",").map(v=>v.trim().split("=")).filter(v=>v.length===2));
const normalizeStatus=(value:unknown)=>{
  const s=String(value||"pending").toLowerCase();
  if(s==="canceled")return "cancelled";
  if(["created","pending","at_terminal","processed","failed","cancelled","expired","refunded"].includes(s))return s;
  return "pending";
};

async function hmac(secret:string,value:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function validSignature(req:Request,id:string,secret:string){
  const signature=parseSig(req.headers.get("x-signature")||"");
  const requestId=req.headers.get("x-request-id")||"";
  if(!signature.ts||!signature.v1||!requestId||!id)return false;
  const manifest=`id:${id};request-id:${requestId};ts:${signature.ts};`;
  return (await hmac(secret,manifest)).toLowerCase()===String(signature.v1).toLowerCase();
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return reply({error:"method_not_allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const accessToken=Deno.env.get("MP_ACCESS_TOKEN")||"";
  const secret=Deno.env.get("MP_WEBHOOK_SECRET")||"";
  if(!supabaseUrl||!serviceKey||!accessToken||!secret)return reply({error:"backend_not_configured"},503);

  const url=new URL(req.url);
  const payload=await req.json().catch(()=>({}));
  const type=String(payload?.type||url.searchParams.get("type")||"");
  const orderId=String(url.searchParams.get("data.id")||url.searchParams.get("data_id")||payload?.data?.id||"");

  if(type&&type!=="order")return reply({ok:true,ignored:true,type});
  if(!orderId)return reply({error:"missing_order_id"},400);
  if(!(await validSignature(req,orderId,secret).catch(()=>false)))return reply({error:"invalid_signature"},401);

  const providerResponse=await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`,{headers:{Authorization:`Bearer ${accessToken}`}});
  const providerOrder=await providerResponse.json().catch(()=>({}));
  if(!providerResponse.ok)return reply({error:"order_lookup_failed"},502);

  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:stored,error:storedError}=await admin.from("payment_orders")
    .select("id,provider_data,status")
    .eq("provider","mercado_pago")
    .eq("provider_order_id",orderId)
    .maybeSingle();

  if(storedError)return reply({error:"db_lookup_failed"},500);
  if(!stored?.id)return reply({ok:true,ignored:true,reason:"order_not_found"});

  const status=normalizeStatus(providerOrder?.status||payload?.data?.status);
  const action=String(payload?.action||"");
  const payment=providerOrder?.transactions?.payments?.[0]||{};

  const {error:updateError}=await admin.from("payment_orders").update({
    status,
    status_detail:String(providerOrder?.status_detail||payload?.data?.status_detail||action||status),
    provider_payment_id:String(payment?.id||"")||null,
    provider_data:{...(stored.provider_data||{}),order_status:String(providerOrder?.status||status),payment_status:payment?.status||null,webhook_action:action,webhook_payload:payload,provider_order:providerOrder,verified:true},
    updated_at:new Date().toISOString()
  }).eq("id",stored.id);

  if(updateError)return reply({error:"order_update_failed",message:updateError.message},500);
  return reply({ok:true,status});
});
