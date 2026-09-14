import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const enc=new TextEncoder();
const b64url=(bytes)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const randomToken=(size=32)=>{const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return b64url(bytes)};
const sha256url=async(value)=>b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value))));
const safeReturnUrl=(value)=>{
  const fallback="https://minhasfinancas.servicosgold.com.br/";
  try{
    const url=new URL(String(value||fallback));
    const allowed=new Set(["minhasfinancas.servicosgold.com.br","cledemilson-oliveira.github.io"]);
    if(url.protocol!=="https:"||!allowed.has(url.hostname))return fallback;
    return `${url.origin}${url.pathname}${url.search}`;
  }catch{return fallback;}
};

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply({error:"method_not_allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const clientId=Deno.env.get("MP_POINT_CLIENT_ID")||"4583403024825492";
  const callbackUrl=Deno.env.get("MP_POINT_OAUTH_REDIRECT_URI")||`${supabaseUrl}/functions/v1/mercado-pago-oauth-callback`;
  if(!supabaseUrl||!anonKey||!serviceKey||!clientId)return reply({error:"backend_not_configured"},503);

  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();
  const user=userData?.user;
  if(userError||!user?.id)return reply({error:"unauthorized"},401);

  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:access}=await admin.from("user_access").select("status").eq("user_id",user.id).maybeSingle();
  if(access?.status!=="ativo")return reply({error:"user_inactive"},403);

  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"status");

  if(action==="status"){
    const {data:connection}=await admin.from("payment_provider_connections")
      .select("id,status,display_name,account_reference,metadata,updated_at")
      .eq("user_id",user.id).eq("provider","mercado_pago").eq("connection_type","oauth").maybeSingle();
    return reply({ok:true,connected:connection?.status==="connected",connection:connection||null});
  }

  if(action==="start"){
    const state=randomToken(32);
    const verifier=randomToken(64);
    const challenge=await sha256url(verifier);
    const returnUrl=safeReturnUrl(body?.return_url);
    await admin.from("payment_oauth_states").delete().eq("user_id",user.id).eq("provider","mercado_pago").lt("expires_at",new Date().toISOString());
    const expiresAt=new Date(Date.now()+10*60*1000).toISOString();
    const {error:stateError}=await admin.from("payment_oauth_states").insert({state,user_id:user.id,provider:"mercado_pago",code_verifier:verifier,return_url:returnUrl,expires_at:expiresAt});
    if(stateError)return reply({error:"oauth_state_save_failed",message:stateError.message},500);
    const url=new URL("https://auth.mercadopago.com/authorization");
    url.searchParams.set("client_id",clientId);
    url.searchParams.set("response_type","code");
    url.searchParams.set("platform_id","mp");
    url.searchParams.set("state",state);
    url.searchParams.set("redirect_uri",callbackUrl);
    url.searchParams.set("code_challenge",challenge);
    url.searchParams.set("code_challenge_method","S256");
    return reply({ok:true,authorization_url:url.toString(),redirect_uri:callbackUrl,expires_at:expiresAt});
  }

  if(action==="disconnect"){
    const {data:connection}=await admin.from("payment_provider_connections")
      .select("id").eq("user_id",user.id).eq("provider","mercado_pago").eq("connection_type","oauth").maybeSingle();
    if(connection?.id){
      await admin.from("payment_terminals").update({connection_id:null,integration_status:"pending",is_active:false,updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("connection_id",connection.id);
    }
    await admin.from("payment_oauth_credentials").delete().eq("user_id",user.id).eq("provider","mercado_pago");
    await admin.from("payment_oauth_states").delete().eq("user_id",user.id).eq("provider","mercado_pago");
    await admin.from("payment_provider_connections").delete().eq("user_id",user.id).eq("provider","mercado_pago").eq("connection_type","oauth");
    return reply({ok:true,disconnected:true});
  }

  return reply({error:"invalid_action"},400);
});