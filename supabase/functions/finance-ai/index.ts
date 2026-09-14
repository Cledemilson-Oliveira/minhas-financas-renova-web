import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json"}})}
function num(v:unknown){const n=Number(v??0);return Number.isFinite(n)?n:0}
function money(v:number){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v)}
function monthKey(date=new Date()){return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`}
function extractText(payload:any){if(typeof payload?.output_text==="string"&&payload.output_text.trim())return payload.output_text.trim();for(const item of payload?.output??[]){for(const content of item?.content??[]){if(content?.type==="output_text"&&typeof content?.text==="string")return content.text.trim()}}return "Não consegui gerar uma resposta agora."}
function providerErrorMessage(status:number,payload:any){const code=String(payload?.error?.code||"");const type=String(payload?.error?.type||"");const message=String(payload?.error?.message||"");if(status===401)return "A chave da OpenAI foi rejeitada. Gere uma nova API key e atualize o segredo OPENAI_API_KEY no Supabase.";if(status===429){if(code==="credit_balance_exhausted"||type==="insufficient_quota"||/credit|quota|billing/i.test(message))return "A OpenAI API está sem créditos disponíveis. Adicione saldo na área Billing da OpenAI e tente novamente após alguns minutos.";return "A OpenAI aplicou um limite temporário de uso. Aguarde um pouco e tente novamente."}if(status===403)return "A chave está válida, mas o projeto da OpenAI não tem permissão para esse modelo ou recurso. Verifique as permissões da API key e do projeto.";if(status===404&&(code==="model_not_found"||/model/i.test(message)))return "O modelo configurado não está disponível neste projeto da OpenAI. Ajuste o segredo OPENAI_MODEL ou use um modelo liberado para a conta.";return "A OpenAI recebeu a solicitação, mas não conseguiu concluir a resposta agora."}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Método não permitido."},405);
  try{
    const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader=req.headers.get("Authorization")||"";
    if(!authHeader.startsWith("Bearer "))return json({error:"Sessão não encontrada."},401);

    const supabase=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
    const supabaseAdmin=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userError}=await supabase.auth.getUser();
    const user=userData?.user;
    if(userError||!user)return json({error:"Sessão inválida ou expirada."},401);

    const body=await req.json().catch(()=>({}));
    const message=String(body?.message||"").trim();
    if(!message)return json({error:"Digite uma mensagem."},400);
    if(message.length>5000)return json({error:"Mensagem muito longa."},400);

    const [{data:access},{data:entitlement,error:entitlementError}]=await Promise.all([
      supabase.from("user_access").select("role,status").eq("user_id",user.id).maybeSingle(),
      supabase.rpc("get_my_plan_access")
    ]);
    if(entitlementError)return json({error:"Não foi possível verificar seu plano agora."},500);
    const isOwner=access?.role==="dono"&&access?.status==="ativo";
    const features=entitlement?.features||{};
    const hasChatAccess=isOwner||features?.all===true||features?.ai_chat===true;
    if(!hasChatAccess){
      return json({error:"Seu plano atual não inclui o Chat IA. Use o Modo Análise Local ou faça upgrade para um plano compatível.",code:"ai_chat_not_in_plan",plan_code:entitlement?.plan_code||"free"},403);
    }

    const [{data:userOpenAiKey,error:userKeyError},{data:userProvider}]=await Promise.all([
      supabaseAdmin.rpc("admin_get_user_openai_key",{p_user_id:user.id}),
      supabaseAdmin.from("ai_user_provider_settings").select("model,is_enabled").eq("user_id",user.id).maybeSingle()
    ]);
    if(userKeyError)console.error("User OpenAI key lookup failed",userKeyError);
    const usingUserKey=Boolean(userOpenAiKey&&userProvider?.is_enabled);
    const openAiKey=usingUserKey?String(userOpenAiKey):Deno.env.get("OPENAI_API_KEY");
    const openAiModel=usingUserKey?String(userProvider?.model||"gpt-5-mini"):(Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna");
    if(!openAiKey)return json({error:"IA generativa ainda não configurada no servidor. O Modo Análise Local continua disponível sem créditos."},503);

    const currentMonth=monthKey();
    const monthStart=`${currentMonth}-01`;
    const nextMonthDate=new Date(`${monthStart}T00:00:00Z`);nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth()+1);
    const nextMonth=`${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth()+1).padStart(2,"0")}-01`;

    const commonRequests=[
      supabase.from("accounts").select("id,name,account_type,initial_balance,is_active").eq("user_id",user.id).eq("is_active",true),
      supabase.from("categories").select("id,name,kind").eq("user_id",user.id).eq("is_active",true),
      supabase.from("transactions").select("id,account_id,destination_account_id,category_id,kind,description,amount,occurred_on,status").eq("user_id",user.id).order("occurred_on",{ascending:false}).limit(500),
      supabase.from("cards").select("id,name,credit_limit,is_active").eq("user_id",user.id).eq("is_active",true),
      supabase.from("card_expenses").select("card_id,category_id,description,amount,installments,current_installment,status,purchase_date").eq("user_id",user.id).order("purchase_date",{ascending:false}).limit(300),
      supabase.from("budgets").select("category_id,month,planned_amount").eq("user_id",user.id).gte("month",monthStart).lt("month",nextMonth),
      supabase.from("financial_goals").select("name,target_amount,current_amount,target_date,status").eq("user_id",user.id).order("created_at",{ascending:false}),
      supabase.from("ai_user_preferences").select("preference_key,preference_value,source_text").eq("user_id",user.id).eq("is_active",true).limit(80)
    ];
    const [accountsR,categoriesR,transactionsR,cardsR,cardExpensesR,budgetsR,goalsR,prefsR]=await Promise.all(commonRequests);

    let training:any[]=[];
    const workspaceId=entitlement?.workspace_id?String(entitlement.workspace_id):"";
    if(workspaceId&&!isOwner){
      const {data,error}=await supabase.from("business_ai_training_items").select("title,area,kind,content,application_mode,keywords,priority").eq("workspace_id",workspaceId).eq("is_active",true).order("priority",{ascending:false}).limit(80);
      if(!error)training=data??[];
    }else{
      const {data,error}=await supabase.from("ai_training_items").select("title,area,kind,content,application_mode,keywords,priority").eq("user_id",user.id).eq("is_active",true).order("priority",{ascending:false}).limit(60);
      if(!error)training=data??[];
    }

    const accounts=accountsR.data??[];const categories=categoriesR.data??[];const transactions=transactionsR.data??[];const cards=cardsR.data??[];const cardExpenses=cardExpensesR.data??[];const budgets=budgetsR.data??[];const goals=goalsR.data??[];const prefs=prefsR.data??[];
    const categoryMap=new Map(categories.map((c:any)=>[c.id,c.name]));
    const accountBalances=new Map(accounts.map((a:any)=>[a.id,num(a.initial_balance)]));
    let monthIncome=0,monthExpense=0;
    for(const t of transactions as any[]){const amount=num(t.amount);if(t.status==="cancelado")continue;if(accountBalances.has(t.account_id)){if(t.kind==="receita"||t.kind==="income")accountBalances.set(t.account_id,num(accountBalances.get(t.account_id))+amount);if(["despesa","expense","transferencia","transfer"].includes(t.kind))accountBalances.set(t.account_id,num(accountBalances.get(t.account_id))-amount)}if(["transferencia","transfer"].includes(t.kind)&&accountBalances.has(t.destination_account_id))accountBalances.set(t.destination_account_id,num(accountBalances.get(t.destination_account_id))+amount);if(String(t.occurred_on||"").startsWith(currentMonth)){if(["receita","income"].includes(t.kind))monthIncome+=amount;if(["despesa","expense"].includes(t.kind))monthExpense+=amount}}
    const totalBalance=[...accountBalances.values()].reduce((s,v)=>s+num(v),0);
    const openCardInvoice=(cardExpenses as any[]).filter(e=>e.status==="aberta").reduce((s,e)=>s+num(e.amount)/Math.max(1,num(e.installments)),0);
    const totalCardLimit=(cards as any[]).reduce((s,c)=>s+num(c.credit_limit),0);
    const recentTransactions=(transactions as any[]).slice(0,30).map(t=>({description:t.description,amount:num(t.amount),kind:t.kind,date:t.occurred_on,category:categoryMap.get(t.category_id)||"Sem categoria"}));
    const financialContext={reference_month:currentMonth,total_balance:money(totalBalance),month_income:money(monthIncome),month_expense:money(monthExpense),month_result:money(monthIncome-monthExpense),accounts:accounts.map((a:any)=>({name:a.name,type:a.account_type,balance:money(num(accountBalances.get(a.id)))})),cards:{total_limit:money(totalCardLimit),estimated_open_invoice:money(openCardInvoice),active_cards:cards.map((c:any)=>c.name)},budgets:budgets.map((b:any)=>({category:categoryMap.get(b.category_id)||"Categoria",planned:money(num(b.planned_amount))})),goals:goals.map((g:any)=>({name:g.name,target:money(num(g.target_amount)),current:money(num(g.current_amount)),target_date:g.target_date,status:g.status})),recent_transactions:recentTransactions};
    const preferencesText=prefs.map((p:any)=>`${p.preference_key}: ${JSON.stringify(p.preference_value)}${p.source_text?` | origem: ${p.source_text}`:""}`).join("\n");
    const trainingText=training.map((t:any)=>`[${t.priority}] ${t.title} (${t.area}/${t.kind})\n${String(t.content).slice(0,2500)}`).join("\n\n");
    const trainingContext=workspaceId&&!isOwner?"TREINAMENTO DA EMPRESA (isolado do treinamento mestre RENOVA)":"TREINAMENTO PERSONALIZADO";
    const instructions=`Você é a IA Financeira RENOVA, assistente financeiro dentro do aplicativo Minhas Finanças RENOVA.\nResponda sempre em português do Brasil, com linguagem clara, prática e objetiva.\nUse os dados financeiros fornecidos como fonte principal. Não invente saldos, lançamentos, datas ou categorias.\nQuando a pergunta depender de informação ausente, diga exatamente o que falta.\nDiferencie fatos observados nos dados de sugestões.\nNão prometa rendimentos, lucro garantido ou resultados financeiros.\nNão execute alterações financeiras nesta função: esta versão é somente de análise e orientação. Se o usuário pedir para lançar, editar ou excluir algo, explique que o modo de execução exige autorização explícita em uma etapa própria.\nPriorize controle de caixa, redução de desperdícios, organização de dívidas, orçamento e metas.\nPara decisões financeiras de alto impacto, apresente riscos e alternativas em vez de uma instrução absoluta.\n\nCONTEXTO FINANCEIRO ATUAL:\n${JSON.stringify(financialContext,null,2)}\n\nPREFERÊNCIAS DO USUÁRIO:\n${preferencesText||"Nenhuma preferência específica cadastrada."}\n\n${trainingContext}:\n${trainingText||"Nenhum treinamento personalizado cadastrado."}`;

    const aiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${openAiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:openAiModel,reasoning:{effort:"low"},instructions,input:message,max_output_tokens:1400})});
    const aiPayload=await aiResponse.json().catch(()=>({}));
    if(!aiResponse.ok){console.error("OpenAI error",aiResponse.status,aiPayload);return json({error:providerErrorMessage(aiResponse.status,aiPayload),provider_status:aiResponse.status,provider_code:aiPayload?.error?.code||null},aiResponse.status===429?429:502)}
    const answer=extractText(aiPayload);
    await supabase.from("ai_action_logs").insert({user_id:user.id,command_text:message,action_type:"financial_analysis",action_payload:{model:openAiModel,provider_source:usingUserKey?"user":"platform",reference_month:currentMonth,plan_code:entitlement?.plan_code||null,workspace_id:workspaceId||null},status:"analysis",result_message:answer.slice(0,5000)});
    return json({answer,model:openAiModel,provider_source:usingUserKey?"user":"platform",access:isOwner?"owner":workspaceId?"business":"plan",plan_code:entitlement?.plan_code||null});
  }catch(error){console.error(error);return json({error:"Erro interno ao processar a solicitação."},500)}
});
