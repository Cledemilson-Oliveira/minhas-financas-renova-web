import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const FALLBACK_URL="https://minhasfinancas.servicosgold.com.br/";
const safeReturnUrl=(value="")=>{
  try{
    const url=new URL(String(value||FALLBACK_URL));
    const allowed=new Set(["minhasfinancas.servicosgold.com.br","cledemilson-oliveira.github.io"]);
    if(url.protocol!=="https:"||!allowed.has(url.hostname))return FALLBACK_URL;
    return `${url.origin}${url.pathname}${url.search}`;
  }catch{return FALLBACK_URL;}
};
const redirectResult=(returnUrl,ok,message)=>{
  const target=new URL(safeReturnUrl(returnUrl));
  target.searchParams.set("mp_oauth",ok?"success":"error");
  target.searchParams.set("mp_oauth_message",String(message||"").slice(0,240));
  return new Response(null,{status:303,headers:{
    "Location":target.toString(),
    "Cache-Control":"no-store, no-cache, must-revalidate",
    "Pragma":"no-cache",
    "Referrer-Policy":"no-referrer"
  }});
};

Deno.serve(async(req)=>{
  if(req.method!=="GET")return new Response("Method Not Allowed",{status:405});
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const clientId=Deno.env.get("MP_POINT_CLIENT_ID")||"4583403024825492";
  const clientSecret=Deno.env.get("MP_POINT_CLIENT_SECRET")||"";
  const callbackUrl=Deno.env.get("MP_POINT_OAUTH_REDIRECT_URI")||`${supabaseUrl}/functions/v1/mercado-pago-oauth-callback`;
  const url=new URL(req.url);
  const state=String(url.searchParams.get("state")||"");
  const code=String(url.searchParams.get("code")||"");
  const oauthError=String(url.searchParams.get("error")||"");
  const oauthDescription=String(url.searchParams.get("error_description")||"");
  if(!supabaseUrl||!serviceKey)return redirectResult(FALLBACK_URL,false,"Backend do RENOVA indisponível.");

  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:stateRow}=await admin.from("payment_oauth_states").select("state,user_id,code_verifier,return_url,expires_at,used_at").eq("state",state).eq("provider","mercado_pago").maybeSingle();
  const returnUrl=safeReturnUrl(stateRow?.return_url||FALLBACK_URL);
  if(!stateRow||stateRow.used_at||new Date(stateRow.expires_at).getTime()<Date.now())return redirectResult(returnUrl,false,"Autorização expirada. Inicie novamente a conexão do Mercado Pago dentro do RENOVA.");
  if(oauthError)return redirectResult(returnUrl,false,oauthDescription||oauthError);
  if(!code)return redirectResult(returnUrl,false,"O Mercado Pago não retornou o código de autorização.");
  if(!clientSecret)return redirectResult(returnUrl,false,"Configuração pendente do Mercado Pago no backend do RENOVA.");

  const tokenRes=await fetch("https://api.mercadopago.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,grant_type:"authorization_code",code,redirect_uri:callbackUrl,code_verifier:stateRow.code_verifier,test_token:false})});
  const tokenData=await tokenRes.json().catch(()=>({}));
  if(!tokenRes.ok||!tokenData?.access_token){
    const message=String(tokenData?.message||tokenData?.error_description||tokenData?.error||`Mercado Pago HTTP ${tokenRes.status}`);
    return redirectResult(returnUrl,false,message);
  }

  const expiresIn=Math.max(60,Number(tokenData.expires_in)||15552000);
  const expiresAt=new Date(Date.now()+expiresIn*1000).toISOString();
  const providerUserId=String(tokenData.user_id||"")||null;
  const now=new Date().toISOString();

  const {error:credentialError}=await admin.from("payment_oauth_credentials").upsert({
    user_id:stateRow.user_id,
    provider:"mercado_pago",
    provider_user_id:providerUserId,
    access_token:String(tokenData.access_token),
    refresh_token:String(tokenData.refresh_token||"")||null,
    token_type:String(tokenData.token_type||"bearer"),
    scope:String(tokenData.scope||""),
    public_key:String(tokenData.public_key||"")||null,
    live_mode:tokenData.live_mode===true,
    expires_at:expiresAt,
    updated_at:now
  },{onConflict:"user_id,provider"});
  if(credentialError)return redirectResult(returnUrl,false,"A autorização foi recebida, mas o RENOVA não conseguiu salvar a credencial com segurança.");

  const {error:connectionError}=await admin.from("payment_provider_connections").upsert({
    user_id:stateRow.user_id,
    provider:"mercado_pago",
    connection_type:"oauth",
    status:"connected",
    display_name:"Mercado Pago conectado",
    account_reference:providerUserId,
    metadata:{oauth:true,live_mode:tokenData.live_mode===true,scope:String(tokenData.scope||""),connected_at:now,token_expires_at:expiresAt},
    updated_at:now
  },{onConflict:"user_id,provider,connection_type"});
  if(connectionError)return redirectResult(returnUrl,false,"A credencial foi recebida, mas o status da integração não pôde ser atualizado.");

  await admin.from("payment_oauth_states").update({used_at:now}).eq("state",state);
  return redirectResult(returnUrl,true,"Mercado Pago conectado. Agora você pode buscar e vincular sua Point.");
});
