-- Thanh toán gói Pro — #364. Chạy trong SQL editor của Supabase TRƯỚC khi bật nút "Nâng cấp".
--
-- Nguyên tắc: TIỀN KHÔNG ĐI QUA ỨNG DỤNG. Ứng dụng chỉ mở một đường link thanh toán của
-- nhà cung cấp trong trình duyệt hệ thống; quyền lợi Pro được mở bởi WEBHOOK của nhà cung
-- cấp, xác minh bằng chữ ký, rồi ghi vào `subscriptions`. Vì vậy:
--   * `billing_orders` là SỔ ĐƠN (một dòng cho một lần trả tiền), không phải giỏ hàng;
--   * `provider_ref` là duy nhất, nên webhook gửi lại hai lần không mở Pro hai lần;
--   * không có RLS policy nào cho client: chỉ service_role đọc/ghi (giống `usage_monthly`).
--
-- Tệp này idempotent: chạy lại nhiều lần không hỏng dữ liệu.

-- ---------------------------------------------------------------------------
-- 001 — `subscriptions` biết gói này hết hạn khi nào và do đâu mà có.
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists period_end timestamptz,
  add column if not exists provider text,
  add column if not exists provider_ref text,
  add column if not exists price_vnd integer,
  add column if not exists started_at timestamptz not null default now();

comment on column public.subscriptions.period_end is
  'Gói trả phí còn hiệu lực tới thời điểm này. NULL = gói miễn phí, hoặc gói cũ trước #364.';

-- ---------------------------------------------------------------------------
-- 002 — sổ đơn thanh toán.
--
-- `status` chỉ có bốn trạng thái, và mỗi trạng thái là một câu nói được với giáo viên:
--   pending  — đã tạo đường link, chưa thấy tiền
--   paid     — nhà cung cấp xác nhận đã nhận tiền (đây là trạng thái DUY NHẤT mở Pro)
--   expired  — quá hạn thanh toán (mặc định 15 phút với VietQR)
--   failed   — nhà cung cấp báo huỷ/lỗi
-- ---------------------------------------------------------------------------
create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'plus' check (plan in ('plus')),
  provider text not null,
  provider_ref text not null unique,
  amount_vnd integer not null check (amount_vnd > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed')),
  checkout_url text,
  months integer not null default 1,
  period_days integer not null default 14,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  expires_at timestamptz,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists billing_orders_user_idx on public.billing_orders (user_id, created_at desc);
create index if not exists billing_orders_status_idx on public.billing_orders (status, created_at desc);

alter table public.billing_orders enable row level security;

-- Chính chủ được XEM đơn của mình (để màn hình Tài khoản nói được "đang chờ chuyển khoản"),
-- nhưng không được tạo, sửa, hay đánh dấu đã trả. Việc mở Pro chỉ xảy ra qua service_role.
drop policy if exists "Users view own orders" on public.billing_orders;
create policy "Users view own orders"
  on public.billing_orders for select using (auth.uid() = user_id);

-- Giá và kỳ hạn của gói nằm ở DB như mọi hạn mức khác (#348): đổi giá không cần deploy.
insert into public.server_config (key, value, description) values
  ('plan_pro_price_vnd', '99000', 'Giá gói Pro cho một kỳ 14 ngày, đơn vị VND'),
  ('plan_pro_period_days', '14', 'Độ dài một kỳ trả phí của gói Pro'),
  ('plan_pro_monthly_credits', '500', 'Credits Pro trong một kỳ')
on conflict (key) do nothing;
