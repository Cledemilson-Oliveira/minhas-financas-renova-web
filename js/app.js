import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { user: null, profile: null, access: null, accounts: [], categories: [], transactions: [], subscription: null };
const pageMeta = {
  dashboard: ['VISÃO GERAL', 'Dashboard'], transactions: ['FINANCEIRO', 'Movimentações'], accounts: ['PATRIMÔNIO', 'Contas'],
  cards: ['CRÉDITO', 'Cartões'], budgets: ['PLANEJAMENTO', 'Orçamentos'], goals: ['OBJETIVOS', 'Metas'],
  ai: ['INTELIGÊNCIA FINANCEIRA', 'IA Financeira'], subscription: ['PLANO', 'Assinatura']
};

const DB_KIND_FROM_UI = { income: 'receita', expense: 'despesa', transfer: 'transferencia' };
const UI_KIND_FROM_DB = { receita: 'income', despesa: 'expense', transferencia: 'transfer', income: 'income', expense: 'expense', transfer: 'transfer' };
const UI_CATEGORY_KIND_FROM_DB = { receita: 'income', despesa: 'expense', ambos: 'both', income: 'income', expense: 'expense', both: 'both' };
function toDbKind(kind) { return DB_KIND_FROM_UI[kind] || kind; }
function toUiKind(kind) { return UI_KIND_FROM_DB[kind] || kind; }
function toUiCategoryKind(kind) { return UI_CATEGORY_KIND_FROM_DB[kind] || kind; }

function money(value = 0) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}
function dateBR(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`));
}
function toast(message, type = 'ok') {
  const el = $('#toast');
  el.textContent = message; el.className = `toast show ${type}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = 'toast', 3200);
}
function setLoading(button, loading, text = 'Aguarde...') {
  if (!button) return;
  if (loading) { button.dataset.original = button.textContent; button.textContent = text; button.disabled = true; }
  else { button.textContent = button.dataset.original || button.textContent; button.disabled = false; }
}

function switchAuthTab(tab) {
  $$('.auth-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.authTab === tab));
  $('#loginForm').classList.toggle('active', tab === 'login');
  $('#signupForm').classList.toggle('active', tab === 'signup');
}
$$('.auth-tab').forEach(btn => btn.addEventListener('click', () => switchAuthTab(btn.dataset.authTab)));

async function handleLogin(event) {
  event.preventDefault();
  const btn = $('#loginBtn'); setLoading(btn, true, 'Entrando...');
  const email = $('#loginEmail').value.trim(); const password = $('#loginPassword').value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setLoading(btn, false);
  if (error) return toast(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message, 'error');
  toast('Login realizado com sucesso.');
}
async function handleSignup(event) {
  event.preventDefault();
  const btn = $('#signupBtn'); setLoading(btn, true, 'Criando...');
  const full_name = $('#signupName').value.trim(); const email = $('#signupEmail').value.trim(); const password = $('#signupPassword').value;
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
  setLoading(btn, false);
  if (error) return toast(error.message, 'error');
  if (!data.session) { toast('Conta criada. Confira seu e-mail para confirmar o acesso.'); switchAuthTab('login'); }
  else toast('Conta criada com sucesso.');
}
async function handleForgotPassword() {
  const email = $('#loginEmail').value.trim();
  if (!email) return toast('Digite seu e-mail no campo de login primeiro.', 'error');
  const resetUrl = new URL('reset-password.html', location.href).href;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetUrl });
  if (error) return toast(error.message, 'error');
  toast('Enviamos as instruções de recuperação para seu e-mail.');
}

$('#loginForm').addEventListener('submit', handleLogin);
$('#signupForm').addEventListener('submit', handleSignup);
$('#forgotPasswordBtn').addEventListener('click', handleForgotPassword);
$('#logoutBtn').addEventListener('click', async () => { await supabase.auth.signOut(); });

async function loadUserContext() {
  const userId = state.user.id;
  const [{ data: profile }, { data: access }, { data: subscription }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, phone').eq('id', userId).maybeSingle(),
    supabase.from('user_access').select('role, status, email').eq('user_id', userId).maybeSingle(),
    supabase.from('ai_subscriptions').select('plan_code, status, current_period_end, locked_price').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  ]);
  state.profile = profile; state.access = access; state.subscription = subscription;
  renderUser(); renderSubscription();
}

async function loadFinancialData() {
  const [{ data: accounts, error: accountsError }, { data: categories }, { data: transactions, error: transactionsError }] = await Promise.all([
    supabase.from('accounts').select('id, name, account_type, initial_balance, is_active').eq('is_active', true).order('created_at'),
    supabase.from('categories').select('id, name, kind, icon, is_active').eq('is_active', true).order('name'),
    supabase.from('transactions').select('id, account_id, destination_account_id, category_id, kind, description, amount, occurred_on, status, notes, created_at').order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(2000)
  ]);
  if (accountsError || transactionsError) {
    $('#connectionBadge').innerHTML = '<i></i> Acesso limitado'; $('#connectionBadge').classList.add('warn');
    toast(accountsError?.message || transactionsError?.message || 'Não foi possível carregar seus dados.', 'error');
  } else {
    $('#connectionBadge').innerHTML = '<i></i> Supabase conectado'; $('#connectionBadge').classList.remove('warn');
  }
  state.accounts = accounts || [];
  state.categories = (categories || []).map(c => ({ ...c, kind: toUiCategoryKind(c.kind) }));
  state.transactions = (transactions || []).map(t => ({ ...t, kind: toUiKind(t.kind) }));
  renderDashboard(); renderTransactions(); fillTransactionSelects();
}

function renderUser() {
  const name = state.profile?.full_name || state.user?.user_metadata?.full_name || state.user?.email?.split('@')[0] || 'Usuário';
  const firstName = name.split(' ')[0];
  $('#sidebarUserName').textContent = name;
  $('#sidebarUserRole').textContent = state.access?.role === 'dono' ? 'Conta dono' : (state.subscription?.status === 'active' ? 'Plano IA ativo' : 'Plano gratuito');
  $('#userAvatar').textContent = firstName.slice(0, 1).toUpperCase();
  $('#welcomeText').textContent = `Olá, ${firstName}! 👋`;
}
function renderSubscription() {
  const s = state.subscription;
  $('#subscriptionStatusText').textContent = s?.status === 'active'
    ? `Seu plano ${s.plan_code || 'IA'} está ativo${s.current_period_end ? ` até ${dateBR(s.current_period_end.slice(0, 10))}` : ''}.`
    : 'Você está no acesso gratuito. A IA Financeira será liberada por assinatura.';
}
function accountBalance(account) {
  let balance = Number(account.initial_balance) || 0;
  for (const t of state.transactions) {
    const amount = Number(t.amount) || 0;
    if (t.account_id === account.id) {
      if (t.kind === 'income') balance += amount;
      if (t.kind === 'expense' || t.kind === 'transfer') balance -= amount;
    }
    if (t.kind === 'transfer' && t.destination_account_id === account.id) balance += amount;
  }
  return balance;
}
function renderDashboard() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthTransactions = state.transactions.filter(t => String(t.occurred_on || '').startsWith(monthKey));
  const incomes = monthTransactions.filter(t => t.kind === 'income');
  const expenses = monthTransactions.filter(t => t.kind === 'expense');
  const income = incomes.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expense = expenses.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalBalance = state.accounts.reduce((sum, a) => sum + accountBalance(a), 0);
  $('#metricBalance').textContent = money(totalBalance); $('#metricIncome').textContent = money(income); $('#metricExpense').textContent = money(expense); $('#metricResult').textContent = money(income - expense);
  $('#incomeCount').textContent = `${incomes.length} ${incomes.length === 1 ? 'lançamento' : 'lançamentos'}`;
  $('#expenseCount').textContent = `${expenses.length} ${expenses.length === 1 ? 'lançamento' : 'lançamentos'}`;

  const recent = state.transactions.slice(0, 6);
  $('#recentTransactions').innerHTML = recent.length ? recent.map(transactionRowCard).join('') : '<div class="empty-state">Nenhuma movimentação cadastrada.</div>';
  $('#accountsSummary').innerHTML = state.accounts.length ? state.accounts.map(a => `<div class="account-row"><div><span class="account-dot"></span><div><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.account_type)}</small></div></div><b>${money(accountBalance(a))}</b></div>`).join('') : '<div class="empty-state">Nenhuma conta cadastrada.</div>';
}
function transactionRowCard(t) {
  const category = state.categories.find(c => c.id === t.category_id);
  const isIncome = t.kind === 'income';
  return `<div class="transaction-row"><div class="transaction-icon ${isIncome ? 'income' : t.kind === 'transfer' ? 'transfer' : 'expense'}">${isIncome ? '↓' : t.kind === 'transfer' ? '↔' : '↑'}</div><div class="transaction-main"><strong>${escapeHtml(t.description)}</strong><span>${escapeHtml(category?.name || 'Sem categoria')} • ${dateBR(t.occurred_on)}</span></div><b class="${isIncome ? 'positive' : t.kind === 'expense' ? 'negative' : ''}">${isIncome ? '+' : t.kind === 'expense' ? '−' : ''}${money(t.amount)}</b></div>`;
}
function renderTransactions() {
  const query = ($('#transactionSearch')?.value || '').trim().toLowerCase();
  const kind = $('#transactionKindFilter')?.value || '';
  const filtered = state.transactions.filter(t => (!query || t.description.toLowerCase().includes(query)) && (!kind || t.kind === kind));
  const body = filtered.length ? filtered.map(t => {
    const account = state.accounts.find(a => a.id === t.account_id); const category = state.categories.find(c => c.id === t.category_id);
    return `<tr><td><strong>${escapeHtml(t.description)}</strong><small>${escapeHtml(category?.name || 'Sem categoria')}</small></td><td>${dateBR(t.occurred_on)}</td><td>${escapeHtml(account?.name || '—')}</td><td><span class="kind-pill ${t.kind}">${t.kind === 'income' ? 'Receita' : t.kind === 'expense' ? 'Despesa' : 'Transferência'}</span></td><td class="amount ${t.kind === 'income' ? 'positive' : t.kind === 'expense' ? 'negative' : ''}">${money(t.amount)}</td></tr>`;
  }).join('') : '<tr><td colspan="5"><div class="empty-state">Nenhuma movimentação encontrada.</div></td></tr>';
  $('#transactionsTable').innerHTML = `<table><thead><tr><th>Descrição</th><th>Data</th><th>Conta</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>${body}</tbody></table>`;
}
function fillTransactionSelects() {
  const accountOptions = '<option value="">Selecione</option>' + state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
  $('#transactionAccount').innerHTML = accountOptions; $('#transactionDestinationAccount').innerHTML = accountOptions;
  filterCategoryOptions($('#transactionKind').value);
}
function filterCategoryOptions(kind) {
  const mappedKind = kind === 'income' ? 'income' : 'expense';
  const cats = state.categories.filter(c => c.kind === mappedKind || c.kind === 'both');
  $('#transactionCategory').innerHTML = '<option value="">Sem categoria</option>' + cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function goTo(page) {
  if (!pageMeta[page]) page = 'dashboard';
  $$('.page').forEach(el => el.classList.toggle('active', el.id === `${page}Page`));
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  $('#pageEyebrow').textContent = pageMeta[page][0]; $('#pageTitle').textContent = pageMeta[page][1];
  document.body.classList.remove('menu-open');
}
$('#mainNav').addEventListener('click', e => { const btn = e.target.closest('[data-page]'); if (btn) goTo(btn.dataset.page); });
$$('[data-go]').forEach(btn => btn.addEventListener('click', () => goTo(btn.dataset.go)));
$('#mobileMenuBtn').addEventListener('click', () => document.body.classList.toggle('menu-open'));
$('#mobileBackdrop').addEventListener('click', () => document.body.classList.remove('menu-open'));
$('#collapseSidebarBtn').addEventListener('click', () => document.body.classList.toggle('sidebar-collapsed'));

function openTransactionModal() {
  if (!state.accounts.length) return toast('Cadastre uma conta antes de lançar uma movimentação.', 'error');
  $('#transactionDate').value = new Date().toISOString().slice(0, 10);
  $('#transactionModal').classList.remove('hidden'); document.body.classList.add('modal-open');
  setTimeout(() => $('#transactionDescription').focus(), 80);
}
function closeTransactionModal() { $('#transactionModal').classList.add('hidden'); document.body.classList.remove('modal-open'); }
$('#quickAddBtn').addEventListener('click', openTransactionModal);
$$('[data-new-transaction]').forEach(btn => btn.addEventListener('click', openTransactionModal));
$$('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeTransactionModal));
$$('.segmented [data-kind]').forEach(btn => btn.addEventListener('click', () => {
  $$('.segmented [data-kind]').forEach(b => b.classList.toggle('active', b === btn));
  $('#transactionKind').value = btn.dataset.kind; $('#destinationAccountWrap').classList.toggle('hidden', btn.dataset.kind !== 'transfer'); filterCategoryOptions(btn.dataset.kind);
}));

$('#transactionForm').addEventListener('submit', async event => {
  event.preventDefault();
  const btn = $('#saveTransactionBtn'); setLoading(btn, true, 'Salvando...');
  const kind = $('#transactionKind').value; const accountId = $('#transactionAccount').value; const destination = $('#transactionDestinationAccount').value || null;
  if (kind === 'transfer' && (!destination || destination === accountId)) { setLoading(btn, false); return toast('Escolha uma conta de destino diferente.', 'error'); }
  const payload = {
    user_id: state.user.id, account_id: accountId, destination_account_id: kind === 'transfer' ? destination : null,
    category_id: kind === 'transfer' ? null : ($('#transactionCategory').value || null), kind: toDbKind(kind),
    description: $('#transactionDescription').value.trim(), amount: Number($('#transactionAmount').value),
    occurred_on: $('#transactionDate').value, status: 'pago', notes: $('#transactionNotes').value.trim() || null
  };
  const { error } = await supabase.from('transactions').insert(payload);
  setLoading(btn, false);
  if (error) return toast(error.message, 'error');
  $('#transactionForm').reset(); $('#transactionKind').value = 'income'; $$('.segmented [data-kind]').forEach(b => b.classList.toggle('active', b.dataset.kind === 'income')); $('#destinationAccountWrap').classList.add('hidden');
  closeTransactionModal(); toast('Movimentação salva.'); await loadFinancialData();
});
$('#transactionSearch').addEventListener('input', renderTransactions);
$('#transactionKindFilter').addEventListener('change', renderTransactions);

async function enterApp(user) {
  if (state.user?.id === user.id && !$('#appView').classList.contains('hidden')) return;
  state.user = user; $('#authView').classList.add('hidden'); $('#appView').classList.remove('hidden');
  await loadUserContext(); await loadFinancialData();
}
function leaveApp() {
  state.user = null; state.profile = null; state.access = null; state.accounts = []; state.transactions = [];
  $('#appView').classList.add('hidden'); $('#authView').classList.remove('hidden'); switchAuthTab('login');
}

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) await enterApp(session.user); else leaveApp();
});

const { data: { session } } = await supabase.auth.getSession();
if (session?.user) await enterApp(session.user); else leaveApp();