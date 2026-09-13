import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=(s,r=document)=>r.querySelector(s);
const esc=(v='')=>String(v).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let user=null,isOwner=false,rendering=false;
const commercialCodes=['renova_essencial','renova_analise','renova_business'];
function toast(message,type='ok'){const el=$('#toast');if(!el)return;el.textContent=message;el.className=`toast show ${type}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='toast',3200)}

async function renderRecovery(){if(!isOwner||rendering)return;const page=$('#subscriptionPage');if(!page||!page.querySelector('.plans-shell'))return;rendering=true;try{page.querySelector('#hiddenPlansRecovery')?.remove();const {data,error}=await supabase.from('ai_subscription_plans').select('code,name,is_active,is_public').in('code',commercialCodes).order('sort_order');if(error)return;const hidden=(data||[]).filter(p=>!p.is_active||!p.is_public);if(!hidden.length)return;const host=document.createElement('section');host.id='hiddenPlansRecovery';host.className='owner-admin-card';host.innerHTML=`<div><span class="eyebrow">ADMINISTRAÇÃO • RECUPERAÇÃO</span><h3>Planos ocultos ou desativados</h3><p>Use esta área para recuperar um plano que deixou de aparecer na vitrine.</p></div><div class="admin-plan-list" style="margin-top:14px">${hidden.map(p=>`<div class="admin-plan-row" style="grid-template-columns:1fr auto" data-recover-row="${esc(p.code)}"><div><strong>${esc(p.name)}</strong><small style="display:block;color:var(--muted,#98a7ba)">${p.is_active?'Ativo':'Desativado'} • ${p.is_public?'Público':'Oculto'}</small></div><button class="ghost-btn" data-recover-plan="${esc(p.code)}" type="button">Reativar e publicar</button></div>`).join('')}</div>`;page.querySelector('.owner-admin')?.appendChild(host)}finally{rendering=false}}

async function recover(code){const {error}=await supabase.from('ai_subscription_plans').update({is_active:true,is_public:true,updated_at:new Date().toISOString()}).eq('code',code);if(error)return toast(error.message,'error');toast('Plano reativado e publicado.');setTimeout(()=>location.reload(),500)}

document.addEventListener('click',e=>{const b=e.target.closest?.('[data-recover-plan]');if(b)recover(b.dataset.recoverPlan)});
const observer=new MutationObserver(()=>{clearTimeout(observer.timer);observer.timer=setTimeout(renderRecovery,120)});
const page=$('#subscriptionPage');if(page)observer.observe(page,{childList:true,subtree:true});
const {data:{session}}=await supabase.auth.getSession();user=session?.user||null;if(user){const {data:a}=await supabase.from('user_access').select('role,status').eq('user_id',user.id).maybeSingle();isOwner=a?.role==='dono'&&a?.status==='ativo';if(isOwner)setTimeout(renderRecovery,250)}
