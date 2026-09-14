import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const $ = (selector, root = document) => root.querySelector(selector);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let currentUser = null;
let currentRole = null;
let oauthConnection = null;
let statusObserver = null;

function toast(message, type = 'ok') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 3800);
}

async function waitFor(selector, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const el = $(selector);
    if (el) return el;
    await sleep(100);
  }
  return null;
}

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('mercado-pago-oauth', { body });
  if (error) {
    let detail = null;
    try { detail = error.context ? await error.context.json() : null; } catch (_) {}
    throw new Error(detail?.message || detail?.error || error.message || 'Falha ao conectar Mercado Pago.');
  }
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

function ensureStyles() {
  if ($('style[data-mp-oauth]')) return;
  const style = document.createElement('style');
  style.dataset.mpOauth = '1';
  style.textContent = `
    .mp-oauth-box{margin-top:10px;padding:10px 12px;border:1px solid rgba(36,224,195,.28);border-radius:12px;background:rgba(36,224,195,.07);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .mp-oauth-copy{display:grid;gap:2px;min-width:190px;flex:1}.mp-oauth-copy strong{font-size:12px}.mp-oauth-copy small{font-size:10px;opacity:.78;line-height:1.35}
    .mp-oauth-actions{display:flex;gap:7px;flex-wrap:wrap}.mp-oauth-actions button{white-space:nowrap}
    .mp-oauth-dot{display:inline-block;width:7px;height:7px;border-radius:99px;margin-right:5px;background:#8a9aaa}.mp-oauth-dot.connected{background:#24e0c3;box-shadow:0 0 10px rgba(36,224,195,.55)}
    @media(max-width:640px){.mp-oauth-box{align-items:stretch}.mp-oauth-actions{width:100%}.mp-oauth-actions button{flex:1}}
  `;
  document.head.appendChild(style);
}

async function ensureUi() {
  const card = await waitFor('[data-provider-card="mercado_pago"]');
  if (!card || $('#mpOauthBox')) return;
  const actions = $('.provider-card-actions', card);
  const box = document.createElement('div');
  box.id = 'mpOauthBox';
  box.className = 'mp-oauth-box';
  box.innerHTML = `
    <div class="mp-oauth-copy">
      <strong id="mpOauthTitle"><span class="mp-oauth-dot"></span> Mercado Pago</strong>
      <small id="mpOauthDescription">Verificando autorização da conta...</small>
    </div>
    <div class="mp-oauth-actions">
      <button id="connectMercadoPagoOauthBtn" class="primary-btn" type="button">Conectar Mercado Pago</button>
      <button id="disconnectMercadoPagoOauthBtn" class="ghost-btn hidden" type="button">Desconectar</button>
    </div>`;
  actions?.insertAdjacentElement('beforebegin', box);
  const note = $('.provider-integrations-note');
  if (note) note.textContent = 'A Conta Dono pode usar a credencial da plataforma. Cada usuário conecta a própria conta Mercado Pago por OAuth; Access Token, refresh token e segredos nunca ficam no navegador.';
}

async function loadStatus() {
  if (!currentUser) return;
  const [{ data: access }, result] = await Promise.all([
    supabase.from('user_access').select('role,status').eq('user_id', currentUser.id).maybeSingle(),
    invoke({ action: 'status' }).catch(() => ({ connected: false, connection: null }))
  ]);
  currentRole = access?.role || null;
  oauthConnection = result?.connected ? result.connection : null;
  render();
}

function render() {
  const title = $('#mpOauthTitle');
  const description = $('#mpOauthDescription');
  const connect = $('#connectMercadoPagoOauthBtn');
  const disconnect = $('#disconnectMercadoPagoOauthBtn');
  const search = $('#searchPointTerminalsBtn');
  const mpStatus = $('#mpIntegrationStatus');
  if (!title || !description) return;
  const dot = title.querySelector('.mp-oauth-dot');

  if (oauthConnection) {
    dot?.classList.add('connected');
    title.lastChild.textContent = ' Mercado Pago conectado';
    const ref = oauthConnection.account_reference ? `Conta ${oauthConnection.account_reference}` : 'Conta autorizada';
    description.textContent = `${ref} • autorização segura via OAuth`;
    connect?.classList.add('hidden');
    disconnect?.classList.remove('hidden');
    if (search) { search.disabled = false; search.title = ''; }
    if (mpStatus && !document.querySelector('[data-provider-card="mercado_pago"] .payment-integration-badge')) mpStatus.textContent = 'Conta conectada • escolha sua Point';
    return;
  }

  dot?.classList.toggle('connected', currentRole === 'dono');
  connect?.classList.remove('hidden');
  disconnect?.classList.add('hidden');
  if (currentRole === 'dono') {
    title.lastChild.textContent = ' Conta Dono conectada';
    description.textContent = 'A Conta Dono continua usando a credencial segura da plataforma. OAuth também pode ser usado para validar o fluxo dos clientes.';
    connect.textContent = 'Conectar via OAuth';
    if (search) { search.disabled = false; search.title = ''; }
  } else {
    title.lastChild.textContent = ' Mercado Pago não conectado';
    description.textContent = 'Autorize sua própria conta uma única vez. Você não precisa copiar Access Token nem Client Secret.';
    connect.textContent = 'Conectar Mercado Pago';
    if (search) { search.disabled = true; search.title = 'Conecte sua conta Mercado Pago primeiro.'; }
    if (mpStatus) mpStatus.textContent = 'Conecte sua conta para buscar sua Point';
  }
}

async function startOauth() {
  const btn = $('#connectMercadoPagoOauthBtn');
  if (!btn) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Abrindo Mercado Pago...';
  let popup = null;
  try {
    popup = window.open('about:blank', 'renovaMercadoPagoOauth', 'width=520,height=760,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes');
    const returnUrl = `${window.location.origin}${window.location.pathname}`;
    const data = await invoke({ action: 'start', return_url: returnUrl });
    if (!data?.authorization_url) throw new Error('URL de autorização não recebida.');
    if (popup && !popup.closed) popup.location.href = data.authorization_url;
    else window.open(data.authorization_url, '_blank');
    toast('Autorize o Minhas Finanças RENOVA na tela oficial do Mercado Pago.');
  } catch (error) {
    try { popup?.close(); } catch (_) {}
    toast(error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function disconnectOauth() {
  if (!confirm('Desconectar esta conta Mercado Pago do Minhas Finanças RENOVA? As Points vinculadas serão desativadas até uma nova conexão.')) return;
  const btn = $('#disconnectMercadoPagoOauthBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Desconectando...'; }
  try {
    await invoke({ action: 'disconnect' });
    toast('Mercado Pago desconectado.');
    setTimeout(() => location.reload(), 500);
  } catch (error) {
    toast(error.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Desconectar'; }
  }
}

function bind() {
  document.addEventListener('click', event => {
    if (event.target.closest('#connectMercadoPagoOauthBtn')) void startOauth();
    if (event.target.closest('#disconnectMercadoPagoOauthBtn')) void disconnectOauth();
  });

  window.addEventListener('message', event => {
    if (event.origin !== new URL(SUPABASE_URL).origin) return;
    if (event.data?.type !== 'renova:mercado-pago-oauth') return;
    if (event.data?.ok) {
      toast('Mercado Pago conectado. Agora você já pode buscar sua Point.');
      setTimeout(() => location.reload(), 700);
    } else {
      toast(event.data?.message || 'A autorização Mercado Pago não foi concluída.', 'error');
    }
  });

  const status = $('#mpIntegrationStatus');
  if (status && !statusObserver) {
    statusObserver = new MutationObserver(() => setTimeout(render, 0));
    statusObserver.observe(status, { childList: true, characterData: true, subtree: true });
  }
}

async function init(user) {
  currentUser = user;
  ensureStyles();
  await ensureUi();
  bind();
  await loadStatus();
}

const { data: { session } } = await supabase.auth.getSession();
if (session?.user) await init(session.user);

supabase.auth.onAuthStateChange((_event, nextSession) => {
  if (nextSession?.user && nextSession.user.id !== currentUser?.id) setTimeout(() => void init(nextSession.user), 0);
  if (!nextSession?.user) { currentUser = null; currentRole = null; oauthConnection = null; }
});
