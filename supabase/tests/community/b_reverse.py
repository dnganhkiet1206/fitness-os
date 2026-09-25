#!/usr/bin/env python3
"""Phép thử ngược của B (#14), đưa vào repo ở #25.

Một cụm Postgres 16; mỗi ca một DATABASE mới: stub → mọi migration cộng đồng
theo tên tệp (đúng MỘT chỗ bị đột biến) → mọi *.test.sql theo thứ tự như
`run.sh`. Kết luận của một ca là câu ASSERT đỏ ĐẦU TIÊN của bộ đích.

  python3 supabase/tests/community/b_reverse.py [bộ...]
      bộ: foundation progress challenges privacy recipe notifications

Khác `a-suites.reverse.sh` (một cụm MỖI ca, một bộ test, sed), cái này:
  · báo "CA SAI" khi chuỗi cần thay không khớp ĐÚNG một chỗ — một đột biến
    không áp được thì không bao giờ được coi là "xanh";
  · diễn đạt được ca phải-XANH (`green_ok`: còn một lớp bảo vệ dự phòng) và
    phá nhiều chỗ (`extra`, `also`, `nth`);
  · chạy MỌI bộ ở mỗi ca, và báo "vạ lây" khi bộ khác cũng đỏ.

Thiết kế và 88 ca là của B (bình luận ở #25, 88/88 trên `53c9b89`). Khi đưa
vào repo chỉ đổi phần môi trường: đường dẫn tương đối, cổng qua `PG_PORT`,
`pg_ctl -w` thay `sleep` (một máy chậm làm `sleep` hụt và ca đọc ra "HỎNG").
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True  # không để lại __pycache__ trong repo
from b_cases import CASES  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
MIG = os.path.join(ROOT, 'supabase', 'migrations')
TESTS = HERE
BIN = os.environ.get('PG_BIN', '/usr/lib/postgresql/16/bin')
PORT = os.environ.get('PG_PORT', '55491')


def sh(cmd, **kw):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, **kw)


d = tempfile.mkdtemp(prefix='ascnd-rb-', dir='/var/tmp')
os.chmod(d, 0o777)
sh(f'id postgres >/dev/null 2>&1 || useradd -m postgres; chown postgres {d}')
sh(f"su postgres -c '{BIN}/initdb -D {d}/data -A trust -U postgres >/dev/null'")
started = sh(f"su postgres -c \"{BIN}/pg_ctl -w -D {d}/data -o '-p {PORT} -k {d} -c fsync=off' -l {d}/log start >/dev/null\"")
if started.returncode:
    sys.exit(f'không khởi động được Postgres ở cổng {PORT}: {started.stderr.strip()[:200]}')
PSQL = f'psql -h {d} -p {PORT} -U postgres -q -v ON_ERROR_STOP=1'
stub = open(os.path.join(TESTS, 'supabase-stub.sql')).read()
roles = [l for l in stub.splitlines() if l.startswith('CREATE ROLE')]
stub_db = '\n'.join(l for l in stub.splitlines() if not l.startswith('CREATE ROLE'))
sh(f"{PSQL} -d postgres -c \"{' '.join(roles)}\"")
migs = sorted(f for f in os.listdir(MIG) if '_community_' in f and f.endswith('.sql'))
tests = sorted(f for f in os.listdir(TESTS) if f.endswith('.test.sql'))


def run_case(n, mig_key, old, new, nth, extra=(), also=()):
    db = f'r{n}'
    sh(f"{PSQL} -d postgres -c 'DROP DATABASE IF EXISTS {db}' -c 'CREATE DATABASE {db}'")
    P = f'{PSQL} -d {db}'
    r = subprocess.run(f'{P} -f -', shell=True, input=stub_db, capture_output=True, text=True)
    if r.returncode:
        return ('HỎNG', 'stub: ' + r.stderr[:200], {})
    hit = None
    for m in migs:
        src = open(os.path.join(MIG, m)).read()
        for ak, ao, an in also:
            if ak in m:
                if src.count(ao) != 1:
                    return ('CA SAI', f'chuỗi "also" xuất hiện {src.count(ao)} lần trong {m}', {})
                src = src.replace(ao, an)
        # `in`, không phải khớp đúng tên tệp: `community_recipe` khớp cả tệp gốc
        # LẪN `…_community_recipe_no_eaten_at.sql` (định nghĩa lại hàm), và
        # phải phá CẢ HAI — phá riêng bản cũ thì bản mới ghi đè, và ca "xanh"
        # không vì luật (như cách B viết).
        if mig_key and mig_key in m:
            cnt = src.count(old)
            if nth == 'all':
                if cnt < 1:
                    return ('CA SAI', f'không thấy chuỗi cần thay trong {m}', {})
                src = src.replace(old, new)
            else:
                if cnt < (nth or 1):
                    return ('CA SAI', f'chuỗi cần thay xuất hiện {cnt} lần trong {m}, cần lần thứ {nth or 1}', {})
                if nth is None and cnt != 1:
                    return ('CA SAI', f'chuỗi cần thay xuất hiện {cnt} lần trong {m} — phải đúng 1 (hoặc chỉ định lần thứ mấy)', {})
                i = -1
                for _ in range(nth or 1):
                    i = src.index(old, i + 1)
                src = src[:i] + new + src[i + len(old):]
                for o2, n2 in extra:
                    if src.count(o2) != 1:
                        return ('CA SAI', f'chuỗi phụ xuất hiện {src.count(o2)} lần trong {m}', {})
                    src = src.replace(o2, n2)
            hit = m
        r = subprocess.run(f'{P} -f -', shell=True, input=src, capture_output=True, text=True)
        if r.returncode:
            return ('HỎNG', f'migration {m} không áp được sau đột biến: ' + r.stderr.strip()[:200], {})
    if mig_key and not hit:
        return ('CA SAI', f'không có migration nào khớp "{mig_key}"', {})
    outs = {}
    for t in tests:
        r = subprocess.run(f'cd /var/tmp && {P} -f {os.path.join(TESTS, t)}', shell=True, capture_output=True, text=True)
        outs[t] = (r.returncode, r.stdout + r.stderr)
    return ('', '', outs)


def first_fail(out):
    m = re.search(r'ERROR:\s+(.*)', out)
    return m.group(1).strip() if m else ''


want = sys.argv[1:]
rows = []
n = 0
try:
    for c in CASES:
        if want and c['suite'] not in want:
            continue
        n += 1
        status, why, outs = run_case(n, c['mig'], c.get('old', ''), c.get('new', ''), c.get('nth'), c.get('extra', ()), c.get('also', ()))
        if status:
            verdict, detail = status, why
        else:
            tf = next(t for t in tests if t == f"community_{c['suite']}.test.sql")
            code, out = outs[tf]
            err = first_fail(out)
            collateral = [t.replace('community_', '').replace('.test.sql', '') for t in tests if t != tf and outs[t][0]]
            if code == 0 and c.get('green_ok'):
                verdict, detail = 'ĐỎ ĐÚNG', 'xanh ĐÚNG như dự kiến — lớp bảo vệ thứ hai còn đó'
            elif code == 0:
                verdict, detail = 'XANH', 'vẫn xanh khi đã phá — RỖNG NGHĨA'
            elif c['expect'] in err:
                verdict, detail = 'ĐỎ ĐÚNG', err[:140]
            else:
                verdict, detail = 'ĐỎ SAI CHỖ', err[:160]
            if collateral:
                detail += f"  [vạ lây: {', '.join(collateral)}]"
        mark = {'ĐỎ ĐÚNG': '✓', 'XANH': '✗', 'ĐỎ SAI CHỖ': '~'}.get(verdict, '!')
        print(f"{mark} {c['suite']:<13} {c['id']:<6} {verdict:<10} · {c['how']} — {detail}", flush=True)
        rows.append((c, verdict, detail))
finally:
    sh(f"su postgres -c '{BIN}/pg_ctl -D {d}/data stop -m fast >/dev/null'")
    shutil.rmtree(d, ignore_errors=True)

bad = [r for r in rows if r[1] != 'ĐỎ ĐÚNG']
print(f'\n{len(rows) - len(bad)}/{len(rows)} đỏ đúng')
sys.exit(1 if bad else 0)
