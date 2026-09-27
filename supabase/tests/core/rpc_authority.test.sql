-- Hàm SECURITY DEFINER lõi (#154): kinh tế xu, đóng băng chuỗi, hạn mức AI.
-- Những hàm này bỏ qua RLS hoàn toàn, nên bộ RLS của #132 không nói gì về
-- chúng. Người dùng riêng; một giao dịch rồi ROLLBACK.
--
-- Quyền của anon hỏi thẳng `has_function_privilege` (bài của R1/C19: so mã lỗi
-- thì một thân hàm tự ném 'not signed in' làm kịch bản xanh dù quyền mở).
-- Supabase cấp EXECUTE cho anon qua default privileges, nên `REVOKE … FROM
-- PUBLIC` của các migration cũ KHÔNG đóng được anon (bài C9 của Cộng đồng).
\set ON_ERROR_STOP 1
BEGIN;
\set A '''ea000000-0000-4000-8000-00000000000a'''
\set B '''eb000000-0000-4000-8000-00000000000b'''
INSERT INTO auth.users (id) VALUES (:A), (:B);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- ── E1: anon không gọi được hàm nào ──
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.ai_gate(text)', 'public.buy_mascot_item(text)', 'public.buy_streak_freeze(uuid)', 'public.buy_streak_freeze()',
    'public.claim_ai_call(text)', 'public.claim_quest_reward(text,text)', 'public.current_tier()',
    'public.earn_mascot_coins(text,integer,text)', 'public.reward_amount_for(text)',
    'public.spend_ai_tokens(text,bigint,boolean)', 'public.use_streak_freeze(date)'] LOOP
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), format('E1 anon gọi được %s', f);
    ASSERT has_function_privilege('authenticated', f, 'EXECUTE'), format('E1b người đã đăng nhập không gọi được %s', f);
  END LOOP;
END $$;

-- Vốn của B: 100 xu từ server (không từ client).
SET ROLE service_role;
INSERT INTO mascot_transactions (user_id, amount, reason, ref_key) VALUES (:B, 100, 'thử', 'seed:b');
RESET ROLE;

SELECT pg_temp.who('eb000000-0000-4000-8000-00000000000b'); SET ROLE authenticated;
-- ── E2–E3: nhận thưởng đúng giá, đúng một lần ──
DO $$ DECLARE k text := 'd:' || current_date || ':meal'; want int := public.reward_amount_for('d:' || current_date || ':meal'); BEGIN
  ASSERT want IS NOT NULL AND want > 0, 'E2 đối chứng: khoá thưởng thử không có giá — kịch bản không đo gì';
  PERFORM public.claim_quest_reward(k, 'thử');
  PERFORM public.claim_quest_reward(k, 'thử lần hai');
END $$;
RESET ROLE;
DO $$ DECLARE k text := 'd:' || current_date || ':meal'; BEGIN
  ASSERT (SELECT count(*) FROM mascot_transactions WHERE user_id = 'eb000000-0000-4000-8000-00000000000b' AND ref_key = k) = 1, 'E3 nhận thưởng hai lần cùng ref_key ra hai dòng sổ';
  ASSERT (SELECT amount FROM mascot_transactions WHERE user_id = 'eb000000-0000-4000-8000-00000000000b' AND ref_key = k) = public.reward_amount_for(k), 'E2 số xu trong sổ khác giá server';
END $$;

SELECT pg_temp.who('eb000000-0000-4000-8000-00000000000b'); SET ROLE authenticated;
-- ── E4: khoá không có giá thì không gì vào sổ ──
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.claim_quest_reward('x:tu-dat', 'gian')$q$) <> 'ok', 'E4 nhận được thưởng cho một khoá không có trong bảng giá'; END $$;
-- ── E5: tham số số tiền cũ bị bỏ qua ──
DO $$ BEGIN
  PERFORM public.earn_mascot_coins('d:' || current_date || ':sleep', 99999, 'gian');
  -- Ngay tại đây, trước khi mua: 99 999 xu giả sẽ cho B mua được mọi thứ và E8
  -- đỏ trước E5 (reverse.py bắt được thứ tự ấy).
  ASSERT (SELECT amount FROM mascot_transactions WHERE ref_key = 'd:' || current_date || ':sleep') = public.reward_amount_for('d:' || current_date || ':sleep'),
    'E5 earn_mascot_coins ghi số tiền client gửi thay vì giá server';
END $$;
-- ── E6–E8: mua đồ ──
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.buy_mascot_item('face_mask')$q$) = 'ok', 'E6 đối chứng: B đủ xu mà không mua được face_mask'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.buy_mascot_item('face_mask')$q$) <> 'ok', 'E7 mua được face_mask lần hai'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.buy_mascot_item((SELECT item_key FROM public.shop_prices ORDER BY price DESC LIMIT 1))$q$) <> 'ok', 'E8 mua được món đắt nhất khi không đủ xu'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.buy_mascot_item('khong-co-mon-nay')$q$) <> 'ok', 'E8b mua được một món không có trong bảng giá'; END $$;
-- ── E10: dùng đóng băng khi không có cái nào ──
DO $$ DECLARE r boolean; BEGIN r := public.use_streak_freeze(current_date - 1); ASSERT r IS NOT TRUE, 'E10 dùng được đóng băng chuỗi khi không có cái nào'; END $$;
RESET ROLE;

DO $$ DECLARE bal int; BEGIN
  ASSERT (SELECT count(*) FROM mascot_inventory WHERE user_id = 'eb000000-0000-4000-8000-00000000000b' AND item_key = 'face_mask') = 1, 'E6 mua xong không có đúng một món trong kho';
  ASSERT (SELECT count(*) FROM mascot_transactions WHERE user_id = 'eb000000-0000-4000-8000-00000000000b' AND ref_key = 'buy:face_mask') = 1, 'E7 bị trừ tiền hai lần cho face_mask';
  SELECT sum(amount) INTO bal FROM mascot_transactions WHERE user_id = 'eb000000-0000-4000-8000-00000000000b';
  ASSERT bal >= 0, format('E8 số dư âm (%s) — mua khi không đủ xu', bal);
  ASSERT NOT EXISTS (SELECT 1 FROM mascot_transactions WHERE ref_key LIKE 'x:%'), 'E4 sổ có dòng cho khoá không có giá';
  -- E9: mọi việc của B không chạm gì của A.
  ASSERT NOT EXISTS (SELECT 1 FROM mascot_transactions WHERE user_id = 'ea000000-0000-4000-8000-00000000000a')
     AND NOT EXISTS (SELECT 1 FROM mascot_inventory WHERE user_id = 'ea000000-0000-4000-8000-00000000000a'), 'E9 việc của B ghi vào sổ hay kho của A';
  ASSERT NOT EXISTS (SELECT 1 FROM streak_freezes WHERE user_id = 'eb000000-0000-4000-8000-00000000000b' AND used_on IS NOT NULL), 'E10 có một đóng băng được đánh dấu đã dùng';
END $$;

\echo 'HÀM SECURITY DEFINER LÕI: E1–E10 xanh'
ROLLBACK;
