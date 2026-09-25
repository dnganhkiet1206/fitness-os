/**
 * Mọi mutation chọn ĐÚNG MỘT đường khi mất mạng (#50).
 *
 * ── vì sao ──
 *
 * React Query mặc định `networkMode: 'online'`: mất mạng thì mutation bị TẠM
 * DỪNG — `mutationFn` không chạy, `onError` không gọi, nút chờ mãi, và dấu lạc
 * quan đứng yên. Đo trên bản web: bấm Thích lúc mất mạng thì "Thích · 128"
 * thành 127 và nằm đó, có mạng lại cũng không gửi (#45); ngôi sao Yêu thích
 * y như thế (#49). #45 và #49 đã chuyển từng chỗ một. Luật này là cái cửa để
 * mutation MỚI không mở lại lớp lỗi ấy — mặc định của thư viện là im lặng, nên
 * không ai viết sai mà thấy được mình viết sai.
 *
 * ── ba đường, và luật đọc từng đường thế nào ──
 *
 *   xếp hàng bền      `useMutation` mang `mutationKey: [...OFFLINE_WRITE_KEY]`
 *                     — `offline-write.ts` giữ nó qua lần khởi động lại và tự
 *                     gửi. `offline-durable.mjs` canh phần còn lại của đường ấy.
 *   chỉ-trực-tuyến    `useOnlineMutation` — từ chối ngay, thành tiếng. Không
 *                     phải `useMutation(` nên luật không cần nhìn thấy nó.
 *   nhánh online      `useMutation` trần, CHỈ khi nó là nửa online của một
 *                     việc xếp hàng: chỗ gọi kiểm `offlineNow()` trước và, lúc
 *                     mất mạng, xếp cùng việc ấy vào hàng. Đổi nó sang
 *                     `useOnlineMutation` thì một request không tới nơi thành
 *                     "không giữ lại để gửi sau" — sai, vì chính chỗ gọi có hàng.
 *
 * Đường thứ ba là NGOẠI LỆ, và một ngoại lệ chỉ được chấp nhận khi lời khai
 * của nó kiểm được. Khuôn khai do B đặt ở #49, ngay trên lời gọi:
 *
 *     Mất mạng (#49): KHÔNG phải `useOnlineMutation`, có chủ đích. Đây là nhánh
 *     ONLINE của một đường xếp hàng: … xếp … (kind `weight`) vào `offline-write.ts`
 *
 * Luật không tin câu chữ; nó kiểm ba điều câu ấy nói:
 *   1. `kind` được khai có trình phát lại (`case 'weight':` trong offline-write.ts);
 *   2. MỌI tệp gọi nhánh ấy (lần theo biến đã bind, kể cả `mutateAsync`) có
 *      một lệnh xếp hàng `mutate({ kind: 'weight', … })` và một phép kiểm
 *      `offlineNow()` — tức đường mất mạng tồn tại ở đúng chỗ gọi;
 *   3. nhánh có người gọi (một ngoại lệ không ai dùng là một lời khai thừa).
 *
 * Nên thêm `useLogWeight()` vào một màn mới mà không có đường xếp hàng thì cổng
 * đỏ — đúng cái lỗi #49 đã sửa ở `food-cards` và `week-plan`, tái phát ở chỗ khác.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Xoá chú thích nhưng giữ NGUYÊN độ dài và số dòng, để chỉ số trong bản đã xoá
   dùng được cho bản gốc (lời khai nằm trong chú thích, lời gọi thì không). */
function stripComments(src) {
  let out = '';
  let i = 0;
  let q = null;
  while (i < src.length) {
    const ch = src[i];
    if (q) {
      out += ch;
      if (ch === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
      if (ch === q) q = null;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; out += ch; i++; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (; i < stop; i++) out += src[i] === '\n' ? '\n' : ' ';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Từ `(` ở `open`, văn bản tới `)` khớp. */
function callText(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

const WRAPPER = 'src/hooks/use-online-mutation.ts';

export function scan(files, replayKinds) {
  const problems = [];
  const code = new Map([...files].map(([f, s]) => [f, stripComments(s)]));
  let queued = 0;
  const branches = []; // { file, name, kind, hook: bool }

  for (const [f, raw] of files) {
    if (f === WRAPPER) continue;
    const src = code.get(f);
    for (const m of src.matchAll(/\buseMutation\s*(?:<[^()]*?>)?\s*\(/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      const where = `${f}:${line}`;
      const body = callText(src, m.index + m[0].length - 1);
      if (/mutationKey:\s*\[\s*\.\.\.OFFLINE_WRITE_KEY\s*\]/.test(body)) {
        queued++;
        continue;
      }
      /* Lời khai: chú thích khối gần nhất KẾT THÚC trước lời gọi, và giữa hai
         thứ chỉ có `return` hoặc `const x =` — không phải một chú thích ở đâu
         đó phía trên trong hàm. */
      const before = raw.slice(0, m.index);
      const close = before.lastIndexOf('*/');
      const gap = close < 0 ? null : before.slice(close + 2);
      const comment = close < 0 ? '' : before.slice(before.lastIndexOf('/*', close), close);
      const adjacent = gap != null && /^\s*(?:return|(?:const|let)\s+\w+\s*=)?\s*$/.test(gap);
      if (!adjacent || !/Mất mạng \(#49\)/.test(comment)) {
        problems.push(
          `${where}: useMutation trần không chọn đường nào khi mất mạng. Mặc định của React Query là TẠM DỪNG: ` +
            'không chạy, không onError, nút chờ mãi. Chọn một: useOnlineMutation (từ chối ngay, thành tiếng), ' +
            'hoặc mutationKey: [...OFFLINE_WRITE_KEY] (xếp hàng bền), hoặc — nếu đây là nửa online của một việc ' +
            'xếp hàng — khai "Mất mạng (#49): … (kind `x`) …" ngay trên lời gọi',
        );
        continue;
      }
      const kind = comment.match(/kind `(\w+)`/)?.[1];
      if (!kind) {
        problems.push(`${where}: lời khai nhánh online không nêu kind \`…\` nó xếp vào hàng — không kiểm được`);
        continue;
      }
      if (!replayKinds.has(kind)) {
        problems.push(
          `${where}: khai là nhánh online của kind \`${kind}\`, mà offline-write.ts không có \`case '${kind}':\` — ` +
            'hàng đợi không có gì để phát lại, tức lúc mất mạng việc này không đi đâu cả',
        );
        continue;
      }
      const bound = src.slice(Math.max(0, m.index - 40), m.index).match(/(?:const|let)\s+(\w+)\s*=\s*$/)?.[1];
      if (bound) branches.push({ file: f, name: bound, kind, hook: false, where });
      else {
        const hook = [...src.slice(0, m.index).matchAll(/export function (use\w+)\s*\(/g)].at(-1)?.[1];
        if (!hook) problems.push(`${where}: không đọc được nhánh online này thuộc hook nào`);
        else branches.push({ file: f, name: hook, kind, hook: true, where });
      }
    }
  }

  /* Mọi chỗ bắn một nhánh online phải có đường xếp hàng CÙNG kind trong tệp. */
  let fired = 0;
  for (const b of branches) {
    const sites = [];
    for (const [f] of files) {
      const src = code.get(f);
      const vars = b.hook
        ? [...src.matchAll(new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*${b.name}\\(`, 'g'))].map((x) => x[1])
        : f === b.file ? [b.name] : [];
      for (const v of vars) {
        if (new RegExp(`\\b${v}\\s*\\.\\s*mutate(?:Async)?\\s*\\(`).test(src)) sites.push(f);
      }
    }
    if (sites.length === 0) {
      problems.push(`${b.where}: nhánh online \`${b.name}\` không có chỗ nào gọi — một ngoại lệ không ai dùng là lời khai thừa; xoá nó hoặc chuyển sang useOnlineMutation`);
      continue;
    }
    for (const f of new Set(sites)) {
      fired++;
      const src = code.get(f);
      const enqueues = new RegExp(`\\.mutate\\(\\s*\\{\\s*kind:\\s*'${b.kind}'`).test(src) && /OFFLINE_WRITE_KEY/.test(src);
      const checks = /\bofflineNow\(\)/.test(src);
      if (!enqueues || !checks) {
        problems.push(
          `${f}: gọi \`${b.name}\` — nhánh ONLINE của kind \`${b.kind}\` — mà tệp này ` +
            (!checks ? 'không kiểm offlineNow()' : `không xếp \`{ kind: '${b.kind}' }\` vào hàng OFFLINE_WRITE_KEY`) +
            '. Lúc mất mạng lời gọi này bị React Query tạm dừng im lặng: kiểm offlineNow() và xếp hàng như ' +
            `những chỗ gọi khác của nó, hoặc dùng một hook useOnlineMutation`,
        );
      }
    }
  }
  return { problems, queued, branches, fired };
}

const files = new Map(
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: NATIVE, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => [f, readFileSync(path.join(NATIVE, f), 'utf8')]),
);
const replayKinds = new Set(
  [...stripComments(files.get('src/lib/offline-write.ts') ?? '').matchAll(/case '(\w+)':/g)].map((m) => m[1]),
);
const { problems, queued, branches, fired } = scan(files, replayKinds);

/* ── thử ngược trên bản sao trong bộ nhớ: mỗi vế phải đỏ khi đúng chỗ nó canh bị gỡ ── */
const edit = (f, fn) => {
  const copy = new Map(files);
  const before = copy.get(f);
  const after = before == null ? null : fn(before);
  if (after == null || after === before) return null;
  copy.set(f, after);
  return copy;
};
const PROBES = [
  ['một useMutation trần mới, không chọn đường nào', () => {
    const copy = new Map(files);
    copy.set('src/app/__probe.tsx', "import { useMutation } from '@tanstack/react-query';\nexport function P() { const m = useMutation({ mutationFn: async () => {} }); return m; }\n");
    return copy;
  }],
  ['gỡ lời khai của useLogWeight', () => edit('src/hooks/use-fitness-data.ts', (s) => {
    const at = s.indexOf('Mất mạng (#49)', s.indexOf('export function useLogWeight('));
    return at < 0 ? s : s.slice(0, at) + 'Mất mạng' + s.slice(at + 'Mất mạng (#49)'.length);
  })],
  ['khai một kind không có trình phát lại', () => edit('src/hooks/use-fitness-data.ts', (s) => s.replace('(kind `weight`)', '(kind `nope`)'))],
  ['một màn mới gọi useLogWeight mà không có đường xếp hàng', () => {
    const copy = new Map(files);
    copy.set('src/app/__probe.tsx', "import { useLogWeight } from '@/hooks/use-fitness-data';\nexport function P() { const w = useLogWeight(); return () => w.mutate(70); }\n");
    return copy;
  }],
  /* Nhắm vào LỆNH xếp hàng, không phải chữ `kind: 'sleep'` đầu tiên trong
     tệp: bản đầu của vế này thay nhầm một chú thích và luật "vẫn xanh". */
  ['bỏ lệnh xếp hàng kind sleep khỏi log-sleep', () => edit('src/app/log-sleep.tsx', (s) => s.replace(/(queue\.mutate\(\{\s*kind: )'sleep'/, "$1'sleepx'"))],
];
for (const [what, make] of PROBES) {
  const copy = make();
  if (!copy) {
    problems.push(`thử ngược "${what}": không tìm thấy chỗ cần gỡ — phép thử đã lỗi thời`);
    continue;
  }
  if (scan(copy, replayKinds).problems.length === 0) problems.push(`thử ngược hỏng: ${what} mà luật vẫn xanh`);
}
if (queued < 5) problems.push(`chỉ thấy ${queued} mutation xếp hàng bền — bộ quét hỏng, đừng tin kết quả`);
if (branches.length === 0) problems.push('không thấy nhánh online nào — bộ quét hỏng, đừng tin kết quả');

if (problems.length) {
  console.log('mutation chưa chọn đường khi mất mạng:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `mất mạng có đường OK — mọi useMutation trong src/ chọn đúng một đường: ${queued} xếp hàng bền (OFFLINE_WRITE_KEY), ` +
    `${branches.length} nhánh online có lời khai kiểm được (${branches.map((b) => `${b.name}→${b.kind}`).join(', ')}), ` +
    `bắn từ ${fired} tệp, tệp nào cũng kiểm offlineNow() và xếp đúng kind ấy vào hàng; mọi việc còn lại là ` +
    'useOnlineMutation. Mặc định của React Query là TẠM DỪNG im lặng (#45: "Thích · 128" thành 127 và nằm đó). ' +
    `Thử ngược trên bản sao: ${PROBES.length} vế (useMutation trần mới, gỡ lời khai, kind không có trình phát lại, ` +
    'màn mới gọi nhánh online không có hàng, tệp gọi bỏ lệnh xếp hàng) — cả năm làm luật đỏ',
);
