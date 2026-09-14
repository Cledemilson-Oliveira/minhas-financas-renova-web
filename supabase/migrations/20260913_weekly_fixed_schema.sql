-- Minhas Finanças RENOVA: suporte a receita/despesa fixa por dias da semana.
alter table public.recurring_transactions
  drop constraint if exists recurring_schedule_type_ck;

alter table public.recurring_transactions
  add constraint recurring_schedule_type_ck
  check (schedule_type = any (array['mensal_fixa'::text, 'parcelada'::text, 'semanal_fixa'::text]));

alter table public.recurring_transactions
  drop constraint if exists recurring_installments_ck;

alter table public.recurring_transactions
  add constraint recurring_installments_ck
  check (
    ((schedule_type = any (array['mensal_fixa'::text, 'semanal_fixa'::text])) and total_installments is null)
    or
    (schedule_type = 'parcelada'::text and total_installments >= 1 and total_installments <= 360)
  );

create unique index if not exists transactions_recurring_date_unique
  on public.transactions (recurring_id, occurred_on);
