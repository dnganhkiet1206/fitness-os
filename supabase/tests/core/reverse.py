#!/usr/bin/env python3
"""Phép thử ngược của bộ lõi (#148): phá từng luật, đòi đúng kịch bản của nó đỏ.

Mọi nhãn M1–M22 có ít nhất một ca, trừ M7 ("B thấy tin nhắn không thuộc hội
thoại của mình"): mọi đột biến làm nó đỏ đều làm M6 — cùng bảng, cùng vai,
hẹp hơn — đỏ trước. M7 giữ lại vì nó bắt cả tin nhắn của một người thứ ba.

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
    m = re.search(r'ERROR:\s+(M\d+[a-z]?)\b', out)
    return m.group(1) if m else None


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
            src = open(os.path.join(tmp, f), encoding='utf-8').read()
            out, err = mutate(src, old, new, nth)
            if err:
                print(f'CA SAI   {name}: {err}'); bad += 1; continue
            open(os.path.join(tmp, f), 'w', encoding='utf-8').write(out)
            r = subprocess.run(['bash', os.path.join(HERE, 'run.sh')], capture_output=True, text=True,
                               env={**os.environ, 'CORE_MIG_DIR': tmp})
            got = first_red(r.stdout + r.stderr)
            if want is None:
                if r.returncode == 0:
                    print(f'đúng     {name} → vẫn xanh')
                else:
                    print(f'ĐỎ SAI   {name}: cần xanh (lớp thứ hai), đỏ {got}'); bad += 1
            elif r.returncode == 0:
                print(f'XANH SAI {name}: cần {want} đỏ, cả bộ vẫn xanh'); bad += 1
            elif got != want:
                print(f'ĐỎ SAI   {name}: cần {want}, đỏ {got or "(không phải ASSERT)"}\n' + (r.stderr[-400:])); bad += 1
            else:
                print(f'đúng     {name} → {want}')
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    print(f'{len(CASES) - bad}/{len(CASES)} ca đúng')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
