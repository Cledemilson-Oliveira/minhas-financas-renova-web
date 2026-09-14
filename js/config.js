// Apenas credenciais públicas do Supabase podem ficar neste arquivo.
// Nunca adicione service_role, access tokens ou segredos de provedores.
export const SUPABASE_URL = 'https://ysxttnnkuyhzvkjheqfy.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ExcRQAHpToigI3WDwv3tew_ONpV9Xls';

// Carrega o complemento de receita/despesa fixa por dia após a configuração base.
queueMicrotask(() => import('./daily-fixed-module.js').catch(error => console.warn('[RENOVA] Módulo de fluxo diário não carregou.', error)));

// Carrega as integrações automáticas de recebimento sem expor tokens privados no frontend.
queueMicrotask(() => import('./payment-integrations-module.js?v=20260914-1015').catch(error => console.warn('[RENOVA] Integrações de pagamento não carregaram.', error)));
