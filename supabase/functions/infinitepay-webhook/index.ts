import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const cents=(value:unknown)=>Math.round((Number(value)||0)*100);

async function paymentCheck(handle:string,orderNsu:string,transactionNsu:string,slug:string){
  const res=await fetch("https://api.checkout.infinitepay.io/payment_check",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({handle,order_nsu:orderNsu,transaction_nsu:transactionNsu,slug})
  });
  const data=await res.json().catch(()=>({}));
  return {res,data};
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return reply({success:false,message:"method_not_allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!supabaseUrl||!serviceKey)return reply({success:false,message:"backend_not_configured"},503);

  const payload=await req.json().catch(()=>({}));
  const orderNsu=String(payload?.order_nsu||"");
  const transactionNsu=String(payload?.transaction_nsu||"");
  const slug=String(payload?.invoice_slug||payload?.slug||"");
  if(!orderNsu||!transactionNsu||!slug)return reply({success:false,message:"missing_payment_reference"},400);

  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:order,error:orderError}=await admin.from("payment_orders")
    .select("id,user_id,connection_id,external_reference,amount,provider_data,status")
    .eq("provider","infinitepay")
    .eq("external_reference",orderNsu)
    .maybeSingle();
  if(orderError||!order?.id)return reply({success:false,message:"order_not_found"},400);

  const {data:connection,error:connectionError}=await admin.from("payment_provider_connections")
    .select("account_reference,status")
    .eq("id",order.connection_id)
    .eq("user_id",order.user_id)
    .eq("provider","infinitepay")
    .maybeSingle();
  if(connectionError||!connection?.account_reference)return reply({success:false,message:"connection_not_found"},400);

  const handle=String(connection.account_reference).replace(/^\$/," ").trim();
  const {res,data}=await paymentCheck(handle,orderNsu,transactionNsu,slug);
  if(!res.ok)return reply({success:false,message:"payment_check_failed"},400);
  const paid=Boolean(data?.success&&data?.paid);
  if(!paid)return reply({success:false,message:"payment_not_confirmed"},400);

  const expected=cents(order.amount);
  const verifiedAmount=Number(data?.amount||0);
  if(verifiedAmount!==expected)return reply({success:false,message:"amount_mismatch"},400);

  const capture=String(data?.capture_method||payload?.capture_method||"");
  await admin.from("payment_orders").update({
    status:"processed",
    status_detail:"webhook_verified_by_payment_check",
    provider_payment_id:transactionNsu,
    provider_order_id:slug,
    payment_method:capture==="pix"?"pix":"credito",
    installments:Math.max(1,Number(data?.installments||payload?.installments)||1),
    provider_data:{...(order.provider_data||{}),transaction_nsu:transactionNsu,invoice_slug:slug,receipt_url:payload?.receipt_url||null,capture_method:capture,webhook_payload:payload,payment_check:data,verified:true},
    updated_at:new Date().toISOString()
  }).eq("id",order.id);

  return reply({success:true,message:null});
});
