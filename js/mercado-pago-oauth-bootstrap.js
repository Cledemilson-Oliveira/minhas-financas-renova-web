import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=20260914-1355';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector, root = document) => root.querySelector(selector);
let currentUser = null;
let currentRole = null;
let oauthConnection = null;
let mounted = false;
let busy = false;

function toast(message, type = 'ok') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 4200);
}

function ensureStyles() {
  if ($('style[data-mp-oauth-bootstrap]')) return;
  const style = document.createElement('style');
  style.dataset.mpOauthBootstrap = '1';
  style.textContent = `
    .mp-oauth-box{margin:10px 0;padding:11px 12px;border:1px solid rgba(36,224,195,.30);border-radius:12px;background:rgba(36,224,195,.075);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .mp-oauth-copy{display:grid;gap:3px;min-width:190px;flex:1}.mp-oauth-copy strong{font-size:12px}.mp-oauth-copy small{font-size:10px;opacity:.8;line-height:1.4}
    .mp-oauth-actions{display:flex;gap:7px;flex-wrap:wrap}.mp-oauth-actions button{white-space:nowrap}
    .mp-oauth-dot{display:inline-block;width:8px;height:8px;border-radius:99px;margin-right:6px;background:#8a9aaa;vertical-align:1px}
    .mp-oauth-dot.connected{background:#24e0c3;box-shadow:0 0 10px rgba(36,224,195,.55)}
    #searchPointTerminalsBtn[disabled]{opacity:.48;cursor:not-allowed;filter:saturate(.35)}
    @media(max-width:640px){.mp-oauth-box{align-items:stretch}.mp-oauth-actions{width:100%}.mp-oauth-actions button{flex:1 1 140px}}
  `;
  document.head.appendChild(style);
}

function ensureUi() {
  const card = $('[data-provider-card="mercado_pago"]');
  if (!card) return false;
  if ($('#mpOauthBox')) {
    mounted = true;
    return true;
  }
  const actions = $('.provider-card-actions', card);
  if (!actions) return false;
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
  actions.insertAdjacentElement('beforebegin', box);
  mounted = true;
  return true;
}

async function directInvoke(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente.');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/mercado-pago-oauth`, {
    method: 'POST',
    mode: 'cors',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      'x-client-info': 'renova-web-oauth-bootstrap/1.0'
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.message || data?.error || `Falha na conexão Mercado Pago (${response.status}).`);
  }
  return data;
}

async function loadState() {
  if (!currentUser) return;
  const { data: access } = await supabase.from('user_access').select('role,status').eq('user_id', currentUser.id).maybeSingle();
  currentRole = access?.role || null;
  try {
    const result = await directInvoke({ action: 'status' });
    oauthConnection = result?.connected ? result.connection : null;
  } catch (error) {
    oauthConnection = null;
    console.warn('[RENOVA] Status OAuth Mercado Pago:', error);
  }
  render();
}

function render() {
  if (!ensureUi()) return;
  const title = $('#mpOauthTitle');
  const description = $('#mpOauthDescription');
  const connect = $('#connectMercadoPagoOauthBtn');
  const disconnect = $('#disconnectMercadoPagoOauthBtn');
  const search = $('#searchPointTerminalsBtn');
  const mpStatus = $('#mpIntegrationStatus');
  const dot = $('.mp-oauth-dot', $('#mpOauthBox'));

  if (oauthConnection) {
    dot?.classList.add('connected');
    if (title) title.innerHTML = '<span class="mp-oauth-dot connected"></span> Mercado Pago conectado';
    const ref = oauthConnection.account_reference ? `Conta ${oauthConnection.account_reference}` : 'Conta autorizada';
    if (description) description.textContent = `${ref} • autorização segura via OAuth`;
    connect?.classList.add('hidden');
    disconnect?.classList.remove('hidden');
    if (search) { search.disabled = false; search.title = ''; }
    if (mpStatus) mpStatus.textContent = 'Conta conectada • escolha sua Point';
    return;
  }

  disconnect?.classList.add('hidden');
  connect?.classList.remove('hidden');
  if (currentRole === 'dono') {
    dot?.classList.add('connected');
    if (title) title.innerHTML = '<span class="mp-oauth-dot connected"></span> Conta Dono conectada';
    if (description) description.textContent = 'A Conta Dono usa a credencial segura da plataforma. Você também pode validar o fluxo OAuth dos clientes.';
    if (connect) connect.textContent = 'Conectar via OAuth';
    if (search) { search.disabled = false; search.title = ''; }
    if (mpStatus) mpStatus.textContent = 'Pronto para buscar terminais da Conta Dono';
  } else {
    dot?.classList.remove('connected');
    if (title) title.innerHTML = '<span class="mp-oauth-dot"></span> Mercado Pago não conectado';
    if (description) description.textContent = 'Conecte sua própria conta uma única vez. Nenhuma chave secreta precisa ser enviada ao RENOVA.';
    if (connect) connect.textContent = 'Conectar Mercado Pago';
    if (search) {
      search.disabled = true;
      search.title = 'Conecte sua conta Mercado Pago primeiro.';
    }
    if (mpStatus) mpStatus.textContent = 'Conecte sua conta para buscar sua Point';
    const discovery = $('#mpTerminalDiscovery');
    if (discovery && /Failed to send a request|oauth_connection_required|Edge Function/i.test(discovery.textContent || '')) {
      discovery.classList.add('hidden');
      discovery.innerHTML = '';
    }
  }
}

async function startOauth() {
  if (busy) return;
  const btn = $('#connectMercadoPagoOauthBtn');
  if (!btn) return;
  busy = true;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Abrindo Mercado Pago...';
  let popup = null;
  try {
    popup = window.open('about:blank', 'renovaMercadoPagoOauth', 'width=520,height=760,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes');
    if (popup) {
      try {
        popup.document.title = 'Mercado Pago • RENOVA';
        popup.document.body.innerHTML = '<div style="font-family:Arial,sans-serif;padding:28px;color:#172231"><b>Minhas Finanças RENOVA</b><p>Preparando conexão segura com o Mercado Pago...</p></div>';
      } catch (_) {}
    }

    const returnUrl = `${window.location.origin}${window.location.pathname}`;
    const data = await directInvoke({ action: 'start', return_url: returnUrl });
    if (!data?.authorization_url) throw new Error('O Mercado Pago não retornou a URL de autorização.');

    if (popup && !popup.closed) popup.location.replace(data.authorization_url);
    else {
      const opened = window.open(data.authorization_url, '_blank', 'noopener,noreferrer');
      if (!opened) window.location.href = data.authorization_url;
    }
    toast('Autorize sua conta na tela oficial do Mercado Pago.');
  } catch (error) {
    try { popup?.close(); } catch (_) {}
    toast(String(error?.message || error || 'Falha ao conectar Mercado Pago.'), 'error');
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function disconnectOauth() {
  if (!confirm('Desconectar esta conta Mercado Pago do Minhas Finanças RENOVA?')) return;
  const btn = $('#disconnectMercadoPagoOauthBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Desconectando...'; }
  try {
    await directInvoke({ action: 'disconnect' });
    oauthConnection = null;
    toast('Mercado Pago desconectado.');
    render();
  } catch (error) {
    toast(String(error?.message || error), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Desconectar'; }
  }
}

// Garante que o bloco OAuth apareça mesmo que o painel de Recebimentos seja criado depois.
const observer = new MutationObserver(() => {
  if (!currentUser) return;
  if (!mounted && ensureUi()) render();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('click', event => {
  const connect = event.target.closest('#connectMercadoPagoOauthBtn');
  if (connect) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void startOauth();
    return;
  }
  const disconnect = event.target.closest('#disconnectMercadoPagoOauthBtn');
  if (disconnect) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void disconnectOauth();
  }
}, true);

window.addEventListener('message', event => {
  if (event.origin !== new URL(SUPABASE_URL).origin) return;
  if (event.data?.type !== 'renova:mercado-pago-oauth') return;
  if (event.data?.ok) {
    toast('Mercado Pago conectado. Agora você pode buscar sua Point.');
    setTimeout(() => void loadState(), 250);
  } else {
    toast(event.data?.message || 'A autorização Mercado Pago não foi concluída.', 'error');
  }
});

ensureStyles();
const { data: { session } } = await supabase.auth.getSession();
currentUser = session?.user || null;
if (currentUser) {
  ensureUi();
  await loadState();
}

supabase.auth.onAuthStateChange((_event, nextSession) => {
  currentUser = nextSession?.user || null;
  if (!currentUser) {
    currentRole = null;
    oauthConnection = null;
    return;
  }
  setTimeout(() => void loadState(), 0);
});
