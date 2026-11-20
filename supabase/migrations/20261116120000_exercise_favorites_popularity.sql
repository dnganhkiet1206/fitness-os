-- Sao yêu thích bài tập + độ phổ biến bài tập từ số liệu thật (16/11/2026, Kiệt: "làm hai việc còn lại").
-- CHƯA DEPLOY: chỉ deploy khi Kiệt duyệt riêng việc này. Trong lúc chờ, app giữ sao trên máy
-- và dùng danh sách bài phổ biến soạn tay (`ExerciseSearch.popularity`); bảng / hàm chưa có thì
-- app bỏ qua lỗi và đi tiếp. Chỉ thêm, không đổi bảng nào đang có.

-- ── 1. Sao yêu thích ──
-- Một cờ TUYỆT ĐỐI mỗi (người, bài) — như `food_items.is_favorite` và luật #161: app gửi giá trị
-- cần ĐẶT bằng upsert, không bao giờ "đảo", không xoá dòng (bỏ sao là `is_favorite = false`).
-- Bài bị xoá thì dòng đi theo (on delete cascade).
create table if not exists public.exercise_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  is_favorite boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- Khoá ngoại thứ hai cần index riêng (khoá chính chỉ phủ user_id đứng đầu) — xoá một bài
-- không phải quét cả bảng.
create index if not exists exercise_favorites_exercise_id_idx on public.exercise_favorites (exercise_id);

alter table public.exercise_favorites enable row level security;

create policy "exercise_favorites_select_own" on public.exercise_favorites
  for select using (auth.uid() = user_id);
create policy "exercise_favorites_insert_own" on public.exercise_favorites
  for insert with check (auth.uid() = user_id);
create policy "exercise_favorites_update_own" on public.exercise_favorites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Quyền tường minh, không dựa vào quyền mặc định của dự án: đọc / thêm / sửa cờ của chính mình
-- (RLS ở trên), không có xoá.
grant select, insert, update on public.exercise_favorites to authenticated;

-- ── 2. Độ phổ biến ──
-- Số BUỔI và số NGƯỜI đã tập mỗi bài trong 90 ngày, gộp trên mọi người dùng. Khoá bài giống
-- `PersonalRecords.exerciseKey` của app: tên bỏ khoảng trắng hai đầu, gộp khoảng trắng, chữ thường.
-- Riêng tư: chỉ trả số đếm, không trả người; chỉ trả bài có ít nhất 5 người tập (một tên bài tự
-- đặt của một hai người không lộ ra). Set khởi động không tính. Tối đa 300 bài.
-- SECURITY DEFINER vì RLS của `workout_sessions` chỉ cho đọc buổi của chính mình.
create or replace function public.exercise_popularity()
returns table (exercise_key text, sessions bigint, users bigint)
language sql
stable
security definer
set search_path = public
as $$
  with picked as (
    select
      w.id as session_id,
      w.user_id,
      lower(regexp_replace(btrim(e->>'exerciseName'), '\s+', ' ', 'g')) as exercise_key
    from public.workout_sessions w
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(w.sets) = 'array' then w.sets else '[]'::jsonb end
    ) as e
    where w.date_time >= now() - interval '90 days'
      and jsonb_typeof(e) = 'object'
      and coalesce(e->>'warmup', 'false') <> 'true'
      and btrim(coalesce(e->>'exerciseName', '')) <> ''
  )
  select p.exercise_key, count(distinct p.session_id), count(distinct p.user_id)
  from picked p
  group by p.exercise_key
  having count(distinct p.user_id) >= 5
  order by 2 desc, 1
  limit 300
$$;

revoke all on function public.exercise_popularity() from public;
revoke all on function public.exercise_popularity() from anon;
grant execute on function public.exercise_popularity() to authenticated;
