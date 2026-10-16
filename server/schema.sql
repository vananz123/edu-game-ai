-- Run in the Supabase SQL editor before enabling cloud generation.
-- Never expose SUPABASE_SERVICE_ROLE_KEY to the Electron application.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  status text not null default 'active' check (status in ('active', 'past_due', 'cancelled')),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  generations integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.subscriptions enable row level security;
alter table public.usage_monthly enable row level security;
-- No client policies: only the server's service-role key may read/write these tables.

create or replace function public.consume_generation_quota(p_user_id uuid, p_month text)
returns table(allowed boolean, used integer, quota_limit integer, plan text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := 'free';
  v_status text := 'active';
  v_used integer := 0;
  v_limit integer := 5;
begin
  select s.plan, s.status into v_plan, v_status
  from public.subscriptions s where s.user_id = p_user_id;
  if v_status is distinct from 'active' then
    v_plan := 'free';
  end if;
  if v_plan = 'plus' then v_limit := 100; else v_limit := 5; end if;

  insert into public.usage_monthly(user_id, month, generations)
  values (p_user_id, p_month, 0)
  on conflict (user_id, month) do nothing;

  select u.generations into v_used
  from public.usage_monthly u
  where u.user_id = p_user_id and u.month = p_month
  for update;

  if v_used >= v_limit then
    return query select false, v_used, v_limit, v_plan;
    return;
  end if;

  update public.usage_monthly
  set generations = generations + 1, updated_at = now()
  where user_id = p_user_id and month = p_month
  returning generations into v_used;

  return query select true, v_used, v_limit, v_plan;
end;
$$;

revoke all on function public.consume_generation_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_generation_quota(uuid, text) to service_role;
