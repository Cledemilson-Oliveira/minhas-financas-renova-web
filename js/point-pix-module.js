import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector, root = document) => root.querySelector(selector);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

let currentUser = null;
let terminals = [];
let currentPixOrder = null;
let syncing = false;

function toast(message, type = 'ok') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 3800);
}

function setStatus(message, type = 'info') {
  const el = $('#providerPaymentStatus');
  if (!el) return;
  el.classList.remove('hidden', 'ok', 'error', 'info');
  el.classList.add(type);
  if (el.textContent !== message) el.textContent = message;
}

function setBusy(button, busy, text = 'Processando...') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.pixOriginalText) button.dataset.pixOriginalText = button.textContent;
    if (button.textContent !== text) button.textContent = text;
    button.disabled = true;
  } else {
    const original = button.dataset.pixOriginalText || button.textContent;
    if (button.textContent !== original) button.textContent = original;
    button.disabled = false;
    delete button.dataset.pixOriginalText;
  }
}

function lockManualSave(lock) {
  const btn = $('#saveTransactionBtn');
  if (!btn) return;
  btn.disabled = lock;
  btn.title = lock ? 'Aguarde a conclusão da cobrança integrada.' : '';
}

async function invokePoint(body) {
  const { data, error } = await supabase.functions.invoke('mercado-pago-point-pix', { body });
  if (error) {
    let detail = null;
    try { detail = error.context ? await error.context.json() : null; } catch (_) {}
    throw new Error(detail?.message || detail?.error || error.message || 'Falha na integração PIX com a Point.');
  }
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

async function loadTerminals() {
  if (!currentUser) return;
  const { data } = await supabase.from('payment_terminals')
    .select('id,name,provider,integration_mode,integration_status,is_active')
    .eq('user_id', currentUser.id)
    .eq('is_active', true);
  terminals = data || [];
  syncPixUi();
}

function selectedPoint() {
  const id = $('#transactionPaymentTerminal')?.value || '';
  return terminals.find(item => item.id === id && item.provider === 'mercado_pago' && item.integration_mode === 'mercado_pago_point' && item.integration_status === 'connected') || null;
}

function isPix() {
  return $('#transactionKind')?.value === 'income' && $('#transactionPaymentMethod')?.value === 'pix';
}

function replaceText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

function syncPixUi() {
  if (syncing) return;
  syncing = true;
  queueMicrotask(() => {
    try {
      const pix = isPix();
      const terminalWrap = $('#transactionTerminalWrap');
      const pointWrap = $('#pointIntegratedActions');
      const installments = $('#pointInstallmentsWrap');
      const chargeBtn = $('#chargePointBtn');
      const terminal = selectedPoint();

      if (pix) {
        terminalWrap?.classList.remove('hidden');
        if (terminalWrap) {
          const textNode = [...terminalWrap.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
          if (textNode && textNode.textContent !== 'Maquininha / provedor (opcional no PIX) ') textNode.textContent = 'Maquininha / provedor (opcional no PIX) ';
        }
        pointWrap?.classList.toggle('hidden', !terminal);
        installments?.classList.add('hidden');
        if (chargeBtn && !chargeBtn.disabled) replaceText(chargeBtn, 'Cobrar PIX na Point');
        replaceText(pointWrap?.querySelector('small'), 'O QR Code PIX será exibido na Point e a receita só entra após confirmação.');
      } else {
        if (chargeBtn && !chargeBtn.disabled) replaceText(chargeBtn, 'Cobrar na Point');
        replaceText(pointWrap?.querySelector('small'), 'O valor será enviado para a maquininha e a receita só entra após aprovação.');
      }

      replaceText(document.querySelector('[data-provider-card="mercado_pago"] p'), 'Point Smart e Point Pro compatíveis recebem cartão e PIX diretamente do RENOVA em modo PDV.');
    } finally {
      syncing = false;
    }
  });
}

function draft() {
  return {
    amount: Number($('#transactionAmount')?.value || 0),
    accountId: $('#transactionAccount')?.value || '',
    categoryId: $('#transactionCategory')?.value || null,
    description: String($('#transactionDescription')?.value || '').trim(),
    terminal: selectedPoint()
  };
}

async function chargePix() {
  const form = $('#transactionForm');
  if (!form?.reportValidity()) return;
  const d = draft();
  if (!(d.amount > 0) || !d.accountId || !d.description) return;
  if (!d.terminal) return toast('Selecione uma Point integrada para cobrar o PIX na maquininha.', 'error');

  const btn = $('#chargePointBtn');
  setBusy(btn, true, 'Enviando PIX...');
  lockManualSave(true);
  setStatus('Enviando PIX para a Point...', 'info');

  try {
    const data = await invokePoint({
      action: 'create_order',
      payment_terminal_id: d.terminal.id,
      amount: d.amount,
      payment_method: 'pix',
      installments: 1,
      description: d.description,
      account_id: d.accountId,
      category_id: d.categoryId
    });
    currentPixOrder = data?.order || null;
    const providerOrderId = currentPixOrder?.provider_order_id || data?.provider_order?.id;
    if (!providerOrderId) throw new Error('O Mercado Pago não retornou o identificador da cobrança PIX.');
    currentPixOrder = { ...(currentPixOrder || {}), provider_order_id: providerOrderId };
    $('#cancelPointBtn')?.classList.remove('hidden');
    setStatus(`PIX de ${money(d.amount)} enviado. Leia o QR Code exibido na Point.`, 'info');
    await pollPix(providerOrderId);
  } catch (error) {
    setStatus(error.message, 'error');
    toast(error.message, 'error');
    lockManualSave(false);
    setBusy(btn, false);
    $('#cancelPointBtn')?.classList.add('hidden');
    syncPixUi();
  }
}

async function pollPix(providerOrderId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(attempt === 0 ? 1200 : 2500);
    const data = await invokePoint({ action: 'get_order', order_id: providerOrderId });
    const order = data?.order || {};
    const status = String(order.status || data?.provider_order?.status || 'pending').toLowerCase();
    currentPixOrder = { ...(currentPixOrder || {}), ...order, provider_order_id: providerOrderId };

    if (status === 'processed') {
      setStatus('PIX aprovado. Receita conciliada automaticamente no financeiro.', 'ok');
      toast('PIX aprovado e lançado no financeiro.');
      setTimeout(() => location.reload(), 900);
      return;
    }
    if (['failed', 'cancelled', 'canceled', 'expired', 'refunded'].includes(status)) {
      setStatus(`Cobrança PIX encerrada: ${status}. Nenhuma receita foi lançada.`, 'error');
      lockManualSave(false);
      setBusy($('#chargePointBtn'), false);
      $('#cancelPointBtn')?.classList.add('hidden');
      currentPixOrder = null;
      syncPixUi();
      return;
    }
    setStatus(status === 'at_terminal' || status === 'created' || status === 'pending' ? 'Aguardando pagamento do PIX na Point...' : `Status do PIX: ${status}`, 'info');
  }
  setStatus('O PIX continua pendente. O webhook continuará acompanhando a cobrança.', 'info');
  lockManualSave(false);
  setBusy($('#chargePointBtn'), false);
  syncPixUi();
}

async function cancelPix() {
  const orderId = currentPixOrder?.provider_order_id;
  if (!orderId) return;
  const btn = $('#cancelPointBtn');
  setBusy(btn, true, 'Cancelando...');
  try {
    await invokePoint({ action: 'cancel_order', order_id: orderId });
    currentPixOrder = null;
    setStatus('Cobrança PIX cancelada. Nenhuma receita foi lançada.', 'info');
    toast('Cobrança PIX cancelada.');
    lockManualSave(false);
    $('#cancelPointBtn')?.classList.add('hidden');
    setBusy($('#chargePointBtn'), false);
    syncPixUi();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(btn, false);
  }
}

document.addEventListener('click', event => {
  const charge = event.target.closest('#chargePointBtn');
  if (charge && isPix()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void chargePix();
    return;
  }
  const cancel = event.target.closest('#cancelPointBtn');
  if (cancel && isPix() && currentPixOrder?.provider_order_id) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void cancelPix();
    return;
  }
  if (event.target.closest('[data-payment-method],[data-kind],[data-new-transaction]')) setTimeout(syncPixUi, 0);
}, true);

document.addEventListener('change', event => {
  if (event.target.matches('#transactionPaymentTerminal,#transactionPaymentMethod,#transactionKind')) setTimeout(syncPixUi, 0);
});

document.addEventListener('input', event => {
  if (event.target.matches('#transactionAmount,#transactionDescription')) setTimeout(syncPixUi, 0);
});

let mountAttempts = 0;
const mountTimer = setInterval(() => {
  mountAttempts += 1;
  syncPixUi();
  if (($('#transactionPaymentWrap') && $('#pointIntegratedActions')) || mountAttempts >= 40) clearInterval(mountTimer);
}, 200);

const { data: { session } } = await supabase.auth.getSession();
currentUser = session?.user || null;
if (currentUser) await loadTerminals();

supabase.auth.onAuthStateChange((_event, nextSession) => {
  currentUser = nextSession?.user || null;
  terminals = [];
  currentPixOrder = null;
  if (currentUser) setTimeout(() => void loadTerminals(), 0);
});

setTimeout(syncPixUi, 0);
