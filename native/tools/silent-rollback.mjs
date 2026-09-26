/**
 * Bản vá lạc quan được gỡ thì phải NÓI ra (#141, #143).
 *
 * ── lỗi này trông như thế nào ──
 *
 * Tick một thực phẩm bổ sung: ô bật ngay (bản vá lạc quan trong `onMutate`),
 * máy chủ từ chối, `onError` gỡ bản vá — và ô lặng lẽ tắt lại. Không một lời.
 * `use-water.ts` đã ghi đúng điều ấy là lỗi: "the number ticked up, then
 * dropped again on its own, with no explanation and nothing to retry". Kịch
 * bản 500 của #141 bắt nó ở thực phẩm bổ sung; soát cả `src/hooks/` ở #143
 * thấy cùng lỗi ở danh sách đi chợ (thêm, tick, xoá) và mặc đồ cho Koa.
 *
 * ── luật ──
 *
 * Mỗi hook xuất khẩu có một mutation mang `onMutate`, thì:
 *   · hoặc thân hook gọi `toast.fail` (lời báo ở MỘT chỗ, mọi chỗ gọi đều có),
 *   · hoặc MỌI lời gọi `.mutate(…)` / `.mutateAsync(…)` trên nó ở `src/` truyền
 *     `onError` (lời báo riêng từng chỗ — như nước, xem `use-water.ts`).
 * Chỗ gọi được tìm qua biến nhận hook: `const x = useHook(…)` hay
 * `const { a, b } = useHook(…)`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : [],
  );

/** Thân của mọi `export function useX(…) { … }` trong một tệp: `{ name: body }`. */
function hooksOf(src) {
  const out = {};
  for (const m of src.matchAll(/export function (use\w+)\s*\(/g)) {
    const open = src.indexOf('{', src.indexOf(')', m.index));
    let d = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}' && --d === 0) break;
    }
    out[m[1]] = src.slice(open, i + 1);
  }
  return out;
}

/** Lời gọi `.mutate(`/`.mutateAsync(` trên biến `v`, kèm cả phần đối số (cân ngoặc). */
function callsOn(src, v) {
  const out = [];
  for (const m of src.matchAll(new RegExp(`\\b${v}\\.(mutate|mutateAsync)\\(`, 'g'))) {
    let i = m.index + m[0].length;
    let d = 1;
    while (d && i < src.length) {
      if (src[i] === '(') d++;
      else if (src[i] === ')') d--;
      i++;
    }
    out.push({ line: src.slice(0, m.index).split('\n').length, text: src.slice(m.index, i) });
  }
  return out;
}

/** Các khối `useOnlineMutation({…})` / `useMutation({…})` trong thân một hook:
 *  `[{ key, text }]` — `key` là tên biến nhận nó (`const toggle = …`), hoặc
 *  `null` khi hook trả thẳng khối ấy (`return useOnlineMutation(…)`). */
function mutationsOf(body) {
  const out = [];
  for (const m of body.matchAll(/(?:const\s+(\w+)\s*=\s*|return\s+)use(?:Online)?Mutation\(/g)) {
    let i = m.index + m[0].length;
    let d = 1;
    while (d && i < body.length) {
      if (body[i] === '(') d++;
      else if (body[i] === ')') d--;
      i++;
    }
    out.push({ key: m[1] ?? null, text: body.slice(m.index, i) });
  }
  /* Tên biến chỉ là KHOÁ khi hook trả một object có khoá ấy (`return { add,
     toggle, remove }`). Nếu không — `const m = useOnlineMutation(…)` rồi trả một
     lớp bọc quanh `m`, như nước — thì cả hook là mutation ấy. */
  const ret = [...body.matchAll(/return\s*\{([^}]*)\}/g)].map((x) => x[1]).join(',');
  /* Khoá THẬT: `toggle` hay `toggle: …` — không phải `...m` hay `m.mutate`. */
  for (const o of out) if (o.key && !new RegExp(`(?<![.\\w])${o.key}\\s*(?=,|:|$)`, 'm').test(ret)) o.key = null;
  return out;
}

/** `{ out, n, sites }` cho các tệp `[[tên, mã]]`. */
export function problemsOf(files) {
  const out = [];
  let n = 0;
  let sites = 0;
  const silent = [];
  for (const [rel, src] of files) {
    if (!rel.startsWith('src/hooks/')) continue;
    for (const [name, body] of Object.entries(hooksOf(src))) {
      for (const mu of mutationsOf(body)) {
        if (!/\bonMutate\b/.test(mu.text)) continue;
        n++;
        if (!/toast\.fail\(/.test(mu.text)) silent.push({ name, key: mu.key, rel });
      }
    }
  }
  for (const { name, key, rel: hookFile } of silent) {
    let calls = 0;
    for (const [rel, src] of files) {
      for (const m of src.matchAll(new RegExp(`const\\s+(\\{[^}]*\\}|\\w+)\\s*=\\s*${name}\\(`, 'g'))) {
        let vars;
        if (m[1].startsWith('{')) {
          /* `{ toggle, remove: rm }` — lấy biến của đúng khoá bị im lặng. */
          vars = m[1].slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean)
            .filter((x) => key === null || x.split(':')[0].trim() === key)
            .map((x) => x.split(':').pop().trim());
        } else {
          vars = [m[1]];
        }
        for (const v of vars) {
          const acc = key === null || m[1].startsWith('{') ? v : `${v}.${key}`;
          for (const c of callsOn(src, acc.replace('.', '\\.'))) {
            calls++;
            sites++;
            if (!/\bonError\b/.test(c.text)) {
              out.push(`${rel}:${c.line}: \`${acc}.mutate(…)\` của ${name}${key ? `.${key}` : ''} (${hookFile}) không có onError, và mutation không tự báo — bản vá lạc quan bị gỡ trong im lặng (#143)`);
            }
          }
        }
      }
    }
    if (calls === 0) out.push(`${hookFile}: ${name}${key ? `.${key}` : ''} có onMutate mà không tự báo lỗi, và không tìm thấy chỗ gọi nào để kiểm — bộ đọc hỏng, hoặc mutation đã chết`);
  }
  return { out, n, sites };
}

const files = walk(path.join(NATIVE, 'src')).map((p) => [path.relative(NATIVE, p), readFileSync(p, 'utf8')]);
const { out: problems, n, sites } = problemsOf(files);
if (n < 15) problems.push(`chỉ thấy ${n} mutation lạc quan — bộ đọc hỏng, đừng tin kết quả`);

/* ── thử ngược ── */
{
  const base = problems.length;
  const flip = (file, from, to, label) => {
    const i = files.findIndex(([f]) => f === file);
    if (i < 0 || !files[i][1].includes(from)) return problems.push(`thử ngược hỏng: "${label}" không áp được`);
    const copy = files.slice();
    copy[i] = [file, copy[i][1].replace(from, to)];
    if (problemsOf(copy).out.length <= base) problems.push(`thử ngược hỏng: ${label} mà luật vẫn xanh`);
  };
  flip('src/hooks/use-library.ts', '      toast.fail(e);\n    },', '    },', 'bỏ toast.fail khỏi useToggleSupplement (#141)');
  flip('src/hooks/use-extras.ts', '      toast.fail(e);\n    },', '    },', 'bỏ toast.fail khỏi tick món đi chợ (#143)');
  flip('src/app/water.tsx', 'onError: (e: Error) => toast.fail(e)', 'onSettled: () => {}', 'bỏ onError ở một chỗ gọi nước (lời báo từng chỗ)');
}

if (problems.length) {
  console.log('bản vá lạc quan gỡ trong im lặng:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `gỡ vá có lời OK — ${n} mutation lạc quan (có onMutate) trong src/hooks/: mutation tự gọi toast.fail, hoặc mọi chỗ gọi ` +
    `truyền onError (${sites} lời gọi đã soát). Thử ngược: bỏ toast.fail ở thực phẩm bổ sung, ở tick món đi chợ, và bỏ ` +
    'onError ở một chỗ gọi nước — mỗi cái đỏ',
);
