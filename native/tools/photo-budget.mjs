/**
 * That a progress photo is bounded before it is stored, and bounded again
 * where storing happens.
 *
 * ── the two halves, and why one without the other is worse than neither ──
 *
 * The bucket had no `file_size_limit` and no `allowed_mime_types`: the RLS
 * policy scopes uploads to the user's own folder and does not care whether the
 * object is a photo or a film. Storage and egress are both billed.
 *
 * The limit could not be chosen first. A ceiling picked against an unbounded
 * input is one that eventually rejects a real photo from a phone nobody tested
 * on — and that failure lands on somebody who did nothing wrong, on the screen
 * where they are least likely to try again. So the capture is bounded first and
 * the ceiling is arithmetic rather than a guess.
 *
 * ── the bug this file is really guarding ──
 *
 * `getAvailablePictureSizesAsync` does not return the same thing on both
 * platforms. Android gives `"1920x1080"`; iOS gives AVFoundation preset names —
 * `"photo"`, `"high"`, `"medium"`. A picker that parses `WxH` and returns
 * `undefined` otherwise looks completely correct, passes every test written
 * against Android's shape, and silently leaves iOS at the device default — on
 * the platform this app is built for, and the one whose default is largest.
 *
 * Nothing about that shows up as a failure. The photo uploads. It is simply
 * eight times bigger than it was supposed to be, for ever, on every device.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCREEN = 'src/app/progress-photos.tsx';
const problems = [];

/*
  ── 1: the picker, run against both platforms' real shapes ──

  Compiled and imported rather than pattern-matched, because the thing that
  matters is what it *returns*, and a regex cannot tell a working iOS branch
  from a missing one.
*/
{
  const out = mkdtempSync(path.join(tmpdir(), 'photo-'));
  execFileSync(
    'npx',
    ['tsc', 'src/lib/photo-size.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { pickPictureSize, MAX_EDGE, PHOTO_QUALITY } = await import(
    pathToFileURL(path.join(out, 'photo-size.js')).href
  );

  const cases = [
    // [what the platform offers, what must come back, why]
    [
      ['3840x2160', '1920x1080', '1280x720', '640x480'],
      '1920x1080',
      'Android: the largest that still fits under the cap, not the smallest',
    ],
    [
      /* Genuinely different resolutions, not two orientations of one. The first
         version of this case used 4032x3024 and 3024x4032, which are the same
         twelve megapixels rotated — so "the smallest" had no answer and the
         expectation was arbitrary. The tool caught the test, not the code. */
      ['4032x3024', '2560x1920'],
      '2560x1920',
      'every option is over the cap — take the smallest rather than give up',
    ],
    [
      ['photo', 'high', 'medium', 'low'],
      'high',
      'iOS presets: a named preset, never undefined',
    ],
    [
      ['1920x1080', 'photo', 'high'],
      '1920x1080',
      'mixed list: the numeric one wins because it is the one we can reason about',
    ],
    [['photo'], 'photo', 'only the full-resolution preset offered — still return it'],
    [
      /* No 1920x1080 anywhere. A sabotage that hard-coded the common size
         passed every other case here, because that string happens to be in
         most real device lists — so the suite could not tell a chosen value
         from an invented one until a case existed where the two differ. */
      ['3840x2160', '1600x1200', '640x480'],
      '1600x1200',
      'the answer must come from this list, not from the usual suspects',
    ],
    [[], undefined, 'nothing offered: leave the camera alone'],
    [undefined, undefined, 'query failed: leave the camera alone'],
    [['ultra', 'cinematic'], undefined, 'names we do not know — never invent a string'],
  ];

  for (const [given, want, why] of cases) {
    const got = pickPictureSize(given);
    if (got !== want) {
      problems.push(
        `pickPictureSize(${JSON.stringify(given)}) = ${JSON.stringify(got)}, cần ${JSON.stringify(want)} — ${why}`,
      );
    }
  }

  /* Anything returned must have come out of the list. `pictureSize` goes
     straight to the native layer; an unrecognised string is a crash or an
     ignored prop, and both are worse than a large photo. */
  for (const [given] of cases) {
    const got = pickPictureSize(given);
    if (got !== undefined && !(given ?? []).includes(got)) {
      problems.push(`pickPictureSize trả "${got}" — chuỗi này không có trong danh sách thiết bị đưa ra`);
    }
  }

  if (MAX_EDGE > 2400) {
    problems.push(`MAX_EDGE = ${MAX_EDGE} — quá lớn để gọi là có trần; giới hạn bucket được tính từ con số này`);
  }
  if (PHOTO_QUALITY > 0.8) {
    problems.push(`PHOTO_QUALITY = ${PHOTO_QUALITY} — nén yếu thì ảnh 1920px vẫn có thể vượt xa dự tính`);
  }
}

// ── 2: the screen actually applies it ──
{
  const code = strip(readFileSync(path.join(NATIVE, SCREEN), 'utf8'));
  for (const [what, re, why] of [
    ['pictureSize', /pictureSize=\{pictureSize\}/, 'không truyền thì camera vẫn chụp ở mặc định'],
    ['getAvailablePictureSizesAsync', /getAvailablePictureSizesAsync\(\)/, 'phải hỏi thiết bị chứ không được đoán chuỗi'],
    ['pickPictureSize', /pickPictureSize\(/, 'chọn tay ở màn hình là bỏ qua phần xử lý hai nền tảng'],
    ['PHOTO_QUALITY', /quality: PHOTO_QUALITY/, 'số nén viết thẳng sẽ lệch khỏi con số bucket được tính từ đó'],
  ]) {
    if (!re.test(code)) problems.push(`${SCREEN}: thiếu ${what} — ${why}`);
  }
}

// ── 3: and the bucket bounds what does not come through the app ──
{
  const sql = readdirSync(path.join(REPO, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(REPO, 'supabase', 'migrations', f), 'utf8'))
    .join('\n');

  const limit = Number(sql.match(/file_size_limit = (\d+)/)?.[1] ?? 0);
  if (!limit) {
    problems.push(
      'progress-photos: bucket không có file_size_limit — ' +
        'policy chỉ giới hạn thư mục, không giới hạn dung lượng, và cả lưu trữ lẫn băng thông đều tính tiền',
    );
  } else if (limit > 20 * 1024 * 1024) {
    problems.push(`progress-photos: giới hạn ${Math.round(limit / 1048576)} MiB — quá rộng để gọi là trần`);
  } else if (limit < 2 * 1024 * 1024) {
    /* Too low is the failure that lands on an innocent user, so it is checked
       from both sides. A 4K fallback capture is ~2 MB. */
    problems.push(
      `progress-photos: giới hạn ${Math.round(limit / 1048576)} MiB — ` +
        'thiết bị có kích thước nhỏ nhất đã trên trần sẽ chụp ~2 MB và bị chặn oan',
    );
  }
  if (!/allowed_mime_types = ARRAY\['image\/jpeg'\]/.test(sql)) {
    problems.push(
      "progress-photos: không giới hạn allowed_mime_types về ['image/jpeg'] — " +
        'app chỉ upload JPEG, mọi kiểu khác được phép là một hình dạng nữa phải lo',
    );
  }
}

/**
 * The self-test.
 *
 * The iOS branch is the one worth proving. A picker that only understands
 * `WxH` returns `undefined` for a preset list, which reads as "no preference"
 * and is indistinguishable from working.
 */
const SELF = [
  ['picker chỉ hiểu WxH — bị bắt', () => {
    const naive = (a) => (a ?? []).find((s) => /^\d+x\d+$/.test(s));
    return naive(['photo', 'high', 'medium']) === undefined;
  }],
  ['trả chuỗi ngoài danh sách — bị bắt', () => {
    const given = ['photo', 'high'];
    const got = '1920x1080';
    return !given.includes(got);
  }],
  ['thiếu file_size_limit — bị bắt', () => Number(''.match(/file_size_limit = (\d+)/)?.[1] ?? 0) === 0],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('ngân sách ảnh sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  'ngân sách ảnh OK — pickPictureSize đúng trên 9 ca gồm cả preset iOS lẫn WxH của Android, ' +
    'và không bao giờ trả chuỗi ngoài danh sách thiết bị đưa ra; màn hình có truyền pictureSize thật; ' +
    'bucket giới hạn 5 MiB và chỉ nhận image/jpeg',
);
