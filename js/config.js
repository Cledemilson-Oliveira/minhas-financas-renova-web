// Apenas credenciais públicas do Supabase podem ficar neste arquivo.
// Nunca adicione service_role, access tokens ou segredos de provedores.
export const SUPABASE_URL = 'https://ysxttnnkuyhzvkjheqfy.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ExcRQAHpToigI3WDwv3tew_ONpV9Xls';

// Carrega o complemento de receita/despesa fixa por dia após a configuração base.
queueMicrotask(() => import('./daily-fixed-module.js').catch(error => console.warn('[RENOVA] Módulo de fluxo diário não carregou.', error)));

// Carrega as integrações automáticas de recebimento sem expor tokens privados no frontend.
queueMicrotask(() => import('./payment-integrations-module.js?v=20260914-1015').catch(error => console.warn('[RENOVA] Integrações de pagamento não carregaram.', error)));

// Trata o retorno do OAuth no próprio domínio RENOVA. Isso evita depender de HTML
// renderizado diretamente pela Edge Function em navegadores/iframes restritivos.
queueMicrotask(() => import('./mercado-pago-oauth-return-fix.js?v=20260914-1420').catch(error => console.warn('[RENOVA] Retorno OAuth Mercado Pago não carregou.', error)));

// OAuth Mercado Pago multiusuário. O bootstrap observa a interface e monta o botão
// de conexão assim que o painel de Recebimentos existir, evitando disputa de ordem/cache.
queueMicrotask(() => import('./mercado-pago-oauth-bootstrap.js?v=20260914-1420').catch(error => console.warn('[RENOVA] OAuth Mercado Pago não carregou.', error)));

// Adiciona PIX integrado na Mercado Pago Point. O QR Code é exibido no terminal e a receita
// só é conciliada após confirmação da order pelo Mercado Pago.
queueMicrotask(() => import('./point-pix-module.js?v=20260914-1225').catch(error => console.warn('[RENOVA] PIX Point não carregou.', error)));

// Corrige o contraste do modal/cartões de planos sem alterar o Checkout Mercado Pago.
queueMicrotask(() => import('./plan-modal-contrast-fix.js?v=20260914-1400').catch(error => console.warn('[RENOVA] Correção de contraste dos planos não carregou.', error)));

// Central de instruções: mostra ao usuário onde encontrar cada recurso e como usar o sistema.
queueMicrotask(() => import('./help-center-module.js?v=20260914-1505').catch(error => console.warn('[RENOVA] Central de instruções não carregou.', error)));

// Garante que a Conta Dono e demais usuários vejam apenas suas próprias contas/categorias
// nos formulários financeiros, mesmo quando políticas administrativas permitem visão global.
queueMicrotask(() => import('./user-financial-scope-fix.js?v=20260914-1045').catch(error => console.warn('[RENOVA] Isolamento financeiro do usuário não carregou.', error)));
