import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = (value = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const toDbKind = kind => ({ income: 'receita', expense: 'despesa', transfer: 'transferencia' }[kind] || kind);
const toUiKind = kind => ({ receita: 'income', despesa: 'expense', transferencia: 'transfer', income: 'income', expense: 'expense', transfer: 'transfer' }[kind] || kind);
const METHOD_LABEL = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', outro: 'Outro' };
const PROVIDER_LABEL = {
  mercado_pago: 'Mercado Pago', infinitepay: 'InfinitePay', ton: 'Ton', stone: 'Stone',
  pagbank: 'PagBank', cielo: 'Cielo', rede: 'Rede', getnet: 'Getnet', sumup: 'SumUp', outro: 'Outro'
};

let currentUser = null;
let terminals = [];
let paymentTransactions = new Map();
let editingPaymentSnapshot = null;
let editPricingChanged = false;
let tableObserver = null;

function toast(message, type = 'ok') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 3400);
}

function setLoading(button, loading, text = 'Salvando...') {
  if (!button) return;
  if (loading) {
    button.dataset.paymentOriginal = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.paymentOriginal || button.textContent;
    button.disabled = false;
  }
}

function ensureStyles() {
  if (document.querySelector('link[data-renova-payments]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/payments-module.css?v=20260914-0900';
  link.dataset.renovaPayments = '1';
  document.head.appendChild(link);
}

function ensurePageButton() {
  const actions = $('#transactionsPage .page-actions');
  if (!actions || $('[data-open-payment-settings]', actions)) return;
  const addButton = $('[data-new-transaction]', actions);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost-btn payment-settings-trigger';
  button.dataset.openPaymentSettings = '1';
  button.innerHTML = '<span aria-hidden="true">⚙</span> Recebimentos';
  actions.insertBefore(button, addButton || null);
}

function receiptCardHtml(prefix) {
  const isEdit = prefix === 'edit';
  const idPrefix = isEdit ? 'editTransaction' : 'transaction';
  return `
    <section id="${idPrefix}PaymentWrap" class="payment-receipt-card">
      <div class="payment-receipt-head">
        <div><span class="eyebrow">RECEBIMENTO</span><strong>Como você recebeu?</strong></div>
        <button class="payment-mini-btn" type="button" data-open-payment-settings>⚙ Taxas</button>
      </div>
      <input id="${idPrefix}PaymentMethod" type="hidden" value="dinheiro" />
      <div class="payment-method-grid" role="group" aria-label="Forma de recebimento">
        <button type="button" class="payment-method active" data-payment-scope="${prefix}" data-payment-method="dinheiro"><span>💵</span><b>Dinheiro</b></button>
        <button type="button" class="payment-method" data-payment-scope="${prefix}" data-payment-method="pix"><span>◆</span><b>PIX</b></button>
        <button type="button" class="payment-method" data-payment-scope="${prefix}" data-payment-method="debito"><span>▣</span><b>Débito</b></button>
        <button type="button" class="payment-method" data-payment-scope="${prefix}" data-payment-method="credito"><span>▤</span><b>Crédito</b></button>
        <button type="button" class="payment-method" data-payment-scope="${prefix}" data-payment-method="outro"><span>＋</span><b>Outro</b></button>
      </div>
      <label id="${idPrefix}TerminalWrap" class="payment-terminal-wrap hidden">Maquininha / provedor
        <select id="${idPrefix}PaymentTerminal"></select>
      </label>
      <div id="${idPrefix}PaymentPreview" class="payment-fee-preview"></div>
    </section>`;
}

function ensureReceiptFields() {
  const newForm = $('#transactionForm');
  if (newForm && !$('#transactionPaymentWrap')) {
    const notes = $('#transactionNotes')?.closest('label');
    notes?.insertAdjacentHTML('beforebegin', receiptCardHtml('new'));
  }
  const editForm = $('#transactionEditForm');
  if (editForm && !$('#editTransactionPaymentWrap')) {
    const notes = $('#editTransactionNotes')?.closest('label');
    notes?.insertAdjacentHTML('beforebegin', receiptCardHtml('edit'));
  }
}

function ensureSettingsModal() {
  if ($('#paymentSettingsModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="paymentSettingsModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="paymentSettingsTitle">
      <div class="modal-backdrop" data-close-payment-settings></div>
      <div class="modal-card payment-settings-card">
        <div class="modal-head">
          <div><span class="eyebrow">RECEBIMENTOS</span><h2 id="paymentSettingsTitle">Maquininhas e taxas</h2></div>
          <button class="icon-btn" type="button" data-close-payment-settings>×</button>
        </div>
        <p class="payment-settings-copy">Cadastre as taxas reais da sua maquininha. Em cada venda no cartão o RENOVA calcula automaticamente taxa e valor líquido.</p>
        <form id="paymentTerminalForm" class="payment-terminal-form">
          <input id="paymentTerminalId" type="hidden" />
          <div class="payment-form-grid">
            <label>Nome da maquininha<input id="paymentTerminalName" type="text" placeholder="Ex.: InfinitePay balcão" required /></label>
            <label>Provedor<select id="paymentTerminalProvider">
              <option value="mercado_pago">Mercado Pago</option><option value="infinitepay">InfinitePay</option>
              <option value="ton">Ton</option><option value="stone">Stone</option><option value="pagbank">PagBank</option>
              <option value="cielo">Cielo</option><option value="rede">Rede</option><option value="getnet">Getnet</option>
              <option value="sumup">SumUp</option><option value="outro">Outro</option>
            </select></label>
          </div>
          <label>ID/serial do terminal <input id="paymentTerminalExternalId" type="text" placeholder="Opcional — deixa a estrutura pronta para API" /></label>
          <div class="payment-form-grid">
            <label>Taxa no débito (%)<input id="paymentTerminalDebitFee" type="number" min="0" max="100" step="0.0001" inputmode="decimal" value="0" required /></label>
            <label>Taxa no crédito (%)<input id="paymentTerminalCreditFee" type="number" min="0" max="100" step="0.0001" inputmode="decimal" value="0" required /></label>
          </div>
          <label class="payment-active-check"><input id="paymentTerminalActive" type="checkbox" checked /><span>Maquininha ativa para novos lançamentos</span></label>
          <div class="payment-api-note"><span>↔</span><div><strong>Preparada para integração por API</strong><small>O vínculo automático com a maquininha física será ativado quando houver API e credenciais do provedor escolhido.</small></div></div>
          <div class="payment-modal-actions">
            <button id="resetPaymentTerminalBtn" class="ghost-btn" type="button">Nova maquininha</button>
            <button id="savePaymentTerminalBtn" class="primary-btn" type="submit">Salvar configuração</button>
          </div>
        </form>
        <div class="payment-terminal-list-head"><span class="eyebrow">CADASTRADAS</span><strong>Suas maquininhas</strong></div>
        <div id="paymentTerminalsList" class="payment-terminal-list"><div class="empty-state">Nenhuma maquininha cadastrada.</div></div>
      </div>
    </div>`);
}

function terminalById(id) { return terminals.find(item => item.id === id) || null; }
function isCardMethod(method) { return method === 'debito' || method === 'credito'; }

function terminalOptions(selected = '') {
  const available = terminals.filter(item => item.is_active || item.id === selected);
  if (!available.length) return '<option value="">Cadastre uma maquininha</option>';
  return '<option value="">Selecione</option>' + available.map(item => {
    const inactive = item.is_active ? '' : ' (inativa)';
    return `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(item.name)} — ${escapeHtml(PROVIDER_LABEL[item.provider] || item.provider)}${inactive}</option>`;
  }).join('');
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function syncTerminalSelects() {
  const newSelect = $('#transactionPaymentTerminal');
  const editSelect = $('#editTransactionPaymentTerminal');
  if (newSelect) {
    const selected = newSelect.value;
    newSelect.innerHTML = terminalOptions(selected);
  }
  if (editSelect) {
    const selected = editSelect.value || editingPaymentSnapshot?.payment_terminal_id || '';
    editSelect.innerHTML = terminalOptions(selected);
  }
  renderPaymentPreview('new');
  renderPaymentPreview('edit');
}

function getScopeRefs(scope) {
  const isEdit = scope === 'edit';
  return {
    kind: $(`#${isEdit ? 'editTransactionKind' : 'transactionKind'}`)?.value || 'income',
    amount: $(`#${isEdit ? 'editTransactionAmount' : 'transactionAmount'}`),
    method: $(`#${isEdit ? 'editTransactionPaymentMethod' : 'transactionPaymentMethod'}`),
    terminal: $(`#${isEdit ? 'editTransactionPaymentTerminal' : 'transactionPaymentTerminal'}`),
    wrap: $(`#${isEdit ? 'editTransactionPaymentWrap' : 'transactionPaymentWrap'}`),
    terminalWrap: $(`#${isEdit ? 'editTransactionTerminalWrap' : 'transactionTerminalWrap'}`),
    preview: $(`#${isEdit ? 'editTransactionPaymentPreview' : 'transactionPaymentPreview'}`)
  };
}

function setPaymentMethod(scope, method, userChanged = true) {
  const refs = getScopeRefs(scope);
  if (!refs.method) return;
  refs.method.value = method;
  $$(`[data-payment-scope="${scope}"]`).forEach(btn => btn.classList.toggle('active', btn.dataset.paymentMethod === method));
  refs.terminalWrap?.classList.toggle('hidden', !isCardMethod(method));
  if (scope === 'edit' && userChanged) editPricingChanged = true;
  renderPaymentPreview(scope);
}

function currentFeePercent(scope, method, terminal) {
  if (!isCardMethod(method)) return 0;
  if (scope === 'edit' && !editPricingChanged && editingPaymentSnapshot) {
    const sameMethod = (editingPaymentSnapshot.payment_method || 'dinheiro') === method;
    const sameTerminal = (editingPaymentSnapshot.payment_terminal_id || '') === (terminal?.id || '');
    if (sameMethod && sameTerminal) return Number(editingPaymentSnapshot.payment_fee_percent || 0);
  }
  if (!terminal) return 0;
  return Number(method === 'debito' ? terminal.debit_fee_percent : terminal.credit_fee_percent) || 0;
}

function paymentCalculation(scope) {
  const refs = getScopeRefs(scope);
  const gross = roundMoney(Number(refs.amount?.value || 0));
  const method = refs.method?.value || 'dinheiro';
  const terminal = terminalById(refs.terminal?.value || '');
  const percent = currentFeePercent(scope, method, terminal);
  const fee = roundMoney(gross * percent / 100);
  const net = roundMoney(Math.max(0, gross - fee));
  return { gross, method, terminal, percent, fee, net };
}

function renderPaymentPreview(scope) {
  const refs = getScopeRefs(scope);
  if (!refs.wrap) return;
  const kind = refs.kind;
  refs.wrap.classList.toggle('hidden', kind !== 'income');
  if (kind !== 'income') return;
  const calc = paymentCalculation(scope);
  refs.terminalWrap?.classList.toggle('hidden', !isCardMethod(calc.method));
  if (!refs.preview) return;

  if (isCardMethod(calc.method) && !calc.terminal) {
    refs.preview.innerHTML = '<span class="payment-preview-warning">Cadastre ou selecione uma maquininha para aplicar a taxa.</span>';
    return;
  }
  if (!calc.gross) {
    refs.preview.innerHTML = `<span>${METHOD_LABEL[calc.method] || calc.method}</span><small>Informe o valor para visualizar o líquido.</small>`;
    return;
  }
  refs.preview.innerHTML = `
    <div><span>Bruto</span><strong>${money(calc.gross)}</strong></div>
    <div><span>Taxa ${calc.percent ? `${Number(calc.percent).toLocaleString('pt-BR')}%` : ''}</span><strong class="payment-fee-value">− ${money(calc.fee)}</strong></div>
    <div class="payment-net"><span>Líquido</span><strong>${money(calc.net)}</strong></div>`;
}

function resetTerminalForm() {
  const form = $('#paymentTerminalForm');
  if (!form) return;
  form.reset();
  $('#paymentTerminalId').value = '';
  $('#paymentTerminalProvider').value = 'mercado_pago';
  $('#paymentTerminalDebitFee').value = '0';
  $('#paymentTerminalCreditFee').value = '0';
  $('#paymentTerminalActive').checked = true;
  $('#savePaymentTerminalBtn').textContent = 'Salvar configuração';
  $('#paymentTerminalName')?.focus();
}

function renderTerminalsList() {
  const host = $('#paymentTerminalsList');
  if (!host) return;
  host.innerHTML = terminals.length ? terminals.map(item => `
    <article class="payment-terminal-item ${item.is_active ? '' : 'inactive'}">
      <div class="payment-terminal-main">
        <div class="payment-terminal-icon">▣</div>
        <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(PROVIDER_LABEL[item.provider] || item.provider)}${item.external_terminal_id ? ` • ${escapeHtml(item.external_terminal_id)}` : ''}</span></div>
      </div>
      <div class="payment-terminal-rates"><span>Débito <b>${Number(item.debit_fee_percent || 0).toLocaleString('pt-BR')}%</b></span><span>Crédito <b>${Number(item.credit_fee_percent || 0).toLocaleString('pt-BR')}%</b></span></div>
      <div class="payment-terminal-footer"><span class="payment-integration-badge ${item.integration_status}">${item.integration_status === 'connected' ? 'API conectada' : 'Configuração manual'}</span><button class="payment-mini-btn" type="button" data-terminal-edit="${item.id}">Editar</button></div>
    </article>`).join('') : '<div class="empty-state">Nenhuma maquininha cadastrada. Cadastre a primeira acima.</div>';
}

async function loadTerminals() {
  if (!currentUser) return;
  const { data, error } = await supabase.from('payment_terminals')
    .select('id,name,provider,external_terminal_id,debit_fee_percent,credit_fee_percent,is_active,integration_status,created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[RENOVA pagamentos] terminais:', error);
    return;
  }
  terminals = data || [];
  syncTerminalSelects();
  renderTerminalsList();
}

async function loadPaymentTransactions() {
  if (!currentUser) return;
  const { data, error } = await supabase.from('transactions')
    .select('id,kind,amount,gross_amount,payment_method,payment_terminal_id,payment_fee_percent,payment_fee_amount')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) {
    console.error('[RENOVA pagamentos] movimentações:', error);
    return;
  }
  paymentTransactions = new Map((data || []).map(item => [item.id, item]));
  decorateTransactionTable();
}

function decorateTransactionTable() {
  const host = $('#transactionsTable');
  if (!host) return;
  $$('[data-tx-edit]', host).forEach(button => {
    const id = button.dataset.txEdit;
    const tx = paymentTransactions.get(id);
    if (!tx || toUiKind(tx.kind) !== 'income' || !tx.payment_method) return;
    const row = button.closest('tr');
    const firstCell = row?.querySelector('td');
    if (!firstCell || firstCell.querySelector(`[data-payment-meta="${id}"]`)) return;
    const method = METHOD_LABEL[tx.payment_method] || tx.payment_method;
    const terminal = terminalById(tx.payment_terminal_id);
    const gross = Number(tx.gross_amount || tx.amount || 0);
    const fee = Number(tx.payment_fee_amount || 0);
    const net = Number(tx.amount || 0);
    const detail = isCardMethod(tx.payment_method)
      ? `${method}${terminal ? ` • ${terminal.name}` : ''} • bruto ${money(gross)} • taxa ${money(fee)} • líquido ${money(net)}`
      : `${method} • recebido ${money(net)}`;
    firstCell.insertAdjacentHTML('beforeend', `<small class="payment-row-meta" data-payment-meta="${id}">${escapeHtml(detail)}</small>`);
  });
}

function observeTransactionTable() {
  const host = $('#transactionsTable');
  if (!host || tableObserver) return;
  tableObserver = new MutationObserver(() => setTimeout(decorateTransactionTable, 0));
  tableObserver.observe(host, { childList: true, subtree: true });
}

function openSettings() {
  resetTerminalForm();
  renderTerminalsList();
  $('#paymentSettingsModal')?.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeSettings() {
  $('#paymentSettingsModal')?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function editTerminal(id) {
  const item = terminalById(id);
  if (!item) return;
  $('#paymentTerminalId').value = item.id;
  $('#paymentTerminalName').value = item.name || '';
  $('#paymentTerminalProvider').value = item.provider || 'outro';
  $('#paymentTerminalExternalId').value = item.external_terminal_id || '';
  $('#paymentTerminalDebitFee').value = Number(item.debit_fee_percent || 0);
  $('#paymentTerminalCreditFee').value = Number(item.credit_fee_percent || 0);
  $('#paymentTerminalActive').checked = Boolean(item.is_active);
  $('#savePaymentTerminalBtn').textContent = 'Salvar alterações';
  $('#paymentTerminalName')?.focus();
}

async function saveTerminal(event) {
  event.preventDefault();
  if (!currentUser) return toast('Faça login novamente.', 'error');
  const button = $('#savePaymentTerminalBtn');
  const debit = Number($('#paymentTerminalDebitFee').value || 0);
  const credit = Number($('#paymentTerminalCreditFee').value || 0);
  if (debit < 0 || debit > 100 || credit < 0 || credit > 100) return toast('As taxas devem ficar entre 0% e 100%.', 'error');
  const payload = {
    name: $('#paymentTerminalName').value.trim(),
    provider: $('#paymentTerminalProvider').value,
    external_terminal_id: $('#paymentTerminalExternalId').value.trim() || null,
    debit_fee_percent: debit,
    credit_fee_percent: credit,
    is_active: $('#paymentTerminalActive').checked,
    updated_at: new Date().toISOString()
  };
  if (!payload.name) return toast('Informe o nome da maquininha.', 'error');
  setLoading(button, true);
  const id = $('#paymentTerminalId').value;
  let result;
  if (id) {
    result = await supabase.from('payment_terminals').update(payload).eq('id', id).eq('user_id', currentUser.id);
  } else {
    result = await supabase.from('payment_terminals').insert({ ...payload, user_id: currentUser.id, integration_status: 'manual' });
  }
  setLoading(button, false);
  if (result.error) return toast(result.error.message, 'error');
  toast(id ? 'Taxas da maquininha atualizadas.' : 'Maquininha cadastrada.');
  resetTerminalForm();
  await loadTerminals();
}

function populateEditPayment(id) {
  const tx = paymentTransactions.get(id);
  if (!tx) return;
  editingPaymentSnapshot = { ...tx };
  editPricingChanged = false;
  const method = tx.payment_method || 'dinheiro';
  const amount = $('#editTransactionAmount');
  if (amount && toUiKind(tx.kind) === 'income') amount.value = Number(tx.gross_amount || tx.amount || 0);
  const terminalSelect = $('#editTransactionPaymentTerminal');
  if (terminalSelect) terminalSelect.innerHTML = terminalOptions(tx.payment_terminal_id || '');
  if (terminalSelect) terminalSelect.value = tx.payment_terminal_id || '';
  setPaymentMethod('edit', method, false);
  renderPaymentPreview('edit');
}

function validateCardSelection(scope) {
  const calc = paymentCalculation(scope);
  if (isCardMethod(calc.method) && !calc.terminal) {
    toast('Selecione uma maquininha para aplicar a taxa do cartão.', 'error');
    return null;
  }
  return calc;
}

async function saveNewTransaction(form) {
  if (!currentUser) return toast('Sua sessão expirou. Entre novamente.', 'error');
  if (!form.reportValidity()) return;
  const button = $('#saveTransactionBtn');
  const kind = $('#transactionKind').value;
  const accountId = $('#transactionAccount').value;
  const destination = $('#transactionDestinationAccount').value || null;
  if (kind === 'transfer' && (!destination || destination === accountId)) return toast('Escolha uma conta de destino diferente.', 'error');

  let amount = roundMoney(Number($('#transactionAmount').value));
  let payment = { gross: null, method: null, terminal: null, percent: 0, fee: 0, net: amount };
  if (kind === 'income') {
    payment = validateCardSelection('new');
    if (!payment) return;
    amount = payment.net;
  }
  if (amount <= 0) return toast('O valor líquido precisa ser maior que zero.', 'error');

  const payload = {
    user_id: currentUser.id,
    account_id: accountId,
    destination_account_id: kind === 'transfer' ? destination : null,
    category_id: kind === 'transfer' ? null : ($('#transactionCategory').value || null),
    kind: toDbKind(kind),
    description: $('#transactionDescription').value.trim(),
    amount,
    gross_amount: kind === 'income' ? payment.gross : null,
    payment_method: kind === 'income' ? payment.method : null,
    payment_terminal_id: kind === 'income' && isCardMethod(payment.method) ? payment.terminal?.id || null : null,
    payment_fee_percent: kind === 'income' ? payment.percent : 0,
    payment_fee_amount: kind === 'income' ? payment.fee : 0,
    occurred_on: $('#transactionDate').value,
    status: 'pago',
    notes: $('#transactionNotes').value.trim() || null
  };
  if (!payload.description) return toast('Informe a descrição.', 'error');

  setLoading(button, true);
  const { error } = await supabase.from('transactions').insert(payload);
  setLoading(button, false);
  if (error) return toast(error.message, 'error');
  toast(kind === 'income' && payment.fee > 0 ? `Receita salva. Líquido: ${money(payment.net)}.` : 'Movimentação salva.');
  setTimeout(() => location.reload(), 550);
}

async function saveEditedTransaction(form) {
  if (!currentUser) return toast('Sua sessão expirou. Entre novamente.', 'error');
  if (!form.reportValidity()) return;
  const id = editingPaymentSnapshot?.id;
  if (!id) return toast('Não foi possível identificar a movimentação.', 'error');
  const button = $('#saveTransactionEditBtn');
  const kind = $('#editTransactionKind').value;
  const accountId = $('#editTransactionAccount').value;
  const destination = $('#editTransactionDestination').value || null;
  if (kind === 'transfer' && (!destination || destination === accountId)) return toast('Escolha uma conta de destino diferente.', 'error');

  let amount = roundMoney(Number($('#editTransactionAmount').value));
  let payment = { gross: null, method: null, terminal: null, percent: 0, fee: 0, net: amount };
  if (kind === 'income') {
    payment = validateCardSelection('edit');
    if (!payment) return;
    amount = payment.net;
  }
  if (amount <= 0) return toast('O valor líquido precisa ser maior que zero.', 'error');

  const payload = {
    account_id: accountId,
    destination_account_id: kind === 'transfer' ? destination : null,
    category_id: kind === 'transfer' ? null : ($('#editTransactionCategory').value || null),
    kind: toDbKind(kind),
    description: $('#editTransactionDescription').value.trim(),
    amount,
    gross_amount: kind === 'income' ? payment.gross : null,
    payment_method: kind === 'income' ? payment.method : null,
    payment_terminal_id: kind === 'income' && isCardMethod(payment.method) ? payment.terminal?.id || null : null,
    payment_fee_percent: kind === 'income' ? payment.percent : 0,
    payment_fee_amount: kind === 'income' ? payment.fee : 0,
    occurred_on: $('#editTransactionDate').value,
    status: $('#editTransactionStatus').value,
    notes: $('#editTransactionNotes').value.trim() || null,
    due_date: kind === 'expense' ? ($('#editTransactionDueDate')?.value || editingPaymentSnapshot?.due_date || null) : null,
    updated_at: new Date().toISOString()
  };
  if (kind !== 'expense') {
    payload.late_fee_percent = 0;
    payload.late_interest_percent_daily = 0;
    payload.late_charge_fixed = 0;
  }

  setLoading(button, true);
  const { error } = await supabase.from('transactions').update(payload).eq('id', id).eq('user_id', currentUser.id);
  setLoading(button, false);
  if (error) return toast(error.message, 'error');
  toast(kind === 'income' && payment.fee > 0 ? `Movimentação atualizada. Líquido: ${money(payment.net)}.` : 'Movimentação atualizada.');
  setTimeout(() => location.reload(), 550);
}

function bind() {
  document.addEventListener('click', event => {
    const settings = event.target.closest('[data-open-payment-settings]');
    if (settings) { event.preventDefault(); return openSettings(); }
    if (event.target.closest('[data-close-payment-settings]')) return closeSettings();

    const method = event.target.closest('[data-payment-method]');
    if (method) return setPaymentMethod(method.dataset.paymentScope, method.dataset.paymentMethod, true);

    const terminalEdit = event.target.closest('[data-terminal-edit]');
    if (terminalEdit) return editTerminal(terminalEdit.dataset.terminalEdit);

    const txEdit = event.target.closest('[data-tx-edit]');
    if (txEdit) setTimeout(() => populateEditPayment(txEdit.dataset.txEdit), 0);

    const kindButton = event.target.closest('[data-kind]');
    if (kindButton) setTimeout(() => { renderPaymentPreview('new'); }, 0);
    const editKindButton = event.target.closest('[data-edit-kind]');
    if (editKindButton) setTimeout(() => { renderPaymentPreview('edit'); }, 0);
  });

  document.addEventListener('input', event => {
    if (event.target.matches('#transactionAmount')) renderPaymentPreview('new');
    if (event.target.matches('#editTransactionAmount')) renderPaymentPreview('edit');
  });
  document.addEventListener('change', event => {
    if (event.target.matches('#transactionPaymentTerminal')) renderPaymentPreview('new');
    if (event.target.matches('#editTransactionPaymentTerminal')) { editPricingChanged = true; renderPaymentPreview('edit'); }
  });

  document.addEventListener('submit', event => {
    if (event.target.id === 'transactionForm') {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      void saveNewTransaction(event.target);
      return;
    }
    if (event.target.id === 'transactionEditForm') {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      void saveEditedTransaction(event.target);
    }
  }, true);

  $('#paymentTerminalForm')?.addEventListener('submit', saveTerminal);
  $('#resetPaymentTerminalBtn')?.addEventListener('click', resetTerminalForm);
}

async function initForUser(user) {
  currentUser = user;
  ensurePageButton();
  ensureReceiptFields();
  ensureSettingsModal();
  bind();
  observeTransactionTable();
  await Promise.all([loadTerminals(), loadPaymentTransactions()]);
  setPaymentMethod('new', 'dinheiro', false);
  renderPaymentPreview('new');
}

ensureStyles();
ensurePageButton();
ensureReceiptFields();
ensureSettingsModal();

const { data: { session } } = await supabase.auth.getSession();
if (session?.user) await initForUser(session.user);

supabase.auth.onAuthStateChange((_event, nextSession) => {
  if (nextSession?.user && nextSession.user.id !== currentUser?.id) {
    setTimeout(() => initForUser(nextSession.user), 0);
  }
  if (!nextSession?.user) {
    currentUser = null;
    terminals = [];
    paymentTransactions = new Map();
  }
});
