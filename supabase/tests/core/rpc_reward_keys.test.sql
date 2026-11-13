-- Hình dạng khoá thưởng (round 3, AUD-02 / R3-SEC-01): `w:` đã bỏ; `ch:` chỉ nhận đúng ba thử
-- thách của tuần (công thức `WeeklyChallenges.pick`) hoặc `koa_week`, đúng hạng cố định, thứ Hai
-- của một tuần gần đây. Một giao dịch rồi ROLLBACK.
\set ON_ERROR_STOP 1
BEGIN;
\set K '''ed000000-0000-4000-8000-00000000000d'''
INSERT INTO auth.users (id) VALUES (:K);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
-- Thứ Hai của tuần này (UTC) và ba thử thách của tuần ấy theo công thức của app.
CREATE OR REPLACE FUNCTION pg_temp.monday(back int DEFAULT 0) RETURNS date LANGUAGE sql AS $$
  SELECT ((now() AT TIME ZONE 'UTC')::date - (extract(isodow FROM (now() AT TIME ZONE 'UTC')::date)::int - 1) - 7 * back) $$;
CREATE OR REPLACE FUNCTION pg_temp.picked(d date, i int) RETURNS text LANGUAGE sql AS $$
  SELECT (ARRAY['workouts_5','workouts_3','protein_7','steps_50k','sleep_7','log_7','calories_5','water_7'])
         [((to_char(d, 'YYYYMMDD')::bigint % 8)::int + i) % 8 + 1] $$;
CREATE OR REPLACE FUNCTION pg_temp.tier(k text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE k WHEN 'workouts_3' THEN 'bronze' WHEN 'protein_7' THEN 'gold' WHEN 'log_7' THEN 'gold' ELSE 'silver' END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- ── K1: `w:` đã bỏ — mọi đuôi đều không có giá ──
DO $$ BEGIN
  ASSERT public.reward_amount_for('w:2026-W45') IS NULL, 'K1 w: tuần vẫn có giá';
  ASSERT public.reward_amount_for('w:a') IS NULL, 'K1 w: đuôi tự do vẫn có giá';
END $$;

-- ── K2: `ch:` đúng tuần, đúng khoá, đúng hạng → có giá ──
DO $$ DECLARE m date := pg_temp.monday(); k text; BEGIN
  FOR i IN 0..2 LOOP
    k := pg_temp.picked(m, i);
    ASSERT public.reward_amount_for(format('ch:%s:%s:%s', pg_temp.tier(k), m, k))
         = (SELECT coins FROM reward_prices WHERE reward_key = 'challenge:' || pg_temp.tier(k)),
      format('K2 thử thách %s của tuần không có đúng giá hạng %s', k, pg_temp.tier(k));
  END LOOP;
  ASSERT public.reward_amount_for(format('ch:silver:%s:koa_week', m)) = 50, 'K2 tuần của Koa không có giá bạc';
  ASSERT public.reward_amount_for(format('ch:silver:%s:koa_week', pg_temp.monday(1))) = 50, 'K2 tuần trước của Koa không nhận được';
END $$;

-- ── K3: client tự nâng hạng, tự đặt khoá, tự đặt ngày → không có giá ──
DO $$ DECLARE m date := pg_temp.monday(); k text := pg_temp.picked(pg_temp.monday(), 0); off text; BEGIN
  ASSERT public.reward_amount_for(format('ch:platinum:%s:%s', m, k)) IS NULL, 'K3 nâng hạng lên bạch kim vẫn có giá';
  ASSERT public.reward_amount_for(format('ch:gold:%s:koa_week', m)) IS NULL, 'K3 tuần của Koa hạng vàng vẫn có giá';
  ASSERT public.reward_amount_for(format('ch:%s:%s:%s-2', pg_temp.tier(k), m, k)) IS NULL, 'K3 đổi đuôi khoá vẫn có giá';
  -- thử thách KHÔNG thuộc tuần này
  SELECT p INTO off FROM unnest(ARRAY['workouts_5','workouts_3','protein_7','steps_50k','sleep_7','log_7','calories_5','water_7']) p
   WHERE p NOT IN (pg_temp.picked(m, 0), pg_temp.picked(m, 1), pg_temp.picked(m, 2)) LIMIT 1;
  ASSERT public.reward_amount_for(format('ch:%s:%s:%s', pg_temp.tier(off), m, off)) IS NULL, 'K3 thử thách của tuần khác vẫn có giá';
  ASSERT public.reward_amount_for(format('ch:silver:%s:koa_week', m + 1)) IS NULL, 'K3 ngày không phải thứ Hai vẫn có giá';
  ASSERT public.reward_amount_for(format('ch:silver:%s:koa_week', pg_temp.monday(3))) IS NULL, 'K3 tuần quá cũ vẫn có giá';
  ASSERT public.reward_amount_for(format('ch:silver:%s:koa_week', pg_temp.monday(-1))) IS NULL, 'K3 tuần tương lai vẫn có giá';
  ASSERT public.reward_amount_for('ch:silver:2026-13-40:koa_week') IS NULL, 'K3 ngày hỏng vẫn có giá';
  ASSERT public.reward_amount_for('ch:silver:koa_week') IS NULL, 'K3 thiếu phần vẫn có giá';
END $$;

-- ── K4: qua `claim_quest_reward` thật — khoá sai bị từ chối, khoá đúng nhận đúng một lần ──
SELECT pg_temp.who('ed000000-0000-4000-8000-00000000000d'); SET ROLE authenticated;
DO $$ DECLARE m date := pg_temp.monday(); BEGIN
  ASSERT pg_temp.errcode($q$SELECT public.claim_quest_reward('w:x1', 'gian')$q$) <> 'ok', 'K4 w: vẫn nhận được';
  ASSERT pg_temp.errcode(format($q$SELECT public.claim_quest_reward(%L, 'gian')$q$, format('ch:platinum:%s:koa_week', m))) <> 'ok',
    'K4 nâng hạng vẫn nhận được';
  ASSERT pg_temp.errcode(format($q$SELECT public.claim_quest_reward(%L, 'thật')$q$, format('ch:silver:%s:koa_week', m))) = 'ok',
    'K4 tuần của Koa đúng luật bị từ chối';
  ASSERT pg_temp.errcode(format($q$SELECT public.claim_quest_reward(%L, 'lần hai')$q$, format('ch:silver:%s:koa_week', m))) = 'ok',
    'K4 nhận lần hai phải êm (không cộng thêm)';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM mascot_transactions WHERE user_id = 'ed000000-0000-4000-8000-00000000000d') = 1,
    'K4 số dòng thưởng khác 1 (khoá sai lọt, hay khoá đúng nhận hai lần)';
  ASSERT (SELECT sum(amount) FROM mascot_transactions WHERE user_id = 'ed000000-0000-4000-8000-00000000000d') = 50,
    'K4 tổng xu khác 50';
END $$;

\echo 'KHOÁ THƯỞNG (w: bỏ, ch: theo tuần / khoá / hạng): K1–K4 xanh'
ROLLBACK;
