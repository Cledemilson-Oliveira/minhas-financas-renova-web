-- Minhas Finanças RENOVA
-- Formas de recebimento + cadastro de maquininhas e taxas.

create table if not exists public.payment_terminals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider text not null default 'outro',
  external_terminal_id text,
  debit_fee_percent numeric(8,4) not null default 0,
  credit_fee_percent numeric(8,4) not null default 0,
  is_active boolean not null default true,
  integration_status text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_terminals_debit_fee_ck check (debit_fee_percent between 0 and 100),
  constraint payment_terminals_credit_fee_ck check (credit_fee_percent between 0 and 100),
  constraint payment_terminals_integration_status_ck check (integration_status in ('manual','pending','connected','error'))
);

create index if not exists payment_terminals_user_id_idx on public.payment_terminals(user_id);

alter table public.payment_terminals enable row level security;

grant select, insert, update, delete on table public.payment_terminals to authenticated;
grant select, insert, update, delete on table public.payment_terminals to service_role;
revoke all on table public.payment_terminals from anon;

drop policy if exists payment_terminals_select_own on public.payment_terminals;
create policy payment_terminals_select_own
on public.payment_terminals for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists payment_terminals_insert_own on public.payment_terminals;
create policy payment_terminals_insert_own
on public.payment_terminals for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists payment_terminals_update_own on public.payment_terminals;
create policy payment_terminals_update_own
on public.payment_terminals for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists payment_terminals_delete_own on public.payment_terminals;
create policy payment_terminals_delete_own
on public.payment_terminals for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

alter table public.transactions
  add column if not exists gross_amount numeric(14,2),
  add column if not exists payment_method text,
  add column if not exists payment_terminal_id uuid,
  add column if not exists payment_fee_percent numeric(8,4) not null default 0,
  add column if not exists payment_fee_amount numeric(14,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_payment_method_ck') then
    alter table public.transactions
      add constraint transactions_payment_method_ck
      check (payment_method is null or payment_method in ('dinheiro','pix','debito','credito','outro'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'transactions_gross_amount_ck') then
    alter table public.transactions
      add constraint transactions_gross_amount_ck
      check (gross_amount is null or gross_amount > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'transactions_payment_fee_percent_ck') then
    alter table public.transactions
      add constraint transactions_payment_fee_percent_ck
      check (payment_fee_percent between 0 and 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'transactions_payment_fee_amount_ck') then
    alter table public.transactions
      add constraint transactions_payment_fee_amount_ck
      check (payment_fee_amount >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'transactions_payment_terminal_id_fkey') then
    alter table public.transactions
      add constraint transactions_payment_terminal_id_fkey
      foreign key (payment_terminal_id)
      references public.payment_terminals(id)
      on delete set null;
  end if;
end $$;

create index if not exists transactions_payment_terminal_id_idx on public.transactions(payment_terminal_id);

comment on table public.payment_terminals is 'Maquininhas/provedores cadastrados pelo usuário e respectivas taxas de débito e crédito.';
comment on column public.transactions.amount is 'Valor efetivo que movimenta o saldo. Para receitas com taxa de cartão, corresponde ao valor líquido.';
comment on column public.transactions.gross_amount is 'Valor bruto da receita antes da taxa de recebimento.';
comment on column public.transactions.payment_method is 'Forma de recebimento: dinheiro, pix, debito, credito ou outro.';
comment on column public.transactions.payment_fee_percent is 'Percentual de taxa aplicado no momento do lançamento, preservado historicamente.';
comment on column public.transactions.payment_fee_amount is 'Valor monetário da taxa aplicado no momento do lançamento, preservado historicamente.';
