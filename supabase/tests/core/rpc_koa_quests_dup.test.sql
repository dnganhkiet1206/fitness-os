-- KOA-T01 (#527, audit Koa 17/11): nhận thưởng trùng phân biệt được. Tên tệp xếp sau
-- rpc_koa_quests. Một giao dịch rồi ROLLBACK.
\set ON_ERROR_STOP 1
BEGIN;
\set U '''ee000000-0000-4000-8000-00000000000e'''
INSERT INTO auth.users (id) VALUES (:U);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

SELECT pg_temp.who('ee000000-0000-4000-8000-00000000000e'); SET ROLE authenticated;
-- ── D1: lần đầu trả giá, lần hai trả 0 ──
DO $$ DECLARE k text := 'd:' || current_date || ':overload'; a1 int; a2 int; BEGIN
  a1 := public.claim_quest_reward(k, 'thử');
  a2 := public.claim_quest_reward(k, 'thử lần hai');
  ASSERT a1 = 20, format('D1 lần đầu không trả giá 20 (%s)', a1);
  ASSERT a2 = 0, format('D1 lần nhận trùng trả %s, phải là 0', a2);
END $$;
-- ── D3: khoá khám phá trùng cũng trả 0 ──
DO $$ DECLARE a1 int; a2 int; BEGIN
  a1 := public.claim_quest_reward('x:photo', 'thử');
  a2 := public.claim_quest_reward('x:photo', 'thử lần hai');
  ASSERT a1 = 40 AND a2 = 0, format('D3 khám phá: %s rồi %s, phải 40 rồi 0', a1, a2);
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM mascot_transactions WHERE user_id = 'ee000000-0000-4000-8000-00000000000e'
          AND ref_key = 'd:' || current_date || ':overload') = 1, 'D1 nhận trùng ghi thêm dòng sổ xu';
END $$;

-- ── D2: khoá đã có không bị trần ngày từ chối ──
SET ROLE service_role;
INSERT INTO mascot_transactions (user_id, amount, reason, ref_key) VALUES (:U, 790, 'thử', 'seed:e');
RESET ROLE;
SELECT pg_temp.who('ee000000-0000-4000-8000-00000000000e'); SET ROLE authenticated;
DO $$ BEGIN
  ASSERT pg_temp.errcode(format($q$SELECT public.claim_quest_reward(%L, 'thử lại gần trần')$q$, 'd:' || current_date || ':overload')) = 'ok',
    'D2 khoá đã nhận bị trần ngày từ chối';
  ASSERT public.claim_quest_reward('d:' || current_date || ':overload', 'thử') = 0, 'D2 khoá đã nhận gần trần không trả 0';
  -- khoá MỚI vẫn bị trần chặn như cũ
  ASSERT pg_temp.errcode(format($q$SELECT public.claim_quest_reward(%L, 'thử')$q$, 'd:' || current_date || ':water')) <> 'ok',
    'D2 khoá mới vượt trần lại được nhận';
END $$;
RESET ROLE;
ROLLBACK;
