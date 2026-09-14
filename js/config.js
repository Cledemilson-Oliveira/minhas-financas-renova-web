// Apenas credenciais públicas do Supabase podem ficar neste arquivo.
// Nunca adicione service_role, access tokens ou segredos de provedores.
export const SUPABASE_URL = 'https://ysxttnnkuyhzvkjheqfy.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ExcRQAHpToigI3WDwv3tew_ONpV9Xls';

// Carrega o complemento de receita/despesa fixa por dia após a configuração base.
queueMicrotask(() => import('./daily-fixed-module.js').catch(error => console.warn('[RENOVA] Módulo de fluxo diário não carregou.', error)));
