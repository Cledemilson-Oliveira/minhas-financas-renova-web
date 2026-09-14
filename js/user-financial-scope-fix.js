import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector, root = document) => root.querySelector(selector);

let currentUserId = null;
let ownAccounts = [];
let ownCategories = [];
let syncing = false;
let observer = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function toUiCategoryKind(kind) {
  return ({ receita: 'income', despesa: 'expense', ambos: 'both', income: 'income', expense: 'expense', both: 'both' })[kind] || kind;
}

function selectedSnapshot(select) {
  if (!select) return { value: '', text: '' };
  return {
    value: select.value || '',
    text: select.selectedOptions?.[0]?.textContent?.trim() || ''
  };
}

function setOptionsIfChanged(select, html, preferredValue = '') {
  if (!select) return;
  const normalized = html.replace(/\s+/g, ' ').trim();
  const current = select.innerHTML.replace(/\s+/g, ' ').trim();
  if (current !== normalized) select.innerHTML = html;
  if (preferredValue && [...select.options].some(option => option.value === preferredValue)) {
    select.value = preferredValue;
  }
}

function resolveOwnedValue(items, snapshot) {
  if (snapshot.value && items.some(item => item.id === snapshot.value)) return snapshot.value;
  if (!snapshot.text) return '';
  const byName = items.find(item => String(item.name || '').trim() === snapshot.text);
  return byName?.id || '';
}

function syncAccounts() {
  const accountSelect = $('#transactionAccount');
  const destinationSelect = $('#transactionDestinationAccount');
  if (!accountSelect && !destinationSelect) return;

  const accountSnapshot = selectedSnapshot(accountSelect);
  const destinationSnapshot = selectedSnapshot(destinationSelect);
  const activeAccounts = ownAccounts.filter(account => account.is_active !== false);
  const options = '<option value="">Selecione</option>' + activeAccounts
    .map(account => `<option value="${account.id}">${escapeHtml(account.name)}</option>`)
    .join('');

  setOptionsIfChanged(accountSelect, options, resolveOwnedValue(activeAccounts, accountSnapshot));
  setOptionsIfChanged(destinationSelect, options, resolveOwnedValue(activeAccounts, destinationSnapshot));
}

function syncCategories() {
  const select = $('#transactionCategory');
  if (!select) return;

  const snapshot = selectedSnapshot(select);
  const kind = $('#transactionKind')?.value || 'income';
  const mappedKind = kind === 'income' ? 'income' : 'expense';
  const filtered = kind === 'transfer'
    ? []
    : ownCategories.filter(category => {
        const categoryKind = toUiCategoryKind(category.kind);
        return categoryKind === mappedKind || categoryKind === 'both';
      });

  const preferredValue = resolveOwnedValue(filtered, snapshot);
  const options = '<option value="">Sem categoria</option>' + filtered
    .map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
    .join('');

  setOptionsIfChanged(select, options, preferredValue);
}

function syncNewTransactionForm() {
  if (syncing) return;
  syncing = true;
  try {
    syncAccounts();
    syncCategories();
  } finally {
    syncing = false;
  }
}

async function loadOwnFinancialSelectors(userId) {
  if (!userId) return;
  const [{ data: accounts, error: accountsError }, { data: categories, error: categoriesError }] = await Promise.all([
    supabase.from('accounts')
      .select('id,name,is_active')
      .eq('user_id', userId)
      .order('created_at'),
    supabase.from('categories')
      .select('id,name,kind,is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name')
  ]);

  if (accountsError || categoriesError) {
    console.warn('[RENOVA scope] Não foi possível isolar contas/categorias do usuário.', accountsError || categoriesError);
    return;
  }

  ownAccounts = accounts || [];
  ownCategories = categories || [];
  syncNewTransactionForm();
}

function bind() {
  document.addEventListener('click', event => {
    if (event.target.closest('[data-kind]')) {
      setTimeout(syncCategories, 0);
    }
    if (event.target.closest('#quickAddBtn, [data-new-transaction]')) {
      setTimeout(syncNewTransactionForm, 0);
    }
  });

  const host = $('#transactionForm');
  if (host && !observer) {
    observer = new MutationObserver(() => {
      if (syncing) return;
      queueMicrotask(syncNewTransactionForm);
    });
    observer.observe(host, { childList: true, subtree: true });
  }
}

bind();

const { data: { session } } = await supabase.auth.getSession();
if (session?.user?.id) {
  currentUserId = session.user.id;
  await loadOwnFinancialSelectors(currentUserId);
}

supabase.auth.onAuthStateChange((_event, nextSession) => {
  const nextUserId = nextSession?.user?.id || null;
  if (!nextUserId) {
    currentUserId = null;
    ownAccounts = [];
    ownCategories = [];
    return;
  }
  if (nextUserId !== currentUserId) {
    currentUserId = nextUserId;
    setTimeout(() => loadOwnFinancialSelectors(nextUserId), 0);
  }
});
