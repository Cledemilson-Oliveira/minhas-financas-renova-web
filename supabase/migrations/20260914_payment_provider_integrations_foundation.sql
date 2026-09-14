-- Minhas Finanças RENOVA
-- Fundação das integrações com provedores de pagamento.
-- Estado aplicado em produção no projeto Supabase renova-financas.
-- Escopo ativo do produto: Mercado Pago + InfinitePay.
-- O valor 'ton' permanece aceito nesta fundação apenas por compatibilidade
-- com a primeira modelagem; não faz parte do roadmap ativo documentado.

create table if not exists public.payment_provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('mercado_pago','infinitepay','ton')),
  connection_type text not null default 'manual'
    check (connection_type in ('manual','platform','oauth','deeplink','checkout')),
  status text not null default 'disconnected'
    check (status in ('disconnected','pending','connected','error')),
  display_name text,
  account_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, connection_type)
);

create index if not exists payment_provider_connections_user_idx
  on public.payment_provider_connections(user_id, provider);

alter table public.payment_provider_connections enable row level security;

grant select, insert, update, delete on table public.payment_provider_connections to authenticated;
grant select, insert, update, delete on table public.payment_provider_connections to service_role;
revoke all on table public.payment_provider_connections from anon;

drop policy if exists payment_provider_connections_select_own on public.payment_provider_connections;
create policy payment_provider_connections_select_own
  on public.payment_provider_connections
  for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists payment_provider_connections_insert_own on public.payment_provider_connections;
create policy payment_provider_connections_insert_own
  on public.payment_provider_connections
  for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists payment_provider_connections_update_own on public.payment_provider_connections;
create policy payment_provider_connections_update_own
  on public.payment_provider_connections
  for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists payment_provider_connections_delete_own on public.payment_provider_connections;
create policy payment_provider_connections_delete_own
  on public.payment_provider_connections
  for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('mercado_pago','infinitepay','ton')),
  connection_id uuid references public.payment_provider_connections(id) on delete set null,
  terminal_id uuid references public.payment_terminals(id) on delete set null,
  provider_order_id text,
  provider_payment_id text,
  external_reference text not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text check (payment_method is null or payment_method in ('pix','debito','credito','outro')),
  installments integer not null default 1 check (installments between 1 and 24),
  status text not null default 'created'
    check (status in ('created','pending','at_terminal','processed','failed','cancelled','expired','refunded')),
  status_detail text,
  transaction_id uuid references public.transactions(id) on delete set null,
  provider_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_reference)
);

create index if not exists payment_orders_user_created_idx
  on public.payment_orders(user_id, created_at desc);
create index if not exists payment_orders_provider_order_idx
  on public.payment_orders(provider, provider_order_id);
create index if not exists payment_orders_transaction_idx
  on public.payment_orders(transaction_id);

alter table public.payment_orders enable row level security;

grant select on table public.payment_orders to authenticated;
grant select, insert, update, delete on table public.payment_orders to service_role;
revoke insert, update, delete on table public.payment_orders from authenticated;
revoke all on table public.payment_orders from anon;

drop policy if exists payment_orders_select_own on public.payment_orders;
create policy payment_orders_select_own
  on public.payment_orders
  for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

alter table public.payment_terminals
  add column if not exists connection_id uuid,
  add column if not exists integration_mode text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_terminals_connection_id_fkey'
  ) then
    alter table public.payment_terminals
      add constraint payment_terminals_connection_id_fkey
      foreign key (connection_id)
      references public.payment_provider_connections(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_terminals_integration_mode_ck'
  ) then
    alter table public.payment_terminals
      add constraint payment_terminals_integration_mode_ck
      check (integration_mode in (
        'manual',
        'mercado_pago_point',
        'infinitepay_tap',
        'infinitepay_checkout',
        'ton_tap',
        'ton_manual'
      ));
  end if;
end $$;

create index if not exists payment_terminals_connection_id_idx
  on public.payment_terminals(connection_id);

comment on table public.payment_provider_connections is
  'Conexões do usuário com provedores de pagamento. Credenciais sensíveis nunca devem ser gravadas nesta tabela; usar secrets do backend ou OAuth seguro.';

comment on table public.payment_orders is
  'Ordens de cobrança externas criadas para Mercado Pago Point, InfinitePay e adaptadores futuros, vinculáveis a uma transação financeira.';

comment on column public.payment_terminals.integration_mode is
  'Modo de integração do dispositivo/provedor. O escopo ativo do RENOVA é Mercado Pago Point e InfinitePay.';
