import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const db=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const days=[[1,'Seg',1],[2,'Ter',1],[3,'Qua',1],[4,'Qui',1],[5,'Sex',1],[6,'Sáb',1],[0,'Dom',0]];
function toast(msg,type='ok'){const e=$('#toast');if(!e)return;e.textContent=msg;e.className=`toast show ${type}`;clearTimeout(toast.t);toast.t=setTimeout(()=>e.className='toast',3500)}
function mount(){
 if($('#dailyFixedBox'))return;
 const notes=$('#transactionNotes')?.closest('label');if(!notes)return;
 const st=document.createElement('style');st.textContent=`.daily-fixed-box{display:grid;gap:12px;padding:14px;border:1px solid rgba(36,224,195,.18);border-radius:16px;background:rgba(36,224,195,.04)}.daily-fixed-toggle{display:flex!important;align-items:flex-start;gap:10px!important;cursor:pointer}.daily-fixed-toggle input{width:18px!important;height:18px;margin-top:2px;accent-color:#24e0c3}.daily-fixed-toggle>span{display:grid;gap:3px}.daily-fixed-toggle small,.daily-fixed-help{color:#8fa4bf;font-size:.72rem;line-height:1.45}.daily-fixed-days{display:grid;gap:9px;padding-top:11px;border-top:1px solid rgba(157,186,220,.1)}.daily-fixed-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.daily-fixed-day{position:relative;display:block!important}.daily-fixed-day input{position:absolute;opacity:0}.daily-fixed-day span{display:grid;place-items:center;min-height:38px;border:1px solid rgba(157,186,220,.14);border-radius:10px;background:#07101e;color:#8fa4bf;font-size:.72rem;font-weight:850}.daily-fixed-day input:checked+span{border-color:rgba(36,224,195,.42);background:rgba(36,224,195,.11);color:#bafbf1}@media(max-width:520px){.daily-fixed-grid{grid-template-columns:repeat(4,1fr)}}`;document.head.appendChild(st);
 const box=document.createElement('div');box.id='dailyFixedBox';box.className='daily-fixed-box';box.innerHTML=`<label class="daily-fixed-toggle"><input id="transactionFixedDaily" type="checkbox"><span><strong id="dailyFixedTitle">Receita fixa por dia</strong><small>O valor informado é por dia. Escolha os dias da semana em que ele se repete.</small></span></label><div id="dailyFixedDays" class="daily-fixed-days hidden"><b>Dias da semana</b><div class="daily-fixed-grid">${days.map(([v,l,c])=>`<label class="daily-fixed-day"><input data-fixed-weekday type="checkbox" value="${v}" ${c?'checked':''}><span>${l}</span></label>`).join('')}</div><p class="daily-fixed-help">Exemplo: Seg a Sáb marcados e Dom desmarcado.</p></div>`;notes.before(box);
 $('#transactionFixedDaily').addEventListener('change',sync);$$('.segmented [data-kind]').forEach(b=>b.addEventListener('click',()=>setTimeout(sync,0)));$('#transactionForm').addEventListener('submit',save,true);sync();
}
function sync(){const k=$('#transactionKind')?.value||'income',t=$('#transactionFixedDaily'),b=$('#dailyFixedBox');if(!b||!t)return;b.classList.toggle('hidden',k==='transfer');if(k==='transfer')t.checked=false;$('#dailyFixedTitle').textContent=k==='expense'?'Despesa fixa por dia':'Receita fixa por dia';$('#dailyFixedDays').classList.toggle('hidden',!t.checked||k==='transfer')}
async function save(ev){
 const k=$('#transactionKind')?.value||'income',t=$('#transactionFixedDaily');if(!t?.checked||k==='transfer')return;
 ev.preventDefault();ev.stopImmediatePropagation();
 const weekdays=$$('[data-fixed-weekday]:checked').map(i=>Number(i.value));if(!weekdays.length)return toast('Escolha pelo menos um dia da semana.','error');
 const btn=$('#saveTransactionBtn');btn.disabled=true;btn.textContent='Criando fluxo...';
 const {data,error}=await db.rpc('create_weekly_fixed_flow',{p_account_id:$('#transactionAccount').value,p_category_id:$('#transactionCategory').value||null,p_kind:k==='expense'?'despesa':'receita',p_description:$('#transactionDescription').value.trim(),p_amount:Number($('#transactionAmount').value),p_start_date:$('#transactionDate').value,p_weekdays:weekdays,p_notes:$('#transactionNotes').value.trim()||null});
 btn.disabled=false;btn.textContent='Salvar movimentação';if(error)return toast(error.message||'Não foi possível criar o fluxo fixo.','error');
 toast(`${k==='expense'?'Despesa':'Receita'} fixa criada para ${weekdays.length} ${weekdays.length===1?'dia':'dias'} da semana.`);$('#transactionModal').classList.add('hidden');document.body.classList.remove('modal-open');$('#transactionForm').reset();if(Number(data?.transactions_generated||0)>0)location.reload();
}
async function catchUp(){const {data:{session}}=await db.auth.getSession();if(!session?.user)return;const {data,error}=await db.rpc('materialize_weekly_fixed_flows');if(!error&&Number(data)>0)location.reload()}
mount();await catchUp();db.auth.onAuthStateChange((event,s)=>{if(event==='SIGNED_IN'&&s?.user)setTimeout(catchUp,0)});
