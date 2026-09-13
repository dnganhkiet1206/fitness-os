/**
 * Một prop mà THƯ VIỆN gửi qua `runOnJS` thì không được là hàm inline.
 *
 * ── lỗi này đã làm app thoát, hai lần, trên máy thật ──
 *
 * `ReanimatedSwipeable` gọi vài prop của nó qua `runOnJS` từ bên trong một
 * worklet, và cái worklet ấy `useCallback` trên đúng danh tính của những prop
 * đó. Truyền một arrow inline vào một prop như thế nghĩa là: mỗi lần render là
 * một danh tính mới → worklet dựng lại → một `SerializableRemoteFunction` MỚI
 * được dựng và cái cũ bị thả. Một lệnh đã lên lịch còn đang bay lúc ấy sẽ đi
 * tìm một hàm không còn nữa, và Hermes dừng cả tiến trình:
 *
 *     EXC_CRASH / SIGABRT  ·  __assert_rtn
 *       → jsi::Value::getObject
 *       → JSIWorkletsModuleProxy::toOptimizedObject
 *       → JSScheduler::scheduleOnJS
 *
 * Đúng chữ ký ấy có trong HAI báo cáo sự cố từ máy của chủ dự án (05/09 và
 * 12/09), và ở cả hai lần luồng chính đều đang ở trong `-[UIScrollView
 * handlePan:]` — ngón tay đang kéo, tức đúng lúc những callback này bay.
 *
 * ── vì sao bản rà tay ngày 11/09 không bắt được ──
 *
 * Bản rà ấy đi tìm chữ `runOnJS` VIẾT TRONG code app, và rà rất kỹ: mọi đích
 * `runOnJS` trên màn Hôm nay đều có danh tính ổn định. Nhưng ở đây trong code
 * app KHÔNG CÓ chữ `runOnJS` nào cả — nó nằm trong thư viện, còn app chỉ truyền
 * một hàm. Cùng một lỗi, khác chỗ nhìn, nên một lần rà bằng mắt không đủ và
 * đây phải là một bước gác.
 *
 * ── danh sách prop được TRÍCH ra, không gõ tay ──
 *
 * Gõ tay một danh sách prop là hẹn trước một lần lệch: thư viện thêm một prop
 * `runOnJS` nữa ở bản sau thì danh sách gõ tay vẫn xanh. Nên bước này đọc
 * thẳng mã thư viện đang cài, tìm mọi `runOnJS(<tên>)` mà `<tên>` là một prop
 * được tháo ra từ props, rồi mới đi soi code app.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(
  NATIVE,
  'node_modules/react-native-gesture-handler/src/components/ReanimatedSwipeable/ReanimatedSwipeable.tsx',
);

const problems = [];

let libSrc = '';
try {
  libSrc = readFileSync(LIB, 'utf8');
} catch {
  problems.push(
    `không đọc được mã thư viện ở ${path.relative(NATIVE, LIB)} — bước này rút danh sách prop từ đó, ` +
      'nên không đọc được thì không được coi là xanh',
  );
}

/* Mọi tên được truyền vào `runOnJS(...)` trong thư viện. */
const wrapped = new Set([...libSrc.matchAll(/runOnJS\(\s*([A-Za-z_$][\w$]*)\s*\)/g)].map((m) => m[1]));
/* …giữ lại những cái THẬT SỰ là prop, tức có mặt trong khối tháo props. */
const destructured = /const\s*\{([\s\S]*?)\}\s*=\s*props/.exec(libSrc)?.[1] ?? libSrc.slice(0, 4000);
const PROPS = [...wrapped].filter((n) => new RegExp(`(^|[\\s,{])${n}\\s*[,}=]`).test(destructured)).sort();

if (libSrc && PROPS.length === 0) {
  problems.push(
    'đọc được mã thư viện nhưng không rút ra được prop `runOnJS` nào — hình dạng mã đã đổi, ' +
      'và một bước gác không tìm thấy gì để gác thì phải ĐỎ chứ không phải xanh',
  );
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) out.push(...walk(f));
    else if (/\.tsx?$/.test(e)) out.push(f);
  }
  return out;
}

const files = walk(path.join(NATIVE, 'src'));
let checked = 0;

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const name of PROPS) {
    /* `matchAll` thẳng, KHÔNG gọi `exec` trước: `exec` trên regex có cờ `g`
       đẩy `lastIndex`, và `matchAll` đi tiếp từ đó — bản đầu của tệp này làm
       đúng thế và đếm ra 0 chỗ truyền trong khi có 3. Một bước gác đếm 0 rồi
       báo xanh thì tệ hơn không có bước gác. */
    const re = new RegExp(`${name}\\s*=\\s*\\{`, 'g');
    for (const m of src.matchAll(re)) {
      checked += 1;
      /* Phần ngay sau `={`: hàm inline bắt đầu bằng `(` hoặc `function`, còn
         một danh tính ổn định là một tên trần. */
      const after = src.slice(m.index + m[0].length).replace(/^\s*/, '');
      const inline = /^(\(|function\b|async\b)/.test(after);
      if (inline) {
        const line = src.slice(0, m.index).split('\n').length;
        problems.push(
          `${path.relative(NATIVE, f)}:${line} — \`${name}\` nhận một hàm INLINE. Thư viện gửi prop này ` +
            'qua `runOnJS`, nên mỗi render là một hàm từ xa mới và cái cũ bị thả giữa chừng. Đưa nó ra ' +
            '`useCallback` (hoặc ra ngoài component nếu nó không đọc gì) rồi truyền tên vào.',
        );
      }
    }
  }
}

/* Và cái chốt cho chính bước này: app CÓ dùng `ReanimatedSwipeable`, nên nếu
   không soi được chỗ truyền nào thì bộ dò đã hỏng, không phải code đã sạch. */
const usesSwipeable = files.some((f) => readFileSync(f, 'utf8').includes('ReanimatedSwipeable'));
if (usesSwipeable && checked === 0) {
  problems.push(
    'app có dùng `ReanimatedSwipeable` nhưng bước này không soi được MỘT chỗ truyền nào — bộ dò hỏng, ' +
      'không phải code sạch. Bản đầu của tệp này đúng là như vậy: nó gọi `exec` trước `matchAll` trên cùng ' +
      'một regex có cờ `g`, nên `lastIndex` đã bị đẩy và nó đếm ra 0 trong khi có 3',
  );
}

if (problems.length) {
  console.error('đích runOnJS CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  `đích runOnJS OK — ${PROPS.length} prop mà \`ReanimatedSwipeable\` gửi qua \`runOnJS\` (${PROPS.join(', ')}) ` +
    `được TRÍCH ra khỏi mã thư viện đang cài chứ không gõ tay, nên thư viện thêm một prop nữa thì bước này tự ` +
    `gác luôn cái mới; ${checked} chỗ truyền trong ${files.length} tệp src đều truyền một danh tính ổn định, ` +
    'không chỗ nào truyền hàm inline. Đây KHÔNG phải luật phong cách: một arrow inline ở đây dựng lại cái ' +
    'worklet `dispatchImmediateEvents` mỗi lần render, tức một `SerializableRemoteFunction` mới mỗi render và ' +
    'cái cũ bị thả — một lệnh còn đang bay sẽ đi tìm hàm không còn nữa, ra đúng `SIGABRT` trong ' +
    '`JSScheduler::scheduleOnJS` có trong hai báo cáo sự cố từ máy thật (05/09, 12/09), cả hai lần đều bắt ' +
    'được lúc luồng chính đang ở trong `-[UIScrollView handlePan:]`. Bản rà tay 11/09 bỏ lọt vì nó tìm chữ ' +
    '`runOnJS` viết trong code app, mà ở đây chữ ấy nằm trong thư viện',
);
