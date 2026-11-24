-- Vá nhanh: chỉ các HÀM của `2026-11-24-account-credits.sql`.
--
-- Dùng khi bảng đã có nhưng hàm RPC chưa có — đúng trạng thái đo được ngày 24/11:
-- `subscriptions`, `usage_monthly`, `profiles`, `server_config`, `ai_usage_log` đều
-- trả 200, còn `consume_generation_quota` / `consume_credits` / `credit_cost_for`
-- trả `404 PGRST202`. Tệp đầy đủ vẫn là nguồn duy nhất; tệp này chỉ là bản rút gọn
-- để một lần dán không bị đứt giữa đường (và để kiểm được: 4 hàm, 8 dấu $$).
--
-- Idempotent: chạy lại nhiều lần không sao (`create or replace`, trigger drop/create).

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.credit_cost_for(p_type text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (value #>> '{}')::integer from public.server_config where key = 'credit_cost_' || p_type),
    (select (value #>> '{}')::integer from public.server_config where key = 'quota_free_monthly_credits'),
    50
  );
$$;

create or replace function public.consume_credits(
  p_user_id uuid,
  p_credits integer,
  p_feature text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := to_char(now(), 'YYYY-MM');
  v_used integer;
  v_limit integer;
  v_plan text := 'free';
  v_status text := 'active';
begin
  if p_credits is null or p_credits <= 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_credit_amount');
  end if;

  -- Cùng một yêu cầu gửi lại (mạng chập chờn) không được trừ tiền hai lần.
  if p_idempotency_key is not null and exists (
    select 1 from public.ai_usage_log
    where idempotency_key = p_idempotency_key and status <> 'failed'
  ) then
    return jsonb_build_object('success', true, 'already_processed', true);
  end if;

  select s.plan, s.status into v_plan, v_status
  from public.subscriptions s
  where s.user_id = p_user_id;

  if v_status is distinct from 'active' then
    v_plan := 'free';
  end if;

  insert into public.usage_monthly (user_id, month, generations, credits_used, credits_limit)
  values (
    p_user_id,
    v_month,
    0,
    0,
    case when v_plan in ('plus', 'pro') then 500 else 50 end
  )
  on conflict (user_id, month) do nothing;

  -- Khoá dòng: hai yêu cầu đồng thời không cùng đọc một số dư.
  select credits_used, credits_limit into v_used, v_limit
  from public.usage_monthly
  where user_id = p_user_id and month = v_month
  for update;

  if v_used + p_credits > v_limit then
    return jsonb_build_object(
      'success', false,
      'error', 'quota_exceeded',
      'credits_used', v_used,
      'credits_limit', v_limit
    );
  end if;

  update public.usage_monthly
  set credits_used = credits_used + p_credits
  where user_id = p_user_id and month = v_month
  returning credits_used into v_used;

  insert into public.ai_usage_log (user_id, feature, credit_cost, status, idempotency_key, completed_at)
  values (
    p_user_id,
    coalesce(p_feature, 'unknown'),
    p_credits,
    'completed',
    p_idempotency_key,
    now()
  )
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object(
    'success', true,
    'credits_used', v_used,
    'credits_limit', v_limit,
    'credits_remaining', v_limit - v_used
  );
end;
$$;

revoke all on function public.consume_credits(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.consume_credits(uuid, integer, text, text) to service_role;

revoke all on function public.credit_cost_for(text) from public, anon, authenticated;
grant execute on function public.credit_cost_for(text) to service_role;
