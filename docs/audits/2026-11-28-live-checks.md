# Kiểm production chỉ đọc — 2026-11-28 (Master Audit P0-04, phần làm được bằng CLI)

Agent 3D, máy Mac của Kiệt, `supabase` CLI v2.115.0 đã đăng nhập, project `guqmbqtgxqleuwajvwvg`.
Chỉ `SELECT`, `supabase functions list`, `supabase backups list`, `supabase secrets list`
(chỉ ghi **tên** secret; CLI trả digest, không phải giá trị). Không ghi gì lên server.
Truy vấn: `supabase db query --linked -f <file>` — nội dung file ở cuối trang.

Đối chiếu với `docs/audits/master-audit-2026-11-28/04-supabase-production-audit.md` §10
(nhánh `agent/c/master-audit-2026-11-28`).

## Kết quả

| Mục §10 | Kết quả 28/11 | Ảnh hưởng tới báo cáo |
|---|---|---|
| 1. Backups/PITR | `walg_enabled: true`, **`pitr_enabled: false`, `backups: []`** (region us-east-1) | AUD-01 / P0-01 **vẫn đúng**: không có bản sao lưu khôi phục được; câu "backup giữ tới 30 ngày" trong `legal-content.json` vẫn không có bằng chứng. Việc của Kiệt (nâng gói / bật PITR, hoặc sửa câu chữ). |
| 2. Migration đã áp | **101/101**, trên cùng là `20261124120000` (dedupe, áp 24/11 có Kiệt duyệt), rồi `20261120130100`, `…130000`, `20261120120000`, `20261119120000`, `20261117170000`, `20261117070000`, `20261116120000`, `20261112150000`, `…140000`, `…130100`, `…130000`, `…120000` | AUD-12 / W3-DB-03 **đóng**: schema production khớp repo. P1-06 **đóng** (đã áp). |
| 3. W3-01 `community_my_reports` | thân hàm có `community_report_target_readable` → **bản đã vá (17170000) đang chạy** | W3-01 live **đóng**. |
| 4. Freeze REVOKE (B-2) | `has_function_privilege('authenticated', buy_streak_freeze(uuid)/()) = false/false` | AUD-14 live **đóng**. |
| 5. Quyền schema / hàm trigger | `CREATE` trên `public`: anon **false**, authenticated **false**. `update_updated_at_column` anon EXECUTE = **true** | AUD-43 không khai thác được (không ai tạo được đối tượng trong `public`). AUD-41 **đúng** nhưng chỉ là hàm trigger (PostgREST không gọi được hàm trả `trigger`) — để mức INFO. |
| 6. Edge Functions | 9 hàm ACTIVE: `ai-coach` v30 (20/11), `ai-smart-nudges` v14, `ai-weekly-review` v13, `ai-meal-suggest` v11 (20/11), `ai-coach-memory` v11, `ai-log-parse` v5, `scan-food` v10 (28/10), `body-check` v1 (05/11), `delete-account` v1 (17/10). **Không có** `verify-purchase`, `store-webhook`, `admin-art`. | P0-02 **đúng**. Thêm: mọi sửa của #1015–#1022 (28/11) **chưa** chạy trên server; `delete-account` đang là bản 17/10 (trước cả thu hồi Apple). |
| 6b. Secret (chỉ tên) | `ASCND_AI_KEY`, `ASCND_AI_MODEL`, `ASCND_AI_REASONING_EFFORT`, `ASCND_AI_URL`, `ASCND_AI_VISION_MODEL` + các `SUPABASE_*` mặc định. **Không có** `APPLE_*`, `APPLE_SIGNIN_*`, `PRODUCT_ID_PLUS/MAX`. | P0-02 **đúng**: đường mua chưa thể chạy. |
| 7. Dedupe index | 0/14 tên bị bỏ còn tồn tại | AUD-16 live **đóng**. |
| 9. Storage | `progress-photos` private 5 MiB, `exercise-media` public 5 MiB, `community-art` public 1 MiB; 3 policy trên `storage.objects` (chỉ `progress-photos`) | Khớp §7. |
| 10. Realtime | publication `supabase_realtime` rỗng | Không bảng nào phát realtime. |
| 12. Dữ liệu | `ai_credits` 0 hàng; `weekly_reviews`/`habit_nudges`/`scan_history`/`wearable_sources` 0 hàng; `auth.users` 3 | AUD-23 đúng (không có top-up tay). Khớp "0 người dùng thật". |

PostgreSQL 17.6.

## Chưa kiểm được ở đây (vẫn là việc của Kiệt)

Mục 8 (Auth providers / Redirect URLs), mục 10 (gói, pooler, row cap, project staging),
mục 11 (Sentry / PostHog / dSYM), restore drill của mục 1.

## Truy vấn

```sql
-- P0-04 read-only checks (Report 4 §10). SELECT only.
select 'migrations_top' as k, json_agg(v order by v desc)::text as v from (select version as v from supabase_migrations.schema_migrations order by version desc limit 15) s
union all
select 'migrations_count', count(*)::text from supabase_migrations.schema_migrations
union all
select 'my_reports_has_guard', (position('community_report_target_readable' in pg_get_functiondef('public.community_my_reports()'::regprocedure)) > 0)::text
union all
select 'freeze_priv_uuid', has_function_privilege('authenticated','public.buy_streak_freeze(uuid)','execute')::text
union all
select 'freeze_priv_noarg', coalesce((select has_function_privilege('authenticated', p.oid, 'execute')::text from pg_proc p where p.proname='buy_streak_freeze' and p.pronargs=0 limit 1), 'absent')
union all
select 'schema_create_anon', has_schema_privilege('anon','public','CREATE')::text
union all
select 'schema_create_authenticated', has_schema_privilege('authenticated','public','CREATE')::text
union all
select 'trigger_fn_exec_anon_update_updated_at', coalesce((select has_function_privilege('anon', p.oid, 'execute')::text from pg_proc p where p.proname='update_updated_at_column' limit 1),'absent')
union all
select 'dup_index_names_present', count(*)::text from pg_indexes where schemaname='public' and indexname in ('daily_logs_user_date_unique','idx_daily_logs_user_date','weekly_reviews_user_week_unique','idx_weight_logs_user_date','awards_user_key_unique','idx_body_measurements_user_date','idx_exercise_media_exercise','idx_meal_entries_user_date','idx_workout_sessions_user_date','idx_sleep_logs_user_date','idx_biometric_samples_user_date','idx_supplement_intake_user_date','idx_scan_history_user_date','community_posts_author_idx')
union all
select 'storage_buckets', json_agg(json_build_object('id',id,'public',public,'limit',file_size_limit))::text from storage.buckets
union all
select 'storage_policies', json_agg(policyname)::text from pg_policies where schemaname='storage'
union all
select 'ai_credits', (select json_build_object('rows',count(*),'sum',sum(tokens_remaining))::text from ai_credits)
union all
select 'row_counts', json_build_object('weekly_reviews',(select count(*) from weekly_reviews),'habit_nudges',(select count(*) from habit_nudges),'scan_history',(select count(*) from scan_history),'wearable_sources',(select count(*) from wearable_sources),'users',(select count(*) from auth.users))::text
union all
select 'publication_tables', coalesce((select json_agg(schemaname||'.'||tablename)::text from pg_publication_tables where pubname='supabase_realtime'),'[]')
union all
select 'pg_version', version();
```
