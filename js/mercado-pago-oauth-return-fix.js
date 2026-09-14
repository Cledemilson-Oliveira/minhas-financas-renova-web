const params = new URLSearchParams(window.location.search);
const result = params.get('mp_oauth');

if (result) {
  const ok = result === 'success';
  const message = params.get('mp_oauth_message') || (ok
    ? 'Mercado Pago conectado. Agora você pode buscar sua Point.'
    : 'A autorização Mercado Pago não foi concluída.');

  // Limpa os parâmetros do OAuth antes de qualquer reload para evitar loop.
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('mp_oauth');
  cleanUrl.searchParams.delete('mp_oauth_message');
  history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);

  const notify = () => {
    const toast = document.querySelector('#toast');
    if (toast) {
      toast.textContent = message;
      toast.className = `toast show ${ok ? 'ok' : 'error'}`;
      setTimeout(() => { toast.className = 'toast'; }, 4200);
    }
  };

  // O callback agora redireciona para o próprio domínio do RENOVA. Quando a
  // autorização ocorreu em popup, conseguimos atualizar a janela principal
  // sem depender de HTML executado pela Edge Function ou de Content-Type.
  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage({
        type: 'renova:mercado-pago-oauth',
        ok,
        message
      }, window.location.origin);
    } catch (_) {}

    try {
      if (ok) window.opener.location.reload();
    } catch (_) {}

    setTimeout(() => window.close(), 350);
  } else {
    notify();
    window.dispatchEvent(new CustomEvent('renova:mercado-pago-oauth-return', {
      detail: { ok, message }
    }));
  }
}
