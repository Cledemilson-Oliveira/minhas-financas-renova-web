create index if not exists payment_provider_connections_user_provider_type_idx
  on public.payment_provider_connections(user_id, provider, connection_type, status);

create or replace function public.cleanup_expired_payment_oauth_states()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  n integer;
begin
  delete from public.payment_oauth_states
  where expires_at < now() - interval '1 day'
     or used_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.cleanup_expired_payment_oauth_states() from public, anon, authenticated;
grant execute on function public.cleanup_expired_payment_oauth_states() to service_role;

comment on function public.cleanup_expired_payment_oauth_states() is
  'Remove estados OAuth expirados ou já usados; execução exclusiva do backend.';
