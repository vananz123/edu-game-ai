-- Cloud auth/credits — Phase 1 + 2 của docs/archive/specs/cloud-auth-plan.md (§7).
-- Chạy trong SQL editor của Supabase TRƯỚC khi bật Cloud AI.
--
-- Tệp này idempotent: chạy lại nhiều lần không hỏng dữ liệu.
--
-- Ba chỗ kế hoạch mô tả KHÔNG đúng với schema thật trong `server/schema.sql`, nên
-- tệp này làm theo schema thật:
--   1. `usage_monthly` dùng cột `generations` (một cột), không phải
--      `generations_used` / `generations_limit`;
--   2. hạn mức cũ (5 / 100) nằm hard-code trong `consume_generation_quota`, không
--      nằm trong bảng — nên phần credits dưới đây đọc hạn mức từ `server_config`;
--   3. `consume_generation_quota` vẫn được giữ nguyên để gateway cũ không gãy;
--      `consume_credits` là hàm mới song song, sẽ thay thế khi Phase 2 lên.
--
-- Không có bảng nào ở đây cho phép client đọc/ghi: mọi ghi đều qua service_role.

-- ---------------------------------------------------------------------------
-- 001 — profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Trigger tạo profile: idempotent để chạy lại migration không nhân đôi dòng.
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

-- ---------------------------------------------------------------------------
-- 002 — server_config (hạn mức và giá credits nằm ở DB, không hard-code)
-- ---------------------------------------------------------------------------
create table if not exists public.server_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.server_config enable row level security;

insert into public.server_config (key, value, description) values
  ('quota_free_monthly_credits', '50', 'Credits miễn phí mỗi tháng'),
  ('quota_pro_monthly_credits', '500', 'Credits Pro mỗi tháng'),
  ('credit_cost_fast_lesson_analysis', '2', 'Phân tích giáo án nhanh'),
  ('credit_cost_deep_lesson_analysis', '5', 'Phân tích giáo án sâu'),
  ('credit_cost_question_generation', '2', 'Sinh câu hỏi'),
  ('credit_cost_content_assistance', '1', 'Trợ giúp nội dung'),
  ('rate_limit_requests_per_minute', '10', 'Giới hạn số yêu cầu mỗi phút mỗi người')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 003 — ai_usage_log (không lưu nội dung bài học)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  feature text not null,
  model text,
  credit_cost integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ai_usage_log_user_id_idx on public.ai_usage_log (user_id);
create index if not exists ai_usage_log_created_at_idx on public.ai_usage_log (created_at desc);

alter table public.ai_usage_log enable row level security;

drop policy if exists "Users view own usage" on public.ai_usage_log;
create policy "Users view own usage"
  on public.ai_usage_log for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 004 — usage_monthly: thêm cột credits, giữ cột generations cũ
-- ---------------------------------------------------------------------------
alter table public.usage_monthly
  add column if not exists credits_used integer not null default 0,
  add column if not exists credits_limit integer not null default 50;

-- Người đã có gói plus giữ hạn mức 500; còn lại 50.
update public.usage_monthly u
set credits_limit = 500
where exists (
  select 1 from public.subscriptions s
  where s.user_id = u.user_id and s.plan in ('plus', 'pro')
);

-- ---------------------------------------------------------------------------
-- 004b — cost lookup từ server_config
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 004c — consume_credits: trừ credits có khoá dòng và chống trùng
--
-- Trả về jsonb:
--   { success, credits_used, credits_limit, credits_remaining }
--   { success: false, error: 'quota_exceeded', credits_used, credits_limit }
--   { success: true, already_processed: true }
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Ghi chú cho Phase 3 (chưa chạy ở tệp này)
-- ---------------------------------------------------------------------------
-- `cloud_projects` / `cloud_lessons` / `cloud_games` + RLS chỉ được thêm khi có
-- quyết định về đồng bộ đám mây: model dữ liệu phải khớp `.egame` và SQLite cục
-- bộ, và việc đồng bộ phải do giáo viên bật, không tự động.
