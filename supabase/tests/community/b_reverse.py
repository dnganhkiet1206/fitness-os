#!/usr/bin/env python3
"""Phép thử ngược của B (#14), đưa vào repo ở #25.

Một cụm Postgres 16; mỗi ca một DATABASE mới: stub → mọi migration cộng đồng
theo tên tệp (đúng MỘT chỗ bị đột biến) → mọi *.test.sql theo thứ tự như
`run.sh`. Kết luận của một ca là câu ASSERT đỏ ĐẦU TIÊN của bộ đích.

  python3 supabase/tests/community/b_reverse.py [bộ...]
      bộ: foundation progress challenges challenge_history privacy recipe
          notifications search badges
  python3 supabase/tests/community/b_reverse.py [bộ...] --jobs=N
      N ca cùng lúc (mặc định 4), mỗi ca database riêng; kết quả in theo đúng
      thứ tự ca (#136).
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
import concurrent.futures
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading
import time

sys.dont_write_bytecode = True  # không để lại __pycache__ trong repo
from b_cases import CASES  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
MIG = os.path.join(ROOT, 'supabase', 'migrations')
TESTS = HERE
BIN = os.environ.get('PG_BIN', '/usr/lib/postgresql/16/bin')
PORT = os.environ.get('PG_PORT', '55491')
# Tệp ca chung của tìm kiếm (#130), như run.sh.
os.environ.setdefault('SEARCH_CASES', os.path.join(HERE, 'search_cases.json'))


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
    'notify_more': {
        'NM3': 'tự lưu bài mình và người không có hồ sơ còn bị BẢNG chặn (CHECK user_id <> actor_id của #13, '
               'khoá ngoại actor → community_profiles): bỏ chốt trong hàm thì câu lưu bài ra ERROR chứ '
               'không ra thông báo — lỗi lộ ra, không lặng lẽ.',
        'NM9': 'canh hệ quả của NM5–NM7: lượt thử bị chặn thì không có hàng nào để trigger chạy. Không '
               'đột biến nào sinh thông báo từ một câu ghi đã bị từ chối.',
        'NS3': 'canh rằng bộ lọc trả NULL cho THÔNG BÁO chứ không chặn câu lưu bài — nằm ở chỗ trigger '
               'được gắn (BEFORE INSERT trên community_notifications). Mọi đột biến làm câu lưu bài hỏng '
               'đều ra ERROR ở chính câu ghi, trước nhãn này.',
        'NS4': 'RLS UPDATE của community_settings là của 20260930130000 và đã có ca ở community_privacy.',
        'NC5': 'trigger chỉ đọc thành viên của chính NEW.user_id; bỏ điều kiện ấy vẫn chỉ ghi cho '
               'NEW.user_id với tiến độ của chính họ (một buổi / bốn) — không đột biến có nghĩa nào với tới.',
        'NC8': 'được canh bằng ca NC8: bỏ bộ bắt lỗi rồi cho hàm tiến độ ném thì câu ghi buổi tập '
               '(câu trần) ra ERROR "division by zero" ngay — ĐỎ trước khi tới nhãn, đúng chỗ dự đoán.',
        'NC6': 'RLS đọc thông báo là của 20260930140000 và đã có ca ở community_notifications.',
    },
    'challenge_history': {
        'H7': 'tập đầy đủ ĐỨNG CUỐI có chủ đích: mọi phép phá có tên bị một kịch bản cụ thể '
              'bắt trước. Nó là lưới cho thứ chưa ai nghĩ ra — một ca với tới được nó nghĩa là '
              'thiếu một kịch bản cụ thể (như H1b đã thiếu, #79).',
        'H10': _GRANT,
    },
    'search': {'G5': _GRANT},
    'search_shared': {
        'SC0': 'canh BIẾN MÔI TRƯỜNG của bộ chạy (SEARCH_CASES), không canh migration nào — không '
               'đột biến migration nào với tới nó. Thử ngược bằng tay (#130): '
               '`SEARCH_CASES=/khong-co python3 b_reverse.py search_shared` thì mọi ca đỏ ở SC0.',
    },
    'find_recipes': {'F16': _GRANT},
    'comment_replies': {
        'MV3': 'đối chứng "bài công khai vẫn nhắc được". Mọi phép phá làm bài công khai thôi nhắc '
               'đều làm M1 (nhắc trên bài công khai, đứng trước) đỏ trước — đo 02/10: ca MV3 riêng '
               'đỏ ở M1. MV3 ở đó để MV1 không xanh nhờ một hàm không nhắc ai cả.',
    },
    'posting_limits': {
        'PL12': 'hai lớp: bỏ chốt tự khoá thì chốt "không khoá người trong đội" vẫn chặn (ca PL12 green_ok), '
                'và bỏ chốt đội thì PL11 đỏ.',
        'PL13': 'khoá thành công là phần dương của PL7–PL12; mọi phép phá đường khoá bị PL15/PL16 bắt.',
        'PL18': 'migration không chạm bảng thích; không phép phá nào trong nó chặn được lượt thích.',
        'PL20': 'cùng chốt với PL17 (cửa chung cho bài và bình luận): phá chốt ấy thì PL17 đỏ trước.',
        'PL26': 'cùng đường gỡ khoá với PL24/PL25.',
    },
    'discover_kinds': {
        'DK2': 'ghi một lựa chọn hợp lệ: migration chỉ THÊM cột và CHECK — phá CHECK thì DK3/DK4 đỏ, '
               'không phép phá nào trong nó chặn được một UPDATE hợp lệ.',
        'DK5': 'cùng luật với DK2, qua upsert của app.',
        'DK6': 'RLS của community_settings là của 20260930130000_community_privacy, có ca V ở privacy.',
    },
    'useful': {
        'U6': 'cùng luật với U2 (trigger đếm lượt thử): phá trigger ấy (ca U2, U6) thì U2 đỏ trước.',
        'U11': 'cùng đường trừ điểm với U10: phá chiều xoá (ca U10, U11) thì U10 đỏ trước.',
        'U15': 'U15 so trigger với công thức tính lại; phá trọng số trong trigger (ca U3–U5, U15) bị '
               'U3–U7 bắt trước — chính các nhãn ấy đo từng trọng số.',
        'U9': 'cùng luật với U8 (người bình luận đếm một lần): phá vế "còn câu khác" thì U8 đỏ trước.',
        'U12': 'cùng luật với U1 (bỏ qua tác giả), ở chiều xoá: phá vế ấy thì U1 đỏ trước.',
        'U13': 'bài không có policy UPDATE cho client là luật của community_foundation (§7), có ca ở đó; '
               'migration này không thêm gì để phá.',
        'U16': 'lọc 7 ngày nằm trong TRUY VẤN của app (useUsefulThisWeek), không trong migration — '
               'kịch bản live đo nó.',
        'U17': 'ẩn riêng là policy RESTRICTIVE của 20261007220000, có ca RT ở report_trust.',
        'U18': 'tắt tiếng là policy RESTRICTIVE của 20261007220000, có ca RT ở report_trust.',
        'U19': 'không giới thiệu bài của mình là điều kiện trong truy vấn của app; kịch bản live đo nó.',
        'U20': 'ngưỡng 5 nằm trong truy vấn của app; kịch bản live đo nó.',
        'U21': 'thứ tự đọc từ cột điểm; mọi phép phá trọng số bị U3–U7 bắt trước.',
        'U22': 'xoá bài cascade: không phép phá nào trong trigger làm lệnh xoá hỏng mà không làm '
               'U1–U11 đỏ trước (bài đã xoá thì UPDATE không khớp dòng nào).',
    },
    'report_trust': {
        'RT8': 'cùng luật với RT7 (cờ `counted` do trigger đặt): báo cáo luôn vào hàng đợi — '
               'không phép phá nào bỏ được dòng báo cáo mà không làm RT7/RT13 đỏ trước.',
        'RT12': 'cùng luật với RT7 (chỉ phiếu được tính mới đếm), trên dữ liệu trộn 2 + 1; '
                'mọi phép phá vế `counted` bị RT7 bắt trước.',
    },
    'golden_path': {
        'GP1': 'share_workout: foundation 6–9 phá từng trường của payload.',
        'GP2': 'share_workout: foundation 10–14 (set khởi động, set nặng nhất, bài thư viện).',
        'GP3': 'policy đọc bài công khai: foundation 19/30.',
        'GP4': 'share_progress không chỉ số: bộ progress (P-cases).',
        'GP5': 'trigger thông báo lưu / thử: notify_more NM1–NM4.',
        'GP6': 'build_progress_payload cân nặng: progress P2–P5.',
        'GP7': 'chỉ số TẮT không lọt: progress P1/P6.',
        'GP8': 'trigger thông báo thích / bình luận: notifications N2/N5.',
        'GP9': 'bộ đếm: foundation 21–24 và comment_count.',
        'GP10': 'trả lời / nhắc: comment_replies R-, M-cases.',
        'GP13': 'mod_target: admin F11–F13.',
        'GP19': 'bài đã gỡ vẫn ẩn (CHECK removed ⇒ hidden) + RLS cũ: admin G4, foundation 30.',
        'GP22': 'cascade khi xoá bài: foundation 33, notify_more NM9.',
    },
    'admin': {
        'B3': 'hệ quả của B1/B2: lời gọi bị từ chối ném lỗi và cuộn lại giao dịch của nó — '
              'không phép phá nào của migration để lại hàng mà không làm B1/B2 đỏ trước.',
        'R6': 'ba lớp chồng nhau: không cấp quyền (R6b có ca), `moderation_require` từ chối uid '
              'null, rồi `app_role_of(null)` = user bị từ chối như R1 (có ca). Phá một lớp thì '
              'hai lớp kia vẫn trả 42501.',
        'R8': 'lời gọi bị từ chối ném lỗi ở DECLARE (`moderation_require`) trước mọi lệnh ghi; '
              'không có thứ tự nào khác trong thân hàm để đột biến.',
        'A2': 'hai luật cùng trả 22023: không-tự-đổi (A8 có ca, với hai admin) và admin-cuối. '
              'Với MỘT admin, bỏ luật nào thì luật kia vẫn chặn.',
        'M2': 'cùng cửa `moderation_require(true)` với M1, mà M1 lặp qua chính `admin_set_role` trước.',
        'M5': 'hệ quả của M2/M3: vai trò chỉ đổi được qua hai đường ấy, cả hai đều có ca.',
        'F1': 'UNIQUE(reporter_id, post_id) thuộc migration báo cáo cũ, không phải migration này; '
              'ở đây F1 chỉ dựng dữ liệu cho F2/F3.',
        'G5': 'bài đã gỡ vẫn `hidden` (CHECK removed ⇒ hidden) và RLS cũ giấu bài ẩn; mọi phép phá '
              'làm bài gỡ không ẩn đều bị G3/G4 bắt trước.',
        'I8': 'policy đọc `community_art` thuộc migration ảnh (#163); `active = false` đã bị I4/I6/I7 '
              'phủ.',
        'L3': 'xem ca `L3·đua` (green_ok): tuần tự thì luật không-tự-đổi chặn trước; luật admin-cuối '
              'chỉ có tác dụng khi hai admin hạ nhau cùng lúc.',
        'L5': 'hệ quả của L4: vai trò đọc lại ở mỗi lời gọi, nên hàng đã xoá thì quyền mất ngay; '
              'phép phá giữ hàng lại bị L4 bắt.',
        'L11': 'cùng luật với L10 (không khoá ngoại + trigger chỉ-thêm), trên cả bảy tài khoản; '
               'L10 có ca.',
    },
    'find_posts': {'P16': _GRANT},
    'fn_privilege': {
        'FP0': 'đối chứng của chính PHÉP NỐI catalog (pg_depend ↔ pg_policy), không của migration nào: '
               'mọi migration đều có policy gọi auth.uid().',
        'FP3': 'tự kiểm trên một bảng dựng sẵn trong SAVEPOINT: bộ kiểm phải thấy đủ bốn đường sai, '
               'và vai ấy chạy thật phải hỏng 42501 — không migration nào với tới nó.',
    },
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
        # `\ir ../shared/x.sql` (#156): nhãn nằm ở tệp được nhúng.
        for inc in re.findall(r'^\\ir\s+(\S+)', text, re.M):
            text += open(os.path.normpath(os.path.join(TESTS, inc))).read()
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


# ── song song (#136) ──
# Mỗi ca đã có database riêng (`r{n}`), nên các ca độc lập theo thiết kế:
# `--jobs=N` chạy N ca cùng lúc trên CÙNG một cụm. Kết quả vẫn in theo ĐÚNG thứ
# tự ca (`Executor.map` trả theo thứ tự nộp, như `pool()` của live.mjs #102).
#
# Đo (216 ca, máy của phiên này): tuần tự 321 s, --jobs=4 78 s. Cộng dồn qua
# các ca: dựng DB + stub 30 s, migration 139 s, kịch bản 142 s — hai phần sau là
# chi phí thật. Đã thử database mẫu đã nạp stub (`CREATE DATABASE … TEMPLATE`):
# dựng DB 31 s thay vì 30 s, không lợi gì vì stub chỉ vài chục câu — bỏ, để
# không phải giữ một đường thứ hai. Mỗi ca xoá database của nó khi xong.
JOBS = next((int(a.split('=', 1)[1]) for a in sys.argv[1:] if a.startswith('--jobs=')), 4)
TIMES = {'db': 0.0, 'mig': 0.0, 'tests': 0.0}
_times_lock = threading.Lock()


def _took(k, t0):
    with _times_lock:
        TIMES[k] += time.monotonic() - t0


def make_db(db):
    sh(f"{PSQL} -d postgres -c 'DROP DATABASE IF EXISTS {db}' -c 'CREATE DATABASE {db}'")
    r = subprocess.run(f'{PSQL} -d {db} -f -', shell=True, input=stub_db, capture_output=True, text=True)
    return 'stub: ' + r.stderr[:200] if r.returncode else ''


_FN_HEAD = re.compile(r'CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(')


def _fn_owner(src, old):
    """Tên hàm chứa lần xuất hiện đầu của `old` (đã thay) — None nếu nằm ngoài hàm."""
    i = src.find(old)
    heads = [m for m in _FN_HEAD.finditer(src) if m.start() < i] if i >= 0 else []
    if not heads:
        return None
    h = heads[-1]
    end = src.find('$$;', src.find('$$', h.end()) + 2)
    return h.group(1) if end == -1 or i < end else None


def _fn_body(src, name):
    """Toàn văn định nghĩa `CREATE … FUNCTION public.<name>(` … `$$;` trong tệp, hoặc None."""
    m = re.search(r'CREATE (?:OR REPLACE )?FUNCTION public\.' + re.escape(name) + r'\(', src)
    if not m:
        return None
    end = src.find('$$;', src.find('$$', m.end()) + 2)
    return src[m.start():end + 3] if end != -1 else None


def run_case(n, mig_key, old, new, nth, extra=(), also=()):
    db = f'r{n}'
    try:
        return _run_case(db, mig_key, old, new, nth, extra, also)
    finally:
        sh(f"{PSQL} -d postgres -c 'DROP DATABASE IF EXISTS {db}'")


def _run_case(db, mig_key, old, new, nth, extra=(), also=()):
    t0 = time.monotonic()
    err = make_db(db)
    _took('db', t0)
    if err:
        return ('HỎNG', err, {})
    P = f'{PSQL} -d {db}'
    t0 = time.monotonic()
    hit = None
    owner = None
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
        orig = src
        if mig_key and mig_key in m and hit and old and src.count(old) == 0:
            # Tệp sau cùng khoá (`community_challenge` khớp cả `…_challenges_en`)
            # không chứa đoạn cần phá: không có gì để phá ở đây — trước 02/10 đây
            # là "CA SAI" cho 13 ca thử thách. Bản định nghĩa lại (nếu có) đi
            # nhánh dưới.
            body = _fn_body(src, owner) if owner else None
            if body and body.count(old) == 1:
                src = src.replace(body, body.replace(old, new))
        elif mig_key and mig_key in m:
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
            owner = _fn_owner(orig, old)
        elif hit and owner and nth != 'all' and old:
            # Một migration SAU định nghĩa lại CHÍNH hàm chứa đoạn bị phá — chép
            # nguyên văn. Không phá nó thì bản mới đè lên bản đã phá và ca thành
            # rỗng nghĩa (đo 02/10: #172 tạo lại hai hàm thử thách → 14 ca XANH;
            # bản sửa nhắc của #30 → 6 ca XANH). Chỉ trong thân hàm cùng tên:
            # một hàm KHÁC có đoạn giống hệt (thoát LIKE của tìm người và tìm
            # công thức) không được phá theo — đo được SC2 đỏ sai chỗ khi phá rộng.
            body = _fn_body(src, owner)
            if body and body.count(old) == 1:
                src = src.replace(body, body.replace(old, new))
        r = subprocess.run(f'{P} -f -', shell=True, input=src, capture_output=True, text=True)
        if r.returncode:
            return ('HỎNG', f'migration {m} không áp được sau đột biến: ' + r.stderr.strip()[:200], {})
    _took('mig', t0)
    if mig_key and not hit:
        return ('CA SAI', f'không có migration nào khớp "{mig_key}"', {})
    outs = {}
    t0 = time.monotonic()
    for t in tests:
        r = subprocess.run(f'cd /var/tmp && {P} -f {os.path.join(TESTS, t)}', shell=True, capture_output=True, text=True)
        outs[t] = (r.returncode, r.stdout + r.stderr)
    _took('tests', t0)
    return ('', '', outs)


def first_fail(out):
    m = re.search(r'ERROR:\s+(.*)', out)
    return m.group(1).strip() if m else ''


want = [a for a in sys.argv[1:] if not a.startswith('--')]
rows = []
picked = [c for c in CASES if not want or c['suite'] in want]


def judge(n, c):
    status, why, outs = run_case(n, c['mig'], c.get('old', ''), c.get('new', ''), c.get('nth'), c.get('extra', ()), c.get('also', ()))
    if status:
        return status, why
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
    return verdict, detail


t_all = time.monotonic()
try:
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, JOBS)) as ex:
        for c, (verdict, detail) in zip(picked, ex.map(lambda nc: judge(*nc), enumerate(picked, 1))):
            mark = {'ĐỎ ĐÚNG': '✓', 'XANH': '✗', 'ĐỎ SAI CHỖ': '~'}.get(verdict, '!')
            print(f"{mark} {c['suite']:<13} {c['id']:<6} {verdict:<10} · {c['how']} — {detail}", flush=True)
            rows.append((c, verdict, detail))
finally:
    sh(as_pg(f'{BIN}/pg_ctl -D {d}/data stop -m fast >/dev/null'))
    shutil.rmtree(d, ignore_errors=True)

bad = [r for r in rows if r[1] != 'ĐỎ ĐÚNG']
print(f'\n{len(rows) - len(bad)}/{len(rows)} đỏ đúng')
print(f"thời gian: {time.monotonic() - t_all:.0f} s tổng, --jobs={JOBS} · "
      f"cộng dồn qua các ca: dựng DB {TIMES['db']:.0f} s, migration {TIMES['mig']:.0f} s, kịch bản {TIMES['tests']:.0f} s")
sys.exit(1 if bad else 0)
