-- Sổ các đợt tạm nghỉ của Koa (03/11/2026): đợt đã qua vẫn là ngày nghỉ cho Nhịp 30 ngày, bụi
-- phòng Koa và Tuần của Koa. `koa_pauses` giữ đợt đang có như cũ; bảng này chỉ thêm, không đổi gì.
-- CHƯA DEPLOY: chỉ deploy khi Kiệt duyệt riêng việc này. Trong lúc chờ, app giữ sổ trên máy.
-- Một dòng mỗi đợt, khoá (người, ngày bắt đầu). Không xoá: huỷ ngay hôm đầu thì ghi ends_on là
-- ngày trước starts_on, app bỏ qua dòng ấy khi đọc.

create table if not exists public.koa_pause_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, starts_on),
  constraint koa_pause_log_range check (ends_on >= starts_on - 1 and ends_on - starts_on <= 13)
);

alter table public.koa_pause_log enable row level security;

create policy "koa_pause_log_select_own" on public.koa_pause_log
  for select using (auth.uid() = user_id);
create policy "koa_pause_log_insert_own" on public.koa_pause_log
  for insert with check (auth.uid() = user_id);
create policy "koa_pause_log_update_own" on public.koa_pause_log
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
