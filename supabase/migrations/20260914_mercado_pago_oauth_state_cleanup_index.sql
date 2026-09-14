create index if not exists payment_oauth_states_unused_idx
  on public.payment_oauth_states(provider, expires_at)
  where used_at is null;
