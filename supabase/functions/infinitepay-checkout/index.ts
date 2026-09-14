import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const cents=(value:unknown)=>Math.round((Number(value)||0)*100);
const normalizeHandle=(value:unknown)=>String(value||"").trim().replace(/^\$/," ").trim().replace(/[^A-Za-z0-9._-]/g,"").slice(0,80);
const cleanRef=(value:string)=>value.replace(/[^A-Za-z0-9_-]/g,"_").slice(0,100);

async function infinite(path:string,init:RequestInit={}){
  const headers=new Headers(init.headers||{});
  headers.set("Content-Type","application/json");
  const res=await fetch(`https://api.checkout.infinitepay.io${path}`,{...init,headers});
  const data=await res.json().catch(()=>({}));
  return {res,data};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply({error:"method_not_allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const appUrl=Deno.env.get("APP_PUBLIC_URL")||"https://minhasfinancas.servicosgold.com.br/";
  if(!supabaseUrl||!anonKey||!serviceKey)return reply({error:"backend_not_configured"},503);

  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();
  const user=userData?.user;
  if(userError||!user?.id)return reply({error:"unauthorized"},401);

  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:access}=await admin.from("user_access").select("status").eq("user_id",user.id).maybeSingle();
  if(access?.status!=="ativo")return reply({error:"user_inactive"},403);

  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"create_checkout");

  if(action==="save_connection"){
    const handle=normalizeHandle(body?.handle);
    if(!handle)return reply({error:"infinitepay_handle_required"},400);
    const {data,error}=await admin.from("payment_provider_connections").upsert({
      user_id:user.id,
      provider:"infinitepay",
      connection_type:"checkout",
      status:"connected",
      display_name:`InfinitePay • $${handle}`,
      account_reference:handle,
      metadata:{integration:"checkout",updated_by:"user"},
      updated_at:new Date().toISOString()
    },{onConflict:"user_id,provider,connection_type"}).select("id,provider,connection_type,status,display_name,account_reference").single();
    if(error)return reply({error:"connection_save_failed",message:error.message},500);
    return reply({ok:true,connection:data});
  }

  let connectionQuery=admin.from("payment_provider_connections").select("id,status,account_reference,metadata").eq("user_id",user.id).eq("provider","infinitepay").eq("connection_type","checkout");
  if(body?.connection_id)connectionQuery=connectionQuery.eq("id",String(body.connection_id));
  const {data:connection,error:connectionError}=await connectionQuery.eq("status","connected").maybeSingle();
  if(connectionError||!connection?.id)return reply({error:"infinitepay_connection_required",message:"Cadastre sua InfiniteTag antes de usar o Checkout Integrado."},409);
  const handle=normalizeHandle(connection.account_reference);
  if(!handle)return reply({error:"invalid_infinitepay_handle"},409);

  if(action==="create_checkout"){
    const amount=Number(body?.amount||0);
    const description=String(body?.description||"Recebimento Minhas Finanças RENOVA").trim().slice(0,120);
    if(!(amount>0))return reply({error:"invalid_amount"},400);
    const amountCents=cents(amount);
    if(amountCents<1)return reply({error:"invalid_amount"},400);

    const externalReference=cleanRef(String(body?.external_reference||`rnv_inf_${crypto.randomUUID()}`));
    const redirectUrl=String(body?.redirect_url||appUrl).slice(0,500);
    const webhookUrl=`${supabaseUrl}/functions/v1/infinitepay-webhook`;
    const customer=body?.customer&&typeof body.customer==="object"?body.customer:null;

    const {data:order,error:orderError}=await admin.from("payment_orders").insert({
      user_id:user.id,
      provider:"infinitepay",
      connection_id:connection.id,
      external_reference:externalReference,
      amount:Math.round(amount*100)/100,
      payment_method:null,
      installments:1,
      status:"created",
      status_detail:"checkout_link_creating",
      provider_data:{description,account_id:body?.account_id||null,category_id:body?.category_id||null}
    }).select("id,external_reference,status").single();
    if(orderError||!order?.id)return reply({error:"order_create_failed",message:orderError?.message},500);

    const payload:any={
      handle,
      redirect_url:redirectUrl,
      webhook_url:webhookUrl,
      order_nsu:externalReference,
      items:[{quantity:1,price:amountCents,description}]
    };
    if(customer){
      payload.customer={};
      if(customer.name)payload.customer.name=String(customer.name).slice(0,120);
      if(customer.email)payload.customer.email=String(customer.email).slice(0,160);
      if(customer.phone_number)payload.customer.phone_number=String(customer.phone_number).slice(0,32);
    }

    const {res,data}=await infinite("/links",{method:"POST",body:JSON.stringify(payload)});
    if(!res.ok||!data?.url){
      await admin.from("payment_orders").update({status:"failed",status_detail:`infinitepay_http_${res.status}`,provider_data:{description,error:data},updated_at:new Date().toISOString()}).eq("id",order.id);
      return reply({error:"infinitepay_error",status:res.status,details:data},502);
    }

    await admin.from("payment_orders").update({
      status:"pending",
      status_detail:"checkout_link_created",
      provider_data:{description,checkout_url:String(data.url),account_id:body?.account_id||null,category_id:body?.category_id||null},
      updated_at:new Date().toISOString()
    }).eq("id",order.id);

    return reply({ok:true,order:{...order,status:"pending"},checkout_url:String(data.url),external_reference:externalReference});
  }

  if(action==="payment_check"){
    let orderQuery=admin.from("payment_orders").select("id,external_reference,amount,provider_data").eq("user_id",user.id).eq("provider","infinitepay");
    if(body?.order_id)orderQuery=orderQuery.eq("id",String(body.order_id));
    else if(body?.external_reference)orderQuery=orderQuery.eq("external_reference",String(body.external_reference));
    else return reply({error:"order_reference_required"},400);
    const {data:order,error:orderError}=await orderQuery.maybeSingle();
    if(orderError||!order?.id)return reply({error:"order_not_found"},404);

    const transactionNsu=String(body?.transaction_nsu||order.provider_data?.transaction_nsu||"");
    const slug=String(body?.slug||order.provider_data?.invoice_slug||"");
    if(!transactionNsu||!slug)return reply({error:"transaction_nsu_and_slug_required"},400);

    const {res,data}=await infinite("/payment_check",{method:"POST",body:JSON.stringify({handle,order_nsu:order.external_reference,transaction_nsu:transactionNsu,slug})});
    if(!res.ok)return reply({error:"infinitepay_error",status:res.status,details:data},502);
    const paid=Boolean(data?.success&&data?.paid);
    const expected=cents(order.amount);
    const verifiedAmount=Number(data?.amount||0);
    if(paid&&verifiedAmount!==expected)return reply({error:"amount_mismatch",expected,received:verifiedAmount},409);

    await admin.from("payment_orders").update({
      status:paid?"processed":"pending",
      status_detail:paid?"payment_verified":"payment_not_confirmed",
      provider_payment_id:transactionNsu,
      provider_order_id:slug,
      payment_method:String(data?.capture_method||"")==="pix"?"pix":"credito",
      installments:Math.max(1,Number(data?.installments)||1),
      provider_data:{...(order.provider_data||{}),transaction_nsu:transactionNsu,invoice_slug:slug,receipt_url:body?.receipt_url||order.provider_data?.receipt_url||null,payment_check:data},
      updated_at:new Date().toISOString()
    }).eq("id",order.id);

    return reply({ok:true,paid,verification:data});
  }

  return reply({error:"invalid_action"},400);
});
