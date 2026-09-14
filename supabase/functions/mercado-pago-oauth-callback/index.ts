import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const esc=(value="")=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
const page=(title,message,ok=false,returnUrl="")=>{
  let target="*";
  try{target=new URL(returnUrl).origin}catch{}
  const payload=JSON.stringify({type:"renova:mercado-pago-oauth",ok,message});
  const fallback=JSON.stringify(returnUrl||"https://minhasfinancas.servicosgold.com.br/");
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;background:#07101e;color:#eef7ff;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh}.card{width:min(92vw,520px);background:#0c1b2d;border:1px solid #1f3b58;border-radius:22px;padding:30px;box-shadow:0 25px 80px #0008}.tag{color:#24e0c3;font-size:12px;font-weight:800;letter-spacing:.12em}.ok{font-size:48px;margin:12px 0}.msg{color:#c9d9e8;line-height:1.6}.btn{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:12px;background:#24e0c3;color:#07101e;text-decoration:none;font-weight:800}</style></head><body><main class="card"><div class="tag">MINHAS FINANÇAS RENOVA</div><div class="ok">${ok?"✓":"!"}</div><h1>${esc(title)}</h1><p class="msg">${esc(message)}</p><a class="btn" href="${esc(returnUrl||"https://minhasfinancas.servicosgold.com.br/")}">Voltar ao RENOVA</a></main><script>try{if(window.opener&&!window.opener.closed){window.opener.postMessage(${payload},${JSON.stringify(target)});setTimeout(()=>window.close(),900)}else if(${ok}){setTimeout(()=>location.replace(${fallback}),1200)}}catch(e){}</script></body></html>`,{status:ok?200:400,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
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
  if(!supabaseUrl||!serviceKey)return page("Configuração incompleta","Backend do RENOVA indisponível.");

  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:stateRow}=await admin.from("payment_oauth_states").select("state,user_id,code_verifier,return_url,expires_at,used_at").eq("state",state).eq("provider","mercado_pago").maybeSingle();
  const returnUrl=stateRow?.return_url||"https://minhasfinancas.servicosgold.com.br/";
  if(!stateRow||stateRow.used_at||new Date(stateRow.expires_at).getTime()<Date.now())return page("Autorização expirada","Inicie novamente a conexão do Mercado Pago dentro do RENOVA.",false,returnUrl);
  if(oauthError)return page("Autorização não concluída",oauthDescription||oauthError,false,returnUrl);
  if(!code)return page("Código não recebido","O Mercado Pago não retornou o código de autorização.",false,returnUrl);
  if(!clientSecret)return page("Configuração pendente","O administrador precisa cadastrar MP_POINT_CLIENT_SECRET no Supabase antes de concluir o OAuth.",false,returnUrl);

  const tokenRes=await fetch("https://api.mercadopago.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,grant_type:"authorization_code",code,redirect_uri:callbackUrl,code_verifier:stateRow.code_verifier,test_token:false})});
  const tokenData=await tokenRes.json().catch(()=>({}));
  if(!tokenRes.ok||!tokenData?.access_token){
    const message=String(tokenData?.message||tokenData?.error_description||tokenData?.error||`Mercado Pago HTTP ${tokenRes.status}`);
    return page("Não foi possível conectar",message,false,returnUrl);
  }

  const expiresIn=Math.max(60,Number(tokenData.expires_in)||15552000);
  const expiresAt=new Date(Date.now()+expiresIn*1000).toISOString();
  const providerUserId=String(tokenData.user_id||"")||null;
  const now=new Date().toISOString();

  const {error:credentialError}=await admin.from("payment_oauth_credentials").upsert({user_id:stateRow.user_id,provider:"mercado_pago",provider_user_id:providerUserId,access_token:String(tokenData.access_token),refresh_token:String(tokenData.refresh_token||"")||null,token_type:String(tokenData.token_type||"bearer"),scope:String(tokenData.scope||""),public_key:String(tokenData.public_key||"")||null,live_mode:tokenData.live_mode===true,expires_at:expiresAt,updated_at:now},{onConflict:"user_id,provider"});
  if(credentialError)return page("Falha ao salvar conexão","A autorização foi recebida, mas o RENOVA não conseguiu salvar a credencial com segurança.",false,returnUrl);

  const {error:connectionError}=await admin.from("payment_provider_connections").upsert({user_id:stateRow.user_id,provider:"mercado_pago",connection_type:"oauth",status:"connected",display_name:"Mercado Pago conectado",account_reference:providerUserId,metadata:{oauth:true,live_mode:tokenData.live_mode===true,scope:String(tokenData.scope||""),connected_at:now,token_expires_at:expiresAt},updated_at:now},{onConflict:"user_id,provider,connection_type"});
  if(connectionError)return page("Falha ao concluir conexão","A credencial foi recebida, mas o status da integração não pôde ser atualizado.",false,returnUrl);

  await admin.from("payment_oauth_states").update({used_at:now}).eq("state",state);
  return page("Mercado Pago conectado","Sua conta foi autorizada. Volte ao RENOVA para buscar e vincular sua Point.",true,returnUrl);
});