import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const cleanRef=(v)=>String(v||"").replace(/[^A-Za-z0-9_-]/g,"_").slice(0,64);
const moneyString=(v)=>{const n=Math.round((Number(v)||0)*100)/100;return n.toFixed(2)};
const normalizeStatus=(value)=>{const s=String(value||"pending").toLowerCase();if(s==="canceled")return "cancelled";return ["created","pending","at_terminal","processed","failed","cancelled","expired","refunded"].includes(s)?s:"pending"};
const mpErrorMessage=(data,status)=>{const detail=Array.isArray(data?.errors)?data.errors.map(item=>item?.message||item?.code).filter(Boolean).join(" • "):"";return String(data?.message||detail||data?.error_description||data?.error||data?.code||`Mercado Pago HTTP ${status}`)};

async function mp(path,token,init={}){
  const headers=new Headers(init.headers||{});headers.set("Authorization",`Bearer ${token}`);headers.set("Content-Type","application/json");
  const res=await fetch(`https://api.mercadopago.com${path}`,{...init,headers});const data=await res.json().catch(()=>({}));return {res,data};
}

async function refreshCredential(admin,credential){
  const clientId=Deno.env.get("MP_POINT_CLIENT_ID")||"4583403024825492";
  const clientSecret=Deno.env.get("MP_POINT_CLIENT_SECRET")||"";
  if(!credential?.refresh_token||!clientSecret)return null;
  const res=await fetch("https://api.mercadopago.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,grant_type:"refresh_token",refresh_token:credential.refresh_token})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok||!data?.access_token)return null;
  const expiresAt=new Date(Date.now()+Math.max(60,Number(data.expires_in)||15552000)*1000).toISOString();
  const now=new Date().toISOString();
  const updated={access_token:String(data.access_token),refresh_token:String(data.refresh_token||credential.refresh_token),token_type:String(data.token_type||credential.token_type||"bearer"),scope:String(data.scope||credential.scope||""),public_key:String(data.public_key||credential.public_key||"")||null,provider_user_id:String(data.user_id||credential.provider_user_id||"")||null,live_mode:data.live_mode===true,expires_at:expiresAt,updated_at:now};
  const {error}=await admin.from("payment_oauth_credentials").update(updated).eq("id",credential.id);
  if(error)return null;
  await admin.from("payment_provider_connections").update({status:"connected",account_reference:updated.provider_user_id,metadata:{oauth:true,live_mode:updated.live_mode,scope:updated.scope,token_expires_at:expiresAt,refreshed_at:now},updated_at:now}).eq("user_id",credential.user_id).eq("provider","mercado_pago").eq("connection_type","oauth");
  return {...credential,...updated};
}

async function resolveToken(admin,userId,role){
  const {data:credential}=await admin.from("payment_oauth_credentials").select("id,user_id,provider_user_id,access_token,refresh_token,token_type,scope,public_key,live_mode,expires_at").eq("user_id",userId).eq("provider","mercado_pago").maybeSingle();
  if(credential?.access_token){
    let active=credential;
    const expires=credential.expires_at?new Date(credential.expires_at).getTime():0;
    if(!expires||expires<Date.now()+7*24*60*60*1000){
      const refreshed=await refreshCredential(admin,credential);
      if(refreshed)active=refreshed;
      else if(expires&&expires<=Date.now())throw new Error("oauth_reconnect_required");
    }
    return {token:String(active.access_token),connectionType:"oauth",accountReference:String(active.provider_user_id||"")||null};
  }
  const platformToken=Deno.env.get("MP_POINT_ACCESS_TOKEN")||"";
  if(role==="dono"&&platformToken)return {token:platformToken,connectionType:"platform",accountReference:"conta_dono"};
  throw new Error("oauth_connection_required");
}

async function ensureConnection(admin,userId,context){
  const now=new Date().toISOString();
  const type=context.connectionType;
  const {data,error}=await admin.from("payment_provider_connections").upsert({user_id:userId,provider:"mercado_pago",connection_type:type,status:"connected",display_name:type==="oauth"?"Mercado Pago conectado":"Mercado Pago Point",account_reference:context.accountReference||null,metadata:{mode:"point",oauth:type==="oauth",operating_mode:"PDV",updated_at:now},updated_at:now},{onConflict:"user_id,provider,connection_type"}).select("id,status,display_name,account_reference").single();
  if(error||!data?.id)throw new Error(error?.message||"connection_save_failed");
  return data;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!supabaseUrl||!anonKey||!serviceKey)return reply({error:"backend_not_configured"},503);
  const auth=req.headers.get("Authorization")||"";const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();const user=userData?.user;if(userError||!user?.id)return reply({error:"unauthorized"},401);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:access}=await admin.from("user_access").select("role,status").eq("user_id",user.id).maybeSingle();if(access?.status!=="ativo")return reply({error:"user_inactive"},403);
  let context;try{context=await resolveToken(admin,user.id,access?.role)}catch(error){const code=String(error?.message||"");if(code==="oauth_connection_required"||code==="oauth_reconnect_required")return reply({error:code,message:code==="oauth_reconnect_required"?"Sua autorização Mercado Pago expirou. Conecte a conta novamente.":"Conecte sua conta Mercado Pago para usar a Point."},409);throw error;}
  const token=context.token;const body=await req.json().catch(()=>({}));const action=String(body?.action||"list_terminals");
  try{
    if(action==="list_terminals"){
      const qs=new URLSearchParams({limit:String(Math.min(50,Math.max(1,Number(body?.limit)||50))),offset:String(Math.max(0,Number(body?.offset)||0))});if(body?.store_id)qs.set("store_id",String(body.store_id));if(body?.pos_id)qs.set("pos_id",String(body.pos_id));
      const {res,data}=await mp(`/terminals/v1/list?${qs.toString()}`,token);if(!res.ok)return reply({error:"mercado_pago_error",message:mpErrorMessage(data,res.status),status:res.status,details:data},502);return reply({ok:true,...data});
    }
    if(action==="setup_terminal"){
      const terminalId=String(body?.terminal_id||"");const operatingMode=String(body?.operating_mode||"PDV").toUpperCase();if(!terminalId)return reply({error:"terminal_id_required"},400);if(!["PDV","STANDALONE"].includes(operatingMode))return reply({error:"invalid_operating_mode"},400);
      const {res,data}=await mp("/terminals/v1/setup",token,{method:"PATCH",body:JSON.stringify({terminals:[{id:terminalId,operating_mode:operatingMode}]})});if(!res.ok)return reply({error:"mercado_pago_error",message:mpErrorMessage(data,res.status),status:res.status,details:data},502);return reply({ok:true,data});
    }
    if(action==="connect_terminal"){
      const externalId=String(body?.terminal_id||body?.external_terminal_id||"").trim();if(!externalId)return reply({error:"terminal_id_required"},400);
      const {res:setupRes,data:setupData}=await mp("/terminals/v1/setup",token,{method:"PATCH",body:JSON.stringify({terminals:[{id:externalId,operating_mode:"PDV"}]})});if(!setupRes.ok)return reply({error:"mercado_pago_error",message:mpErrorMessage(setupData,setupRes.status),status:setupRes.status,details:setupData},502);
      const connection=await ensureConnection(admin,user.id,context);
      const {data:existing}=await admin.from("payment_terminals").select("id,debit_fee_percent,credit_fee_percent").eq("user_id",user.id).eq("provider","mercado_pago").eq("external_terminal_id",externalId).maybeSingle();
      const base={user_id:user.id,name:String(body?.name||`Point ${externalId.slice(-6)}`).slice(0,120),provider:"mercado_pago",external_terminal_id:externalId,connection_id:connection.id,integration_mode:"mercado_pago_point",integration_status:"connected",is_active:true,updated_at:new Date().toISOString()};
      let terminal=null;
      if(existing?.id){const update={...base};if(body?.debit_fee_percent!=null)update.debit_fee_percent=Math.max(0,Math.min(100,Number(body.debit_fee_percent)||0));if(body?.credit_fee_percent!=null)update.credit_fee_percent=Math.max(0,Math.min(100,Number(body.credit_fee_percent)||0));const result=await admin.from("payment_terminals").update(update).eq("id",existing.id).select("id,name,provider,external_terminal_id,integration_mode,integration_status,debit_fee_percent,credit_fee_percent").single();if(result.error)return reply({error:"terminal_save_failed",message:result.error.message},500);terminal=result.data;}else{const result=await admin.from("payment_terminals").insert({...base,debit_fee_percent:Math.max(0,Math.min(100,Number(body?.debit_fee_percent)||0)),credit_fee_percent:Math.max(0,Math.min(100,Number(body?.credit_fee_percent)||0))}).select("id,name,provider,external_terminal_id,integration_mode,integration_status,debit_fee_percent,credit_fee_percent").single();if(result.error)return reply({error:"terminal_save_failed",message:result.error.message},500);terminal=result.data;}
      return reply({ok:true,connection,terminal,setup:setupData});
    }
    if(action==="create_order"){
      const localTerminalId=String(body?.payment_terminal_id||"").trim();if(!localTerminalId)return reply({error:"payment_terminal_id_required"},400);
      const {data:terminal,error:terminalError}=await admin.from("payment_terminals").select("id,connection_id,external_terminal_id,integration_mode,integration_status,is_active").eq("id",localTerminalId).eq("user_id",user.id).eq("provider","mercado_pago").maybeSingle();if(terminalError||!terminal?.id)return reply({error:"terminal_not_found"},404);if(!terminal.is_active||terminal.integration_mode!=="mercado_pago_point"||terminal.integration_status!=="connected")return reply({error:"terminal_not_connected"},409);
      const externalTerminalId=String(terminal.external_terminal_id||"");if(!externalTerminalId)return reply({error:"external_terminal_id_missing"},409);
      const amount=Number(body?.amount||0);const method=String(body?.payment_method||"credito");const installments=Math.max(1,Math.min(24,Number(body?.installments)||1));const description=String(body?.description||"Minhas Financas RENOVA").slice(0,120);const accountId=String(body?.account_id||"").trim();const categoryId=String(body?.category_id||"").trim()||null;
      if(!(amount>0))return reply({error:"invalid_amount"},400);if(!["credito","debito","pix"].includes(method))return reply({error:"invalid_payment_method"},400);if(method!=="credito"&&installments!==1)return reply({error:"installments_not_allowed"},400);if(!accountId)return reply({error:"account_id_required"},400);
      const {data:account}=await admin.from("accounts").select("id").eq("id",accountId).eq("user_id",user.id).eq("is_active",true).maybeSingle();if(!account?.id)return reply({error:"invalid_account"},400);if(categoryId){const {data:category}=await admin.from("categories").select("id").eq("id",categoryId).eq("user_id",user.id).maybeSingle();if(!category?.id)return reply({error:"invalid_category"},400);}
      const externalReference=cleanRef(String(body?.external_reference||`rnv_point_${crypto.randomUUID()}`));const idempotencyKey=crypto.randomUUID();const providerMethod=method==="debito"?"debit_card":method==="pix"?"qr":"credit_card";const paymentMethod={default_type:providerMethod};if(method==="credito"){paymentMethod.default_installments=installments;paymentMethod.installments_cost=String(body?.installments_cost||"seller");}
      const payload={type:"point",external_reference:externalReference,expiration_time:String(body?.expiration_time||"PT15M"),transactions:{payments:[{amount:moneyString(amount)}]},config:{point:{terminal_id:externalTerminalId,print_on_terminal:String(body?.print_on_terminal||"no_ticket")},payment_method:paymentMethod},description};
      const {res,data}=await mp("/v1/orders",token,{method:"POST",headers:{"X-Idempotency-Key":idempotencyKey},body:JSON.stringify(payload)});if(!res.ok)return reply({error:"mercado_pago_error",message:mpErrorMessage(data,res.status),status:res.status,details:data},502);
      const providerPaymentId=String(data?.transactions?.payments?.[0]?.id||"")||null;const status=normalizeStatus(data?.status);const {data:order,error:dbError}=await admin.from("payment_orders").insert({user_id:user.id,provider:"mercado_pago",connection_id:terminal.connection_id||null,terminal_id:terminal.id,provider_order_id:String(data?.id||""),provider_payment_id:providerPaymentId,external_reference:externalReference,amount:Math.round(amount*100)/100,payment_method:method,installments:method==="credito"?installments:1,status,status_detail:String(data?.status_detail||data?.status||status),provider_data:{external_terminal_id:externalTerminalId,operating_mode:"PDV",order_status:String(data?.status||status),description,account_id:accountId,category_id:categoryId,oauth:context.connectionType==="oauth"}}).select("id,provider_order_id,external_reference,status,transaction_id").single();if(dbError)return reply({error:"order_saved_with_provider_but_db_failed",provider_order:data,db_message:dbError.message},500);return reply({ok:true,order,provider_order:data});
    }
    if(action==="get_order"){
      const orderId=String(body?.order_id||"");if(!orderId)return reply({error:"order_id_required"},400);const {data:stored}=await admin.from("payment_orders").select("id,provider_data").eq("user_id",user.id).eq("provider","mercado_pago").eq("provider_order_id",orderId).maybeSingle();if(!stored?.id)return reply({error:"order_not_found"},404);
      const {res,data}=await mp(`/v1/orders/${encodeURIComponent(orderId)}`,token);if(!res.ok)return reply({error:"mercado_pago_error",message:mpErrorMessage(data,res.status),status:res.status,details:data},502);const status=normalizeStatus(data?.status);const {data:updated,error:updateError}=await admin.from("payment_orders").update({status,status_detail:String(data?.status_detail||data?.status||status),provider_payment_id:String(data?.transactions?.payments?.[0]?.id||"")||null,updated_at:new Date().toISOString(),provider_data:{...(stored.provider_data||{}),external_terminal_id:data?.config?.point?.terminal_id||stored.provider_data?.external_terminal_id||null,order_status:String(data?.status||status),payment_status:data?.transactions?.payments?.[0]?.status||null,provider_order:data}}).eq("id",stored.id).select("id,status,status_detail,transaction_id").single();if(updateError)return reply({error:"order_update_failed",message:updateError.message},500);return reply({ok:true,order:updated,provider_order:data});
    }
    if(action==="cancel_order"){
      const orderId=String(body?.order_id||"");if(!orderId)return reply({error:"order_id_required"},400);const {data:stored}=await admin.from("payment_orders").select("id").eq("user_id",user.id).eq("provider","mercado_pago").eq("provider_order_id",orderId).maybeSingle();if(!stored?.id)return reply({error:"order_not_found"},404);
      const {res,data}=await mp(`/v1/orders/${encodeURIComponent(orderId)}/cancel`,token,{method:"POST",headers:{"X-Idempotency-Key":crypto.randomUUID()}});if(!res.ok)return reply({error:"mercado_pago_error",message:mpErrorMessage(data,res.status),status:res.status,details:data},502);await admin.from("payment_orders").update({status:"cancelled",status_detail:String(data?.status_detail||"cancelled"),updated_at:new Date().toISOString()}).eq("id",stored.id);return reply({ok:true,provider_order:data});
    }
    return reply({error:"invalid_action"},400);
  }catch(error){return reply({error:"point_integration_failed",message:error instanceof Error?error.message:String(error)},500);}
});