-- Minhas Finanças RENOVA: chave OpenAI individual, criptografada no Supabase Vault.
create table if not exists public.ai_user_provider_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'openai' check (provider = 'openai'),
  vault_secret_id uuid not null,
  key_hint text not null check (char_length(key_hint) between 4 and 12),
  model text not null default 'gpt-5-mini' check (model ~ '^[a-zA-Z0-9._-]{2,80}$'),
  is_enabled boolean not null default true,
  tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_user_provider_settings enable row level security;
revoke all on table public.ai_user_provider_settings from public, anon, authenticated;

create or replace function public.admin_upsert_user_openai_key(
  p_user_id uuid,
  p_api_key text,
  p_key_hint text,
  p_model text default 'gpt-5-mini'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_name text := 'openai_user_' || p_user_id::text;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'invalid user';
  end if;
  if p_api_key is null or char_length(p_api_key) < 20 then raise exception 'invalid api key'; end if;
  if p_key_hint is null or char_length(p_key_hint) not between 4 and 12 then raise exception 'invalid key hint'; end if;
  if p_model is null or p_model !~ '^[a-zA-Z0-9._-]{2,80}$' then raise exception 'invalid model'; end if;

  select vault_secret_id into v_secret_id
    from public.ai_user_provider_settings where user_id=p_user_id;

  if v_secret_id is null then
    select vault.create_secret(p_api_key, v_name, 'OpenAI API key do usuário RENOVA')
      into v_secret_id;
  else
    perform vault.update_secret(v_secret_id, p_api_key, v_name, 'OpenAI API key do usuário RENOVA');
  end if;

  insert into public.ai_user_provider_settings(user_id,vault_secret_id,key_hint,model,is_enabled,updated_at)
  values(p_user_id,v_secret_id,p_key_hint,p_model,true,now())
  on conflict(user_id) do update set
    vault_secret_id=excluded.vault_secret_id,
    key_hint=excluded.key_hint,
    model=excluded.model,
    is_enabled=true,
    updated_at=now();
end;
$$;

create or replace function public.admin_get_user_openai_key(p_user_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select v.decrypted_secret
    from public.ai_user_provider_settings s
    join vault.decrypted_secrets v on v.id=s.vault_secret_id
   where s.user_id=p_user_id and s.is_enabled=true;
$$;

create or replace function public.admin_delete_user_openai_key(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  delete from public.ai_user_provider_settings
   where user_id=p_user_id
   returning vault_secret_id into v_secret_id;
  if v_secret_id is not null then delete from vault.secrets where id=v_secret_id; end if;
end;
$$;

revoke all on function public.admin_upsert_user_openai_key(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_get_user_openai_key(uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_user_openai_key(uuid) from public, anon, authenticated;
grant execute on function public.admin_upsert_user_openai_key(uuid,text,text,text) to service_role;
grant execute on function public.admin_get_user_openai_key(uuid) to service_role;
grant execute on function public.admin_delete_user_openai_key(uuid) to service_role;
