-- Minhas Finanças RENOVA
-- Conciliação automática: payment_orders processada -> transactions.

create unique index if not exists payment_terminals_user_provider_external_unique
on public.payment_terminals(user_id, provider, external_terminal_id)
where external_terminal_id is not null;

create unique index if not exists payment_orders_transaction_unique
on public.payment_orders(transaction_id)
where transaction_id is not null;

create or replace function public.reconcile_processed_payment_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account_id uuid;
  v_category_id uuid;
  v_transaction_id uuid;
  v_fee_percent numeric(8,4) := 0;
  v_fee_amount numeric(14,2) := 0;
  v_net_amount numeric(14,2);
  v_description text;
  v_method text;
  v_uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
begin
  if new.status is distinct from 'processed' or new.transaction_id is not null then
    return new;
  end if;

  if coalesce(new.provider_data->>'account_id','') ~ v_uuid_pattern then
    v_account_id := (new.provider_data->>'account_id')::uuid;
  end if;

  if v_account_id is null or not exists (
    select 1 from public.accounts a
    where a.id = v_account_id and a.user_id = new.user_id and a.is_active = true
  ) then
    new.status_detail := concat_ws(' • ', nullif(new.status_detail,''), 'aguardando_conta_para_conciliacao');
    return new;
  end if;

  if coalesce(new.provider_data->>'category_id','') ~ v_uuid_pattern then
    v_category_id := (new.provider_data->>'category_id')::uuid;
    if not exists (
      select 1 from public.categories c
      where c.id = v_category_id and c.user_id = new.user_id
    ) then
      v_category_id := null;
    end if;
  end if;

  v_method := case
    when new.payment_method in ('pix','debito','credito','outro') then new.payment_method
    else 'outro'
  end;

  if new.terminal_id is not null and v_method in ('debito','credito') then
    select case
      when v_method = 'debito' then t.debit_fee_percent
      else t.credit_fee_percent
    end
    into v_fee_percent
    from public.payment_terminals t
    where t.id = new.terminal_id and t.user_id = new.user_id;
  end if;

  v_fee_percent := coalesce(v_fee_percent, 0);
  v_fee_amount := round((new.amount * v_fee_percent / 100.0)::numeric, 2);
  v_net_amount := round((new.amount - v_fee_amount)::numeric, 2);
  if v_net_amount <= 0 then
    v_fee_percent := 0;
    v_fee_amount := 0;
    v_net_amount := new.amount;
  end if;

  v_description := coalesce(nullif(trim(new.provider_data->>'description'),''),
    case new.provider
      when 'mercado_pago' then 'Recebimento Mercado Pago'
      when 'infinitepay' then 'Recebimento InfinitePay'
      else 'Recebimento integrado'
    end
  );

  insert into public.transactions (
    user_id,
    account_id,
    category_id,
    kind,
    description,
    amount,
    gross_amount,
    payment_method,
    payment_terminal_id,
    payment_fee_percent,
    payment_fee_amount,
    occurred_on,
    status,
    notes
  ) values (
    new.user_id,
    v_account_id,
    v_category_id,
    'receita',
    v_description,
    v_net_amount,
    new.amount,
    v_method,
    new.terminal_id,
    v_fee_percent,
    v_fee_amount,
    current_date,
    'pago',
    concat('Pagamento confirmado automaticamente • ', new.provider, ' • pedido ', coalesce(new.provider_order_id,new.external_reference))
  )
  returning id into v_transaction_id;

  new.transaction_id := v_transaction_id;
  new.status_detail := concat_ws(' • ', nullif(new.status_detail,''), 'conciliado_automaticamente');
  return new;
end;
$$;

revoke all on function public.reconcile_processed_payment_order() from public, anon, authenticated;

drop trigger if exists payment_orders_reconcile_processed on public.payment_orders;
create trigger payment_orders_reconcile_processed
before insert or update of status on public.payment_orders
for each row
execute function public.reconcile_processed_payment_order();

comment on function public.reconcile_processed_payment_order() is
'Concilia uma payment_order processada em uma única receita financeira. Função de trigger sem EXECUTE público.';
