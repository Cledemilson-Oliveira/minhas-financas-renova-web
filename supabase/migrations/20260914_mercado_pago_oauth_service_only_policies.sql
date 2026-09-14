drop policy if exists payment_oauth_credentials_service_only on public.payment_oauth_credentials;
create policy payment_oauth_credentials_service_only
  on public.payment_oauth_credentials
  for all to service_role
  using (true)
  with check (true);

drop policy if exists payment_oauth_states_service_only on public.payment_oauth_states;
create policy payment_oauth_states_service_only
  on public.payment_oauth_states
  for all to service_role
  using (true)
  with check (true);
