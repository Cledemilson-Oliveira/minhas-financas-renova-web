import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const cleanRef=v=>String(v||"").replace(/[^A-Za-z0-9_-]/g,"_").slice(0,64);
const moneyString=v=>(Math.round((Number(v)||0)*100)/100).toFixed(2);
const normalizeStatus=value=>{const s=String(value||"pending").toLowerCase();if(s==="canceled")return "cancelled";return ["created","pending","at_terminal","processed","failed","cancelled","expired","refunded"].includes(s)?s:"pending"};
const mpErrorMessage=(data,status)=>{const detail=Array.isArray(data?.errors)?data.errors.map(item=>item?.message||item?.code).filter(Boolean).join(" • "):"";return String(data?.message||detail||data?.error||data?.code||`Mercado Pago HTTP ${status}`)};

async function mp(path,token,init={}){
  const headers=new Headers(init.headers||{});
  headers.set("Authorization",`Bearer ${token}`);
  headers.set("Content-Type","application/json");
  const res=await fetch(`https://api.mercadopago.com${path}`,{...init,headers});
  const data=await res.json().catch(()=>({}));
  return {res,data};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply({error:"method_not_allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const token=Deno.env.get("MP_POINT_ACCESS_TOKEN")||"";
  if(!supabaseUrl||!anonKey||!serviceKey)return reply({error:"backend_not_configured"},503);
  if(!token)return reply({error:"mercado_pago_point_not_configured",message:"MP_POINT_ACCESS_TOKEN ausente no backend."},503);

  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();
  const user=userData?.user;
  if(userError||!user?.id)return reply({error:"unauthorized"},401);

  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:access}=await admin.from("user_access").select("role,status").eq("user_id",user.id).maybeSingle();
  if(access?.status!=="ativo")return reply({error:"user_inactive"},403);
  if(access?.role!=="dono")return reply({error:"oauth_connection_required",message:"Conecte sua própria conta Mercado Pago antes de usar a Point."},409);

  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"create_order");

  try{
    if(action==="create_order"){
      const localTerminalId=String(body?.payment_terminal_id||"").trim();
      if(!localTerminalId)return reply({error:"payment_terminal_id_required"},400);

      const {data:terminal,error:terminalError}=await admin.from("payment_terminals")
        .select("id,connection_id,external_terminal_id,integration_mode,integration_status,is_active")
        .eq("id",localTerminalId).eq("user_id",user.id).eq("provider","mercado_pago").maybeSingle();
      if(terminalError||!terminal?.id)return reply({error:"terminal_not_found"},404);
      if(!terminal.is_active||terminal.integration_mode!=="mercado_pago_point"||terminal.integration_status!=="connected")return reply({error:"terminal_not_connected"},409);
      const externalTerminalId=String(terminal.external_terminal_id||"");
      if(!externalTerminalId)return reply({error:"external_terminal_id_missing"},409);

      const amount=Number(body?.amount||0);
      const description=String(body?.description||"Minhas Financas RENOVA - PIX").slice(0,120);
      const accountId=String(body?.account_id||"").trim();
      const categoryId=String(body?.category_id||"").trim()||null;
      if(!(amount>0))return reply({error:"invalid_amount"},400);
      if(!accountId)return reply({error:"account_id_required"},400);

      const {data:account}=await admin.from("accounts").select("id").eq("id",accountId).eq("user_id",user.id).eq("is_active",true).maybeSingle();
      if(!account?.id)return reply({error:"invalid_account"},400);
      if(categoryId){
        const {data:category}=await admin.from("categories").select("id").eq("id",categoryId).eq("user_id",user.id).maybeSingle();
        if(!category?.id)return reply({error:"invalid_category"},400);
      }

      const externalReference=cleanRef(body?.external_reference||`rnv_point_pix_${crypto.randomUUID()}`);
      const payload={
        type:"point",
        external_reference:externalReference,
        expiration_time:String(body?.expiration_time||"PT15M"),
        transactions:{payments:[{amount:moneyString(amount)}]},
        config:{point:{terminal_id:externalTerminalId,print_on_terminal:String(body?.print_on_terminal||"no_ticket")},payment_method:{default_type:"qr"}},
        description
      };

      const {res,data}=await mp("/v1/orders",token,{method:"POST",headers:{"X-Idempotency-Key":crypto.randomUUID()},body:JSON.stringify(payload)});
      if(!res.ok)return reply({error:"mercado_pago_error",message:mpErrorMessage(data,res.status),status:res.status,details:data},502);

      const providerPaymentId=String(data?.transactions?.payments?.[0]?.id||"")||null;
      const status=normalizeStatus(data?.status);
      const {data:order,error:dbError}=await admin.from("payment_orders").insert({
        user_id:user.id,provider:"mercado_pago",connection_id:terminal.connection_id||null,terminal_id:terminal.id,
        provider_order_id:String(data?.id||""),provider_payment_id:providerPaymentId,external_reference:externalReference,
        amount:Math.round(amount*100)/100,payment_method:"pix",installments:1,status,
        status_detail:String(data?.status_detail||data?.status||status),
        provider_data:{external_terminal_id:externalTerminalId,operating_mode:"PDV",order_status:String(data?.status||status),description,account_id:accountId,category_id:categoryId,payment_method_type:"qr"}
      }).select("id,provider_order_id,external_reference,status,transaction_id").single();
      if(dbError)return reply({error:"order_saved_with_provider_but_db_failed",provider_order:data,db_message:dbError.message},500);
      return reply({ok:true,order,provider_order:data});
    }

    if(action==="get_order"){
      const orderId=String(body?.order_id||"");
      if(!orderId)return reply({error:"order_id_required"},400);
      const {data:stored}=await admin.from("payment_orders").select("id,provider_data").eq("user_id",user.id).eq("provider","mercado_pago").eq("provider_order_id",orderId).maybeSingle();
      if(!stored?.id)return reply({error:"order_not_found"},404);
      const {res,data}=await mp(`/v1/orders/${encodeURIComponent(orderId)}`,token);
      if(!res.ok)return reply({error:"mercado_pago_error",message:mpErrorMessage(data,res.status),status:res.status,details:data},502);
      const status=normalizeStatus(data?.status);
      const {data:updated,error:updateError}=await admin.from("payment_orders").update({
        status,status_detail:String(data?.status_detail||data?.status||status),provider_payment_id:String(data?.transactions?.payments?.[0]?.id||"")||null,
        updated_at:new Date().toISOString(),provider_data:{...(stored.provider_data||{}),order_status:String(data?.status||status),payment_status:data?.transactions?.payments?.[0]?.status||null,provider_order:data,payment_method_type:"qr"}
      }).eq("id",stored.id).select("id,status,status_detail,transaction_id").single();
      if(updateError)return reply({error:"order_update_failed",message:updateError.message},500);
      return reply({ok:true,order:updated,provider_order:data});
    }

    if(action==="cancel_order"){
      const orderId=String(body?.order_id||"");
      if(!orderId)return reply({error:"order_id_required"},400);
      const {data:stored}=await admin.from("payment_orders").select("id").eq("user_id",user.id).eq("provider","mercado_pago").eq("provider_order_id",orderId).maybeSingle();
      if(!stored?.id)return reply({error:"order_not_found"},404);
      const {res,data}=await mp(`/v1/orders/${encodeURIComponent(orderId)}/cancel`,token,{method:"POST",headers:{"X-Idempotency-Key":crypto.randomUUID()}});
      if(!res.ok)return reply({error:"mercado_pago_error",message:mpErrorMessage(data,res.status),status:res.status,details:data},502);
      await admin.from("payment_orders").update({status:"cancelled",status_detail:String(data?.status_detail||"cancelled"),updated_at:new Date().toISOString()}).eq("id",stored.id);
      return reply({ok:true,provider_order:data});
    }

    return reply({error:"invalid_action"},400);
  }catch(error){
    return reply({error:"point_pix_integration_failed",message:error instanceof Error?error.message:String(error)},500);
  }
});
