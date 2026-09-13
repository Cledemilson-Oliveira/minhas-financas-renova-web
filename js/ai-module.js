import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=(s,r=document)=>r.querySelector(s);
let user=null,access=null,entitlement=null,busy=false;

function ensureStyles(){if(document.querySelector('link[data-ai-module]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='./css/ai-module.css?v=20260913-0090';l.dataset.aiModule='1';document.head.appendChild(l)}
function esc(v=''){return String(v).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function isOwner(){return access?.role==='dono'&&access?.status==='ativo'}
function features(){return entitlement?.features||{}}
function hasChatAccess(){return isOwner()||features().all===true||features().ai_chat===true}
function hasLocalAccess(){return isOwner()||features().all===true||features().ai_local===true}
function accessLabel(){if(isOwner())return'Conta dono • acesso global';if(entitlement?.mode==='trial')return'Teste RENOVA';if(entitlement?.mode==='benefit')return`${entitlement?.plan_name||'RENOVA'} • benefício`;if(entitlement?.mode==='limited')return'Acesso limitado';return entitlement?.plan_name||'Verificando acesso'}
function goSubscription(){document.querySelector('[data-page="subscription"]')?.click()}

function ensureUI(){const page=$('#aiPage');if(!page)return;page.innerHTML=`<div class="ai-shell"><div class="ai-head"><div class="ai-brand"><div class="ai-orb">✦</div><div><h2>IA Financeira RENOVA</h2><p>Análise inteligente conectada aos seus dados financeiros.</p></div></div><span id="aiAccessBadge" class="ai-access-badge locked">Verificando acesso...</span></div><div id="aiBody" class="ai-body"></div><div id="aiComposer" class="ai-composer hidden"><div class="ai-composer-inner"><textarea id="aiInput" class="ai-input" rows="1" placeholder="Pergunte sobre seus gastos, orçamento, contas, cartões ou metas..."></textarea><button id="aiSend" class="ai-send" type="button" aria-label="Enviar">➤</button></div><div class="ai-note">O Chat IA usa um provedor configurado. O Modo Análise Local funciona sem consumir créditos de IA generativa.</div></div></div>`}

function syncAccessUI(){const roleEl=$('#sidebarUserRole');if(!roleEl)return;roleEl.textContent=isOwner()?'Conta dono':entitlement?.mode==='trial'?'Teste 14 dias':entitlement?.mode==='benefit'?`${entitlement?.plan_name||'RENOVA'} • benefício`:entitlement?.plan_name||'Acesso limitado'}

function renderGate(){const body=$('#aiBody'),composer=$('#aiComposer'),badge=$('#aiAccessBadge');if(!body)return;const chatAllowed=hasChatAccess();badge.textContent=accessLabel();badge.classList.toggle('locked',!chatAllowed&&!hasLocalAccess());composer.classList.toggle('hidden',!chatAllowed);if(!chatAllowed){const local=hasLocalAccess();body.innerHTML=`<div class="ai-gate"><div class="ai-gate-card"><div class="ai-orb">✦</div><h3>${local?'Modo Análise Local disponível':'Recursos de IA não disponíveis neste acesso'}</h3><p>${local?'Seu plano inclui o Motor de Análise RENOVA sem consumo de créditos. Use a aba “Análise Local” acima. O Chat IA generativo depende de um plano/provedor compatível.':'O plano Essencial mantém toda a gestão financeira, mas não inclui Modo Análise, Chat IA ou Central de Treinamento.'}</p><div class="ai-gate-actions"><button class="primary-btn" id="aiViewSubscription" type="button">Ver planos</button></div></div></div>`;$('#aiViewSubscription')?.addEventListener('click',goSubscription);return}renderWelcome()}
function renderWelcome(){const body=$('#aiBody');if(!body)return;body.innerHTML=`<div class="ai-welcome"><div class="ai-orb">✦</div><h3>Como posso ajudar com suas finanças?</h3><p>O Chat IA pode analisar lançamentos, contas, cartões, orçamento e metas quando um provedor de IA estiver configurado para o ambiente.</p></div><div class="ai-prompts"><button class="ai-prompt" type="button">Como está minha situação financeira este mês?</button><button class="ai-prompt" type="button">Onde estou gastando mais?</button><button class="ai-prompt" type="button">Como posso organizar melhor meu orçamento?</button><button class="ai-prompt" type="button">Qual meta financeira devo priorizar?</button></div><div id="aiMessages" class="ai-messages"></div>`;document.querySelectorAll('.ai-prompt').forEach(b=>b.addEventListener('click',()=>sendText(b.textContent.trim())))}
function messagesHost(){return $('#aiMessages')}
function addMessage(role,text){const host=messagesHost();if(!host)return;const row=document.createElement('div');row.className=`ai-message ${role}`;row.innerHTML=`<div class="ai-bubble">${esc(text)}</div>`;host.appendChild(row);scrollBottom();return row}
function addThinking(){const host=messagesHost();if(!host)return null;const row=document.createElement('div');row.className='ai-message assistant';row.innerHTML='<div class="ai-bubble"><span class="ai-thinking"><i></i><i></i><i></i></span></div>';host.appendChild(row);scrollBottom();return row}
function scrollBottom(){const body=$('#aiBody');if(body)requestAnimationFrame(()=>{body.scrollTop=body.scrollHeight})}
function setBusy(v){busy=v;const btn=$('#aiSend'),input=$('#aiInput');if(btn)btn.disabled=v;if(input)input.disabled=v}
async function errorMessage(error){try{if(error?.context?.json){const p=await error.context.json();if(p?.error)return p.error}}catch{}return error?.message||'Não foi possível falar com a IA agora.'}

async function sendText(raw){const text=String(raw||'').trim();if(!text||busy||!hasChatAccess())return;const input=$('#aiInput');if(input){input.value='';input.style.height='auto'}addMessage('user',text);const thinking=addThinking();setBusy(true);try{const {data,error}=await supabase.functions.invoke('finance-ai',{body:{message:text}});thinking?.remove();if(error){addMessage('system',await errorMessage(error));return}if(data?.error){addMessage('system',data.error);return}addMessage('assistant',data?.answer||'Não consegui gerar uma resposta agora.')}catch(e){thinking?.remove();addMessage('system',e?.message||'Erro ao consultar a IA.')}finally{setBusy(false);input?.focus()}}

async function loadAccess(){if(!user)return;const [{data:a},{data:e}]=await Promise.all([supabase.from('user_access').select('role,status').eq('user_id',user.id).maybeSingle(),supabase.rpc('get_my_plan_access')]);access=a;entitlement=e||null;syncAccessUI();renderGate();window.dispatchEvent(new CustomEvent('renova:entitlement',{detail:entitlement}))}
function bind(){const input=$('#aiInput'),send=$('#aiSend');send?.addEventListener('click',()=>sendText(input?.value));input?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText(input.value)}});input?.addEventListener('input',()=>{input.style.height='auto';input.style.height=`${Math.min(120,input.scrollHeight)}px`})}

ensureStyles();ensureUI();bind();const {data:{session}}=await supabase.auth.getSession();user=session?.user||null;if(user)await loadAccess();supabase.auth.onAuthStateChange((_e,s)=>{user=s?.user||null;access=null;entitlement=null;if(user)setTimeout(loadAccess,0);else{syncAccessUI();renderGate()}});

// Módulos complementares isolados do núcleo financeiro.
import('./access-control.js?v=20260913-0090').catch(error=>console.error('Falha ao carregar controle de acesso',error));
import('./plans-module.js?v=20260913-0090').catch(error=>console.error('Falha ao carregar planos e assinaturas',error));
import('./checkout-module.js?v=20260913-0090').catch(error=>console.error('Falha ao carregar Checkout Transparente',error));
import('./plans-admin-recovery.js?v=20260913-0090').catch(error=>console.error('Falha ao carregar recuperação de planos',error));
import('./referral-benefits-module.js?v=20260913-0090').catch(error=>console.error('Falha ao carregar Indique e Evolua',error));
import('./ai-owner-tools.js?v=20260913-0090').catch(error=>console.error('Falha ao carregar ferramentas de análise RENOVA',error));