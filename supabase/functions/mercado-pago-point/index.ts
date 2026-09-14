import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const cleanRef=(v:string)=>v.replace(/[^A-Za-z0-9_-]/g,"_").slice(0,64);
const moneyString=(v:unknown)=>{const n=Math.round((Number(v)||0)*100)/100;return n.toFixed(2)};

async function mp(path:string,token:string,init:RequestInit={}){
  const headers=new Headers(init.headers||{});
  headers.set("Authorization",`Bearer ${token}`);
  headers.set("Content-Type","application/json");
  const res=await fetch(`https://api.mercadopago.com${path}`,{...init,headers});
  const data=await res.json().catch(()=>({}));
  return {res,data};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply({error:"method_not_allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const token=Deno.env.get("MP_ACCESS_TOKEN")||"";
  if(!supabaseUrl||!anonKey||!serviceKey)return reply({error:"backend_not_configured"},503);
  if(!token)return reply({error:"mercado_pago_not_configured",message:"MP_ACCESS_TOKEN ausente no backend."},503);

  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();
  const user=userData?.user;
  if(userError||!user?.id)return reply({error:"unauthorized"},401);

  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:access}=await admin.from("user_access").select("role,status").eq("user_id",user.id).maybeSingle();
  if(access?.status!=="ativo")return reply({error:"user_inactive"},403);

  // Enquanto o OAuth individual por usuário não estiver ativo, o token global do projeto
  // só pode operar na conta dono para impedir cobranças na conta Mercado Pago errada.
  if(access?.role!=="dono")return reply({error:"oauth_connection_required",message:"Conecte sua própria conta Mercado Pago antes de usar a Point."},409);

  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"list_terminals");

  try{
    if(action==="list_terminals"){
      const qs=new URLSearchParams({limit:String(Math.min(50,Math.max(1,Number(body?.limit)||50))),offset:String(Math.max(0,Number(body?.offset)||0))});
      if(body?.store_id)qs.set("store_id",String(body.store_id));
      if(body?.pos_id)qs.set("pos_id",String(body.pos_id));
      const {res,data}=await mp(`/terminals/v1/list?${qs.toString()}`,token);
      if(!res.ok)return reply({error:"mercado_pago_error",status:res.status,details:data},502);
      return reply({ok:true,...data});
    }

    if(action==="setup_terminal"){
      const terminalId=String(body?.terminal_id||"");
      const operatingMode=String(body?.operating_mode||"PDV").toUpperCase();
      if(!terminalId)return reply({error:"terminal_id_required"},400);
      if(!["PDV","STANDALONE"].includes(operatingMode))return reply({error:"invalid_operating_mode"},400);
      const {res,data}=await mp("/terminals/v1/setup",token,{method:"PATCH",body:JSON.stringify({terminals:[{id:terminalId,operating_mode:operatingMode}]})});
      if(!res.ok)return reply({error:"mercado_pago_error",status:res.status,details:data},502);
      return reply({ok:true,data});
    }

    if(action==="create_order"){
      const terminalId=String(body?.terminal_id||"");
      const amount=Number(body?.amount||0);
      const method=String(body?.payment_method||"credito");
      const installments=Math.max(1,Math.min(24,Number(body?.installments)||1));
      const description=String(body?.description||"Minhas Financas RENOVA").slice(0,120);
      if(!terminalId)return reply({error:"terminal_id_required"},400);
      if(!(amount>0))return reply({error:"invalid_amount"},400);
      if(!["credito","debito"].includes(method))return reply({error:"invalid_payment_method"},400);
      if(method==="debito"&&installments!==1)return reply({error:"debit_installments_not_allowed"},400);

      const externalReference=cleanRef(String(body?.external_reference||`rnv_point_${crypto.randomUUID()}`));
      const idempotencyKey=crypto.randomUUID();
      const providerMethod=method==="debito"?"debit_card":"credit_card";
      const payload={
        type:"point",
        external_reference:externalReference,
        expiration_time:String(body?.expiration_time||"PT15M"),
        transactions:{payments:[{amount:moneyString(amount)}]},
        config:{
          point:{terminal_id:terminalId,print_on_terminal:String(body?.print_on_terminal||"no_ticket")},
          payment_method:{default_type:providerMethod,default_installments:method==="debito"?1:installments,installments_cost:String(body?.installments_cost||"seller")}
        },
        description
      };
      const {res,data}=await mp("/v1/orders",token,{method:"POST",headers:{"X-Idempotency-Key":idempotencyKey},body:JSON.stringify(payload)});
      if(!res.ok)return reply({error:"mercado_pago_error",status:res.status,details:data},502);
      const providerPaymentId=String(data?.transactions?.payments?.[0]?.id||"")||null;
      const status=String(data?.status||"created").toLowerCase();
      const normalized=["created","at_terminal","processed","failed","cancelled","expired","refunded"].includes(status)?status:"pending";
      const {data:order,error:dbError}=await admin.from("payment_orders").insert({
        user_id:user.id,provider:"mercado_pago",provider_order_id:String(data?.id||""),provider_payment_id:providerPaymentId,
        external_reference:externalReference,amount:Math.round(amount*100)/100,payment_method:method,installments,status:normalized,
        status_detail:String(data?.status_detail||status),provider_data:{terminal_id:terminalId,operating_mode:"PDV",order_status:status}
      }).select("id,provider_order_id,external_reference,status").single();
      if(dbError)return reply({error:"order_saved_with_provider_but_db_failed",provider_order:data,db_message:dbError.message},500);
      return reply({ok:true,order,provider_order:data});
    }

    if(action==="get_order"){
      const orderId=String(body?.order_id||"");
      if(!orderId)return reply({error:"order_id_required"},400);
      const {res,data}=await mp(`/v1/orders/${encodeURIComponent(orderId)}`,token);
      if(!res.ok)return reply({error:"mercado_pago_error",status:res.status,details:data},502);
      const status=String(data?.status||"pending").toLowerCase();
      const normalized=["created","at_terminal","processed","failed","cancelled","expired","refunded"].includes(status)?status:"pending";
      await admin.from("payment_orders").update({status:normalized,status_detail:String(data?.status_detail||status),provider_payment_id:String(data?.transactions?.payments?.[0]?.id||"")||null,updated_at:new Date().toISOString(),provider_data:{terminal_id:data?.config?.point?.terminal_id||null,order_status:status,payment_status:data?.transactions?.payments?.[0]?.status||null}}).eq("user_id",user.id).eq("provider","mercado_pago").eq("provider_order_id",orderId);
      return reply({ok:true,provider_order:data});
    }

    if(action==="cancel_order"){
      const orderId=String(body?.order_id||"");
      if(!orderId)return reply({error:"order_id_required"},400);
      const {res,data}=await mp(`/v1/orders/${encodeURIComponent(orderId)}/cancel`,token,{method:"POST",headers:{"X-Idempotency-Key":crypto.randomUUID()}});
      if(!res.ok)return reply({error:"mercado_pago_error",status:res.status,details:data},502);
      await admin.from("payment_orders").update({status:"cancelled",status_detail:String(data?.status_detail||"cancelled"),updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("provider","mercado_pago").eq("provider_order_id",orderId);
      return reply({ok:true,provider_order:data});
    }

    return reply({error:"invalid_action"},400);
  }catch(error){
    return reply({error:"point_integration_failed",message:error instanceof Error?error.message:String(error)},500);
  }
});
