import './transactions-module.js?v=20260913-0001';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector, root = document) => root.querySelector(selector);
const money = (value = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const typeLabels = {
  conta: 'Conta corrente',
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  carteira: 'Carteira digital',
  dinheiro: 'Dinheiro',
  investimento: 'Investimentos',
  outro: 'Outra conta'
};

let currentUser = null;
let accounts = [];
let transactions = [];
let editingId = null;

function toast(message, type = 'ok') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

function accountBalance(account) {
  let balance = Number(account.initial_balance) || 0;
  for (const t of transactions) {
    const amount = Number(t.amount) || 0;
    const kind = t.kind;
    const isIncome = kind === 'receita' || kind === 'income';
    const isExpense = kind === 'despesa' || kind === 'expense';
    const isTransfer = kind === 'transferencia' || kind === 'transfer';
    if (t.account_id === account.id) {
      if (isIncome) balance += amount;
      if (isExpense || isTransfer) balance -= amount;
    }
    if (isTransfer && t.destination_account_id === account.id) balance += amount;
  }
  return balance;
}

function hasTransactions(accountId) {
  return transactions.some(t => t.account_id === accountId || t.destination_account_id === accountId);
}

function syncDashboard() {
  const active = accounts.filter(a => a.is_active);
  const total = active.reduce((sum, a) => sum + accountBalance(a), 0);
  const metric = $('#metricBalance');
  if (metric) metric.textContent = money(total);

  const summary = $('#accountsSummary');
  if (summary) {
    summary.innerHTML = active.length
      ? active.map(a => `<div class="account-row"><div><span class="account-dot"></span><div><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(typeLabels[a.account_type] || a.account_type || 'Conta')}</small></div></div><b>${money(accountBalance(a))}</b></div>`).join('')
      : '<div class="empty-state">Nenhuma conta ativa.</div>';
  }

  const options = '<option value="">Selecione</option>' + active.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
  const accountSelect = $('#transactionAccount');
  const destinationSelect = $('#transactionDestinationAccount');
  if (accountSelect) accountSelect.innerHTML = options;
  if (destinationSelect) destinationSelect.innerHTML = options;
}

function renderAccounts() {
  const grid = $('#accountsGrid');
  const totalEl = $('#accountsTotalBalance');
  const countEl = $('#accountsActiveCount');
  if (!grid) return;

  const active = accounts.filter(a => a.is_active);
  if (totalEl) totalEl.textContent = money(active.reduce((sum, a) => sum + accountBalance(a), 0));
  if (countEl) countEl.textContent = `${active.length} ${active.length === 1 ? 'conta ativa' : 'contas ativas'}`;

  if (!accounts.length) {
    grid.innerHTML = '<div class="accounts-empty"><span>▣</span><strong>Nenhuma conta cadastrada</strong><p>Crie sua primeira conta para começar a organizar suas movimentações.</p><button class="primary-btn" type="button" data-account-new>+ Criar primeira conta</button></div>';
    return;
  }

  grid.innerHTML = accounts.map(a => {
    const inUse = hasTransactions(a.id);
    return `<article class="account-card ${a.is_active ? '' : 'is-inactive'}" data-account-id="${a.id}">
      <div class="account-card-top">
        <div class="account-card-icon">▣</div>
        <span class="account-status ${a.is_active ? 'active' : 'inactive'}">${a.is_active ? 'Ativa' : 'Arquivada'}</span>
      </div>
      <div class="account-card-body">
        <span class="account-type">${escapeHtml(typeLabels[a.account_type] || a.account_type || 'Conta')}</span>
        <h3>${escapeHtml(a.name)}</h3>
        <strong>${money(accountBalance(a))}</strong>
        <small>Saldo inicial: ${money(a.initial_balance)}</small>
      </div>
      <div class="account-card-actions">
        <button class="ghost-btn" type="button" data-account-edit="${a.id}">Editar</button>
        <button class="ghost-btn ${a.is_active ? 'danger-soft' : ''}" type="button" data-account-toggle="${a.id}" ${a.is_active && inUse ? 'title="Conta com movimentações não pode ser arquivada"' : ''}>${a.is_active ? 'Arquivar' : 'Reativar'}</button>
      </div>
    </article>`;
  }).join('');

  syncDashboard();
}

async function loadAccounts() {
  if (!currentUser) return;
  const [{ data: accountRows, error: accountError }, { data: txRows, error: txError }] = await Promise.all([
    supabase.from('accounts').select('id,user_id,name,account_type,currency,initial_balance,is_active,created_at').eq('user_id', currentUser.id).order('created_at'),
    supabase.from('transactions').select('id,account_id,destination_account_id,kind,amount').eq('user_id', currentUser.id)
  ]);

  if (accountError || txError) {
    toast(accountError?.message || txError?.message || 'Não foi possível carregar as contas.', 'error');
    return;
  }

  accounts = accountRows || [];
  transactions = txRows || [];
  renderAccounts();
}

function openAccountModal(account = null) {
  editingId = account?.id || null;
  $('#accountModalTitle').textContent = editingId ? 'Editar conta' : 'Nova conta';
  $('#accountName').value = account?.name || '';
  $('#accountType').value = account?.account_type || 'conta';
  $('#accountInitialBalance').value = account ? Number(account.initial_balance || 0) : 0;
  $('#accountActive').checked = account ? Boolean(account.is_active) : true;
  $('#accountActiveWrap').classList.toggle('hidden', !editingId);
  $('#accountModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => $('#accountName')?.focus(), 80);
}

function closeAccountModal() {
  $('#accountModal').classList.add('hidden');
  document.body.classList.remove('modal-open');
  editingId = null;
}

async function saveAccount(event) {
  event.preventDefault();
  if (!currentUser) return;
  const button = $('#saveAccountBtn');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Salvando...';

  const payload = {
    user_id: currentUser.id,
    name: $('#accountName').value.trim(),
    account_type: $('#accountType').value,
    currency: 'BRL',
    initial_balance: Number($('#accountInitialBalance').value || 0),
    is_active: $('#accountActive').checked
  };

  let error;
  if (editingId) {
    const existing = accounts.find(a => a.id === editingId);
    if (existing?.is_active && !payload.is_active && hasTransactions(editingId)) {
      button.disabled = false;
      button.textContent = original;
      return toast('Esta conta possui movimentações e não pode ser arquivada enquanto estiver em uso.', 'error');
    }
    ({ error } = await supabase.from('accounts').update(payload).eq('id', editingId).eq('user_id', currentUser.id));
  } else {
    ({ error } = await supabase.from('accounts').insert(payload));
  }

  button.disabled = false;
  button.textContent = original;
  if (error) return toast(error.message, 'error');

  const wasEditing = Boolean(editingId);
  closeAccountModal();
  toast(wasEditing ? 'Conta atualizada.' : 'Conta criada com sucesso.');
  await loadAccounts();
  window.dispatchEvent(new CustomEvent('renova:accounts-updated'));
}

async function toggleAccount(id) {
  const account = accounts.find(a => a.id === id);
  if (!account) return;
  if (account.is_active && hasTransactions(id)) {
    return toast('Esta conta possui movimentações e não pode ser arquivada enquanto estiver em uso.', 'error');
  }
  const { error } = await supabase.from('accounts').update({ is_active: !account.is_active }).eq('id', id).eq('user_id', currentUser.id);
  if (error) return toast(error.message, 'error');
  toast(account.is_active ? 'Conta arquivada.' : 'Conta reativada.');
  await loadAccounts();
  window.dispatchEvent(new CustomEvent('renova:accounts-updated'));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function bindEvents() {
  $('#accountsPage')?.addEventListener('click', event => {
    const newBtn = event.target.closest('[data-account-new]');
    if (newBtn) return openAccountModal();
    const edit = event.target.closest('[data-account-edit]');
    if (edit) return openAccountModal(accounts.find(a => a.id === edit.dataset.accountEdit));
    const toggle = event.target.closest('[data-account-toggle]');
    if (toggle) return toggleAccount(toggle.dataset.accountToggle);
  });
  $('#accountForm')?.addEventListener('submit', saveAccount);
  document.querySelectorAll('[data-close-account-modal]').forEach(el => el.addEventListener('click', closeAccountModal));
  window.addEventListener('renova:transactions-updated', () => currentUser && loadAccounts());
}

async function init(session) {
  currentUser = session?.user || null;
  if (!currentUser) return;
  await loadAccounts();
  if (location.hash === '#accounts') {
    document.querySelector('[data-page="accounts"]')?.click();
  }
}

bindEvents();
const { data: { session } } = await supabase.auth.getSession();
await init(session);
supabase.auth.onAuthStateChange((_event, nextSession) => {
  currentUser = nextSession?.user || null;
  if (currentUser) setTimeout(() => loadAccounts(), 0);
  else {
    accounts = [];
    transactions = [];
    renderAccounts();
  }
});
