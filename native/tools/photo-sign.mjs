/**
 * "Ký hỏng không ném" (#53): thư viện ảnh tiến trình vẫn render khi ký URL hỏng.
 *
 * ── hợp đồng ──
 *
 * Xem `src/lib/photo-urls.ts`: `signPhotos(rows, sign)` ký cả loạt qua
 * `createSignedUrls`. Nếu signer ném, reject, trả `error`, hay thiếu một ảnh
 * trong `data` — MỌI ô vẫn có mặt, với chính `photo_url` làm `signedUrl`
 * (ảnh không hiện, nhưng ô và nút xoá còn). Một lần ký hỏng không được làm
 * cả thư viện thành "không đọc được".
 *
 * Gate chạy THẬT `signPhotos` (import trực tiếp file TS qua type-stripping
 * của Node, không copy logic) với bốn signer: ném, trả error, thiếu ảnh,
 * và thành công — assert số ô giữ nguyên và `signedUrl` luôn có mặt.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const { signPhotos, SIGN_CHUNK } = await import(
  pathToFileURL(path.join(NATIVE, 'src/lib/photo-urls.ts')).href
);
if (typeof signPhotos !== 'function') {
  console.error('ký ảnh HỎNG\n  - src/lib/photo-urls.ts: thiếu export signPhotos — gate mù?');
  process.exit(1);
}

const rows = (n) =>
  Array.from({ length: n }, (_, i) => ({ photo_url: `progress/u1/photo-${i}.jpg`, id: i }));
const check = (name, got, want) => {
  if (got.length !== want.length) {
    problems.push(`${name}: trả ${got.length} ô, muốn ${want.length} — thư viện mất ô`);
    return;
  }
  got.forEach((r, i) => {
    if (r.signedUrl !== want[i]) {
      problems.push(`${name}: ô ${i} signedUrl=${JSON.stringify(r.signedUrl)}, muốn ${JSON.stringify(want[i])}`);
    }
  });
};
const raw = (n) => rows(n).map((r) => r.photo_url);

/* 1. signer ném — thư viện vẫn đủ ô, mỗi ô giữ đường dẫn gốc */
check('signer ném', await signPhotos(rows(3), async () => { throw new Error('ký hỏng'); }), raw(3));

/* 2. signer trả error — như trên */
check(
  'signer trả error',
  await signPhotos(rows(3), async () => ({ data: null, error: new Error('403') })),
  raw(3),
);

/* 3. thiếu một ảnh trong data — chỉ ô ấy fallback */
{
  const got = await signPhotos(rows(3), async (paths) => ({
    data: paths.slice(0, 2).map((p) => ({ path: p, signedUrl: `https://signed/${p}` })),
    error: null,
  }));
  check(
    'thiếu một ảnh',
    got,
    rows(3).map((r, i) => (i < 2 ? `https://signed/${r.photo_url}` : r.photo_url)),
  );
}

/* 4. thành công — map đúng từng đường dẫn */
check(
  'ký thành công',
  await signPhotos(rows(3), async (paths) => ({
    data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })),
    error: null,
  })),
  rows(3).map((r) => `https://signed/${r.photo_url}`),
);

/* 5. URL http dùng thẳng, không gửi đi ký */
{
  const seen = [];
  const got = await signPhotos(
    [{ photo_url: 'https://cdn/x.jpg' }, { photo_url: 'progress/u1/a.jpg' }],
    async (paths) => {
      seen.push(...paths);
      return { data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })), error: null };
    },
  );
  if (seen.some((p) => p.startsWith('http'))) problems.push('URL http bị gửi đi ký — phải dùng thẳng');
  if (got[0].signedUrl !== 'https://cdn/x.jpg') problems.push('URL http không được dùng thẳng');
}

/* 6. trùng đường dẫn chỉ ký một lần; quá chunk thì chia loạt */
{
  let calls = 0;
  await signPhotos(
    [...rows(2), ...rows(2)],
    async (paths) => {
      calls++;
      if (new Set(paths).size !== paths.length) problems.push('đường dẫn trùng bị ký hai lần');
      return { data: [], error: null };
    },
  );
  if (calls !== 1) problems.push(`4 ô (2 trùng) gọi signer ${calls} lần, muốn 1`);
  let chunks = 0;
  await signPhotos(rows(SIGN_CHUNK + 1), async () => {
    chunks++;
    return { data: [], error: null };
  });
  if (chunks !== 2) problems.push(`${SIGN_CHUNK + 1} đường dẫn chia ${chunks} loạt, muốn 2`);
}

if (problems.length) {
  console.error(`ký ảnh HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `ký ảnh OK — signPhotos thật qua 6 kịch bản (ném / error / thiếu ảnh / thành công / http thẳng / chunk+trùng): ` +
    `mọi ô luôn có mặt với signedUrl`,
);
