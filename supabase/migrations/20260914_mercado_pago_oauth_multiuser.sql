-- Minhas Finanças RENOVA
-- OAuth multiusuário do Mercado Pago Point.
-- Tokens são server-only: nunca disponíveis para anon/authenticated via Data API.

create table if not exists public.payment_oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('mercado_pago')),
  provider_user_id text,
  access_token text not null,
  refresh_token text,
  token_type text,
  scope text,
  public_key text,
  live_mode boolean,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists payment_oauth_credentials_provider_user_idx
  on public.payment_oauth_credentials(provider, provider_user_id);

alter table public.payment_oauth_credentials enable row level security;
revoke all on table public.payment_oauth_credentials from anon, authenticated;
grant select, insert, update, delete on table public.payment_oauth_credentials to service_role;

comment on table public.payment_oauth_credentials is
  'Credenciais OAuth privadas dos vendedores. Acesso exclusivo do backend/service_role; nunca expor no navegador.';
comment on column public.payment_oauth_credentials.access_token is
  'Access Token privado do vendedor. Server-only.';
comment on column public.payment_oauth_credentials.refresh_token is
  'Refresh Token privado do vendedor. Server-only e substituído a cada renovação.';

create table if not exists public.payment_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('mercado_pago')),
  code_verifier text not null,
  return_url text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payment_oauth_states_user_created_idx
  on public.payment_oauth_states(user_id, created_at desc);
create index if not exists payment_oauth_states_expiry_idx
  on public.payment_oauth_states(expires_at);

alter table public.payment_oauth_states enable row level security;
revoke all on table public.payment_oauth_states from anon, authenticated;
grant select, insert, update, delete on table public.payment_oauth_states to service_role;

comment on table public.payment_oauth_states is
  'Estados efêmeros do OAuth + PKCE. Acesso exclusivo do backend/service_role.';