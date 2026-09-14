import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

let currentUser = null;
let currentRole = null;
let connections = [];
let terminals = [];
let currentPointOrder = null;
let bound = false;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function toast(message, type = 'ok') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 3600);
}

function setBusy(button, busy, text = 'Processando...') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function ensureStyles() {
  if (document.querySelector('link[data-renova-payment-integrations]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/payment-integrations-module.css?v=20260914-1015';
  link.dataset.renovaPaymentIntegrations = '1';
  document.head.appendChild(link);
}

async function waitFor(selector, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const el = $(selector);
    if (el) return el;
    await sleep(80);
  }
  return null;
}

function providerPanelHtml() {
  return `
    <section id="providerIntegrationsPanel" class="provider-integrations-panel">
      <div class="provider-integrations-head">
        <div>
          <span class="eyebrow">INTEGRAÇÕES AUTOMÁTICAS</span>
          <strong>Mercado Pago + InfinitePay</strong>
        </div>
        <span class="provider-security-badge">🔒 Backend seguro</span>
      </div>

      <div class="provider-cards-grid">
        <article class="provider-card" data-provider-card="mercado_pago">
          <div class="provider-card-head">
            <div class="provider-logo provider-logo-mp">MP</div>
            <div>
              <strong>Mercado Pago Point</strong>
              <span id="mpIntegrationStatus">Verificando conexão...</span>
            </div>
          </div>
          <p>Point Smart e Point Pro compatíveis podem receber a cobrança diretamente do RENOVA em modo PDV.</p>
          <div class="provider-card-actions">
            <button id="searchPointTerminalsBtn" class="primary-btn" type="button">Buscar minhas Points</button>
          </div>
          <div id="mpTerminalDiscovery" class="provider-discovery hidden"></div>
        </article>

        <article class="provider-card" data-provider-card="infinitepay">
          <div class="provider-card-head">
            <div class="provider-logo provider-logo-inf">∞</div>
            <div>
              <strong>InfinitePay</strong>
              <span id="infiniteIntegrationStatus">Informe sua InfiniteTag</span>
            </div>
          </div>
          <p>O Checkout Integrado gera uma cobrança com Pix ou cartão e confirma automaticamente por webhook.</p>
          <label class="provider-field">InfiniteTag
            <div class="provider-input-row">
              <span>$</span>
              <input id="infinitePayHandle" type="text" placeholder="sua_infinite_tag" autocomplete="off" />
            </div>
          </label>
          <div class="provider-card-actions">
            <button id="saveInfiniteConnectionBtn" class="primary-btn" type="button">Conectar InfinitePay</button>
          </div>
        </article>
      </div>

      <p class="provider-integrations-note">
        Tokens privados nunca ficam no navegador. A Point usa o backend do Supabase e o acesso global do Mercado Pago continua restrito à Conta Dono até o OAuth individual estar concluído.
      </p>
    </section>`;
}

async function ensureProviderPanel() {
  const modal = await waitFor('#paymentSettingsModal');
  if (!modal || $('#providerIntegrationsPanel')) return;
  const form = $('#paymentTerminalForm', modal);
  if (form) form.insertAdjacentHTML('beforebegin', providerPanelHtml());
  else $('.payment-settings-copy', modal)?.insertAdjacentHTML('afterend', providerPanelHtml());
}

function transactionActionsHtml() {
  return `
    <div id="transactionProviderActions" class="transaction-provider-actions">
      <div id="pointIntegratedActions" class="provider-payment-action hidden">
        <div>
          <strong>Mercado Pago Point integrada</strong>
          <small>O valor será enviado para a maquininha e a receita só entra após aprovação.</small>
        </div>
        <div class="provider-action-controls">
          <label id="pointInstallmentsWrap" class="provider-installments hidden">Parcelas
            <select id="pointInstallments">
              ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}
            </select>
          </label>
          <button id="chargePointBtn" class="primary-btn" type="button">Cobrar na Point</button>
          <button id="cancelPointBtn" class="ghost-btn hidden" type="button">Cancelar cobrança</button>
        </div>
      </div>

      <div id="infiniteIntegratedActions" class="provider-payment-action hidden">
        <div>
          <strong>InfinitePay Checkout</strong>
          <small>Gere um checkout com Pix ou crédito. A confirmação entra automaticamente no financeiro.</small>
        </div>
        <button id="chargeInfiniteBtn" class="primary-btn" type="button">Gerar checkout InfinitePay</button>
      </div>

      <div id="providerPaymentStatus" class="provider-payment-status hidden" aria-live="polite"></div>
    </div>`;
}

async function ensureTransactionActions() {
  const preview = await waitFor('#transactionPaymentPreview');
  if (!preview || $('#transactionProviderActions')) return;
  preview.insertAdjacentHTML('afterend', transactionActionsHtml());
}

function connectionFor(provider, type = null) {
  return connections.find(item => item.provider === provider && item.status === 'connected' && (!type || item.connection_type === type)) || null;
}

function terminalById(id) {
  return terminals.find(item => item.id === id) || null;
}

async function loadState() {
  if (!currentUser) return;
  const [{ data: access }, { data: connectionRows }, { data: terminalRows }] = await Promise.all([
    supabase.from('user_access').select('role,status').eq('user_id', currentUser.id).maybeSingle(),
    supabase.from('payment_provider_connections').select('id,provider,connection_type,status,display_name,account_reference,metadata').eq('user_id', currentUser.id),
    supabase.from('payment_terminals').select('id,name,provider,external_terminal_id,debit_fee_percent,credit_fee_percent,is_active,integration_status,integration_mode,connection_id').eq('user_id', currentUser.id)
  ]);
  currentRole = access?.role || null;
  connections = connectionRows || [];
  terminals = terminalRows || [];
  renderProviderState();
  updateTransactionActions();
}

function renderProviderState() {
  const mpStatus = $('#mpIntegrationStatus');
  const mpConnected = terminals.filter(item => item.provider === 'mercado_pago' && item.integration_mode === 'mercado_pago_point' && item.integration_status === 'connected');
  if (mpStatus) {
    if (mpConnected.length) mpStatus.textContent = `${mpConnected.length} Point${mpConnected.length > 1 ? 's' : ''} integrada${mpConnected.length > 1 ? 's' : ''}`;
    else if (currentRole === 'dono') mpStatus.textContent = 'Pronto para buscar terminais da Conta Dono';
    else mpStatus.textContent = 'OAuth individual necessário para conectar Point';
  }

  const infinite = connectionFor('infinitepay', 'checkout');
  const infStatus = $('#infiniteIntegrationStatus');
  const handleInput = $('#infinitePayHandle');
  if (infinite) {
    if (infStatus) infStatus.textContent = `Conectado • $${infinite.account_reference}`;
    if (handleInput && !handleInput.value) handleInput.value = infinite.account_reference || '';
  } else if (infStatus) {
    infStatus.textContent = 'Ainda não conectado';
  }
}

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const context = error.context;
    let detail = null;
    try { detail = context ? await context.json() : null; } catch (_) {}
    const message = detail?.message || detail?.error || error.message || 'Falha na integração.';
    const enhanced = new Error(message);
    enhanced.details = detail;
    throw enhanced;
  }
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

function extractTerminalList(data) {
  const candidates = [
    data?.terminals,
    data?.results,
    data?.devices,
    data?.data?.terminals,
    Array.isArray(data?.data) ? data.data : null
  ];
  return candidates.find(Array.isArray) || [];
}

function terminalDisplayName(item) {
  return String(item?.name || item?.model || item?.device_name || item?.id || 'Mercado Pago Point');
}

async function searchPointTerminals() {
  const btn = $('#searchPointTerminalsBtn');
  const host = $('#mpTerminalDiscovery');
  if (!host) return;
  setBusy(btn, true, 'Buscando...');
  host.classList.remove('hidden');
  host.innerHTML = '<div class="provider-loading">Buscando terminais vinculados à sua conta Mercado Pago...</div>';

  try {
    const data = await invoke('mercado-pago-point', { action: 'list_terminals', limit: 50 });
    const list = extractTerminalList(data);
    if (!list.length) {
      host.innerHTML = '<div class="provider-empty">Nenhuma Point foi encontrada nesta conta. Confirme se a maquininha está vinculada ao mesmo Mercado Pago.</div>';
      return;
    }
    host.innerHTML = list.map(item => {
      const id = String(item?.id || item?.terminal_id || item?.device_id || '');
      const mode = String(item?.operating_mode || item?.mode || '—');
      const status = String(item?.status || item?.state || '—');
      const name = terminalDisplayName(item);
      return `
        <article class="provider-terminal-result">
          <div>
            <strong>${escapeHtml(name)}</strong>
            <span>ID ${escapeHtml(id)} • modo ${escapeHtml(mode)} • status ${escapeHtml(status)}</span>
          </div>
          <button class="primary-btn" type="button" data-connect-point="${escapeHtml(id)}" data-connect-point-name="${escapeHtml(name)}" ${id ? '' : 'disabled'}>Vincular e ativar PDV</button>
        </article>`;
    }).join('');
  } catch (error) {
    host.innerHTML = `<div class="provider-error">${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(btn, false);
  }
}

async function connectPoint(button) {
  const terminalId = button.dataset.connectPoint || '';
  const name = button.dataset.connectPointName || `Point ${terminalId.slice(-6)}`;
  if (!terminalId) return;
  setBusy(button, true, 'Vinculando...');
  try {
    const data = await invoke('mercado-pago-point', {
      action: 'connect_terminal',
      terminal_id: terminalId,
      name
    });
    const connectedTerminal = data?.terminal;
    if (connectedTerminal?.id) {
      terminals = [
        ...terminals.filter(item => item.id !== connectedTerminal.id),
        connectedTerminal
      ];
      renderProviderState();
      updateTransactionActions();
    }

    button.textContent = 'Conectada';
    button.disabled = true;
    button.dataset.originalText = 'Conectada';
    toast(`${connectedTerminal?.name || name} conectada em modo PDV.`);

    // A vinculação já foi concluída no backend. Atualize o restante da tela em
    // segundo plano para uma consulta lenta não deixar o botão em "Vinculando...".
    void loadState().catch(error => console.warn('[RENOVA Point] Falha ao atualizar estado após vínculo:', error));
  } catch (error) {
    toast(error.message, 'error');
    setBusy(button, false);
  }
}

async function saveInfiniteConnection() {
  const btn = $('#saveInfiniteConnectionBtn');
  const handle = String($('#infinitePayHandle')?.value || '').trim().replace(/^\$/, '');
  if (!handle) return toast('Informe sua InfiniteTag.', 'error');
  setBusy(btn, true, 'Conectando...');
  try {
    await invoke('infinitepay-checkout', { action: 'save_connection', handle });
    toast('InfinitePay conectada ao Minhas Finanças RENOVA.');
    await loadState();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(btn, false);
  }
}

function getTransactionDraft() {
  const kind = $('#transactionKind')?.value;
  const amount = Number($('#transactionAmount')?.value || 0);
  const accountId = $('#transactionAccount')?.value || '';
  const categoryId = $('#transactionCategory')?.value || null;
  const description = String($('#transactionDescription')?.value || '').trim();
  const method = $('#transactionPaymentMethod')?.value || 'dinheiro';
  const terminalId = $('#transactionPaymentTerminal')?.value || '';
  return { kind, amount, accountId, categoryId, description, method, terminalId };
}

function validateDraft({ allowNonCard = false } = {}) {
  const form = $('#transactionForm');
  if (!form?.reportValidity()) return null;
  const draft = getTransactionDraft();
  if (draft.kind !== 'income') {
    toast('A integração de cobrança é usada em receitas.', 'error');
    return null;
  }
  if (!(draft.amount > 0) || !draft.accountId || !draft.description) return null;
  if (!allowNonCard && !['credito', 'debito'].includes(draft.method)) {
    toast('Selecione Crédito ou Débito para cobrar na Point.', 'error');
    return null;
  }
  return draft;
}

function setProviderStatus(message, type = 'info') {
  const el = $('#providerPaymentStatus');
  if (!el) return;
  el.classList.remove('hidden', 'ok', 'error', 'info');
  el.classList.add(type);
  el.textContent = message;
}

function lockManualSave(lock) {
  const btn = $('#saveTransactionBtn');
  if (!btn) return;
  btn.disabled = lock;
  btn.title = lock ? 'Aguarde a conclusão da cobrança integrada.' : '';
}

function updateTransactionActions() {
  const pointWrap = $('#pointIntegratedActions');
  const infiniteWrap = $('#infiniteIntegratedActions');
  if (!pointWrap || !infiniteWrap) return;

  const draft = getTransactionDraft();
  const terminal = terminalById(draft.terminalId);
  const pointReady = draft.kind === 'income' && ['credito', 'debito'].includes(draft.method) && terminal?.provider === 'mercado_pago' && terminal?.integration_mode === 'mercado_pago_point' && terminal?.integration_status === 'connected';
  pointWrap.classList.toggle('hidden', !pointReady);

  const installmentsWrap = $('#pointInstallmentsWrap');
  installmentsWrap?.classList.toggle('hidden', draft.method !== 'credito');
  if (draft.method === 'debito' && $('#pointInstallments')) $('#pointInstallments').value = '1';

  const infiniteReady = draft.kind === 'income' && Boolean(connectionFor('infinitepay', 'checkout'));
  infiniteWrap.classList.toggle('hidden', !infiniteReady);
}

async function chargePoint() {
  const draft = validateDraft();
  if (!draft) return;
  const terminal = terminalById(draft.terminalId);
  if (!terminal || terminal.integration_mode !== 'mercado_pago_point') return toast('Selecione uma Point integrada.', 'error');

  const installments = draft.method === 'credito' ? Math.max(1, Number($('#pointInstallments')?.value || 1)) : 1;
  const btn = $('#chargePointBtn');
  setBusy(btn, true, 'Enviando...');
  lockManualSave(true);
  setProviderStatus('Enviando cobrança para a Point...', 'info');

  try {
    const data = await invoke('mercado-pago-point', {
      action: 'create_order',
      payment_terminal_id: terminal.id,
      amount: draft.amount,
      payment_method: draft.method,
      installments,
      description: draft.description,
      account_id: draft.accountId,
      category_id: draft.categoryId
    });
    currentPointOrder = data?.order || null;
    const providerOrderId = currentPointOrder?.provider_order_id || data?.provider_order?.id;
    if (!providerOrderId) throw new Error('O Mercado Pago não retornou o identificador da cobrança.');

    $('#cancelPointBtn')?.classList.remove('hidden');
    setProviderStatus(`Cobrança de ${money(draft.amount)} enviada. Aguardando pagamento na Point...`, 'info');
    await pollPointOrder(providerOrderId);
  } catch (error) {
    const queuedOrder = /already a queued order|queued order/i.test(error.message);
    if (queuedOrder) {
      try {
        const pending = await invoke('mercado-pago-point', {
          action: 'get_pending_order',
          payment_terminal_id: terminal.id
        });
        if (pending?.order?.provider_order_id && ['created', 'pending', 'at_terminal'].includes(String(pending.order.status))) {
          currentPointOrder = pending.order;
          $('#cancelPointBtn')?.classList.remove('hidden');
          setProviderStatus('Já existe uma cobrança aguardando nesta Point. Conclua na maquininha ou clique em Cancelar cobrança.', 'info');
          toast('A Point já possui uma cobrança pendente.', 'error');
          lockManualSave(false);
          setBusy(btn, false);
          return;
        }
      } catch (lookupError) {
        console.warn('[RENOVA Point] Não foi possível recuperar a cobrança pendente:', lookupError);
      }
    }
    const message = queuedOrder ? 'Já existe uma cobrança aguardando nesta Point. Cancele-a na maquininha antes de tentar novamente.' : error.message;
    setProviderStatus(message, 'error');
    toast(message, 'error');
    lockManualSave(false);
    setBusy(btn, false);
    $('#cancelPointBtn')?.classList.add('hidden');
  }
}

async function pollPointOrder(providerOrderId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(attempt === 0 ? 1200 : 2500);
    const data = await invoke('mercado-pago-point', { action: 'get_order', order_id: providerOrderId });
    const order = data?.order || {};
    const status = String(order.status || data?.provider_order?.status || 'pending').toLowerCase();
    currentPointOrder = { ...(currentPointOrder || {}), ...order, provider_order_id: providerOrderId };

    if (status === 'processed') {
      setProviderStatus('Pagamento aprovado. Receita conciliada automaticamente no financeiro.', 'ok');
      toast('Pagamento aprovado e lançado no financeiro.');
      setTimeout(() => location.reload(), 900);
      return;
    }
    if (['failed', 'cancelled', 'canceled', 'expired', 'refunded'].includes(status)) {
      setProviderStatus(`Cobrança encerrada: ${status}. Nenhuma receita foi lançada.`, 'error');
      lockManualSave(false);
      setBusy($('#chargePointBtn'), false);
      $('#cancelPointBtn')?.classList.add('hidden');
      return;
    }
    setProviderStatus(status === 'pending' ? 'Aguardando confirmação na maquininha...' : `Status da Point: ${status}`, 'info');
  }

  setProviderStatus('A cobrança continua pendente. O webhook continuará acompanhando mesmo se você fechar esta tela.', 'info');
  lockManualSave(false);
  setBusy($('#chargePointBtn'), false);
}

async function cancelPointOrder() {
  const providerOrderId = currentPointOrder?.provider_order_id;
  if (!providerOrderId) return;
  const btn = $('#cancelPointBtn');
  setBusy(btn, true, 'Cancelando...');
  try {
    await invoke('mercado-pago-point', { action: 'cancel_order', order_id: providerOrderId });
    setProviderStatus('Cobrança cancelada. Nenhuma receita foi lançada.', 'info');
    toast('Cobrança cancelada.');
    currentPointOrder = null;
    lockManualSave(false);
    setBusy($('#chargePointBtn'), false);
    btn.classList.add('hidden');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(btn, false);
  }
}

async function chargeInfinitePay() {
  const draft = validateDraft({ allowNonCard: true });
  if (!draft) return;
  if (!connectionFor('infinitepay', 'checkout')) return toast('Conecte sua InfiniteTag primeiro.', 'error');

  const btn = $('#chargeInfiniteBtn');
  setBusy(btn, true, 'Gerando...');
  setProviderStatus('Gerando checkout InfinitePay...', 'info');
  try {
    const redirectUrl = `${window.location.origin}${window.location.pathname}?payment_return=infinitepay`;
    const data = await invoke('infinitepay-checkout', {
      action: 'create_checkout',
      amount: draft.amount,
      description: draft.description,
      account_id: draft.accountId,
      category_id: draft.categoryId,
      redirect_url: redirectUrl
    });
    const checkoutUrl = data?.checkout_url;
    if (!checkoutUrl) throw new Error('A InfinitePay não retornou o link do checkout.');
    const opened = window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.href = checkoutUrl;
    setProviderStatus(`Checkout de ${money(draft.amount)} criado. A receita será lançada somente após confirmação do pagamento.`, 'info');
    toast('Checkout InfinitePay criado.');
    if (data?.order?.id) void pollInfiniteOrder(data.order.id);
  } catch (error) {
    setProviderStatus(error.message, 'error');
    toast(error.message, 'error');
  } finally {
    setBusy(btn, false);
  }
}

async function pollInfiniteOrder(orderId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(3000);
    const { data, error } = await supabase.from('payment_orders')
      .select('id,status,status_detail,transaction_id')
      .eq('id', orderId)
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (error || !data) continue;
    if (data.status === 'processed') {
      setProviderStatus('Pagamento InfinitePay aprovado e conciliado automaticamente.', 'ok');
      toast('Pagamento InfinitePay lançado no financeiro.');
      setTimeout(() => location.reload(), 900);
      return;
    }
    if (['failed', 'cancelled', 'expired', 'refunded'].includes(data.status)) {
      setProviderStatus(`Checkout encerrado: ${data.status}.`, 'error');
      return;
    }
  }
}

async function handleInfiniteReturn() {
  if (!currentUser) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment_return') !== 'infinitepay') return;
  const orderNsu = params.get('order_nsu');
  const transactionNsu = params.get('transaction_nsu');
  const slug = params.get('slug');
  if (!orderNsu || !transactionNsu || !slug) return;
  try {
    const data = await invoke('infinitepay-checkout', {
      action: 'payment_check',
      external_reference: orderNsu,
      transaction_nsu: transactionNsu,
      slug,
      receipt_url: params.get('receipt_url') || null
    });
    if (data?.paid) toast('Pagamento InfinitePay confirmado e conciliado.');
  } catch (error) {
    console.warn('[RENOVA InfinitePay] retorno não confirmado:', error);
  } finally {
    const clean = `${window.location.pathname}${window.location.hash || ''}`;
    history.replaceState({}, document.title, clean);
  }
}

function bind() {
  if (bound) return;
  bound = true;

  document.addEventListener('click', event => {
    if (event.target.closest('#searchPointTerminalsBtn')) void searchPointTerminals();
    const connect = event.target.closest('[data-connect-point]');
    if (connect) void connectPoint(connect);
    if (event.target.closest('#saveInfiniteConnectionBtn')) void saveInfiniteConnection();
    if (event.target.closest('#chargePointBtn')) void chargePoint();
    if (event.target.closest('#cancelPointBtn')) void cancelPointOrder();
    if (event.target.closest('#chargeInfiniteBtn')) void chargeInfinitePay();
    if (event.target.closest('[data-payment-method],[data-kind]')) setTimeout(updateTransactionActions, 0);
  });

  document.addEventListener('change', event => {
    if (event.target.matches('#transactionPaymentTerminal,#transactionPaymentMethod,#transactionKind,#transactionAccount,#transactionCategory')) updateTransactionActions();
  });
  document.addEventListener('input', event => {
    if (event.target.matches('#transactionAmount,#transactionDescription')) updateTransactionActions();
  });

  window.addEventListener('renova:transactions-updated', () => void loadState());
}

async function initForUser(user) {
  currentUser = user;
  await Promise.all([ensureProviderPanel(), ensureTransactionActions()]);
  await loadState();
  await handleInfiniteReturn();
}

ensureStyles();
bind();
await Promise.all([ensureProviderPanel(), ensureTransactionActions()]);

const { data: { session } } = await supabase.auth.getSession();
if (session?.user) await initForUser(session.user);

supabase.auth.onAuthStateChange((_event, nextSession) => {
  if (nextSession?.user && nextSession.user.id !== currentUser?.id) {
    setTimeout(() => void initForUser(nextSession.user), 0);
  }
  if (!nextSession?.user) {
    currentUser = null;
    currentRole = null;
    connections = [];
    terminals = [];
  }
});
