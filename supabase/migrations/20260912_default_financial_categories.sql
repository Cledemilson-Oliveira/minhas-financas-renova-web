create or replace function public.seed_default_categories_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, kind, icon, is_active)
  values
    (p_user_id, 'Salário', 'receita', '💼', true),
    (p_user_id, 'Vendas', 'receita', '💰', true),
    (p_user_id, 'Serviços', 'receita', '🧾', true),
    (p_user_id, 'Comissões', 'receita', '🤝', true),
    (p_user_id, 'Rendimentos', 'receita', '📈', true),
    (p_user_id, 'Reembolsos', 'receita', '↩️', true),
    (p_user_id, 'Alimentação', 'despesa', '🛒', true),
    (p_user_id, 'Moradia', 'despesa', '🏠', true),
    (p_user_id, 'Transporte', 'despesa', '🚲', true),
    (p_user_id, 'Saúde', 'despesa', '❤️', true),
    (p_user_id, 'Educação', 'despesa', '📚', true),
    (p_user_id, 'Família', 'despesa', '👨‍👩‍👧‍👦', true),
    (p_user_id, 'Lazer', 'despesa', '🎯', true),
    (p_user_id, 'Assinaturas', 'despesa', '🔁', true),
    (p_user_id, 'Impostos e taxas', 'despesa', '🧮', true),
    (p_user_id, 'Empréstimos e dívidas', 'despesa', '💸', true),
    (p_user_id, 'Outros', 'ambos', '📌', true)
  on conflict (user_id, name, kind) do nothing;
end;
$$;

create or replace function public.handle_new_user_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_categories_for_user(new.id);
  return new;
end;
$$;

drop trigger if exists trg_auth_user_default_categories on auth.users;
create trigger trg_auth_user_default_categories
after insert on auth.users
for each row execute function public.handle_new_user_default_categories();

select public.seed_default_categories_for_user(u.id)
from auth.users u
where not exists (
  select 1 from public.categories c where c.user_id = u.id
);
