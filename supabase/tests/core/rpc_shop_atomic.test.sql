-- KOA-T18 / T19 (#527, audit Koa 17/11): mua và mặc đồ nguyên khối. Một giao dịch rồi ROLLBACK.
\set ON_ERROR_STOP 1
BEGIN;
\set U '''ef000000-0000-4000-8000-00000000000f'''
\set V '''ef000000-0000-4000-8000-0000000000f2'''
INSERT INTO auth.users (id) VALUES (:U), (:V);
INSERT INTO mascot_transactions (user_id, amount, reason, ref_key) VALUES (:U, 1000, 'thử', 'seed:u');

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.err(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLERRM; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- ── S0: anon không gọi được hai RPC mới ──
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.buy_and_wear_mascot_item(text,text[])', 'EXECUTE'), 'S0 anon mua được';
  ASSERT NOT has_function_privilege('anon', 'public.set_mascot_worn(text,text[])', 'EXECUTE'), 'S0 anon mặc được';
END $$;

SELECT pg_temp.who('ef000000-0000-4000-8000-00000000000f'); SET ROLE authenticated;
-- ── S1: mua lần hai báo 'already owned' rõ ràng (không phải unique_violation thô) ──
DO $$ BEGIN
  ASSERT pg_temp.err($q$SELECT public.buy_mascot_item('head_band')$q$) = 'ok', 'S1 mua lần đầu hỏng';
  ASSERT pg_temp.err($q$SELECT public.buy_mascot_item('head_band')$q$) = 'already owned', 'S1 mua lần hai không báo already owned';
END $$;
RESET ROLE;
-- S1b: đụng ràng buộc duy nhất thật (dòng sổ xu 'buy:' còn, dòng tủ đồ đã mất — như hai lượt
-- mua chạy chồng) → vẫn là 'already owned', không phải unique_violation thô.
DELETE FROM mascot_inventory WHERE user_id = 'ef000000-0000-4000-8000-00000000000f' AND item_key = 'head_band';
SELECT pg_temp.who('ef000000-0000-4000-8000-00000000000f'); SET ROLE authenticated;
DO $$ BEGIN
  ASSERT pg_temp.err($q$SELECT public.buy_mascot_item('head_band')$q$) = 'already owned', 'S1 đụng ràng buộc duy nhất ra lỗi thô';
END $$;
RESET ROLE;
INSERT INTO mascot_inventory (user_id, item_key, equipped) VALUES (:U, 'head_band', true);
SELECT pg_temp.who('ef000000-0000-4000-8000-00000000000f'); SET ROLE authenticated;
-- ── S2: mua + mặc tắt món cùng chỗ trong cùng giao dịch ──
DO $$ BEGIN
  PERFORM public.buy_and_wear_mascot_item('head_cap', ARRAY['head_band', 'head_cap']);
  ASSERT (SELECT count(*) FROM mascot_inventory WHERE user_id = auth.uid() AND item_key LIKE 'head_%' AND equipped) = 1,
    'S2 hai món mũ cùng đang mặc sau khi mua';
  ASSERT (SELECT equipped FROM mascot_inventory WHERE user_id = auth.uid() AND item_key = 'head_cap'), 'S2 món vừa mua không được mặc';
END $$;
-- ── S3: đặt cả nhóm nguyên khối; món không có trong tủ → false ──
DO $$ BEGIN
  ASSERT public.set_mascot_worn('head_band', ARRAY['head_cap']) = true, 'S3 mặc món có trong tủ trả false';
  ASSERT (SELECT equipped FROM mascot_inventory WHERE user_id = auth.uid() AND item_key = 'head_band'), 'S3 không mặc được';
  ASSERT NOT (SELECT equipped FROM mascot_inventory WHERE user_id = auth.uid() AND item_key = 'head_cap'), 'S3 không cởi được món cùng chỗ';
  ASSERT public.set_mascot_worn('head_phones', ARRAY['head_band']) = false, 'S3 món không có trong tủ không trả false';
  ASSERT public.set_mascot_worn(NULL, ARRAY['head_band']) = true, 'S3 cởi hết trả false';
  ASSERT NOT (SELECT equipped FROM mascot_inventory WHERE user_id = auth.uid() AND item_key = 'head_band'), 'S3 cởi hết không cởi';
END $$;
RESET ROLE;
-- ── S4: không chạm tủ của người khác ──
INSERT INTO mascot_inventory (user_id, item_key, equipped) VALUES (:V, 'head_band', true);
SELECT pg_temp.who('ef000000-0000-4000-8000-00000000000f'); SET ROLE authenticated;
DO $$ BEGIN PERFORM public.set_mascot_worn(NULL, ARRAY['head_band']); END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT equipped FROM mascot_inventory WHERE user_id = 'ef000000-0000-4000-8000-0000000000f2' AND item_key = 'head_band'),
    'S4 cởi được đồ của người khác';
END $$;
ROLLBACK;
