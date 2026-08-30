/**
 * "Có mạng" là một câu hỏi, và app phải trả lời nó bằng cả hai dữ kiện nó có.
 *
 * ── lỗi đã sửa ──
 *
 * `query-client.ts` báo cho React Query biết máy có mạng hay không bằng:
 *
 *     setOnline(state.isConnected !== false)
 *
 * NetInfo trả về HAI trường, và dòng ấy đọc một:
 *
 *     isConnected: boolean            // có nối vào một mạng nào đó không
 *     isInternetReachable: boolean|null   // mạng ấy có ra được internet không
 *
 * Nên mọi ca "có sóng mà không có mạng" — Wi-Fi quán cà phê chưa bấm đồng ý
 * điều khoản, Wi-Fi khách sạn bắt đăng nhập, router mất đường lên, 4G đủ vạch
 * mà hết dung lượng — đều được app đọc thành ONLINE. Đó là dạng mất mạng phổ
 * biến nhất trên điện thoại, không phải ca hiếm.
 *
 * Và hậu quả không dừng ở cái dải báo bị ẩn: `offlineNow()` đọc cùng nguồn ấy,
 * và nó quyết định có cho phép cập nhật lạc quan hay không. Ở đúng tình huống
 * này app vẽ ra con số người dùng vừa nhập trong khi không có gì được gửi đi —
 * chính lời nói dối mà `offline.ts` được viết ra để chặn, đi lọt qua cửa nó
 * không canh.
 *
 * ── vì sao tệp này CHẠY code thật ──
 *
 * Một luật so chuỗi chỉ chứng minh được rằng chữ `isInternetReachable` có xuất
 * hiện đâu đó. Nó không chứng minh được rằng khi bơm vào trạng thái của một
 * cái Wi-Fi khách sạn thì app trả lời "mất mạng". Nên `isUsable` và
 * `applyNetInfo` được bundle rồi gọi thật, trên cả bảng trạng thái và trên
 * chuỗi sự kiện — cùng cách `shop-camera.mjs` chạy camera thật.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const problems = [];

/* ── bundle ─────────────────────────────────────────────────────────────────
   NetInfo là native module, không import được trong node. Nó bị thay bằng một
   bản giả chỉ đủ để tệp nạp được: các hàm được kiểm ở đây đều nhận trạng thái
   qua tham số, nên không hàm nào trong số chúng gọi tới bản giả này. */
const dir = mkdtempSync(path.join(tmpdir(), 'netstatus-'));
const shim = path.join(dir, 'netinfo-shim.js');
writeFileSync(
  shim,
  'const noop = () => () => {};\n' +
    'export default { addEventListener: noop, refresh: async () => ({}), configure: () => {} };\n',
);
const entry = path.join(dir, 'e.ts');
writeFileSync(entry, `export * from '@/lib/net-status';\n`);
execFileSync(
  'npx',
  [
    'esbuild',
    entry,
    '--bundle',
    '--format=esm',
    '--tsconfig=tsconfig.json',
    `--alias:@react-native-community/netinfo=${shim}`,
    `--outfile=${path.join(dir, 'c.js')}`,
  ],
  { stdio: ['ignore', 'ignore', 'inherit'], cwd: NATIVE },
);
const N = await import(pathToFileURL(path.join(dir, 'c.js')));

/* ── 1. bảng trạng thái, chạy qua `isUsable` THẬT ────────────────────────────
   `want` là câu trả lời đúng cho một người đang cầm điện thoại, không phải cho
   một cái cờ. */
const TABLE = [
  {
    name: 'máy bay / không sóng',
    state: { isConnected: false, isInternetReachable: false },
    want: false,
  },
  {
    name: 'Wi-Fi tốt',
    state: { isConnected: true, isInternetReachable: true },
    want: true,
  },
  {
    /* Ca đã ship sai. Có sóng, đủ vạch, và không ra được internet. */
    name: 'Wi-Fi quán cà phê chưa bấm đồng ý điều khoản',
    state: { isConnected: true, isInternetReachable: false },
    want: false,
  },
  {
    name: '4G đủ vạch nhưng hết dung lượng',
    state: { isConnected: true, isInternetReachable: false },
    want: false,
  },
  {
    /* `null` = NetInfo CHƯA BIẾT, nó vẫn đang dò. Cửa sổ này có ở mỗi lần mở
       app; kết tội lúc chưa biết thì mỗi lần mở app đều nháy một cảnh báo sai,
       và một cảnh báo sai vài lần sẽ dạy người ta bỏ qua nó đúng lúc nó thật. */
    name: 'vừa mở app, NetInfo còn đang dò',
    state: { isConnected: true, isInternetReachable: null },
    want: true,
  },
  {
    name: 'không rõ loại mạng, chưa dò xong',
    state: { isConnected: null, isInternetReachable: null },
    want: true,
  },
  {
    /* Dứt khoát thắng chưa-biết: không nối vào đâu thì không cần dò. */
    name: 'mất kết nối, chưa dò xong',
    state: { isConnected: false, isInternetReachable: null },
    want: false,
  },
];

/*
  Thân luật là một HÀM, và phần tự kiểm ở cuối tệp gọi lại ĐÚNG hàm này trên
  một thế giới hỏng. Viết lại điều kiện trong phần tự kiểm thì nó chỉ chứng
  minh một tính chất của thứ nó tự dựng, không phải rằng luật còn ở đây: xoá
  luật đi, bản tự kiểm chép tay vẫn xanh. Đo được — cả sáu luật trong tệp này
  từng xoá được mà vẫn báo OK.

  `W` là cả thế giới mà các luật đọc: phép đo `isUsable`, và ba tệp nguồn.
*/
function audit(W) {
  const out = [];
  const table = W.table ?? TABLE;

  // 1 — bảng trạng thái
  for (const c of table) {
    const got = W.isUsable(c.state);
    if (got !== c.want) {
      out.push(
        `isUsable sai ở "${c.name}" — isConnected=${c.state.isConnected}, ` +
          `isInternetReachable=${c.state.isInternetReachable} → ${got}, đáng lẽ ${c.want}`,
      );
    }
  }

  /* 2 — răng: bản ĐÃ SHIP phải bị chính bảng này bắt.
     Một bảng mà bản hỏng cũng đi qua được là một bảng không chứng minh gì. Đây
     đúng là biểu thức từng nằm trong `query-client.ts`. */
  const shipped = (st) => st.isConnected !== false;
  if (table.filter((c) => shipped(c.state) !== c.want).length === 0) {
    out.push(
      'bảng trạng thái không còn bắt được bản đã ship (`isConnected !== false`) — ' +
        'luật này không chứng minh điều gì nữa',
    );
  }

  // 4 — một định nghĩa "có mạng", không phải hai
  if (!/setOnline\(isUsable\(state\)\)/.test(W.qc)) {
    out.push(
      'src/lib/query-client.ts: onlineManager không còn nuôi bằng `isUsable(state)` — ' +
        'nếu nó tự tính lại "có mạng" thì app có hai định nghĩa, và luật ở trên chỉ kiểm cái không dùng',
    );
  }
  if (/isConnected\s*!==\s*false/.test(W.qc)) {
    out.push(
      'src/lib/query-client.ts: `isConnected !== false` đã quay lại — đó chính là bản bỏ qua ' +
        '`isInternetReachable`, tức là Wi-Fi có sóng mà không có mạng lại đọc ra ONLINE',
    );
  }

  // 5 — dải báo nói được cả ba trạng thái
  if (!/useNetStatus\(\)/.test(W.banner)) {
    out.push('connection-banner.tsx: không đọc `useNetStatus()` — nó lại chỉ biết đóng/mở');
  }
  if (!/i18n\.nReconnecting/.test(W.banner)) {
    out.push('connection-banner.tsx: không có nhánh "đang kết nối lại"');
  }
  if (!/retryNow/.test(W.banner)) {
    out.push(
      'connection-banner.tsx: mất nút thử lại — mất mạng là trạng thái DUY NHẤT người dùng tự ' +
        'thoát ra được, và không có nút thì cách duy nhất là khởi động lại app',
    );
  }

  // 6 — "đang kết nối lại" không thể mắc kẹt vĩnh viễn
  const m = /const RECONNECT_CAP_MS = ([\d_]+);/.exec(W.net);
  if (!m) {
    out.push(
      'src/lib/net-status.ts: không còn `RECONNECT_CAP_MS` — không có trần thì một truy vấn treo ' +
        'giữ dải báo "đang kết nối lại" ở lại vĩnh viễn',
    );
  } else {
    const cap = Number(m[1].replace(/_/g, ''));
    if (!Number.isFinite(cap) || cap <= 0 || cap > 60_000) {
      out.push(`src/lib/net-status.ts: RECONNECT_CAP_MS = ${cap} — trần phải hữu hạn và dưới 60 giây`);
    }
  }
  if (!/capTimer = setTimeout\(/.test(W.net)) {
    out.push('src/lib/net-status.ts: trần được khai nhưng không ai đặt hẹn giờ theo nó');
  }

  /* 7 — sàn hiển thị. Không có nó thì mạng về mà không có gì cần tải lại sẽ
     làm dải báo hiện ra rồi tắt trong khoảng một phần tư giây, trong khi riêng
     hiệu ứng hiện ra đã 200ms: một vệt loé không ai đọc kịp. */
  const f = /const RECONNECT_MIN_MS = ([\d_]+);/.exec(W.net);
  if (!f) {
    out.push(
      'src/lib/net-status.ts: không còn `RECONNECT_MIN_MS` — dải báo "đang kết nối lại" sẽ nháy ' +
        'một cái rồi tắt khi không có gì cần tải lại',
    );
  } else {
    const floor = Number(f[1].replace(/_/g, ''));
    if (!(floor >= 300 && floor < 5_000)) {
      out.push(`src/lib/net-status.ts: RECONNECT_MIN_MS = ${floor} — sàn phải từ 300ms tới dưới 5 giây`);
    }
  }

  return out;
}

const WORLD = {
  isUsable: N.isUsable,
  qc: strip(read('src/lib/query-client.ts')),
  banner: strip(read('src/components/ascnd/connection-banner.tsx')),
  net: strip(read('src/lib/net-status.ts')),
};
problems.push(...audit(WORLD));

/* ── 3. máy trạng thái ba nhánh, chạy THẬT trên chuỗi sự kiện ────────────────
   Đây là phần mà một luật đọc chữ không với tới được: thứ tự các trạng thái. */
const ONLINE = { isConnected: true, isInternetReachable: true };
const DEAD = { isConnected: true, isInternetReachable: false };
const GONE = { isConnected: false, isInternetReachable: false };

/**
 * Chạy một chuỗi sự kiện, trả về chuỗi trạng thái đi qua.
 *
 * `waitMs` là thời gian chờ THẬT sau chuỗi sự kiện, cho những ca mà lối ra
 * không nằm trong một sự kiện nào mà nằm ở một nhịp hẹn giờ — "đang kết nối
 * lại" thoát khi app tải xong, và "xong" chỉ biết được qua nhịp dò.
 *
 * Chờ thật chứ không rút ngắn nhịp dò của app cho vừa phép kiểm: một hằng số
 * chỉ tồn tại ở giá trị khác khi đang bị kiểm là một hằng số chưa từng được
 * kiểm.
 */
async function run(events, { busy = () => false, waitMs = 0 } = {}) {
  N.__resetNetStatusForTest();
  N.registerBusyProbe(busy);
  const seen = [N.netStatus()];
  const note = () => {
    if (N.netStatus() !== seen[seen.length - 1]) seen.push(N.netStatus());
  };
  for (const e of events) {
    N.applyNetInfo(e);
    note();
  }
  if (waitMs > 0) {
    const stop = N.subscribeNetStatus(note);
    await new Promise((r) => setTimeout(r, waitMs));
    stop();
  }
  return seen;
}

const SEQ = [
  {
    name: 'mất mạng rồi có lại → phải đi qua "đang kết nối lại"',
    events: [ONLINE, GONE, ONLINE],
    /* `busy` còn true nên nó Ở LẠI 'reconnecting' — đúng thứ người dùng thấy
       trong lúc app tải lại phần đã lỡ. */
    busy: () => true,
    want: ['online', 'offline', 'reconnecting'],
  },
  {
    name: 'mạng vẫn tốt, NetInfo báo lại → KHÔNG được dựng ra một lần kết nối lại',
    events: [ONLINE, ONLINE, ONLINE],
    busy: () => true,
    want: ['online'],
  },
  {
    /* Ca đã ship sai, nhìn từ phía trạng thái: bước vào vùng Wi-Fi chết phải
       đọc ra là mất mạng. Bản cũ đứng yên ở 'online'. */
    name: 'đi vào vùng Wi-Fi có sóng mà không có internet',
    events: [ONLINE, DEAD],
    want: ['online', 'offline'],
  },
  {
    name: 'không còn gì đang tải → về online, không kẹt ở "đang kết nối lại"',
    events: [ONLINE, GONE, ONLINE],
    busy: () => false,
    /* Sàn hiển thị là 600ms, nhịp dò 250ms sau đó. Chờ dư để phép kiểm không
       thua một lần lệch lịch của bộ hẹn giờ. */
    waitMs: 1200,
    want: ['online', 'offline', 'reconnecting', 'online'],
  },
  {
    /* Trần cứng: dù `busy` không bao giờ chịu xong, dải báo vẫn phải thoát.
       Không kiểm hết 12 giây ở đây — kiểm rằng trần TỒN TẠI, ở luật 6. */
    name: 'còn đang tải thì Ở LẠI "đang kết nối lại", không tự về sớm',
    events: [ONLINE, GONE, ONLINE],
    busy: () => true,
    waitMs: 1200,
    want: ['online', 'offline', 'reconnecting'],
  },
];

/**
 * Chấm cả bảng chuỗi sự kiện bằng MỘT bộ chạy.
 *
 * Nhận `runner` làm tham số để phần tự kiểm chấm lại đúng bảng này bằng một bộ
 * chạy dùng phép đo ĐÃ SHIP — và bảng phải bắt được nó. Không có tham số ấy thì
 * xoá cả vòng lặp đi cũng không ai biết.
 */
async function seqAudit(runner) {
  const out = [];
  for (const c of SEQ) {
    const got = await runner(c.events, { busy: c.busy, waitMs: c.waitMs });
    if (got.join(' → ') !== c.want.join(' → ')) {
      out.push(`chuỗi trạng thái sai ở "${c.name}" — được [${got.join(' → ')}], đáng lẽ [${c.want.join(' → ')}]`);
    }
  }
  return out;
}
problems.push(...(await seqAudit(run)));

N.__resetNetStatusForTest();

/* ── tự kiểm ─────────────────────────────────────────────────────────────────
   Mỗi luật một thế giới hỏng, và phần này gọi lại ĐÚNG `audit` đang chạy ở
   trên — nên xoá một luật đi là phần tự kiểm ĐỎ, chứ không phải im lặng báo OK.

   Thế giới hỏng của luật 1 là bản ĐÃ SHIP: phép đo chỉ đọc `isConnected`. */
{
  const fail = (name) => {
    console.error(`phép tự kiểm hỏng — thế giới "${name}" đáng lẽ phải bị bắt, đừng tin kết quả`);
    process.exit(1);
  };
  const broken = (name, patch, want) => {
    const found = audit({ ...WORLD, ...patch });
    if (!found.some((p) => want.test(p))) fail(name);
  };

  broken('phép đo quay về bản đã ship, chỉ đọc isConnected', { isUsable: (s) => s.isConnected !== false }, /isUsable sai/);
  /* Hai thế giới TÁCH RỜI, vì luật 4 có hai nửa và một thế giới chạm cả hai thì
     xoá một nửa đi vẫn xanh nhờ nửa kia. Mỗi nửa phải tự đứng được. */
  broken('onlineManager không còn nuôi bằng isUsable', { qc: 'setOnline(reachable(state))' }, /hai định nghĩa/);
  broken('biểu thức đã ship quay lại cạnh isUsable', { qc: 'setOnline(isUsable(state)); const legacy = st.isConnected !== false;' }, /đã quay lại/);
  broken('dải báo mất nhánh đang kết nối lại', { banner: WORLD.banner.replace('i18n.nReconnecting', 'i18n.nOffline') }, /nhánh "đang kết nối lại"/);
  broken('dải báo mất nút thử lại', { banner: WORLD.banner.replace(/retryNow/g, 'noop') }, /nút thử lại/);
  broken('dải báo quay về đóng\/mở', { banner: WORLD.banner.replace('useNetStatus()', 'useOnlineStatus()') }, /chỉ biết đóng\/mở/);
  broken('trần cứng bị gỡ', { net: WORLD.net.replace(/const RECONNECT_CAP_MS = [\d_]+;/, '') }, /không còn `RECONNECT_CAP_MS`/);
  broken('trần cứng thành vô lý', { net: WORLD.net.replace(/const RECONNECT_CAP_MS = [\d_]+;/, 'const RECONNECT_CAP_MS = 600_000;') }, /trần phải hữu hạn/);
  broken('trần khai mà không ai đặt hẹn giờ', { net: WORLD.net.replace('capTimer = setTimeout(', 'capTimer = never(') }, /không ai đặt hẹn giờ/);

  broken('sàn hiển thị bị gỡ', { net: WORLD.net.replace(/const RECONNECT_MIN_MS = [\d_]+;/, '') }, /không còn `RECONNECT_MIN_MS`/);
  broken('sàn hiển thị thành vô lý', { net: WORLD.net.replace(/const RECONNECT_MIN_MS = [\d_]+;/, 'const RECONNECT_MIN_MS = 20;') }, /sàn phải từ 300ms/);

  /* Bảng mất răng: bỏ đi đúng những hàng mà bản đã ship trả lời sai. */
  broken('bảng trạng thái mất răng', { table: TABLE.filter((c) => (c.state.isConnected !== false) === c.want) }, /không còn bắt được bản đã ship/);

  /* Và luật 3 — máy trạng thái. Bộ chạy hỏng ở đây dùng phép đo ĐÃ SHIP: bước
     vào vùng Wi-Fi chết thì nó đứng yên ở 'online'. Bảng SEQ phải bắt được. */
  const shippedRunner = async (events, { busy = () => false } = {}) => {
    let st = 'online';
    const seen = [st];
    for (const e of events) {
      const usable = e.isConnected !== false; // bản đã ship: bỏ qua isInternetReachable
      const next = !usable ? 'offline' : st === 'offline' ? (busy() ? 'reconnecting' : 'online') : st;
      if (next !== st) seen.push(next);
      st = next;
    }
    return seen;
  };
  if ((await seqAudit(shippedRunner)).length === 0) {
    console.error('phép tự kiểm hỏng — bảng chuỗi sự kiện không còn bắt được bản đã ship');
    process.exit(1);
  }
}

if (problems.length) {
  console.error('trạng thái mạng CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  `trạng thái mạng OK — \`isUsable\` được CHẠY THẬT trên ${TABLE.length} trạng thái NetInfo và ` +
    `máy trạng thái chạy thật trên ${SEQ.length} chuỗi sự kiện: "có sóng mà không ra được internet" ` +
    '(Wi-Fi quán cà phê chưa bấm đồng ý, khách sạn bắt đăng nhập, 4G hết dung lượng) đọc ra là MẤT ' +
    'MẠNG chứ không phải online — bản đã ship `isConnected !== false` bỏ qua hẳn ' +
    '`isInternetReachable` nên đọc ra online, và vì `offlineNow()` dùng chung nguồn ấy, app còn cho ' +
    'phép vẽ ra những con số chưa hề được gửi đi. `null` KHÔNG bị tính là mất mạng, nên không nháy ' +
    'cảnh báo sai ở mỗi lần mở app. Mạng về thì đi qua "đang kết nối lại" rồi mới tới online, và ' +
    'mạng vẫn tốt thì không dựng ra một lần kết nối lại nào. Bảng còn răng: bản đã ship vẫn bị bắt',
);
