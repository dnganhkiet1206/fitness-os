#!/usr/bin/env python3
"""Phép thử ngược của bộ lõi (#148): phá từng luật, đòi đúng kịch bản của nó đỏ.

Mọi nhãn M1–M22 có ít nhất một ca, trừ M7 ("B thấy tin nhắn không thuộc hội
thoại của mình"): mọi đột biến làm nó đỏ đều làm M6 — cùng bảng, cùng vai,
hẹp hơn — đỏ trước. M7 giữ lại vì nó bắt cả tin nhắn của một người thứ ba.

Bộ bảng lõi (owner_rls.test.sql, #132) chạy CÙNG một vòng cho mọi bảng, nên
một ca cho mỗi NHÃN là đủ để chứng minh nhãn ấy biết đỏ; các ca chọn bảng có
policy viết khác nhau (FOR ALL một dòng, FOR ALL nhiều dòng, policy tách lệnh,
storage). Không ca nào nhắm T2 (kiểm chính bảng xếp loại, không kiểm migration)
và O5 (xoá dòng của mình kéo theo dòng của A — cần một trigger mà không
migration nào có; nhãn ở đó để một trigger như thế không lọt).

  python3 supabase/tests/core/reverse.py

Mỗi ca: chép thư mục migration, thay ĐÚNG một chỗ (hoặc chỗ thứ `nth`) trong
một tệp, chạy `run.sh` với `CORE_MIG_DIR` trỏ vào bản chép, và đọc nhãn của
câu ASSERT đỏ ĐẦU TIÊN. Chuỗi cần thay không khớp đúng số chỗ đã nói thì là
"CA SAI" — một đột biến không áp được không bao giờ được tính là xanh.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
MIG = os.path.abspath(os.path.join(HERE, '..', '..', 'migrations'))
AI = '20260212060013_6726b054-a435-4559-9b7d-fd7eec6f8f41.sql'
CM = '20260811120000_coach_memory.sql'
OWN_PARENT = '\n    AND ai_conversations.user_id = auth.uid()'

# (tên, tệp, chuỗi cũ, chuỗi mới, lần xuất hiện thứ mấy (None = phải duy nhất),
#  nhãn phải đỏ — None = cả bộ phải XANH: còn một lớp bảo vệ khác)
CASES = [
    # Điều #148 hỏi thẳng: policy ai_messages quên kiểm chủ của hội thoại cha.
    # Điều #148 hỏi thẳng: policy ai_messages quên kiểm chủ của hội thoại cha.
    # Đo ra là nó VẪN KÍN: truy vấn con `EXISTS (SELECT … FROM ai_conversations
    # WHERE id = conversation_id)` chạy bằng quyền người gọi, nên chính RLS của
    # ai_conversations giấu hội thoại của A khỏi B. Hai ca phải-XANH này giữ cho
    # lớp thứ hai ấy còn đó; bỏ CẢ HAI lớp thì M5 đỏ (ca 'ai_conversations USING mở').
    ('ai_messages USING bỏ vế chủ hội thoại (lớp 2 giữ)', AI, OWN_PARENT, '', 1, None),
    ('ai_messages WITH CHECK bỏ vế chủ hội thoại (lớp 2 giữ)', AI, OWN_PARENT, '', 2, None),
    ('ai_messages USING mở hẳn', AI, '''  USING (EXISTS (
    SELECT 1 FROM public.ai_conversations''', '''  USING (true OR EXISTS (
    SELECT 1 FROM public.ai_conversations''', None, 'M6'),
    ('ai_messages WITH CHECK mở hẳn', AI, '''  WITH CHECK (EXISTS (''', '''  WITH CHECK (true OR EXISTS (''', None, 'M8'),
    ('ai_messages tắt RLS', AI, 'ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;', '', None, 'M6'),
    # Một policy UPDATE mở cho B chuyển tin nhắn của mình sang hội thoại của A
    # trước khi kịp sửa tin của A: M10 là chỗ đầu tiên nói ra.
    ('ai_messages thêm policy UPDATE mở', AI, '-- Create table for custom grocery items',
     'CREATE POLICY mut ON public.ai_messages FOR UPDATE USING (true);\n-- Create table for custom grocery items', None, 'M10'),
    ('ai_messages thêm policy DELETE mở', AI, '-- Create table for custom grocery items',
     'CREATE POLICY mut ON public.ai_messages FOR DELETE USING (true);\n-- Create table for custom grocery items', None, 'M12'),
    ('ai_conversations USING mở', AI, '''ON public.ai_conversations FOR ALL
  USING (auth.uid() = user_id)''', '''ON public.ai_conversations FOR ALL
  USING (true)''', None, 'M5'),
    ('ai_conversations WITH CHECK mở', AI, '''USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create table for AI coach messages''', '''USING (auth.uid() = user_id)
  WITH CHECK (true);

-- Create table for AI coach messages''', None, 'M9'),
    ('ai_conversations thêm policy DELETE mở', AI, '-- Create table for AI coach messages',
     'CREATE POLICY mut ON public.ai_conversations FOR DELETE USING (true);\n-- Create table for AI coach messages', None, 'M13'),
    ('ai_conversations lọt anon', AI, '''ON public.ai_conversations FOR ALL
  USING (auth.uid() = user_id)''', '''ON public.ai_conversations FOR ALL
  USING (auth.uid() = user_id OR auth.role() = 'anon')''', None, 'M20'),
    ('coach_memory SELECT mở', CM, 'FOR SELECT USING (auth.uid() = user_id);', 'FOR SELECT USING (true);', None, 'M4'),
    ('coach_memory DELETE mở', CM, 'FOR DELETE USING (auth.uid() = user_id);', 'FOR DELETE USING (true);', None, 'M14'),
    ('coach_memory bỏ policy DELETE', CM, 'FOR DELETE USING (auth.uid() = user_id);', 'FOR DELETE USING (false);', None, 'M15'),
    ('coach_memory thêm UPDATE mở', CM, '-- deliberately no INSERT or UPDATE policy',
     'CREATE POLICY mut ON public.coach_memory FOR UPDATE USING (true);\n-- deliberately no INSERT or UPDATE policy', None, 'M14'),
    ('coach_memory cho tự chèn', CM, '-- deliberately no INSERT or UPDATE policy',
     'CREATE POLICY mut ON public.coach_memory FOR INSERT WITH CHECK (auth.uid() = user_id);\n-- deliberately no INSERT or UPDATE policy', None, 'M17'),
    ('coach_memory cho tự sửa', CM, '-- deliberately no INSERT or UPDATE policy',
     'CREATE POLICY mut ON public.coach_memory FOR UPDATE USING (auth.uid() = user_id);\n-- deliberately no INSERT or UPDATE policy', None, 'M18'),
    ('ai_messages lọt anon khi chèn', AI, '''  WITH CHECK (EXISTS (''', '''  WITH CHECK (auth.role() = 'anon' OR EXISTS (''', None, 'M22'),
    ('coach_memory lọt anon', CM, 'FOR SELECT USING (auth.uid() = user_id);', "FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'anon');", None, 'M19'),
    ('ai_messages lọt anon khi đọc', AI, '''  USING (EXISTS (''', '''  USING (auth.role() = 'anon' OR EXISTS (''', None, 'M21'),
    # Kịch bản kiểm soát: một policy đóng chặt đến mức chặn luôn chủ thì phải đỏ,
    # nếu không các kịch bản "B không thấy" xanh nhờ một bảng không ai đọc được.
    ('coach_memory SELECT đóng cả chủ', CM, 'FOR SELECT USING (auth.uid() = user_id);', 'FOR SELECT USING (false);', None, 'M1'),
    ('ai_conversations đóng cả chủ', AI, '''ON public.ai_conversations FOR ALL
  USING (auth.uid() = user_id)''', '''ON public.ai_conversations FOR ALL
  USING (false)''', None, 'M2'),
    ('ai_messages đóng cả chủ', AI, '''  USING (EXISTS (''', '''  USING (false AND EXISTS (''', None, 'M3'),
    ('ai_conversations chủ không xoá được', AI, '-- Create table for AI coach messages',
     'CREATE POLICY mut ON public.ai_conversations AS RESTRICTIVE FOR DELETE USING (false);\n-- Create table for AI coach messages', None, 'M16'),
    ('ai_conversations thêm policy UPDATE mở', AI, '-- Create table for AI coach messages',
     'CREATE POLICY mut ON public.ai_conversations FOR UPDATE USING (true);\n-- Create table for AI coach messages', None, 'M11'),
]

# ── bảng lõi (#132): owner_rls.test.sql ──
LORE = '20260212040248_'
WATER = '20260212050120_'
PHOTOS = '20260212045102_'
AWARDS = '20260212052623_'
PLANS = '20260212044110_'
ECON = '20260810120000_economy_server_authority'
REWARD = '20260819120000_reward_amount_authority'
GUIDE = '20260921120000_exercise_guide_content'
MEDIA = '20260923120000_exercise_media.sql'
W_ALL = '''  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);'''
MEI = 'CREATE POLICY "Users can CRUD own meal items" ON public.meal_entry_items FOR ALL \n'
CASES += [
    ('T0 bảng mới chưa xếp loại', WATER, '-- Enable RLS\n', '-- Enable RLS\nCREATE TABLE public.zz_moi (id int);\nALTER TABLE public.zz_moi ENABLE ROW LEVEL SECURITY;\n', None, 'T0'),
    ('T1 water_logs tắt RLS', WATER, 'ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;', '', None, 'T1 water_logs'),
    ('O1 water_logs USING mở', WATER, W_ALL, W_ALL.replace('USING (auth.uid() = user_id)', 'USING (true)'), None, 'O1 water_logs'),
    ('O4 water_logs WITH CHECK mở', WATER, W_ALL, W_ALL.replace('WITH CHECK (auth.uid() = user_id)', 'WITH CHECK (true)'), None, 'O4 water_logs'),
    ('C2 water_logs chặn luôn chủ đọc', WATER, W_ALL, W_ALL.replace('USING (auth.uid() = user_id)', 'USING (false)'), None, 'C2 water_logs'),
    ('N2 water_logs anon chèn được', WATER, W_ALL, W_ALL.replace('WITH CHECK (auth.uid() = user_id)', "WITH CHECK (auth.uid() = user_id OR auth.role() = 'anon')"), None, 'N2 water_logs'),
    ('O4 supplement_intake_logs WITH CHECK mở', LORE, 'ON public.supplement_intake_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
     'ON public.supplement_intake_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (true);', None, 'O4 supplement_intake_logs'),
    ('O2 profiles UPDATE mở', LORE, 'ON public.profiles FOR UPDATE USING (auth.uid() = user_id);', 'ON public.profiles FOR UPDATE USING (true);', None, 'O2 profiles'),
    ('O3 grocery_items thêm DELETE mở', '20260212060013_', '-- Create table for custom grocery items',
     "-- Create table for custom grocery items", None, None),  # thay bằng ca dưới — xem ghi chú
    ('O1 exercises SELECT mở', LORE, 'ON public.exercises FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);', 'ON public.exercises FOR SELECT USING (true);', None, 'O1 exercises'),
    ('X1 exercises bỏ thư viện chung', LORE, 'ON public.exercises FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);', 'ON public.exercises FOR SELECT USING (auth.uid() = user_id);', None, 'X1 exercises'),
    ('X4 exercises tạo được bài chung', LORE, 'ON public.exercises FOR INSERT WITH CHECK (auth.uid() = user_id);', 'ON public.exercises FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);', None, 'X4 exercises'),
    ('X2 food_items sửa được thực phẩm chung', LORE, 'ON public.food_items FOR UPDATE USING (auth.uid() = user_id);', 'ON public.food_items FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);', None, 'X2 food_items'),
    ('X3 food_items xoá được thực phẩm chung', LORE, 'ON public.food_items FOR DELETE USING (auth.uid() = user_id);', 'ON public.food_items FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL);', None, 'X3 food_items'),
    ('N1 exercises anon đọc dòng riêng', LORE, 'ON public.exercises FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);', "ON public.exercises FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id OR auth.role() = 'anon');", None, 'N1 exercises'),
    # Như ai_messages (#148): bỏ vế "cha là của mình" vẫn KÍN, vì truy vấn con vào
    # meal_entries chịu RLS của nó. Mở hẳn thì K1 đỏ.
    ('meal_entry_items bỏ vế chủ cha (lớp 2 giữ)', LORE, 'meal_entries WHERE id = meal_entry_id AND user_id = auth.uid()))\n  WITH', 'meal_entries WHERE id = meal_entry_id))\n  WITH', None, None),
    ('K1 meal_entry_items USING mở', LORE, MEI + '  USING (EXISTS', MEI + '  USING (true OR EXISTS', None, 'K1 meal_entry_items'),
    ('K4 meal_plan_items WITH CHECK mở', PLANS, '  WITH CHECK (EXISTS (SELECT 1 FROM meal_plans', '  WITH CHECK (true OR EXISTS (SELECT 1 FROM meal_plans', None, 'K4 meal_plan_items'),
    ('K2 meal_plan_items thêm UPDATE mở', PLANS, 'CREATE POLICY "Users can CRUD own meal plan items"', 'CREATE POLICY mut ON public.meal_plan_items FOR UPDATE USING (true);\nCREATE POLICY "Users can CRUD own meal plan items"', None, 'K2 meal_plan_items'),
    ('K3 meal_entry_items thêm DELETE mở', LORE, MEI, 'CREATE POLICY mut ON public.meal_entry_items FOR DELETE USING (true);\n' + MEI, None, 'K3 meal_entry_items'),
    ('C5 meal_entry_items chặn luôn chủ chèn', LORE, '  WITH CHECK (EXISTS (SELECT 1 FROM public.meal_entries', '  WITH CHECK (false AND EXISTS (SELECT 1 FROM public.meal_entries', None, 'C5 meal_entry_items'),
    ('C6 meal_entry_items chủ không xoá được', LORE, MEI, 'CREATE POLICY mut ON public.meal_entry_items AS RESTRICTIVE FOR DELETE USING (false);\n' + MEI, None, 'C6 meal_entry_items'),
    ('C1 entitlements tự cấp gói', ECON, '-- deliberately no INSERT/UPDATE/DELETE policy for any user role',
     'CREATE POLICY mut ON public.entitlements FOR INSERT WITH CHECK (auth.uid() = user_id);\n-- deliberately no INSERT/UPDATE/DELETE policy for any user role', None, 'C1 entitlements'),
    ('C3 awards sửa được', AWARDS, 'CREATE POLICY "Users can delete own awards"', 'CREATE POLICY mut ON public.awards FOR UPDATE USING (auth.uid() = user_id);\nCREATE POLICY "Users can delete own awards"', None, 'C3 awards'),
    ('C4 awards chủ không xoá được', AWARDS, 'CREATE POLICY "Users can delete own awards"', 'CREATE POLICY mut ON public.awards AS RESTRICTIVE FOR DELETE USING (false);\nCREATE POLICY "Users can delete own awards"', None, 'C4 awards'),
    # UPDATE mở trên kho linh vật: trigger `mascot_inventory_item_is_fixed` ném lỗi
    # khi B đổi user_id của dòng A — lỗi ấy chính là "với tới" (O2 đòi 'ok').
    ('O2 mascot_inventory UPDATE mở', '20260718120000_mascot_economy', 'FOR UPDATE USING (auth.uid() = user_id);', 'FOR UPDATE USING (true);', None, 'O2 mascot_inventory'),
    ('N3 reward_prices anon đọc được', REWARD, 'FOR SELECT USING (auth.uid() IS NOT NULL);', 'FOR SELECT USING (true);', None, 'N3 reward_prices'),
    ('N3 shop_prices anon đọc được', ECON, 'FOR SELECT TO authenticated USING (true);', 'FOR SELECT TO authenticated, anon USING (true);', None, 'N3 shop_prices'),
    ('X8 shop_prices đóng cả người đăng nhập', ECON, 'FOR SELECT TO authenticated USING (true);', 'FOR SELECT TO authenticated USING (false);', None, 'X8 shop_prices'),
    ('X5 guide bỏ bài chung', GUIDE, '       AND (e.user_id IS NULL OR e.user_id = auth.uid())\n  ));', '       AND (e.user_id = auth.uid())\n  ));', None, 'X5 exercise_guide_content'),
    # Lớp thứ hai lần nữa: bỏ vế "bài của mình" khỏi policy hướng dẫn vẫn KÍN, vì
    # truy vấn con vào `exercises` chịu RLS của exercises. Mở hẳn thì X6 đỏ.
    ('guide bỏ vế chủ bài (lớp 2 giữ)', GUIDE, '       AND (e.user_id IS NULL OR e.user_id = auth.uid())\n  ));', '       AND (e.user_id IS NULL OR e.user_id IS NOT NULL)\n  ));', None, None),
    ('X6 guide USING mở', GUIDE, '  ON public.exercise_guide_content FOR SELECT\n  USING (EXISTS (', '  ON public.exercise_guide_content FOR SELECT\n  USING (true OR EXISTS (', None, 'X6 exercise_guide_content'),
    ('X7 exercise_media ghi được', MEDIA, 'CREATE POLICY "Users can view media for visible exercises"', 'CREATE POLICY mut ON public.exercise_media FOR INSERT WITH CHECK (true);\nCREATE POLICY "Users can view media for visible exercises"', None, 'X7 exercise_media'),
    ('P1 ảnh: SELECT bỏ thư mục', PHOTOS, "  ON storage.objects FOR SELECT\n  USING (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);",
     "  ON storage.objects FOR SELECT\n  USING (bucket_id = 'progress-photos');", None, 'P1'),
    ('P2 ảnh: INSERT bỏ thư mục', PHOTOS, "  ON storage.objects FOR INSERT\n  WITH CHECK (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);",
     "  ON storage.objects FOR INSERT\n  WITH CHECK (bucket_id = 'progress-photos');", None, 'P2'),
    ('P3 ảnh: DELETE bỏ thư mục', PHOTOS, "  ON storage.objects FOR DELETE\n  USING (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);",
     "  ON storage.objects FOR DELETE\n  USING (bucket_id = 'progress-photos');", None, 'P3'),
    ('P4 ảnh: chủ không tải được', PHOTOS, "  ON storage.objects FOR INSERT\n  WITH CHECK (bucket_id = 'progress-photos' AND", "  ON storage.objects FOR INSERT\n  WITH CHECK (bucket_id = 'khac' AND", None, 'P4'),
    ('N4 ảnh: anon đọc được', PHOTOS, "  ON storage.objects FOR SELECT\n  USING (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);",
     "  ON storage.objects FOR SELECT\n  USING (bucket_id = 'progress-photos' AND (auth.role() = 'anon' OR auth.uid()::text = (storage.foldername(name))[1]));", None, 'N4'),
]
CASES = [c for c in CASES if not c[0].startswith('O3 grocery_items thêm DELETE mở')]
CASES += [
    ('O3 grocery_items thêm DELETE mở', '20260212060013_', '-- Triggers for updated_at', 'CREATE POLICY mut ON public.grocery_items FOR DELETE USING (true);\n-- Triggers for updated_at', None, 'O3 grocery_items'),
]


def mutate(src, old, new, nth):
    n = src.count(old)
    if nth is None:
        if n != 1:
            return None, f'chuỗi khớp {n} chỗ, cần đúng 1'
        return src.replace(old, new), None
    if n < nth:
        return None, f'chuỗi khớp {n} chỗ, cần ít nhất {nth}'
    i = -1
    for _ in range(nth):
        i = src.index(old, i + 1)
    return src[:i] + new + src[i + len(old):], None


def first_red(out):
    """Câu lỗi ĐẦU TIÊN của psql — một nhãn ASSERT ('M6 …', 'O1 water_logs: …') hay một lỗi thật."""
    m = re.search(r'ERROR:\s+(.*)', out)
    return m.group(1).strip() if m else None


def is_label(msg, want):
    return msg is not None and re.match(re.escape(want) + r'(?![\w])', msg) is not None


def main():
    # Kiểm soát: không đột biến thì phải xanh, nếu không mọi ca dưới đây vô nghĩa.
    base = subprocess.run(['bash', os.path.join(HERE, 'run.sh')], capture_output=True, text=True)
    if base.returncode != 0:
        print('BỘ GỐC KHÔNG XANH — dừng:\n' + base.stdout[-800:] + base.stderr[-800:])
        return 1
    bad = 0
    for name, f, old, new, nth, want in CASES:
        tmp = tempfile.mkdtemp(prefix='ascnd-core-mig-')
        try:
            for x in os.listdir(MIG):
                shutil.copy(os.path.join(MIG, x), tmp)
            # `f` là một chuỗi con của tên tệp và phải khớp ĐÚNG một tệp.
            hits = [x for x in os.listdir(tmp) if f in x]
            if len(hits) != 1:
                print(f'CA SAI   {name}: "{f}" khớp {len(hits)} tệp migration, cần đúng 1'); bad += 1; continue
            src = open(os.path.join(tmp, hits[0]), encoding='utf-8').read()
            out, err = mutate(src, old, new, nth)
            if err:
                print(f'CA SAI   {name}: {err}'); bad += 1; continue
            open(os.path.join(tmp, hits[0]), 'w', encoding='utf-8').write(out)
            r = subprocess.run(['bash', os.path.join(HERE, 'run.sh')], capture_output=True, text=True,
                               env={**os.environ, 'CORE_MIG_DIR': tmp})
            got = first_red(r.stdout + r.stderr)
            if want is None:
                if r.returncode == 0:
                    print(f'đúng     {name} → vẫn xanh')
                else:
                    print(f'ĐỎ SAI   {name}: cần xanh (lớp thứ hai), đỏ: {got}'); bad += 1
            elif r.returncode == 0:
                print(f'XANH SAI {name}: cần {want} đỏ, cả bộ vẫn xanh'); bad += 1
            elif not is_label(got, want):
                print(f'ĐỎ SAI   {name}: cần {want}, đỏ: {got}'); bad += 1
            else:
                print(f'đúng     {name} → {want}')
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    print(f'{len(CASES) - bad}/{len(CASES)} ca đúng')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
