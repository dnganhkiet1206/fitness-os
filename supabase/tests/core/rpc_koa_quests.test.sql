-- Nhiệm vụ Koa phần 4 (#527, 29/10) — tên tệp xếp SAU rpc_authority để đột biến E2 của
-- reverse.py đỏ ở đúng nhãn E2 trước Q3. Nội dung: khoá khám phá `x:<việc>` một lần trọn đời,
-- ngoài trần ngày; `d:<ngày>:overload` có giá. Một giao dịch rồi ROLLBACK.
\set ON_ERROR_STOP 1
BEGIN;
\set C '''ec000000-0000-4000-8000-00000000000c'''
INSERT INTO auth.users (id) VALUES (:C);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- ── Q1: giá ──
DO $$ BEGIN
  ASSERT public.reward_amount_for('d:' || current_date || ':overload') = 20, 'Q1 tăng tải không có giá 20';
  ASSERT public.reward_amount_for('x:photo') = 40, 'Q1 khám phá ảnh không có giá 40';
  ASSERT public.reward_amount_for('x:') IS NULL, 'Q1 x: rỗng có giá';
  ASSERT public.reward_amount_for('x:photo:2') IS NULL, 'Q1 x: có thêm phần sau vẫn có giá';
  ASSERT public.reward_amount_for('x:tu-dat') IS NULL, 'Q1 việc không có trong bảng giá vẫn có giá';
  ASSERT (SELECT sum(coins) FROM reward_prices WHERE reward_key LIKE 'explore:%') = 195, 'Q1 tổng khám phá khác 195';
END $$;

-- Gần chạm trần ngày: 790 xu hôm nay, từ server.
SET ROLE service_role;
INSERT INTO mascot_transactions (user_id, amount, reason, ref_key) VALUES (:C, 790, 'thử', 'seed:c');
RESET ROLE;

SELECT pg_temp.who('ec000000-0000-4000-8000-00000000000c'); SET ROLE authenticated;
-- ── Q2: khoá ngày thường vẫn bị trần chặn ──
DO $$ BEGIN
  ASSERT pg_temp.errcode(format($q$SELECT public.claim_quest_reward(%L, 'thử')$q$, 'd:' || current_date || ':overload')) <> 'ok',
    'Q2 trần ngày không chặn nhiệm vụ tăng tải';
END $$;
-- ── Q3: khám phá ngoài trần, đúng một lần ──
DO $$ BEGIN
  ASSERT pg_temp.errcode($q$SELECT public.claim_quest_reward('x:photo', 'thử')$q$) = 'ok', 'Q3 khám phá bị trần ngày chặn';
  ASSERT pg_temp.errcode($q$SELECT public.claim_quest_reward('x:photo', 'thử lần hai')$q$) = 'ok', 'Q3 khám phá lần hai báo lỗi';
  ASSERT pg_temp.errcode($q$SELECT public.claim_quest_reward('x:review', 'thử')$q$) = 'ok', 'Q3 khám phá bị trần ngày chặn';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM mascot_transactions WHERE user_id = 'ec000000-0000-4000-8000-00000000000c' AND ref_key = 'x:photo') = 1,
    'Q3 khám phá nhận hai lần';
  ASSERT (SELECT sum(amount) FROM mascot_transactions WHERE user_id = 'ec000000-0000-4000-8000-00000000000c' AND ref_key LIKE 'x:%') = 70,
    'Q3 khám phá không trả đúng giá (40 + 30) khi đã gần trần';
END $$;
-- ── Q4: xu khám phá không ăn vào trần của khoá khác ──
SET ROLE service_role;
DELETE FROM mascot_transactions WHERE user_id = :C AND ref_key = 'seed:c';
INSERT INTO mascot_transactions (user_id, amount, reason, ref_key) VALUES (:C, 770, 'thử', 'seed:c2');
RESET ROLE;
SELECT pg_temp.who('ec000000-0000-4000-8000-00000000000c'); SET ROLE authenticated;
DO $$ BEGIN PERFORM public.claim_quest_reward('d:' || current_date || ':overload', 'thử'); END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM mascot_transactions WHERE user_id = 'ec000000-0000-4000-8000-00000000000c' AND ref_key = 'd:' || current_date || ':overload') = 1,
    'Q4 70 xu khám phá hôm nay bị tính vào trần (770 + 20 ≤ 800 phải nhận được)';
END $$;
\echo 'NHIỆM VỤ KOA (tăng tải, khám phá ngoài trần): Q1–Q4 xanh'
ROLLBACK;
