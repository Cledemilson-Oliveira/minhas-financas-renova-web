import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=(s,r=document)=>r.querySelector(s);
let entitlement=null,user=null,accessRow=null;
const corePages={transactions:'transactions',accounts:'accounts',cards:'cards',budgets:'budgets',goals:'goals'};
const mutationSelectors=['#quickAddBtn','[data-new-transaction]','[data-account-new]','[data-card-new]','[data-budget-new]','[data-goal-new]'];

function ensureStyles(){if(document.querySelector('link[data-access-control]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='./css/access-control.css?v=20260913-0080';l.dataset.accessControl='1';document.head.appendChild(l)}
function toast(message,type='ok'){const el=$('#toast');if(!el)return;el.textContent=message;el.className=`toast show ${type}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='toast',3200)}
function isOwner(){return accessRow?.role==='dono'&&accessRow?.status==='ativo'}
function isLimited(){return !isOwner()&&entitlement?.mode==='limited'}
function can(feature){if(isOwner())return true;const f=entitlement?.features||{};return f.all===true||f[feature]===true}
function days(end){return end?Math.max(0,Math.ceil((new Date(end).getTime()-Date.now())/86400000)):null}
function goSubscription(){document.querySelector('[data-page="subscription"]')?.click()}

function renderNotice(){const dash=$('#dashboardPage');if(!dash)return;dash.querySelector('#renovaAccessNotice')?.remove();if(isOwner()||entitlement?.mode==='owner'||entitlement?.mode==='paid'||entitlement?.mode==='business')return;const d=days(entitlement?.expires_at);const box=document.createElement('div');box.id='renovaAccessNotice';box.className=`renova-access-notice ${isLimited()?'limited':''}`;box.innerHTML=isLimited()?`<div><strong>Acesso limitado</strong><span>Seu teste ou período pago terminou. Seus dados continuam disponíveis para consulta, mas novas alterações exigem um plano ativo.</span></div><button class="primary-btn" type="button">Ver planos</button>`:`<div><strong>Teste RENOVA ativo</strong><span>${d!==null?`${d} dia(s) restante(s) do período gratuito de 14 dias.`:'Período gratuito ativo.'} Depois disso, escolha um plano para continuar alterando seus dados.</span></div><button class="ghost-btn" type="button">Conhecer planos</button>`;box.querySelector('button')?.addEventListener('click',goSubscription);dash.prepend(box)}

function syncButtons(){mutationSelectors.forEach(sel=>document.querySelectorAll(sel).forEach(btn=>{const locked=isLimited();btn.classList.toggle('renova-write-locked',locked);btn.setAttribute('aria-disabled',locked?'true':'false')}))}
function pageAllowed(page){const feature=corePages[page];return !feature||can(feature)}
function mutationLocked(){return isLimited()}

function guardClick(e){const pageBtn=e.target.closest('[data-page]');if(pageBtn){const page=pageBtn.dataset.page;if(page&&corePages[page]&&!pageAllowed(page)){e.preventDefault();e.stopImmediatePropagation();toast('Seu período ativo terminou. Escolha um plano para continuar usando este módulo.','error');goSubscription();return}}
  const go=e.target.closest('[data-go]');if(go){const page=go.dataset.go;if(page&&corePages[page]&&!pageAllowed(page)){e.preventDefault();e.stopImmediatePropagation();toast('Este módulo está em modo consulta até a renovação.','error');goSubscription();return}}
  if(mutationLocked()&&e.target.closest(mutationSelectors.join(','))){e.preventDefault();e.stopImmediatePropagation();toast('Acesso em modo consulta. Renove um plano para criar ou editar dados.','error');goSubscription()}}

async function refresh(){if(!user)return;const [{data:access,error:accessError},{data,error}]=await Promise.all([supabase.from('user_access').select('role,status').eq('user_id',user.id).maybeSingle(),supabase.rpc('get_my_plan_access')]);if(accessError||error)return;accessRow=access||null;entitlement=data||null;renderNotice();syncButtons()}

ensureStyles();document.addEventListener('click',guardClick,true);window.addEventListener('renova:entitlement',e=>{entitlement=e.detail||null;renderNotice();syncButtons()});const {data:{session}}=await supabase.auth.getSession();user=session?.user||null;if(user)await refresh();supabase.auth.onAuthStateChange((_e,s)=>{user=s?.user||null;if(user)setTimeout(refresh,0)});
