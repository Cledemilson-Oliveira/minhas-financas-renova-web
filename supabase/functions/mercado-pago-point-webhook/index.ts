import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const parseSig=(value)=>Object.fromEntries(String(value||"").split(",").map(v=>v.trim().split("=")).filter(v=>v.length===2));
const normalizeStatus=(value)=>{const s=String(value||"pending").toLowerCase();if(s==="canceled")return "cancelled";return ["created","pending","at_terminal","processed","failed","cancelled","expired","refunded"].includes(s)?s:"pending"};
async function hmac(secret,value){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));return Array.from(new Uint8Array(signature)).map(b=>b.toString(16).padStart(2,"0")).join("")}
async function validSignature(req,id,secret){const signature=parseSig(req.headers.get("x-signature")||"");const requestId=req.headers.get("x-request-id")||"";if(!signature.ts||!signature.v1||!requestId||!id)return false;const manifest=`id:${id};request-id:${requestId};ts:${signature.ts};`;return (await hmac(secret,manifest)).toLowerCase()===String(signature.v1).toLowerCase()}

async function refreshCredential(admin,credential){
  const clientId=Deno.env.get("MP_POINT_CLIENT_ID")||"4583403024825492";const clientSecret=Deno.env.get("MP_POINT_CLIENT_SECRET")||"";if(!credential?.refresh_token||!clientSecret)return null;
  const res=await fetch("https://api.mercadopago.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,grant_type:"refresh_token",refresh_token:credential.refresh_token})});const data=await res.json().catch(()=>({}));if(!res.ok||!data?.access_token)return null;
  const expiresAt=new Date(Date.now()+Math.max(60,Number(data.expires_in)||15552000)*1000).toISOString();const now=new Date().toISOString();const updated={access_token:String(data.access_token),refresh_token:String(data.refresh_token||credential.refresh_token),token_type:String(data.token_type||credential.token_type||"bearer"),scope:String(data.scope||credential.scope||""),public_key:String(data.public_key||credential.public_key||"")||null,provider_user_id:String(data.user_id||credential.provider_user_id||"")||null,live_mode:data.live_mode===true,expires_at:expiresAt,updated_at:now};
  const {error}=await admin.from("payment_oauth_credentials").update(updated).eq("id",credential.id);if(error)return null;await admin.from("payment_provider_connections").update({status:"connected",account_reference:updated.provider_user_id,metadata:{oauth:true,live_mode:updated.live_mode,scope:updated.scope,token_expires_at:expiresAt,refreshed_at:now},updated_at:now}).eq("user_id",credential.user_id).eq("provider","mercado_pago").eq("connection_type","oauth");return {...credential,...updated};
}
async function resolveToken(admin,userId){
  const {data:credential}=await admin.from("payment_oauth_credentials").select("id,user_id,provider_user_id,access_token,refresh_token,token_type,scope,public_key,live_mode,expires_at").eq("user_id",userId).eq("provider","mercado_pago").maybeSingle();
  if(credential?.access_token){let active=credential;const expires=credential.expires_at?new Date(credential.expires_at).getTime():0;if(!expires||expires<Date.now()+7*24*60*60*1000){const refreshed=await refreshCredential(admin,credential);if(refreshed)active=refreshed;else if(expires&&expires<=Date.now())return null;}return String(active.access_token);}
  const {data:access}=await admin.from("user_access").select("role").eq("user_id",userId).maybeSingle();const platformToken=Deno.env.get("MP_POINT_ACCESS_TOKEN")||"";if(access?.role==="dono"&&platformToken)return platformToken;return null;
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";const secret=Deno.env.get("MP_POINT_WEBHOOK_SECRET")||"";if(!supabaseUrl||!serviceKey||!secret)return reply({error:"backend_not_configured"},503);
  const url=new URL(req.url);const payload=await req.json().catch(()=>({}));const type=String(payload?.type||url.searchParams.get("type")||"");const orderId=String(url.searchParams.get("data.id")||url.searchParams.get("data_id")||payload?.data?.id||"");
  if(type&&type!=="order")return reply({ok:true,ignored:true,type});if(!orderId)return reply({error:"missing_order_id"},400);if(!(await validSignature(req,orderId,secret).catch(()=>false)))return reply({error:"invalid_signature"},401);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:stored,error:storedError}=await admin.from("payment_orders").select("id,user_id,provider_data,status").eq("provider","mercado_pago").eq("provider_order_id",orderId).maybeSingle();if(storedError)return reply({error:"db_lookup_failed"},500);if(!stored?.id)return reply({ok:true,ignored:true,reason:"order_not_found"});
  const accessToken=await resolveToken(admin,stored.user_id);if(!accessToken)return reply({error:"seller_oauth_unavailable",message:"Não foi possível obter a autorização Mercado Pago do vendedor."},409);
  const providerResponse=await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`,{headers:{Authorization:`Bearer ${accessToken}`}});const providerOrder=await providerResponse.json().catch(()=>({}));if(!providerResponse.ok)return reply({error:"order_lookup_failed",status:providerResponse.status},502);
  const status=normalizeStatus(providerOrder?.status||payload?.data?.status);const action=String(payload?.action||"");const payment=providerOrder?.transactions?.payments?.[0]||{};
  const {error:updateError}=await admin.from("payment_orders").update({status,status_detail:String(providerOrder?.status_detail||payload?.data?.status_detail||action||status),provider_payment_id:String(payment?.id||"")||null,provider_data:{...(stored.provider_data||{}),order_status:String(providerOrder?.status||status),payment_status:payment?.status||null,webhook_action:action,webhook_payload:payload,provider_order:providerOrder,verified:true},updated_at:new Date().toISOString()}).eq("id",stored.id);
  if(updateError)return reply({error:"order_update_failed",message:updateError.message},500);return reply({ok:true,status});
});