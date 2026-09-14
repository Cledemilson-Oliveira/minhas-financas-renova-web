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
let chargingId = null;
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
function localTodayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function dayNumber(isoDate) {
  if (!isoDate) return null;
  const [year, month, day] = String(isoDate).split('-').map(Number);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}
function lateDays(dueDate) {
  const due = dayNumber(dueDate);
  const today = dayNumber(localTodayISO());
  if (due === null || today === null) return 0;
  return Math.max(0, today - due);
}
function chargeBreakdown(transaction, overrides = {}) {
  const t = { ...transaction, ...overrides };
  const base = Math.max(0, Number(t.amount) || 0);
  const days = lateDays(t.due_date);
  const feePercent = Math.max(0, Number(t.late_fee_percent) || 0);
  const dailyPercent = Math.max(0, Number(t.late_interest_percent_daily) || 0);
  const fixed = Math.max(0, Number(t.late_charge_fixed) || 0);
  const eligible = toUiKind(t.kind) === 'expense' && days > 0 && !['pago', 'cancelado'].includes(t.status || 'pago');
  const lateFee = eligible ? base * feePercent / 100 : 0;
  const interest = eligible ? base * dailyPercent / 100 * days : 0;
  const fixedApplied = eligible ? fixed : 0;
  const additional = lateFee + interest + fixedApplied;
  return { base, days, feePercent, dailyPercent, fixed, eligible, lateFee, interest, fixedApplied, additional, total: base + additional };
}
function effectiveStatus(t) {
  if (toUiKind(t.kind) === 'expense' && t.status === 'previsto' && lateDays(t.due_date) > 0) return 'atrasado';
  return t.status || 'pago';
}
function normalizeExpenseStatus(status, dueDate) {
  if (status === 'previsto' && lateDays(dueDate) > 0) return 'atrasado';
  return status;
}
function ensureStyles() {
  if (document.querySelector('link[data-renova-transactions-v2]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/transactions-module.css?v=20260914-0821';
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
            <label>Data do lançamento<input id="editTransactionDate" type="date" required /></label>
          </div>
          <div class="tx-edit-grid">
            <label>Conta<select id="editTransactionAccount" required></select></label>
            <label>Categoria<select id="editTransactionCategory"></select></label>
          </div>
          <label id="editDestinationWrap" class="hidden">Conta de destino<select id="editTransactionDestination"></select></label>
          <div class="tx-edit-grid">
            <label>Status<select id="editTransactionStatus"><option value="pago">Pago</option><option value="previsto">Previsto</option><option value="atrasado">Atrasado</option><option value="cancelado">Cancelado</option></select></label>
            <label id="editDueDateWrap" class="hidden">Vencimento<input id="editTransactionDueDate" type="date" /></label>
          </div>
          <label>Observações<textarea id="editTransactionNotes" rows="3" placeholder="Opcional"></textarea></label>
          <div class="tx-modal-actions"><button class="ghost-btn" type="button" data-close-tx-edit>Cancelar</button><button id="saveTransactionEditBtn" class="primary-btn" type="submit">Salvar alterações</button></div>
        </form>
      </div>
    </div>

    <div id="transactionChargesModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="transactionChargesTitle">
      <div class="modal-backdrop" data-close-tx-charges></div>
      <div class="modal-card charges-modal-card">
        <div class="modal-head"><div><span class="eyebrow">CONTA A PAGAR</span><h2 id="transactionChargesTitle">Multas e encargos</h2></div><button class="icon-btn" type="button" data-close-tx-charges>×</button></div>
        <form id="transactionChargesForm" class="tx-edit-form">
          <div id="chargesTransactionPreview" class="charges-transaction-preview"></div>
          <div class="tx-edit-grid">
            <label>Vencimento<input id="chargesDueDate" type="date" required /></label>
            <label>Status<select id="chargesStatus"><option value="previsto">Previsto</option><option value="atrasado">Atrasado</option><option value="pago">Pago</option><option value="cancelado">Cancelado</option></select></label>
          </div>
          <div class="charges-fields-grid">
            <label>Multa por atraso (%)<input id="chargesLateFeePercent" type="number" min="0" step="0.01" inputmode="decimal" value="0" /></label>
            <label>Juros ao dia (%)<input id="chargesDailyInterestPercent" type="number" min="0" step="0.0001" inputmode="decimal" value="0" /></label>
            <label>Encargo fixo (R$)<input id="chargesFixedAmount" type="number" min="0" step="0.01" inputmode="decimal" value="0" /></label>
          </div>
          <div id="chargesCalculation" class="charges-calculation"></div>
          <p class="charges-help">Os encargos são calculados sobre o valor original somente após o vencimento. O valor base não é sobrescrito, evitando juros sobre juros por atualização da tela.</p>
          <div class="tx-modal-actions"><button class="ghost-btn" type="button" data-close-tx-charges>Cancelar</button><button id="saveTransactionChargesBtn" class="primary-btn" type="submit">Salvar encargos</button></div>
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
    const status = effectiveStatus(t);
    const charges = chargeBreakdown(t, { status });
    const dueCopy = kind === 'expense' && t.due_date ? `<small>Vence ${dateBR(t.due_date)}${charges.days > 0 && !['pago', 'cancelado'].includes(status) ? ` • ${charges.days}d em atraso` : ''}</small>` : '';
    const amountCopy = charges.eligible && charges.additional > 0
      ? `<strong>${sign}${money(charges.total)}</strong><small>Base ${money(charges.base)} • +${money(charges.additional)} encargos</small>`
      : `${sign}${money(t.amount)}`;
    const chargesButton = kind === 'expense' ? `<button class="tx-action charge" type="button" data-tx-charges="${t.id}">Encargos</button>` : '';
    return `<tr>
      <td><strong>${escapeHtml(t.description)}</strong><small>${escapeHtml(categoryName(t.category_id))}</small></td>
      <td>${dateBR(t.occurred_on)}${dueCopy}</td>
      <td>${escapeHtml(accountName(t.account_id))}</td>
      <td><span class="kind-pill ${kind}">${kindLabel(kind)}</span></td>
      <td><span class="status-pill ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></td>
      <td class="amount ${kind === 'income' ? 'positive' : kind === 'expense' ? 'negative' : ''}">${amountCopy}</td>
      <td class="actions-cell"><div class="transaction-actions">${chargesButton}<button class="tx-action" type="button" data-tx-edit="${t.id}">Editar</button><button class="tx-action danger" type="button" data-tx-delete="${t.id}">Excluir</button></div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="7"><div class="empty-state">Nenhuma movimentação encontrada.</div></td></tr>';
  host.innerHTML = `<table class="transactions-v2"><thead><tr><th>Descrição</th><th>Data / vencimento</th><th>Conta</th><th>Tipo</th><th>Status</th><th>Valor</th><th class="actions-cell">Ações</th></tr></thead><tbody>${body}</tbody></table>`;
}
function renderRecent() {
  const host = $('#recentTransactions');
  if (!host) return;
  const recent = transactions.slice(0, 6);
  host.innerHTML = recent.length ? recent.map(t => {
    const kind = toUiKind(t.kind);
    const isIncome = kind === 'income';
    const status = effectiveStatus(t);
    const charges = chargeBreakdown(t, { status });
    const displayAmount = charges.eligible ? charges.total : Number(t.amount || 0);
    return `<div class="transaction-row"><div class="transaction-icon ${isIncome ? 'income' : kind === 'transfer' ? 'transfer' : 'expense'}">${isIncome ? '↓' : kind === 'transfer' ? '↔' : '↑'}</div><div class="transaction-main"><strong>${escapeHtml(t.description)}</strong><span>${escapeHtml(categoryName(t.category_id))} • ${dateBR(t.occurred_on)}${kind === 'expense' && t.due_date ? ` • vence ${dateBR(t.due_date)}` : ''}</span></div><b class="${isIncome ? 'positive' : kind === 'expense' ? 'negative' : ''}">${isIncome ? '+' : kind === 'expense' ? '−' : ''}${money(displayAmount)}</b></div>`;
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

const transactionSelect = 'id,account_id,destination_account_id,category_id,kind,description,amount,occurred_on,due_date,status,notes,late_fee_percent,late_interest_percent_daily,late_charge_fixed,created_at';
async function loadData() {
  if (!currentUser) return;
  const [{ data: a, error: ae }, { data: c, error: ce }, { data: t, error: te }] = await Promise.all([
    supabase.from('accounts').select('id,name,account_type,initial_balance,is_active').eq('user_id', currentUser.id).order('created_at'),
    supabase.from('categories').select('id,name,kind,is_active').eq('user_id', currentUser.id).eq('is_active', true).order('name'),
    supabase.from('transactions').select(transactionSelect).eq('user_id', currentUser.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(2000)
  ]);
  if (ae || ce || te) return toast(ae?.message || ce?.message || te?.message || 'Não foi possível carregar as movimentações.', 'error');
  accounts = a || []; categories = c || []; transactions = t || [];
  renderTable(); syncDashboard();
}
async function refreshTransactionsOnly() {
  if (!currentUser) return;
  const { data, error } = await supabase.from('transactions').select(transactionSelect).eq('user_id', currentUser.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(2000);
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
  $('#editDueDateWrap').classList.toggle('hidden', kind !== 'expense');
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
  $('#editTransactionDueDate').value = t.due_date || t.occurred_on || '';
  $('#editTransactionAccount').innerHTML = accountOptions(t.account_id);
  $('#editTransactionDestination').innerHTML = accountOptions(t.destination_account_id || '');
  $('#editTransactionStatus').value = effectiveStatus(t);
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
  const dueDate = kind === 'expense' ? ($('#editTransactionDueDate').value || null) : null;
  const selectedStatus = $('#editTransactionStatus').value;
  const payload = {
    account_id: accountId,
    destination_account_id: kind === 'transfer' ? destination : null,
    category_id: kind === 'transfer' ? null : ($('#editTransactionCategory').value || null),
    kind: toDbKind(kind),
    description: $('#editTransactionDescription').value.trim(),
    amount: Number($('#editTransactionAmount').value),
    occurred_on: $('#editTransactionDate').value,
    due_date: dueDate,
    status: kind === 'expense' ? normalizeExpenseStatus(selectedStatus, dueDate) : selectedStatus,
    notes: $('#editTransactionNotes').value.trim() || null,
    updated_at: new Date().toISOString()
  };
  if (kind !== 'expense') {
    payload.late_fee_percent = 0;
    payload.late_interest_percent_daily = 0;
    payload.late_charge_fixed = 0;
  }
  const { error } = await supabase.from('transactions').update(payload).eq('id', editingId).eq('user_id', currentUser.id);
  button.disabled = false; button.textContent = original;
  if (error) return toast(error.message, 'error');
  closeEdit();
  toast('Movimentação atualizada.');
  await refreshTransactionsOnly();
  window.dispatchEvent(new CustomEvent('renova:transactions-updated'));
}

function renderChargesPreview() {
  if (!chargingId) return;
  const t = transactions.find(item => item.id === chargingId);
  if (!t) return;
  const status = $('#chargesStatus')?.value || t.status || 'previsto';
  const dueDate = $('#chargesDueDate')?.value || t.due_date || t.occurred_on || '';
  const breakdown = chargeBreakdown(t, {
    status,
    due_date: dueDate,
    late_fee_percent: Number($('#chargesLateFeePercent')?.value || 0),
    late_interest_percent_daily: Number($('#chargesDailyInterestPercent')?.value || 0),
    late_charge_fixed: Number($('#chargesFixedAmount')?.value || 0)
  });
  const reason = ['pago', 'cancelado'].includes(status)
    ? 'Encargos guardados, mas não aplicados enquanto a conta estiver paga ou cancelada.'
    : breakdown.days === 0
      ? 'Ainda não há atraso. O valor atualizado permanece igual ao valor original.'
      : `${breakdown.days} ${breakdown.days === 1 ? 'dia' : 'dias'} de atraso calculados até hoje.`;
  $('#chargesCalculation').innerHTML = `
    <div><span>Valor original</span><b>${money(breakdown.base)}</b></div>
    <div><span>Multa</span><b>+ ${money(breakdown.lateFee)}</b></div>
    <div><span>Juros (${breakdown.days}d)</span><b>+ ${money(breakdown.interest)}</b></div>
    <div><span>Encargo fixo</span><b>+ ${money(breakdown.fixedApplied)}</b></div>
    <div class="charges-total"><span>Valor atualizado</span><strong>${money(breakdown.total)}</strong></div>
    <small>${escapeHtml(reason)}</small>`;
}
function openCharges(id) {
  const t = transactions.find(item => item.id === id);
  if (!t || toUiKind(t.kind) !== 'expense') return;
  chargingId = id;
  $('#chargesTransactionPreview').innerHTML = `<div><span>Despesa</span><strong>${escapeHtml(t.description)}</strong></div><b>${money(t.amount)}</b>`;
  $('#chargesDueDate').value = t.due_date || t.occurred_on || localTodayISO();
  $('#chargesStatus').value = effectiveStatus(t) || 'previsto';
  $('#chargesLateFeePercent').value = Number(t.late_fee_percent || 0);
  $('#chargesDailyInterestPercent').value = Number(t.late_interest_percent_daily || 0);
  $('#chargesFixedAmount').value = Number(t.late_charge_fixed || 0);
  renderChargesPreview();
  $('#transactionChargesModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => $('#chargesDueDate')?.focus(), 60);
}
function closeCharges() {
  chargingId = null;
  $('#transactionChargesModal')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}
async function saveCharges(event) {
  event.preventDefault();
  if (!chargingId || !currentUser) return;
  const button = $('#saveTransactionChargesBtn');
  const original = button.textContent; button.disabled = true; button.textContent = 'Salvando...';
  const dueDate = $('#chargesDueDate').value || null;
  const selectedStatus = $('#chargesStatus').value;
  const payload = {
    due_date: dueDate,
    status: normalizeExpenseStatus(selectedStatus, dueDate),
    late_fee_percent: Math.max(0, Number($('#chargesLateFeePercent').value) || 0),
    late_interest_percent_daily: Math.max(0, Number($('#chargesDailyInterestPercent').value) || 0),
    late_charge_fixed: Math.max(0, Number($('#chargesFixedAmount').value) || 0),
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('transactions').update(payload).eq('id', chargingId).eq('user_id', currentUser.id);
  button.disabled = false; button.textContent = original;
  if (error) return toast(error.message, 'error');
  closeCharges();
  toast('Multas e encargos atualizados.');
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
    const charges = event.target.closest('[data-tx-charges]');
    if (charges) return openCharges(charges.dataset.txCharges);
    const edit = event.target.closest('[data-tx-edit]');
    if (edit) return openEdit(edit.dataset.txEdit);
    const del = event.target.closest('[data-tx-delete]');
    if (del) return openDelete(del.dataset.txDelete);
  });
  $('#transactionSearch')?.addEventListener('input', renderTable);
  $('#transactionKindFilter')?.addEventListener('change', renderTable);
  $('#transactionEditForm')?.addEventListener('submit', saveEdit);
  $('#transactionChargesForm')?.addEventListener('submit', saveCharges);
  $$('[data-close-tx-edit]').forEach(el => el.addEventListener('click', closeEdit));
  $$('[data-close-tx-charges]').forEach(el => el.addEventListener('click', closeCharges));
  $$('[data-close-tx-delete]').forEach(el => el.addEventListener('click', closeDelete));
  $('#confirmDeleteTransactionBtn')?.addEventListener('click', confirmDelete);
  $$('[data-edit-kind]').forEach(btn => btn.addEventListener('click', () => setEditKind(btn.dataset.editKind, $('#editTransactionCategory')?.value || '')));
  ['#chargesDueDate', '#chargesStatus', '#chargesLateFeePercent', '#chargesDailyInterestPercent', '#chargesFixedAmount'].forEach(selector => {
    $(selector)?.addEventListener('input', renderChargesPreview);
    $(selector)?.addEventListener('change', renderChargesPreview);
  });

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
