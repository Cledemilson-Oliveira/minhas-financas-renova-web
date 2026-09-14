-- Minhas Finanças RENOVA: receita/despesa fixa por mês.
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
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  for v_rule in
    select id, account_id, category_id, kind, description, amount,
           next_due_date, due_day, notes
      from public.recurring_transactions
     where user_id = v_user_id
       and schedule_type = 'mensal_fixa'
       and is_active = true
       and next_due_date <= current_date
     order by next_due_date, id
  loop
    v_due := v_rule.next_due_date;
    while v_due <= current_date loop
      insert into public.transactions (
        user_id, account_id, destination_account_id, category_id, kind,
        description, amount, occurred_on, due_date, recurring_id, status, notes
      ) values (
        v_user_id, v_rule.account_id, null, v_rule.category_id, v_rule.kind,
        v_rule.description, v_rule.amount, v_due, v_due, v_rule.id, 'previsto', v_rule.notes
      ) on conflict (recurring_id, occurred_on) do nothing;
      if found then v_generated := v_generated + 1; end if;

      v_first_next := (date_trunc('month', v_due)::date + interval '1 month')::date;
      v_last_next := (v_first_next + interval '1 month - 1 day')::date;
      v_due := v_first_next + (
        least(v_rule.due_day::integer, extract(day from v_last_next)::integer) - 1
      );
    end loop;

    update public.recurring_transactions
       set next_due_date = v_due,
           updated_at = now()
     where id = v_rule.id and user_id = v_user_id;
  end loop;

  return v_generated;
end;
$$;

create or replace function public.create_monthly_fixed_flow(
  p_account_id uuid,
  p_category_id uuid,
  p_kind text,
  p_description text,
  p_amount numeric,
  p_start_date date,
  p_notes text default null
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

  insert into public.recurring_transactions (
    user_id, account_id, category_id, kind, description, amount,
    frequency, next_due_date, is_active, schedule_type, start_date,
    due_day, total_amount, total_installments, generated_installments,
    end_date, notes
  ) values (
    v_user_id, p_account_id, p_category_id, p_kind, btrim(p_description), p_amount,
    'mensal', p_start_date, true, 'mensal_fixa', p_start_date,
    extract(day from p_start_date)::smallint, null, null, 0,
    null, nullif(btrim(coalesce(p_notes,'')), '')
  ) returning id into v_rule_id;

  v_generated := public.materialize_monthly_fixed_flows();
  return jsonb_build_object(
    'rule_id', v_rule_id,
    'transactions_generated', v_generated,
    'due_day', extract(day from p_start_date)::integer
  );
end;
$$;

revoke all on function public.materialize_monthly_fixed_flows() from public, anon;
revoke all on function public.create_monthly_fixed_flow(uuid,uuid,text,text,numeric,date,text) from public, anon;
grant execute on function public.materialize_monthly_fixed_flows() to authenticated;
grant execute on function public.create_monthly_fixed_flow(uuid,uuid,text,text,numeric,date,text) to authenticated;
