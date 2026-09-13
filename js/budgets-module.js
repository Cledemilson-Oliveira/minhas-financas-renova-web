import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector, root = document) => root.querySelector(selector);
const money = (value = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const todayMonth = () => new Date().toISOString().slice(0, 7);
const firstDay = month => `${month}-01`;
const nextMonthFirstDay = month => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

let currentUser = null;
let selectedMonth = todayMonth();
let categories = [];
let budgets = [];
let transactions = [];
let cardExpenses = [];
let editingBudgetId = null;
let deletingBudgetId = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}
function toast(message, type = 'ok') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 3200);
}
function ensureStyles() {
  if (document.querySelector('link[data-renova-budgets]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/budgets-module.css?v=20260913-0030';
  link.dataset.renovaBudgets = '1';
  document.head.appendChild(link);
}
function ensureUI() {
  const page = $('#budgetsPage');
  if (!page) return;
  page.innerHTML = `
    <div class="budgets-shell">
      <div class="budgets-toolbar">
        <div><span class="eyebrow">PLANEJAMENTO</span><h2>Orçamentos</h2><p>Defina limites por categoria e acompanhe o que já foi comprometido no mês.</p></div>
        <div class="budget-month-wrap">
          <label>Mês de referência<input id="budgetMonth" type="month" /></label>
          <button id="newBudgetBtn" class="primary-btn" type="button">+ Novo orçamento</button>
        </div>
      </div>
      <div class="budgets-metrics">
        <article class="budget-metric"><span>Total planejado</span><strong id="budgetMetricPlanned">R$ 0,00</strong><small>Limites definidos</small></article>
        <article class="budget-metric"><span>Gasto no mês</span><strong id="budgetMetricSpent">R$ 0,00</strong><small>Despesas + cartão</small></article>
        <article class="budget-metric good"><span>Disponível</span><strong id="budgetMetricAvailable">R$ 0,00</strong><small>Antes de atingir os limites</small></article>
        <article class="budget-metric"><span>Uso do orçamento</span><strong id="budgetMetricUsage">0%</strong><small id="budgetMetricStatus">Sem orçamento definido</small></article>
      </div>
      <div id="budgetsGrid" class="budgets-grid"></div>
      <div class="budget-categories-panel">
        <h3>Categorias sem orçamento neste mês</h3>
        <div id="budgetCategoryChips" class="budget-category-chips"></div>
      </div>
    </div>`;

  if ($('#budgetModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="budgetModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="budgetModalTitle">
      <div class="modal-backdrop" data-close-budget-modal></div>
      <div class="modal-card">
        <div class="modal-head"><div><span class="eyebrow">ORÇAMENTO MENSAL</span><h2 id="budgetModalTitle">Novo orçamento</h2></div><button class="icon-btn" data-close-budget-modal type="button">×</button></div>
        <form id="budgetForm" class="budget-form">
          <label>Categoria<select id="budgetCategory" required></select></label>
          <label>Valor planejado<input id="budgetAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" required /></label>
          <div class="budget-modal-actions"><button class="ghost-btn" data-close-budget-modal type="button">Cancelar</button><button id="saveBudgetBtn" class="primary-btn" type="submit">Salvar orçamento</button></div>
        </form>
      </div>
    </div>
    <div id="budgetDeleteModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="budgetDeleteTitle">
      <div class="modal-backdrop" data-close-budget-delete></div>
      <div class="modal-card">
        <div class="modal-head"><div><span class="eyebrow">CONFIRMAÇÃO</span><h2 id="budgetDeleteTitle">Remover orçamento?</h2></div><button class="icon-btn" data-close-budget-delete type="button">×</button></div>
        <p>O limite mensal será removido, mas nenhum lançamento financeiro será excluído.</p>
        <div id="budgetDeletePreview" class="confirm-highlight"></div>
        <div class="budget-modal-actions"><button class="ghost-btn" data-close-budget-delete type="button">Cancelar</button><button id="confirmDeleteBudgetBtn" class="danger-btn" type="button">Remover orçamento</button></div>
      </div>
    </div>`);
}

function isExpenseCategory(category) {
  return ['despesa', 'expense', 'ambos', 'both'].includes(category.kind);
}
function categoryById(id) { return categories.find(c => c.id === id); }
function budgetByCategory(id) { return budgets.find(b => b.category_id === id); }
function spentForCategory(categoryId) {
  const txTotal = transactions
    .filter(t => t.category_id === categoryId && ['despesa', 'expense'].includes(t.kind) && t.status !== 'cancelado')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const cardTotal = cardExpenses
    .filter(e => e.category_id === categoryId && e.status !== 'cancelada')
    .reduce((sum, e) => sum + (Number(e.amount || 0) / Math.max(1, Number(e.installments || 1))), 0);
  return txTotal + cardTotal;
}
function totalSpentAllCategories() {
  const txTotal = transactions
    .filter(t => ['despesa', 'expense'].includes(t.kind) && t.status !== 'cancelado')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const cardTotal = cardExpenses
    .filter(e => e.status !== 'cancelada')
    .reduce((sum, e) => sum + (Number(e.amount || 0) / Math.max(1, Number(e.installments || 1))), 0);
  return txTotal + cardTotal;
}
function budgetState(planned, spent) {
  if (planned <= 0) return { pct: spent > 0 ? 100 : 0, tone: spent > 0 ? 'bad' : 'good', label: spent > 0 ? 'Sem limite' : 'Disponível' };
  const pct = Math.round((spent / planned) * 100);
  if (pct > 100) return { pct, tone: 'bad', label: 'Ultrapassado' };
  if (pct >= 80) return { pct, tone: 'warn', label: 'Atenção' };
  return { pct, tone: 'good', label: 'Dentro do limite' };
}

function render() {
  const grid = $('#budgetsGrid');
  if (!grid) return;
  const planned = budgets.reduce((sum, b) => sum + Number(b.planned_amount || 0), 0);
  const spent = totalSpentAllCategories();
  const available = planned - spent;
  const usage = planned > 0 ? Math.round((spent / planned) * 100) : 0;

  $('#budgetMetricPlanned').textContent = money(planned);
  $('#budgetMetricSpent').textContent = money(spent);
  $('#budgetMetricAvailable').textContent = money(available);
  $('#budgetMetricUsage').textContent = `${usage}%`;
  const status = $('#budgetMetricStatus');
  status.textContent = planned <= 0 ? 'Sem orçamento definido' : usage > 100 ? 'Limite total ultrapassado' : usage >= 80 ? 'Atenção aos gastos' : 'Planejamento sob controle';
  const availableCard = $('#budgetMetricAvailable')?.closest('.budget-metric');
  if (availableCard) availableCard.className = `budget-metric ${available < 0 ? 'bad' : available < planned * .2 && planned > 0 ? 'warn' : 'good'}`;

  if (!budgets.length) {
    grid.innerHTML = '<div class="budget-empty"><div><span style="font-size:28px">◎</span><strong>Nenhum orçamento definido</strong><p>Crie limites mensais por categoria para acompanhar seus gastos.</p><button class="primary-btn" type="button" data-budget-new>+ Criar primeiro orçamento</button></div></div>';
  } else {
    grid.innerHTML = budgets.map(b => {
      const cat = categoryById(b.category_id);
      const plannedAmount = Number(b.planned_amount || 0);
      const spentAmount = spentForCategory(b.category_id);
      const availableAmount = plannedAmount - spentAmount;
      const state = budgetState(plannedAmount, spentAmount);
      return `<article class="budget-card">
        <div class="budget-card-head"><div class="budget-card-title"><div class="budget-icon">${escapeHtml(cat?.icon || '◎')}</div><div><h3>${escapeHtml(cat?.name || 'Categoria')}</h3><div class="budget-sub">${selectedMonth.split('-').reverse().join('/')}</div></div></div><span class="budget-status ${state.tone}">${state.label}</span></div>
        <div class="budget-progress ${state.tone}"><i style="width:${Math.min(100, Math.max(0, state.pct))}%"></i></div>
        <div class="budget-values"><div><span>Planejado</span><b>${money(plannedAmount)}</b></div><div><span>Gasto</span><b>${money(spentAmount)}</b></div><div><span>Disponível</span><b>${money(availableAmount)}</b></div></div>
        <div class="budget-actions"><button class="ghost-btn" type="button" data-budget-edit="${b.id}">Editar</button><button class="ghost-btn" type="button" data-budget-delete="${b.id}">Remover</button></div>
      </article>`;
    }).join('');
  }

  const unbudgeted = categories.filter(c => isExpenseCategory(c) && !budgetByCategory(c.id));
  $('#budgetCategoryChips').innerHTML = unbudgeted.length
    ? unbudgeted.map(c => `<button class="budget-category-chip" type="button" data-budget-category="${c.id}">${escapeHtml(c.icon || '•')} ${escapeHtml(c.name)}</button>`).join('')
    : '<span style="color:var(--muted,#8fa1b8);font-size:12px">Todas as categorias de despesa já possuem orçamento neste mês.</span>';
}

async function loadData() {
  if (!currentUser) return;
  const start = firstDay(selectedMonth);
  const end = nextMonthFirstDay(selectedMonth);
  const [{ data: cats, error: ce }, { data: bs, error: be }, { data: txs, error: te }, { data: cards, error: cde }] = await Promise.all([
    supabase.from('categories').select('id,name,kind,icon,is_active').eq('user_id', currentUser.id).eq('is_active', true).order('name'),
    supabase.from('budgets').select('id,category_id,month,planned_amount,created_at,updated_at').eq('user_id', currentUser.id).eq('month', start).order('created_at'),
    supabase.from('transactions').select('id,category_id,kind,amount,status,occurred_on').eq('user_id', currentUser.id).gte('occurred_on', start).lt('occurred_on', end),
    supabase.from('card_expenses').select('id,category_id,amount,installments,status,purchase_date').eq('user_id', currentUser.id).gte('purchase_date', start).lt('purchase_date', end)
  ]);
  if (ce || be || te || cde) return toast(ce?.message || be?.message || te?.message || cde?.message || 'Não foi possível carregar os orçamentos.', 'error');
  categories = cats || [];
  budgets = bs || [];
  transactions = txs || [];
  cardExpenses = cards || [];
  render();
}

function categoryOptions(selected = '') {
  const expenseCats = categories.filter(isExpenseCategory);
  return '<option value="">Selecione</option>' + expenseCats.map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
}
function openBudgetModal(categoryId = '', budgetId = null) {
  editingBudgetId = budgetId;
  const budget = budgetId ? budgets.find(b => b.id === budgetId) : null;
  const selectedCategory = budget?.category_id || categoryId;
  $('#budgetModalTitle').textContent = budget ? 'Editar orçamento' : 'Novo orçamento';
  $('#budgetCategory').innerHTML = categoryOptions(selectedCategory);
  $('#budgetCategory').disabled = Boolean(budget);
  $('#budgetAmount').value = budget ? Number(budget.planned_amount || 0) : '';
  $('#budgetModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => budget ? $('#budgetAmount')?.focus() : $('#budgetCategory')?.focus(), 60);
}
function closeBudgetModal() {
  editingBudgetId = null;
  $('#budgetCategory').disabled = false;
  $('#budgetModal')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}
async function saveBudget(event) {
  event.preventDefault();
  if (!currentUser) return;
  const categoryId = $('#budgetCategory').value;
  const amount = Number($('#budgetAmount').value || 0);
  if (!categoryId) return toast('Escolha uma categoria.', 'error');
  if (amount < 0) return toast('O valor planejado não pode ser negativo.', 'error');
  const button = $('#saveBudgetBtn');
  const original = button.textContent; button.disabled = true; button.textContent = 'Salvando...';
  let error;
  if (editingBudgetId) {
    ({ error } = await supabase.from('budgets').update({ planned_amount: amount, updated_at: new Date().toISOString() }).eq('id', editingBudgetId).eq('user_id', currentUser.id));
  } else {
    const existing = budgetByCategory(categoryId);
    if (existing) {
      ({ error } = await supabase.from('budgets').update({ planned_amount: amount, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('user_id', currentUser.id));
    } else {
      ({ error } = await supabase.from('budgets').insert({ user_id: currentUser.id, category_id: categoryId, month: firstDay(selectedMonth), planned_amount: amount }));
    }
  }
  button.disabled = false; button.textContent = original;
  if (error) return toast(error.message, 'error');
  closeBudgetModal();
  toast(editingBudgetId ? 'Orçamento atualizado.' : 'Orçamento salvo.');
  await loadData();
}
function openDeleteBudget(id) {
  const b = budgets.find(item => item.id === id);
  if (!b) return;
  deletingBudgetId = id;
  const cat = categoryById(b.category_id);
  $('#budgetDeletePreview').innerHTML = `<strong>${escapeHtml(cat?.name || 'Categoria')}</strong><b>${money(b.planned_amount)}</b>`;
  $('#budgetDeleteModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeDeleteBudget() {
  deletingBudgetId = null;
  $('#budgetDeleteModal')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}
async function confirmDeleteBudget() {
  if (!deletingBudgetId || !currentUser) return;
  const button = $('#confirmDeleteBudgetBtn');
  const original = button.textContent; button.disabled = true; button.textContent = 'Removendo...';
  const { error } = await supabase.from('budgets').delete().eq('id', deletingBudgetId).eq('user_id', currentUser.id);
  button.disabled = false; button.textContent = original;
  if (error) return toast(error.message, 'error');
  closeDeleteBudget();
  toast('Orçamento removido.');
  await loadData();
}

function bind() {
  $('#budgetMonth').value = selectedMonth;
  $('#budgetMonth').addEventListener('change', async event => {
    selectedMonth = event.target.value || todayMonth();
    await loadData();
  });
  $('#newBudgetBtn').addEventListener('click', () => openBudgetModal());
  $('#budgetsPage').addEventListener('click', event => {
    const add = event.target.closest('[data-budget-new]');
    if (add) return openBudgetModal();
    const chip = event.target.closest('[data-budget-category]');
    if (chip) return openBudgetModal(chip.dataset.budgetCategory);
    const edit = event.target.closest('[data-budget-edit]');
    if (edit) return openBudgetModal('', edit.dataset.budgetEdit);
    const del = event.target.closest('[data-budget-delete]');
    if (del) return openDeleteBudget(del.dataset.budgetDelete);
  });
  $('#budgetForm').addEventListener('submit', saveBudget);
  document.querySelectorAll('[data-close-budget-modal]').forEach(el => el.addEventListener('click', closeBudgetModal));
  document.querySelectorAll('[data-close-budget-delete]').forEach(el => el.addEventListener('click', closeDeleteBudget));
  $('#confirmDeleteBudgetBtn').addEventListener('click', confirmDeleteBudget);
  window.addEventListener('renova:transactions-updated', loadData);
  window.addEventListener('renova:cards-updated', loadData);
}

ensureStyles();
ensureUI();
bind();
const { data: { session } } = await supabase.auth.getSession();
currentUser = session?.user || null;
if (currentUser) await loadData();
supabase.auth.onAuthStateChange((_event, nextSession) => {
  currentUser = nextSession?.user || null;
  if (currentUser) setTimeout(loadData, 0);
  else { categories = []; budgets = []; transactions = []; cardExpenses = []; render(); }
});
