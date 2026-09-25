#!/usr/bin/env python3
"""Phép thử ngược của B (#14), đưa vào repo ở #25.

Một cụm Postgres 16; mỗi ca một DATABASE mới: stub → mọi migration cộng đồng
theo tên tệp (đúng MỘT chỗ bị đột biến) → mọi *.test.sql theo thứ tự như
`run.sh`. Kết luận của một ca là câu ASSERT đỏ ĐẦU TIÊN của bộ đích.

  python3 supabase/tests/community/b_reverse.py [bộ...]
      bộ: foundation progress challenges challenge_history privacy recipe
          notifications search badges
  python3 supabase/tests/community/b_reverse.py --coverage
      không chạy Postgres: liệt kê nhãn ASSERT chưa có ca nào nhắm tới (#79),
      và dòng \echo nào nói sai số kịch bản của tệp nó.

Từ #75 đây là bộ chạy thử ngược DUY NHẤT cho các bộ của A: 32 ca của
`a-suites.reverse.sh` (bash, sed, một cụm mỗi ca, một bộ test) đã chuyển vào
`b_cases.py` và tệp bash bị bỏ. Những gì các ca ấy từng bắt được, để lịch sử
không mất cùng tệp:
  · foundation 21, challenges C4/C14 — ghi và kiểm trong CÙNG một câu nối bằng
    AND: Postgres không hứa thứ tự tính, phép đếm chạy trước lệnh ghi.
  · privacy V4 — UPDATE có WHERE đọc cột nên Postgres áp cả policy SELECT.
  · challenges C19/C20, notifications N20 — so MÃ LỖI khi anon gọi, trong khi
    thân hàm tự ném 42501; nay hỏi thẳng `has_function_privilege`.
  · notifications N10 — chỉ đếm sau lượt theo dõi LẠI; nay có N10a.
  · challenges C9 — lỗi của STUB: thiếu default privileges trên hàm mới.
  · challenges R3 (#60) — lỗi của hàm dừng khối DO trước khi ASSERT nói nhãn.
  · challenges C10 (#25) — đỏ SAI chỗ vì C4 không lọc, trên database dùng chung
    với bộ lịch sử; chỉ bộ chạy này thấy, vì nó chạy MỌI bộ ở mỗi ca.
Từ #74 cũng là bộ DUY NHẤT cho Recipe: `recipe.reverse.sh` bị bỏ, 12 trong 13
ca của nó trùng ý với ca R đã có, ca còn lại là R11b. Nó từng bắt được:
  · recipe R1 — so MÃ LỖI 42501 khi anon gọi, trong khi thân hàm tự ném đúng mã
    ấy vì `auth.uid()` là null: cấp quyền cho anon mà R1 vẫn xanh.
  · recipe R16–R18 — gọi trên bữa đã chia sẻ và bữa rỗng, nên lỗi đến từ một
    chốt KHÁC; nay chạy trên bữa kiểm soát 6, và R18b chứng minh bữa ấy đăng được.

So với bộ bash cũ, cái này:
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
import shlex
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


# ── --coverage (#79): kịch bản nào chưa từng bị phá thử? Không cần Postgres. ──
# Nhãn là từ đầu câu ASSERT ('C6 …', 'H3 …', '21 …', '27b …'); một ca "phủ" nhãn
# khi `expect` của nó bắt đầu bằng đúng nhãn ấy, trong đúng bộ ấy.
# Một ca `green_ok` KHÔNG phủ nhãn: nó chứng minh lớp thứ hai, không chứng minh
# kịch bản biết đỏ. Nhãn không thể phá mà vẫn có nghĩa thì ghi ở COVERAGE_OK
# kèm lý do — lý do là thứ người đọc sau cần, không phải lối thoát cho `--coverage`.
_GRANT = ('quyền của người ĐÃ ĐĂNG NHẬP: thu lại thì lời gọi đầu tiên của bộ hỏng vì '
          '"permission denied" trước khi nhãn này kịp nói (đỏ sai chỗ); bỏ riêng dòng GRANT '
          'thì default privileges của stub vẫn cấp. Mọi kịch bản trước nó đã là bằng chứng.')
COVERAGE_OK = {
    'challenge_history': {
        'H7': 'tập đầy đủ ĐỨNG CUỐI có chủ đích: mọi phép phá có tên bị một kịch bản cụ thể '
              'bắt trước. Nó là lưới cho thứ chưa ai nghĩ ra — một ca với tới được nó nghĩa là '
              'thiếu một kịch bản cụ thể (như H1b đã thiếu, #79).',
        'H10': _GRANT,
    },
    'search': {'G5': _GRANT},
    'find_recipes': {'F16': _GRANT},
    'recipe': {
        'R9': 'CÙNG công thức với R8 (servings × serving_g), trên hàng thứ hai — servings '
              'nguyên (2 × 100). Mọi phép phá công thức làm R8 đỏ trước trong cùng khối DO; '
              'một phép chỉ lệch hàng cơm mà không lệch hàng ức gà là phá theo DỮ LIỆU, không '
              'theo luật (#81). R9 là điểm dữ liệu thứ hai của R8, không phải một chốt riêng.',
    },
    'foundation': {
        '35b': 'đối chứng của DỮ LIỆU THỬ, không của một luật: nó đỏ khi chính bộ test xoá bài '
               'công khai cuối cùng trước lượt anon (lỗi #14 của 35), không khi migration sai. '
               'Mọi phép phá migration làm bài mới không công khai đều bị 19/20 bắt trước.',
    },
    'notifications': {
        'N4': 'thích lại đi đúng đường của N2 (trigger) sau N3 (dọn): mọi phép phá làm N4 lệch '
              '— trigger mất, dọn mất — bị N2/N3 bắt trước. Khác N10: thông báo theo dõi đầu '
              'tiên được kiểm là 0 (N10a) nên trigger theo dõi mất chỉ N10 thấy — có ca.',
        'N20b': _GRANT,
        'N21': 'mỗi dòng trong hộp có HAI đường dọn khi xoá tài khoản: khoá ngoại của chính nó, '
               'và cascade của bài/lượt thích/lượt theo dõi kéo trigger rút thông báo. Phá một '
               'đường thì đường kia vẫn dọn — ca `N21·u` (green_ok) ghi lại điều đó.',
    },
}


def labels_of(text):
    # CHỈ trong câu ASSERT: `'3 ngày'` trong một INSERT không phải một nhãn.
    out = set()
    for stmt in re.findall(r'ASSERT[\s\S]*?;', text):
        out |= set(re.findall(r"(?:,|format\()\s*'([A-Z]{0,2}\d+[a-z]?) ", stmt))
    return out


if '--coverage' in sys.argv:
    tests_ = sorted(f for f in os.listdir(TESTS) if f.endswith('.test.sql'))
    missing_total = 0
    for t in tests_:
        suite = t.replace('community_', '').replace('.test.sql', '')
        text = open(os.path.join(TESTS, t)).read()
        have = labels_of(text)
        # Con số ở dòng \echo cuối là thứ run.sh in ra và người đọc tin: bộ Tìm
        # người in "23" suốt từ #37 trong khi chỉ có 22 câu ASSERT (#79).
        said = re.search(r'\\echo .*?(\d+) KỊCH BẢN', text)
        if said and int(said.group(1)) != len(have):
            print(f"{suite:<18} \\echo nói {said.group(1)} kịch bản, tệp có {len(have)} nhãn")
            missing_total += 1
        hit = {c['expect'].split()[0] for c in CASES if c['suite'] == suite and not c.get('green_ok')}
        missing = sorted(have - hit - set(COVERAGE_OK.get(suite, {})), key=lambda x: (len(x), x))
        missing_total += len(missing)
        print(f"{suite:<18} {len(have):>3} nhãn · {len(have & hit):>3} có ca · thiếu: {', '.join(missing) or '—'}")
    print(f"\n{missing_total} nhãn chưa từng bị phá thử")
    sys.exit(1 if missing_total else 0)

# Rẽ theo QUYỀN, như `run.sh` (#78): `initdb` từ chối chạy dưới root, nên root
# thì hạ quyền sang `postgres`; một người dùng thường (runner của CI) chạy thẳng.
AS_ROOT = os.geteuid() == 0


def as_pg(cmd):
    return f'su postgres -c {shlex.quote(cmd)}' if AS_ROOT else cmd


d = tempfile.mkdtemp(prefix='ascnd-rb-', dir='/var/tmp')
os.chmod(d, 0o777)
if AS_ROOT:
    sh(f'id postgres >/dev/null 2>&1 || useradd -m postgres; chown postgres {d}')
sh(as_pg(f'{BIN}/initdb -D {d}/data -A trust -U postgres >/dev/null'))
started = sh(as_pg(f"{BIN}/pg_ctl -w -D {d}/data -o '-p {PORT} -k {d} -c fsync=off' -l {d}/log start >/dev/null"))
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
    sh(as_pg(f'{BIN}/pg_ctl -D {d}/data stop -m fast >/dev/null'))
    shutil.rmtree(d, ignore_errors=True)

bad = [r for r in rows if r[1] != 'ĐỎ ĐÚNG']
print(f'\n{len(rows) - len(bad)}/{len(rows)} đỏ đúng')
sys.exit(1 if bad else 0)
