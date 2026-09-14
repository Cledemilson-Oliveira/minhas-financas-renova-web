import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const validModel=(value:string)=>/^[a-zA-Z0-9._-]{2,80}$/.test(value);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Método não permitido."},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))return json({error:"Sessão não encontrada."},401);
    const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const admin=createClient(url,service,{auth:{persistSession:false}});
    const {data:{user},error:userError}=await client.auth.getUser();
    if(userError||!user)return json({error:"Sessão inválida ou expirada."},401);
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"status");

    if(action==="status"){
      const {data,error}=await admin.from("ai_user_provider_settings").select("key_hint,model,is_enabled,tested_at,updated_at").eq("user_id",user.id).maybeSingle();
      if(error)return json({error:"Não foi possível consultar a configuração."},500);
      return json({configured:Boolean(data),...(data||{})});
    }

    if(action==="save"){
      const apiKey=String(body?.api_key||"").trim();
      const model=String(body?.model||"gpt-5-mini").trim();
      if(!apiKey.startsWith("sk-")||apiKey.length<20)return json({error:"Informe uma chave OpenAI válida, iniciada por sk-."},400);
      if(!validModel(model))return json({error:"Informe um modelo OpenAI válido."},400);
      const hint=apiKey.slice(-6);
      const {error}=await admin.rpc("admin_upsert_user_openai_key",{p_user_id:user.id,p_api_key:apiKey,p_key_hint:hint,p_model:model});
      if(error){console.error(error);return json({error:"Não foi possível guardar a chave com segurança."},500)}
      return json({ok:true,key_hint:hint,model});
    }

    if(action==="delete"){
      const {error}=await admin.rpc("admin_delete_user_openai_key",{p_user_id:user.id});
      if(error){console.error(error);return json({error:"Não foi possível remover a chave."},500)}
      return json({ok:true});
    }

    if(action==="test"){
      let apiKey=String(body?.api_key||"").trim();
      if(!apiKey){
        const {data,error}=await admin.rpc("admin_get_user_openai_key",{p_user_id:user.id});
        if(error||!data)return json({error:"Salve uma chave antes de testar."},400);
        apiKey=String(data);
      }
      const response=await fetch("https://api.openai.com/v1/models",{headers:{Authorization:`Bearer ${apiKey}`}});
      if(!response.ok){
        const payload=await response.json().catch(()=>({}));
        const message=response.status===401?"A OpenAI rejeitou esta chave. Verifique ou gere uma nova.":String(payload?.error?.message||"Não foi possível validar a chave.");
        return json({error:message},response.status===401?400:502);
      }
      await admin.from("ai_user_provider_settings").update({tested_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("user_id",user.id);
      return json({ok:true,message:"Chave validada com sucesso."});
    }
    return json({error:"Ação inválida."},400);
  }catch(error){console.error(error);return json({error:"Erro interno ao configurar a API."},500)}
});
