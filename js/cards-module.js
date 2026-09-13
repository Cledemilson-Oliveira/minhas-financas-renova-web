import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = (v = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dateBR = v => v ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${v}T12:00:00`)) : '—';

let user = null;
let cards = [];
let expenses = [];
let accounts = [];
let categories = [];
let editingCardId = null;
let editingExpenseId = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch]));
}
function toast(message, type = 'ok') {
  const el = $('#toast'); if (!el) return;
  el.textContent = message; el.className = `toast show ${type}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.className = 'toast'; }, 3200);
}
function ensureStyles() {
  if (document.querySelector('link[data-cards-module]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = './css/cards-module.css?v=20260913-0015'; link.dataset.cardsModule = '1';
  document.head.appendChild(link);
}
function cardUsed(cardId) {
  return expenses.filter(e => e.card_id === cardId && e.status === 'aberta').reduce((s,e) => s + Number(e.amount || 0), 0);
}
function cardInvoice(cardId) {
  return expenses.filter(e => e.card_id === cardId && e.status === 'aberta').reduce((s,e) => s + (Number(e.amount || 0) / Math.max(1, Number(e.installments || 1))), 0);
}
function cardName(id) { return cards.find(c => c.id === id)?.name || 'Cartão'; }
function categoryName(id) { return categories.find(c => c.id === id)?.name || 'Sem categoria'; }

function ensureUI() {
  const page = $('#cardsPage');
  if (!page) return;
  page.innerHTML = `
    <div class="cards-toolbar">
      <div><span class="eyebrow">CRÉDITO</span><h2>Cartões</h2><p>Gerencie limites, vencimentos, faturas e compras no cartão.</p></div>
      <button class="primary-btn" type="button" data-card-new>+ Novo cartão</button>
    </div>
    <div class="cards-kpis">
      <div class="cards-kpi"><span>Limite total</span><strong id="cardsTotalLimit">R$ 0,00</strong></div>
      <div class="cards-kpi"><span>Limite disponível</span><strong id="cardsAvailableLimit">R$ 0,00</strong></div>
      <div class="cards-kpi"><span>Fatura estimada</span><strong id="cardsInvoiceTotal">R$ 0,00</strong><div class="invoice-note">Parcelas abertas do período</div></div>
    </div>
    <div id="cardsGrid" class="cards-grid"></div>
    <article class="panel cards-expenses-panel">
      <div class="panel-head"><div><span class="eyebrow">COMPRAS</span><h3>Gastos dos cartões</h3></div><button class="ghost-btn" type="button" data-card-expense-new>+ Registrar compra</button></div>
      <div id="cardExpensesList" class="card-expense-list"></div>
    </article>`;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="cardModal" class="modal hidden" role="dialog" aria-modal="true">
      <div class="modal-backdrop" data-close-card></div>
      <div class="modal-card">
        <div class="modal-head"><div><span class="eyebrow">CARTÃO</span><h2 id="cardModalTitle">Novo cartão</h2></div><button class="icon-btn" type="button" data-close-card>×</button></div>
        <form id="cardForm" class="card-form">
          <label>Nome do cartão<input id="cardNameInput" type="text" placeholder="Ex.: Nubank, Inter, Itaú..." required /></label>
          <div class="card-modal-grid">
            <label>Limite<input id="cardLimitInput" type="number" min="0" step="0.01" inputmode="decimal" required /></label>
            <label>Conta vinculada<select id="cardAccountInput"><option value="">Sem vínculo</option></select></label>
          </div>
          <div class="card-modal-grid">
            <label>Dia do fechamento<input id="cardClosingInput" type="number" min="1" max="31" placeholder="Ex.: 5" /></label>
            <label>Dia do vencimento<input id="cardDueInput" type="number" min="1" max="31" placeholder="Ex.: 12" /></label>
          </div>
          <label id="cardActiveWrap" class="card-active-row hidden"><input id="cardActiveInput" type="checkbox" checked /><span>Cartão ativo</span></label>
          <div class="modal-actions"><button class="ghost-btn" type="button" data-close-card>Cancelar</button><button id="saveCardBtn" class="primary-btn" type="submit">Salvar cartão</button></div>
        </form>
      </div>
    </div>
    <div id="cardExpenseModal" class="modal hidden" role="dialog" aria-modal="true">
      <div class="modal-backdrop" data-close-card-expense></div>
      <div class="modal-card">
        <div class="modal-head"><div><span class="eyebrow">COMPRA NO CARTÃO</span><h2 id="cardExpenseTitle">Registrar compra</h2></div><button class="icon-btn" type="button" data-close-card-expense>×</button></div>
        <form id="cardExpenseForm" class="card-expense-form">
          <label>Descrição<input id="cardExpenseDescription" type="text" placeholder="Ex.: Mercado, notebook, combustível..." required /></label>
          <div class="card-modal-grid">
            <label>Cartão<select id="cardExpenseCard" required></select></label>
            <label>Categoria<select id="cardExpenseCategory"><option value="">Sem categoria</option></select></label>
          </div>
          <div class="card-modal-grid">
            <label>Valor total da compra<input id="cardExpenseAmount" type="number" min="0.01" step="0.01" inputmode="decimal" required /></label>
            <label>Data da compra<input id="cardExpenseDate" type="date" required /></label>
          </div>
          <div class="card-modal-grid">
            <label>Parcelas<input id="cardExpenseInstallments" type="number" min="1" max="120" value="1" required /></label>
            <label>Parcela atual<input id="cardExpenseCurrentInstallment" type="number" min="1" value="1" required /></label>
          </div>
          <label>Status<select id="cardExpenseStatus"><option value="aberta">Aberta</option><option value="paga">Paga</option><option value="cancelada">Cancelada</option></select></label>
          <div class="modal-actions"><button class="ghost-btn" type="button" data-close-card-expense>Cancelar</button><button id="saveCardExpenseBtn" class="primary-btn" type="submit">Salvar compra</button></div>
        </form>
      </div>
    </div>`);
}

function accountOptions(selected = '') {
  return '<option value="">Sem vínculo</option>' + accounts.filter(a => a.is_active).map(a => `<option value="${a.id}" ${a.id===selected?'selected':''}>${escapeHtml(a.name)}</option>`).join('');
}
function cardOptions(selected = '') {
  return '<option value="">Selecione</option>' + cards.filter(c => c.is_active).map(c => `<option value="${c.id}" ${c.id===selected?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
}
function categoryOptions(selected = '') {
  return '<option value="">Sem categoria</option>' + categories.filter(c => c.kind === 'despesa' || c.kind === 'expense' || c.kind === 'ambos' || c.kind === 'both').map(c => `<option value="${c.id}" ${c.id===selected?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
}

function renderCards() {
  const active = cards.filter(c => c.is_active);
  const totalLimit = active.reduce((s,c)=>s+Number(c.credit_limit||0),0);
  const used = active.reduce((s,c)=>s+cardUsed(c.id),0);
  const invoice = active.reduce((s,c)=>s+cardInvoice(c.id),0);
  $('#cardsTotalLimit').textContent = money(totalLimit);
  $('#cardsAvailableLimit').textContent = money(Math.max(0,totalLimit-used));
  $('#cardsInvoiceTotal').textContent = money(invoice);
  const grid = $('#cardsGrid');
  if (!cards.length) {
    grid.innerHTML = '<div class="cards-empty"><span>▤</span><strong>Nenhum cartão cadastrado</strong><p>Cadastre seu primeiro cartão para acompanhar limite e fatura.</p><button class="primary-btn" type="button" data-card-new>+ Criar cartão</button></div>';
  } else {
    grid.innerHTML = cards.map(c => {
      const limit = Number(c.credit_limit||0), usedAmount = cardUsed(c.id), available = Math.max(0,limit-usedAmount), pct = limit>0 ? Math.min(100,(usedAmount/limit)*100) : 0;
      return `<article class="credit-card-item ${c.is_active?'':'inactive'}">
        <div class="credit-card-top"><div class="credit-card-brand"><div class="credit-card-icon">R</div><div><strong>${escapeHtml(c.name)}</strong><small>${c.is_active?'Ativo':'Arquivado'}</small></div></div><span class="status-chip ${c.is_active?'':'cancelada'}">${c.is_active?'Ativo':'Inativo'}</span></div>
        <h3>${money(available)} disponíveis</h3>
        <div class="credit-card-limit-row"><span>Usado ${money(usedAmount)}</span><strong>Limite ${money(limit)}</strong></div>
        <div class="limit-bar"><i style="width:${pct}%"></i></div>
        <div class="credit-card-meta"><span>Fecha dia ${c.closing_day || '—'}</span><span>Vence dia ${c.due_day || '—'}</span><span>Fatura estimada ${money(cardInvoice(c.id))}</span></div>
        <div class="credit-card-actions"><button class="ghost-btn" type="button" data-card-expense-new="${c.id}">+ Compra</button><button class="ghost-btn" type="button" data-card-edit="${c.id}">Editar</button><button class="ghost-btn ${c.is_active?'danger-soft':''}" type="button" data-card-toggle="${c.id}">${c.is_active?'Arquivar':'Reativar'}</button></div>
      </article>`;
    }).join('');
  }
  renderExpenses();
}
function renderExpenses() {
  const host = $('#cardExpensesList');
  const sorted = [...expenses].sort((a,b)=>String(b.purchase_date).localeCompare(String(a.purchase_date)));
  if (!sorted.length) { host.innerHTML = '<div class="empty-state">Nenhuma compra registrada em cartões.</div>'; return; }
  host.innerHTML = sorted.map(e => `<div class="card-expense-row">
    <div class="card-expense-main"><strong>${escapeHtml(e.description)}</strong><small>${escapeHtml(cardName(e.card_id))} • ${escapeHtml(categoryName(e.category_id))}</small></div>
    <span>${dateBR(e.purchase_date)}</span><span class="expense-installment">${e.current_installment}/${e.installments} • ${money(Number(e.amount||0)/Math.max(1,Number(e.installments||1)))}</span>
    <span class="status-chip ${e.status}">${e.status==='aberta'?'Aberta':e.status==='paga'?'Paga':'Cancelada'}</span>
    <div class="card-expense-actions"><button class="mini-btn" data-card-expense-edit="${e.id}" type="button">Editar</button><button class="mini-btn danger" data-card-expense-delete="${e.id}" type="button">Excluir</button></div>
  </div>`).join('');
}

async function loadData() {
  if (!user) return;
  const [{data:c,error:ce},{data:e,error:ee},{data:a,error:ae},{data:k,error:ke}] = await Promise.all([
    supabase.from('cards').select('*').eq('user_id',user.id).order('created_at'),
    supabase.from('card_expenses').select('*').eq('user_id',user.id).order('purchase_date',{ascending:false}),
    supabase.from('accounts').select('id,name,is_active').eq('user_id',user.id).order('created_at'),
    supabase.from('categories').select('id,name,kind,is_active').eq('user_id',user.id).eq('is_active',true).order('name')
  ]);
  if (ce||ee||ae||ke) return toast(ce?.message||ee?.message||ae?.message||ke?.message||'Não foi possível carregar os cartões.','error');
  cards=c||[]; expenses=e||[]; accounts=a||[]; categories=k||[]; renderCards();
}

function openCard(card = null) {
  editingCardId = card?.id || null;
  $('#cardModalTitle').textContent = editingCardId ? 'Editar cartão' : 'Novo cartão';
  $('#cardNameInput').value = card?.name || '';
  $('#cardLimitInput').value = card ? Number(card.credit_limit||0) : '';
  $('#cardAccountInput').innerHTML = accountOptions(card?.account_id || '');
  $('#cardClosingInput').value = card?.closing_day || '';
  $('#cardDueInput').value = card?.due_day || '';
  $('#cardActiveInput').checked = card ? Boolean(card.is_active) : true;
  $('#cardActiveWrap').classList.toggle('hidden', !editingCardId);
  $('#cardModal').classList.remove('hidden'); document.body.classList.add('modal-open');
}
function closeCard(){ editingCardId=null; $('#cardModal').classList.add('hidden'); document.body.classList.remove('modal-open'); }
async function saveCard(event){
  event.preventDefault(); if(!user)return;
  const btn=$('#saveCardBtn'), txt=btn.textContent; btn.disabled=true; btn.textContent='Salvando...';
  const payload={user_id:user.id,account_id:$('#cardAccountInput').value||null,name:$('#cardNameInput').value.trim(),credit_limit:Number($('#cardLimitInput').value||0),closing_day:$('#cardClosingInput').value?Number($('#cardClosingInput').value):null,due_day:$('#cardDueInput').value?Number($('#cardDueInput').value):null,is_active:$('#cardActiveInput').checked,updated_at:new Date().toISOString()};
  let error;
  if(editingCardId) ({error}=await supabase.from('cards').update(payload).eq('id',editingCardId).eq('user_id',user.id));
  else ({error}=await supabase.from('cards').insert(payload));
  btn.disabled=false; btn.textContent=txt; if(error)return toast(error.message,'error');
  closeCard(); toast(editingCardId?'Cartão atualizado.':'Cartão criado.'); await loadData();
}
async function toggleCard(id){ const card=cards.find(c=>c.id===id); if(!card)return; const {error}=await supabase.from('cards').update({is_active:!card.is_active,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id); if(error)return toast(error.message,'error'); toast(card.is_active?'Cartão arquivado.':'Cartão reativado.'); await loadData(); }

function openExpense(expense = null, presetCardId = '') {
  if (!cards.some(c=>c.is_active)) return toast('Cadastre um cartão ativo primeiro.','error');
  editingExpenseId=expense?.id||null;
  $('#cardExpenseTitle').textContent=editingExpenseId?'Editar compra':'Registrar compra';
  $('#cardExpenseDescription').value=expense?.description||'';
  $('#cardExpenseCard').innerHTML=cardOptions(expense?.card_id||presetCardId);
  $('#cardExpenseCategory').innerHTML=categoryOptions(expense?.category_id||'');
  $('#cardExpenseAmount').value=expense?Number(expense.amount||0):'';
  $('#cardExpenseDate').value=expense?.purchase_date||new Date().toISOString().slice(0,10);
  $('#cardExpenseInstallments').value=expense?.installments||1;
  $('#cardExpenseCurrentInstallment').value=expense?.current_installment||1;
  $('#cardExpenseStatus').value=expense?.status||'aberta';
  $('#cardExpenseModal').classList.remove('hidden'); document.body.classList.add('modal-open');
}
function closeExpense(){ editingExpenseId=null; $('#cardExpenseModal').classList.add('hidden'); document.body.classList.remove('modal-open'); }
async function saveExpense(event){
  event.preventDefault(); if(!user)return;
  const installments=Number($('#cardExpenseInstallments').value||1), current=Number($('#cardExpenseCurrentInstallment').value||1);
  if(current>installments) return toast('A parcela atual não pode ser maior que o total de parcelas.','error');
  const btn=$('#saveCardExpenseBtn'),txt=btn.textContent; btn.disabled=true; btn.textContent='Salvando...';
  const payload={user_id:user.id,card_id:$('#cardExpenseCard').value,category_id:$('#cardExpenseCategory').value||null,description:$('#cardExpenseDescription').value.trim(),amount:Number($('#cardExpenseAmount').value),purchase_date:$('#cardExpenseDate').value,installments,current_installment:current,status:$('#cardExpenseStatus').value,updated_at:new Date().toISOString()};
  let error; if(editingExpenseId)({error}=await supabase.from('card_expenses').update(payload).eq('id',editingExpenseId).eq('user_id',user.id)); else ({error}=await supabase.from('card_expenses').insert(payload));
  btn.disabled=false; btn.textContent=txt; if(error)return toast(error.message,'error'); closeExpense(); toast(editingExpenseId?'Compra atualizada.':'Compra registrada.'); await loadData();
}
async function deleteExpense(id){ if(!confirm('Excluir esta compra do cartão?'))return; const {error}=await supabase.from('card_expenses').delete().eq('id',id).eq('user_id',user.id); if(error)return toast(error.message,'error'); toast('Compra excluída.'); await loadData(); }

function bind(){
  $('#cardsPage')?.addEventListener('click',e=>{
    const n=e.target.closest('[data-card-new]'); if(n)return openCard();
    const ed=e.target.closest('[data-card-edit]'); if(ed)return openCard(cards.find(c=>c.id===ed.dataset.cardEdit));
    const tg=e.target.closest('[data-card-toggle]'); if(tg)return toggleCard(tg.dataset.cardToggle);
    const ne=e.target.closest('[data-card-expense-new]'); if(ne)return openExpense(null,ne.dataset.cardExpenseNew||'');
    const ee=e.target.closest('[data-card-expense-edit]'); if(ee)return openExpense(expenses.find(x=>x.id===ee.dataset.cardExpenseEdit));
    const de=e.target.closest('[data-card-expense-delete]'); if(de)return deleteExpense(de.dataset.cardExpenseDelete);
  });
  $('#cardForm')?.addEventListener('submit',saveCard); $('#cardExpenseForm')?.addEventListener('submit',saveExpense);
  $$('[data-close-card]').forEach(x=>x.addEventListener('click',closeCard)); $$('[data-close-card-expense]').forEach(x=>x.addEventListener('click',closeExpense));
}

ensureStyles(); ensureUI(); bind();
const {data:{session}}=await supabase.auth.getSession(); user=session?.user||null; if(user)await loadData();
supabase.auth.onAuthStateChange((_e,s)=>{ user=s?.user||null; if(user)setTimeout(loadData,0); else {cards=[];expenses=[];renderCards();} });
