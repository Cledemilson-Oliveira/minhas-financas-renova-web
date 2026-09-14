-- Minhas Finanças RENOVA: parcelas, multa e juros em despesas fixas mensais.
alter table public.recurring_transactions
  add column if not exists late_fee_percent numeric(8,4) not null default 0,
  add column if not exists late_interest_percent_daily numeric(8,4) not null default 0,
  add column if not exists late_charge_fixed numeric(14,2) not null default 0;

alter table public.recurring_transactions
  drop constraint if exists recurring_installments_ck;

alter table public.recurring_transactions
  add constraint recurring_installments_ck
  check (
    (schedule_type = 'semanal_fixa' and total_installments is null)
    or
    (schedule_type = 'mensal_fixa' and (total_installments is null or total_installments between 1 and 360))
    or
    (schedule_type = 'parcelada' and total_installments between 1 and 360)
  );

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recurring_late_fee_percent_nonnegative') then
    alter table public.recurring_transactions add constraint recurring_late_fee_percent_nonnegative check (late_fee_percent >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurring_late_interest_percent_daily_nonnegative') then
    alter table public.recurring_transactions add constraint recurring_late_interest_percent_daily_nonnegative check (late_interest_percent_daily >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurring_late_charge_fixed_nonnegative') then
    alter table public.recurring_transactions add constraint recurring_late_charge_fixed_nonnegative check (late_charge_fixed >= 0);
  end if;
end $$;

create or replace function public.materialize_monthly_fixed_flows()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_rule record;
  v_due date;
  v_first_next date;
  v_last_next date;
  v_generated integer := 0;
  v_processed integer;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  for v_rule in
    select id, account_id, category_id, kind, description, amount,
           next_due_date, due_day, notes, total_installments, generated_installments,
           late_fee_percent, late_interest_percent_daily, late_charge_fixed
      from public.recurring_transactions
     where user_id = v_user_id
       and schedule_type = 'mensal_fixa'
       and is_active = true
       and next_due_date <= current_date
       and (total_installments is null or generated_installments < total_installments)
     order by next_due_date, id
  loop
    v_due := v_rule.next_due_date;
    v_processed := coalesce(v_rule.generated_installments, 0);

    while v_due <= current_date
      and (v_rule.total_installments is null or v_processed < v_rule.total_installments)
    loop
      insert into public.transactions (
        user_id, account_id, destination_account_id, category_id, kind,
        description, amount, occurred_on, due_date, recurring_id, status, notes,
        late_fee_percent, late_interest_percent_daily, late_charge_fixed
      ) values (
        v_user_id, v_rule.account_id, null, v_rule.category_id, v_rule.kind,
        v_rule.description, v_rule.amount, v_due, v_due, v_rule.id, 'previsto', v_rule.notes,
        v_rule.late_fee_percent, v_rule.late_interest_percent_daily, v_rule.late_charge_fixed
      ) on conflict (recurring_id, occurred_on) do nothing;
      if found then v_generated := v_generated + 1; end if;
      v_processed := v_processed + 1;

      v_first_next := (date_trunc('month', v_due)::date + interval '1 month')::date;
      v_last_next := (v_first_next + interval '1 month - 1 day')::date;
      v_due := v_first_next + (
        least(v_rule.due_day::integer, extract(day from v_last_next)::integer) - 1
      );
    end loop;

    update public.recurring_transactions
       set next_due_date = v_due,
           generated_installments = v_processed,
           is_active = case when total_installments is null then true else v_processed < total_installments end,
           end_date = case when total_installments is not null and v_processed >= total_installments then v_due else end_date end,
           updated_at = now()
     where id = v_rule.id and user_id = v_user_id;
  end loop;

  return v_generated;
end;
$$;

create or replace function public.create_monthly_fixed_flow_v2(
  p_account_id uuid,
  p_category_id uuid,
  p_kind text,
  p_description text,
  p_amount numeric,
  p_start_date date,
  p_notes text default null,
  p_total_installments integer default null,
  p_late_fee_percent numeric default 0,
  p_late_interest_percent_daily numeric default 0,
  p_late_charge_fixed numeric default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_rule_id uuid;
  v_generated integer := 0;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_kind not in ('receita','despesa') then raise exception 'invalid kind'; end if;
  if p_description is null or btrim(p_description) = '' then raise exception 'description is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be greater than zero'; end if;
  if p_start_date is null then raise exception 'start date is required'; end if;
  if p_kind = 'despesa' and (p_total_installments is null or p_total_installments not between 1 and 360) then
    raise exception 'installments must be between 1 and 360 for expenses';
  end if;
  if p_kind = 'receita' then p_total_installments := null; end if;
  if coalesce(p_late_fee_percent,0) < 0 or coalesce(p_late_interest_percent_daily,0) < 0 or coalesce(p_late_charge_fixed,0) < 0 then
    raise exception 'late charges must be nonnegative';
  end if;

  insert into public.recurring_transactions (
    user_id, account_id, category_id, kind, description, amount,
    frequency, next_due_date, is_active, schedule_type, start_date,
    due_day, total_amount, total_installments, generated_installments,
    end_date, notes, late_fee_percent, late_interest_percent_daily, late_charge_fixed
  ) values (
    v_user_id, p_account_id, p_category_id, p_kind, btrim(p_description), p_amount,
    'mensal', p_start_date, true, 'mensal_fixa', p_start_date,
    extract(day from p_start_date)::smallint,
    case when p_total_installments is null then null else p_amount * p_total_installments end,
    p_total_installments, 0, null, nullif(btrim(coalesce(p_notes,'')), ''),
    coalesce(p_late_fee_percent,0), coalesce(p_late_interest_percent_daily,0), coalesce(p_late_charge_fixed,0)
  ) returning id into v_rule_id;

  v_generated := public.materialize_monthly_fixed_flows();
  return jsonb_build_object(
    'rule_id', v_rule_id,
    'transactions_generated', v_generated,
    'due_day', extract(day from p_start_date)::integer,
    'total_installments', p_total_installments
  );
end;
$$;

revoke all on function public.create_monthly_fixed_flow_v2(uuid,uuid,text,text,numeric,date,text,integer,numeric,numeric,numeric) from public, anon;
grant execute on function public.create_monthly_fixed_flow_v2(uuid,uuid,text,text,numeric,date,text,integer,numeric,numeric,numeric) to authenticated;
