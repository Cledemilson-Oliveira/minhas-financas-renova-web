alter table public.transactions
  add column if not exists late_fee_percent numeric(8,4) not null default 0,
  add column if not exists late_interest_percent_daily numeric(8,4) not null default 0,
  add column if not exists late_charge_fixed numeric(14,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_late_fee_percent_nonnegative') then
    alter table public.transactions add constraint transactions_late_fee_percent_nonnegative check (late_fee_percent >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_late_interest_percent_daily_nonnegative') then
    alter table public.transactions add constraint transactions_late_interest_percent_daily_nonnegative check (late_interest_percent_daily >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_late_charge_fixed_nonnegative') then
    alter table public.transactions add constraint transactions_late_charge_fixed_nonnegative check (late_charge_fixed >= 0);
  end if;
end $$;

comment on column public.transactions.late_fee_percent is 'Multa percentual aplicada uma vez quando a despesa vence.';
comment on column public.transactions.late_interest_percent_daily is 'Juros percentuais simples por dia de atraso.';
comment on column public.transactions.late_charge_fixed is 'Encargos fixos adicionais em reais para despesa vencida.';
