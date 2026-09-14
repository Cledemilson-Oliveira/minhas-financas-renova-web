// Apenas credenciais públicas do Supabase podem ficar neste arquivo.
// Nunca adicione service_role, access tokens ou segredos de provedores.
export const SUPABASE_URL = 'https://ysxttnnkuyhzvkjheqfy.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ExcRQAHpToigI3WDwv3tew_ONpV9Xls';

// Carrega o complemento de receita/despesa fixa por dia após a configuração base.
queueMicrotask(() => import('./daily-fixed-module.js').catch(error => console.warn('[RENOVA] Módulo de fluxo diário não carregou.', error)));

// Carrega as integrações automáticas de recebimento sem expor tokens privados no frontend.
queueMicrotask(() => import('./payment-integrations-module.js?v=20260914-1015').catch(error => console.warn('[RENOVA] Integrações de pagamento não carregaram.', error)));

// O OAuth Mercado Pago multiusuário é carregado diretamente no index.html.
// Isso evita disputa de ordem/cache entre módulos dinâmicos no domínio customizado/iframe.

// Adiciona PIX integrado na Mercado Pago Point. O QR Code é exibido no terminal e a receita
// só é conciliada após confirmação da order pelo Mercado Pago.
queueMicrotask(() => import('./point-pix-module.js?v=20260914-1225').catch(error => console.warn('[RENOVA] PIX Point não carregou.', error)));

// Garante que a Conta Dono e demais usuários vejam apenas suas próprias contas/categorias
// nos formulários financeiros, mesmo quando políticas administrativas permitem visão global.
queueMicrotask(() => import('./user-financial-scope-fix.js?v=20260914-1045').catch(error => console.warn('[RENOVA] Isolamento financeiro do usuário não carregou.', error)));
