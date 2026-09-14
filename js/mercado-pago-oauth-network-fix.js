import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function toast(message, type = 'ok') {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'toast'; }, 4200);
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
      'Authorization': `Bearer ${accessToken}`,
      'apikey': SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      'x-client-info': 'renova-web-oauth-fallback/1.0'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.message || data?.error || `Falha ao iniciar Mercado Pago (${response.status}).`);
  }
  return data;
}

async function startOauthRobust(button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Abrindo Mercado Pago...';

  // Abre imediatamente a janela para evitar bloqueio de popup após a chamada assíncrona.
  let popup = null;
  try {
    popup = window.open('about:blank', 'renovaMercadoPagoOauth', 'width=520,height=760,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes');
    if (popup) {
      try {
        popup.document.title = 'Conectando Mercado Pago...';
        popup.document.body.innerHTML = '<div style="font-family:Arial,sans-serif;padding:28px;color:#172231"><b>Minhas Finanças RENOVA</b><p>Preparando conexão segura com o Mercado Pago...</p></div>';
      } catch (_) {}
    }

    const returnUrl = `${window.location.origin}${window.location.pathname}`;
    let data;
    let lastError;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        data = await directInvoke({ action: 'start', return_url: returnUrl });
        break;
      } catch (error) {
        lastError = error;
        if (attempt === 0 && /failed to fetch|network|load failed/i.test(String(error?.message || error))) {
          await sleep(700);
          continue;
        }
        throw error;
      }
    }

    if (!data?.authorization_url) throw lastError || new Error('URL de autorização não recebida.');

    if (popup && !popup.closed) popup.location.replace(data.authorization_url);
    else {
      const opened = window.open(data.authorization_url, '_blank', 'noopener,noreferrer');
      if (!opened) window.location.href = data.authorization_url;
    }

    toast('Autorize o Minhas Finanças RENOVA na tela oficial do Mercado Pago.');
  } catch (error) {
    try { popup?.close(); } catch (_) {}
    const message = String(error?.message || error || 'Falha ao conectar Mercado Pago.');
    toast(message.includes('Failed to fetch') ? 'Não foi possível abrir o Mercado Pago agora. Verifique a internet e tente novamente.' : message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

// Captura antes do listener antigo. Assim preservamos toda a interface existente e apenas
// substituímos a abertura OAuth por um fluxo mais resistente a iframe/domínio customizado.
document.addEventListener('click', event => {
  const button = event.target.closest('#connectMercadoPagoOauthBtn');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void startOauthRobust(button);
}, true);
