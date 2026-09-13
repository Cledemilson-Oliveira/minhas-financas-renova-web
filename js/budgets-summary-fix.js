import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const money = (value = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const firstDay = month => `${month}-01`;
const nextMonthFirstDay = month => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

let user = null;
let refreshTimer = null;

function ensureOutsideCard() {
  const metrics = document.querySelector('.budgets-metrics');
  if (!metrics || document.querySelector('#budgetMetricOutside')) return;
  const card = document.createElement('article');
  card.className = 'budget-metric';
  card.innerHTML = '<span>Fora do orçamento</span><strong id="budgetMetricOutside">R$ 0,00</strong><small>Gastos em categorias sem limite definido</small>';
  metrics.appendChild(card);
}

async function refreshSummary() {
  const monthInput = document.querySelector('#budgetMonth');
  if (!user || !monthInput?.value) return;
  const month = monthInput.value;
  const start = firstDay(month);
  const end = nextMonthFirstDay(month);

  const [{ data: budgets, error: be }, { data: txs, error: te }, { data: cardExpenses, error: ce }] = await Promise.all([
    supabase.from('budgets').select('category_id,planned_amount').eq('user_id', user.id).eq('month', start),
    supabase.from('transactions').select('category_id,kind,amount,status').eq('user_id', user.id).gte('occurred_on', start).lt('occurred_on', end),
    supabase.from('card_expenses').select('category_id,amount,installments,status').eq('user_id', user.id).gte('purchase_date', start).lt('purchase_date', end)
  ]);
  if (be || te || ce) return;

  const budgetRows = budgets || [];
  const budgetedCategories = new Set(budgetRows.map(b => b.category_id));
  const planned = budgetRows.reduce((sum, b) => sum + Number(b.planned_amount || 0), 0);

  let spentBudgeted = 0;
  let spentOutside = 0;

  for (const t of txs || []) {
    if (!['despesa', 'expense'].includes(t.kind) || t.status === 'cancelado') continue;
    const amount = Number(t.amount || 0);
    if (budgetedCategories.has(t.category_id)) spentBudgeted += amount;
    else spentOutside += amount;
  }

  for (const e of cardExpenses || []) {
    if (e.status === 'cancelada') continue;
    const amount = Number(e.amount || 0) / Math.max(1, Number(e.installments || 1));
    if (budgetedCategories.has(e.category_id)) spentBudgeted += amount;
    else spentOutside += amount;
  }

  const available = planned - spentBudgeted;
  const usage = planned > 0 ? Math.round((spentBudgeted / planned) * 100) : 0;

  const spentEl = document.querySelector('#budgetMetricSpent');
  const availableEl = document.querySelector('#budgetMetricAvailable');
  const usageEl = document.querySelector('#budgetMetricUsage');
  const statusEl = document.querySelector('#budgetMetricStatus');
  if (spentEl) {
    spentEl.textContent = money(spentBudgeted);
    const small = spentEl.parentElement?.querySelector('small');
    if (small) small.textContent = 'Somente categorias com orçamento';
    const label = spentEl.parentElement?.querySelector('span');
    if (label) label.textContent = 'Gasto orçado';
  }
  if (availableEl) availableEl.textContent = money(available);
  if (usageEl) usageEl.textContent = `${usage}%`;
  if (statusEl) statusEl.textContent = planned <= 0 ? 'Sem orçamento definido' : usage > 100 ? 'Limite total ultrapassado' : usage >= 80 ? 'Atenção aos gastos' : 'Planejamento sob controle';

  const availableCard = availableEl?.closest('.budget-metric');
  if (availableCard) availableCard.className = `budget-metric ${available < 0 ? 'bad' : available < planned * .2 && planned > 0 ? 'warn' : 'good'}`;

  ensureOutsideCard();
  const outsideEl = document.querySelector('#budgetMetricOutside');
  if (outsideEl) outsideEl.textContent = money(spentOutside);
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshSummary, 180);
}

const observer = new MutationObserver(() => {
  if (document.querySelector('#budgetsPage')) scheduleRefresh();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('change', event => {
  if (event.target?.id === 'budgetMonth') scheduleRefresh();
});
window.addEventListener('renova:transactions-updated', scheduleRefresh);
window.addEventListener('renova:cards-updated', scheduleRefresh);

const { data: { session } } = await supabase.auth.getSession();
user = session?.user || null;
if (user) scheduleRefresh();
supabase.auth.onAuthStateChange((_event, nextSession) => {
  user = nextSession?.user || null;
  if (user) scheduleRefresh();
});