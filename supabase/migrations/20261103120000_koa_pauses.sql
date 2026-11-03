-- Tạm nghỉ của Koa (Koa Ecosystem V2, Kiệt duyệt hướng 02/11/2026).
-- CHƯA DEPLOY: chỉ deploy khi Kiệt duyệt riêng việc này. Trong lúc chờ, app lưu tạm nghỉ trên máy.
-- Mỗi người một khoảng tạm nghỉ đang có (ghi đè), tối đa 14 ngày, chỉ chính chủ đọc / ghi.

create table if not exists public.koa_pauses (
  user_id uuid primary key references auth.users (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  updated_at timestamptz not null default now(),
  constraint koa_pauses_range check (ends_on >= starts_on and ends_on - starts_on <= 13)
);

alter table public.koa_pauses enable row level security;

create policy "koa_pauses_select_own" on public.koa_pauses
  for select using (auth.uid() = user_id);
create policy "koa_pauses_insert_own" on public.koa_pauses
  for insert with check (auth.uid() = user_id);
create policy "koa_pauses_update_own" on public.koa_pauses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "koa_pauses_delete_own" on public.koa_pauses
  for delete using (auth.uid() = user_id);
