import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = (value = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const dateBR = value => value ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`)) : '—';
const toUiKind = kind => ({ receita: 'income', despesa: 'expense', transferencia: 'transfer', income: 'income', expense: 'expense', transfer: 'transfer' }[kind] || kind);
const toDbKind = kind => ({ income: 'receita', expense: 'despesa', transfer: 'transferencia' }[kind] || kind);
const kindLabel = kind => ({ income: 'Receita', expense: 'Despesa', transfer: 'Transferência' }[toUiKind(kind)] || kind);
const statusLabel = status => ({ pago: 'Pago', previsto: 'Previsto', atrasado: 'Atrasado', cancelado: 'Cancelado' }[status] || status);

let currentUser = null;
let accounts = [];
let categories = [];
let transactions = [];
let editingId = null;
let deletingId = null;
let refreshTimer = null;

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
  if (document.querySelector('link[data-renova-transactions-v2]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/transactions-module.css?v=20260912-2358';
  link.dataset.renovaTransactionsV2 = '1';
  document.head.appendChild(link);
}
function ensureModals() {
  if ($('#transactionEditModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="transactionEditModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="transactionEditTitle">
      <div class="modal-backdrop" data-close-tx-edit></div>
      <div class="modal-card">
        <div class="modal-head"><div><span class="eyebrow">MOVIMENTAÇÃO</span><h2 id="transactionEditTitle">Editar movimentação</h2></div><button class="icon-btn" type="button" data-close-tx-edit>×</button></div>
        <form id="transactionEditForm" class="tx-edit-form">
          <div class="tx-kind-tabs">
            <button class="active" type="button" data-edit-kind="income">Receita</button>
            <button type="button" data-edit-kind="expense">Despesa</button>
            <button type="button" data-edit-kind="transfer">Transferência</button>
          </div>
          <input id="editTransactionKind" type="hidden" value="income" />
          <label>Descrição<input id="editTransactionDescription" type="text" required /></label>
          <div class="tx-edit-grid">
            <label>Valor<input id="editTransactionAmount" type="number" min="0.01" step="0.01" inputmode="decimal" required /></label>
            <label>Data<input id="editTransactionDate" type="date" required /></label>
          </div>
          <div class="tx-edit-grid">
            <label>Conta<select id="editTransactionAccount" required></select></label>
            <label>Categoria<select id="editTransactionCategory"></select></label>
          </div>
          <label id="editDestinationWrap" class="hidden">Conta de destino<select id="editTransactionDestination"></select></label>
          <label>Status<select id="editTransactionStatus"><option value="pago">Pago</option><option value="previsto">Previsto</option><option value="atrasado">Atrasado</option><option value="cancelado">Cancelado</option></select></label>
          <label>Observações<textarea id="editTransactionNotes" rows="3" placeholder="Opcional"></textarea></label>
          <div class="tx-modal-actions"><button class="ghost-btn" type="button" data-close-tx-edit>Cancelar</button><button id="saveTransactionEditBtn" class="primary-btn" type="submit">Salvar alterações</button></div>
        </form>
      </div>
    </div>
    <div id="transactionDeleteModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="transactionDeleteTitle">
      <div class="modal-backdrop" data-close-tx-delete></div>
      <div class="modal-card">
        <div class="modal-head"><div><span class="eyebrow">CONFIRMAÇÃO</span><h2 id="transactionDeleteTitle">Excluir movimentação?</h2></div><button class="icon-btn" type="button" data-close-tx-delete>×</button></div>
        <p class="confirm-copy">Essa ação remove o lançamento do histórico e recalcula automaticamente os saldos e o Dashboard.</p>
        <div id="deleteTransactionPreview" class="confirm-highlight"></div>
        <div class="tx-modal-actions"><button class="ghost-btn" type="button" data-close-tx-delete>Cancelar</button><button id="confirmDeleteTransactionBtn" class="danger-btn" type="button">Excluir definitivamente</button></div>
      </div>
    </div>`);
}

function accountBalance(account) {
  let balance = Number(account.initial_balance) || 0;
  for (const t of transactions) {
    const amount = Number(t.amount) || 0;
    const kind = toUiKind(t.kind);
    if (t.account_id === account.id) {
      if (kind === 'income') balance += amount;
      if (kind === 'expense' || kind === 'transfer') balance -= amount;
    }
    if (kind === 'transfer' && t.destination_account_id === account.id) balance += amount;
  }
  return balance;
}
function categoryName(id) { return categories.find(c => c.id === id)?.name || 'Sem categoria'; }
function accountName(id) { return accounts.find(a => a.id === id)?.name || '—'; }

function filteredTransactions() {
  const query = ($('#transactionSearch')?.value || '').trim().toLowerCase();
  const kindFilter = $('#transactionKindFilter')?.value || '';
  return transactions.filter(t => {
    const kind = toUiKind(t.kind);
    return (!query || String(t.description || '').toLowerCase().includes(query) || categoryName(t.category_id).toLowerCase().includes(query)) && (!kindFilter || kind === kindFilter);
  });
}
function renderTable() {
  const host = $('#transactionsTable');
  if (!host) return;
  const rows = filteredTransactions();
  const body = rows.length ? rows.map(t => {
    const kind = toUiKind(t.kind);
    const sign = kind === 'income' ? '+' : kind === 'expense' ? '−' : '';
    return `<tr>
      <td><strong>${escapeHtml(t.description)}</strong><small>${escapeHtml(categoryName(t.category_id))}</small></td>
      <td>${dateBR(t.occurred_on)}</td>
      <td>${escapeHtml(accountName(t.account_id))}</td>
      <td><span class="kind-pill ${kind}">${kindLabel(kind)}</span></td>
      <td><span class="status-pill ${escapeHtml(t.status || 'pago')}">${escapeHtml(statusLabel(t.status || 'pago'))}</span></td>
      <td class="amount ${kind === 'income' ? 'positive' : kind === 'expense' ? 'negative' : ''}">${sign}${money(t.amount)}</td>
      <td class="actions-cell"><div class="transaction-actions"><button class="tx-action" type="button" data-tx-edit="${t.id}">Editar</button><button class="tx-action danger" type="button" data-tx-delete="${t.id}">Excluir</button></div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="7"><div class="empty-state">Nenhuma movimentação encontrada.</div></td></tr>';
  host.innerHTML = `<table class="transactions-v2"><thead><tr><th>Descrição</th><th>Data</th><th>Conta</th><th>Tipo</th><th>Status</th><th>Valor</th><th class="actions-cell">Ações</th></tr></thead><tbody>${body}</tbody></table>`;
}
function renderRecent() {
  const host = $('#recentTransactions');
  if (!host) return;
  const recent = transactions.slice(0, 6);
  host.innerHTML = recent.length ? recent.map(t => {
    const kind = toUiKind(t.kind);
    const isIncome = kind === 'income';
    return `<div class="transaction-row"><div class="transaction-icon ${isIncome ? 'income' : kind === 'transfer' ? 'transfer' : 'expense'}">${isIncome ? '↓' : kind === 'transfer' ? '↔' : '↑'}</div><div class="transaction-main"><strong>${escapeHtml(t.description)}</strong><span>${escapeHtml(categoryName(t.category_id))} • ${dateBR(t.occurred_on)}</span></div><b class="${isIncome ? 'positive' : kind === 'expense' ? 'negative' : ''}">${isIncome ? '+' : kind === 'expense' ? '−' : ''}${money(t.amount)}</b></div>`;
  }).join('') : '<div class="empty-state">Nenhuma movimentação cadastrada.</div>';
}
function syncDashboard() {
  const activeAccounts = accounts.filter(a => a.is_active);
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = transactions.filter(t => String(t.occurred_on || '').startsWith(monthKey));
  const incomes = month.filter(t => toUiKind(t.kind) === 'income');
  const expenses = month.filter(t => toUiKind(t.kind) === 'expense');
  const income = incomes.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expense = expenses.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const total = activeAccounts.reduce((sum, a) => sum + accountBalance(a), 0);
  if ($('#metricBalance')) $('#metricBalance').textContent = money(total);
  if ($('#metricIncome')) $('#metricIncome').textContent = money(income);
  if ($('#metricExpense')) $('#metricExpense').textContent = money(expense);
  if ($('#metricResult')) $('#metricResult').textContent = money(income - expense);
  if ($('#incomeCount')) $('#incomeCount').textContent = `${incomes.length} ${incomes.length === 1 ? 'lançamento' : 'lançamentos'}`;
  if ($('#expenseCount')) $('#expenseCount').textContent = `${expenses.length} ${expenses.length === 1 ? 'lançamento' : 'lançamentos'}`;
  const summary = $('#accountsSummary');
  if (summary) summary.innerHTML = activeAccounts.length ? activeAccounts.map(a => `<div class="account-row"><div><span class="account-dot"></span><div><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.account_type || 'conta')}</small></div></div><b>${money(accountBalance(a))}</b></div>`).join('') : '<div class="empty-state">Nenhuma conta cadastrada.</div>';
  renderRecent();
}

async function loadData() {
  if (!currentUser) return;
  const [{ data: a, error: ae }, { data: c, error: ce }, { data: t, error: te }] = await Promise.all([
    supabase.from('accounts').select('id,name,account_type,initial_balance,is_active').eq('user_id', currentUser.id).order('created_at'),
    supabase.from('categories').select('id,name,kind,is_active').eq('user_id', currentUser.id).eq('is_active', true).order('name'),
    supabase.from('transactions').select('id,account_id,destination_account_id,category_id,kind,description,amount,occurred_on,status,notes,created_at').eq('user_id', currentUser.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(2000)
  ]);
  if (ae || ce || te) return toast(ae?.message || ce?.message || te?.message || 'Não foi possível carregar as movimentações.', 'error');
  accounts = a || []; categories = c || []; transactions = t || [];
  renderTable(); syncDashboard();
}
async function refreshTransactionsOnly() {
  if (!currentUser) return;
  const { data, error } = await supabase.from('transactions').select('id,account_id,destination_account_id,category_id,kind,description,amount,occurred_on,status,notes,created_at').eq('user_id', currentUser.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(2000);
  if (error) return;
  transactions = data || [];
  renderTable(); syncDashboard();
}

function accountOptions(selected = '') {
  return '<option value="">Selecione</option>' + accounts.map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${escapeHtml(a.name)}${a.is_active ? '' : ' (arquivada)'}</option>`).join('');
}
function fillEditCategories(kind, selected = '') {
  const dbKind = kind === 'income' ? 'receita' : 'despesa';
  const cats = categories.filter(c => c.kind === dbKind || c.kind === kind || c.kind === 'ambos' || c.kind === 'both');
  $('#editTransactionCategory').innerHTML = '<option value="">Sem categoria</option>' + cats.map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
}
function setEditKind(kind, selectedCategory = '') {
  $('#editTransactionKind').value = kind;
  $$('[data-edit-kind]').forEach(btn => btn.classList.toggle('active', btn.dataset.editKind === kind));
  $('#editDestinationWrap').classList.toggle('hidden', kind !== 'transfer');
  fillEditCategories(kind, kind === 'transfer' ? '' : selectedCategory);
}
function openEdit(id) {
  const t = transactions.find(item => item.id === id);
  if (!t) return;
  editingId = id;
  const kind = toUiKind(t.kind);
  $('#editTransactionDescription').value = t.description || '';
  $('#editTransactionAmount').value = Number(t.amount || 0);
  $('#editTransactionDate').value = t.occurred_on || '';
  $('#editTransactionAccount').innerHTML = accountOptions(t.account_id);
  $('#editTransactionDestination').innerHTML = accountOptions(t.destination_account_id || '');
  $('#editTransactionStatus').value = t.status || 'pago';
  $('#editTransactionNotes').value = t.notes || '';
  setEditKind(kind, t.category_id || '');
  $('#transactionEditModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => $('#editTransactionDescription')?.focus(), 60);
}
function closeEdit() {
  editingId = null;
  $('#transactionEditModal')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}
async function saveEdit(event) {
  event.preventDefault();
  if (!editingId || !currentUser) return;
  const button = $('#saveTransactionEditBtn');
  const original = button.textContent; button.disabled = true; button.textContent = 'Salvando...';
  const kind = $('#editTransactionKind').value;
  const accountId = $('#editTransactionAccount').value;
  const destination = $('#editTransactionDestination').value || null;
  if (kind === 'transfer' && (!destination || destination === accountId)) {
    button.disabled = false; button.textContent = original;
    return toast('Escolha uma conta de destino diferente.', 'error');
  }
  const payload = {
    account_id: accountId,
    destination_account_id: kind === 'transfer' ? destination : null,
    category_id: kind === 'transfer' ? null : ($('#editTransactionCategory').value || null),
    kind: toDbKind(kind),
    description: $('#editTransactionDescription').value.trim(),
    amount: Number($('#editTransactionAmount').value),
    occurred_on: $('#editTransactionDate').value,
    status: $('#editTransactionStatus').value,
    notes: $('#editTransactionNotes').value.trim() || null,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('transactions').update(payload).eq('id', editingId).eq('user_id', currentUser.id);
  button.disabled = false; button.textContent = original;
  if (error) return toast(error.message, 'error');
  closeEdit();
  toast('Movimentação atualizada.');
  await refreshTransactionsOnly();
  window.dispatchEvent(new CustomEvent('renova:transactions-updated'));
}
function openDelete(id) {
  const t = transactions.find(item => item.id === id);
  if (!t) return;
  deletingId = id;
  $('#deleteTransactionPreview').innerHTML = `<strong>${escapeHtml(t.description)}</strong><b>${money(t.amount)}</b>`;
  $('#transactionDeleteModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeDelete() {
  deletingId = null;
  $('#transactionDeleteModal')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}
async function confirmDelete() {
  if (!deletingId || !currentUser) return;
  const button = $('#confirmDeleteTransactionBtn');
  const original = button.textContent; button.disabled = true; button.textContent = 'Excluindo...';
  const id = deletingId;
  const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', currentUser.id);
  button.disabled = false; button.textContent = original;
  if (error) return toast(error.message, 'error');
  closeDelete();
  toast('Movimentação excluída.');
  await refreshTransactionsOnly();
  window.dispatchEvent(new CustomEvent('renova:transactions-updated'));
}

function bind() {
  $('#transactionsTable')?.addEventListener('click', event => {
    const edit = event.target.closest('[data-tx-edit]');
    if (edit) return openEdit(edit.dataset.txEdit);
    const del = event.target.closest('[data-tx-delete]');
    if (del) return openDelete(del.dataset.txDelete);
  });
  $('#transactionSearch')?.addEventListener('input', renderTable);
  $('#transactionKindFilter')?.addEventListener('change', renderTable);
  $('#transactionEditForm')?.addEventListener('submit', saveEdit);
  $$('[data-close-tx-edit]').forEach(el => el.addEventListener('click', closeEdit));
  $$('[data-close-tx-delete]').forEach(el => el.addEventListener('click', closeDelete));
  $('#confirmDeleteTransactionBtn')?.addEventListener('click', confirmDelete);
  $$('[data-edit-kind]').forEach(btn => btn.addEventListener('click', () => setEditKind(btn.dataset.editKind, $('#editTransactionCategory')?.value || '')));

  const host = $('#transactionsTable');
  if (host) {
    const observer = new MutationObserver(() => {
      if (!currentUser || host.querySelector('[data-tx-edit]')) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshTransactionsOnly, 120);
    });
    observer.observe(host, { childList: true, subtree: true });
  }
}

ensureStyles(); ensureModals(); bind();
const { data: { session } } = await supabase.auth.getSession();
currentUser = session?.user || null;
if (currentUser) await loadData();
supabase.auth.onAuthStateChange((_event, nextSession) => {
  currentUser = nextSession?.user || null;
  if (currentUser) setTimeout(loadData, 0);
  else { accounts = []; categories = []; transactions = []; renderTable(); }
});
