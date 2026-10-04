/**
 * RPC của thế giới giả: `POST /rest/v1/rpc/<tên>` trả dữ liệu thật, không phải `[]` (#38).
 *
 * ── vì sao ──
 *
 * Trước #38, route giả của `live.mjs` đọc `table = 'rpc'` cho mọi lời gọi RPC,
 * nên `FIXTURES['rpc']` là `undefined` và kết quả luôn là `[]`. Thẻ thử thách,
 * gợi ý theo dõi (#19), tìm người, bản xem trước bài Tiến trình chỉ đo được
 * bằng mock viết tay trong từng đầu dò; lượt quét màn chỉ từng thấy trạng thái
 * rỗng của chúng. Nhánh có dữ liệu chưa từng được quét.
 *
 * ── luật của tệp này ──
 *
 * Mỗi hàm là bản dịch THÂN SQL của hàm cùng tên trong migration sau cùng định
 * nghĩa nó (ghi ở từng mục), chạy trên CÙNG thế giới với các bảng (`world`):
 * `FIXTURES` ở chế độ `full`, thế giới rỗng ở chế độ `empty`. Không có số nào
 * gõ riêng cho RPC. Thử thách có đúng một người tham gia vì fixture có đúng một
 * dòng thành viên, không phải vì ai đó gõ "1".
 *
 * Lỗi mà hàm SQL ném (`RAISE … USING ERRCODE`) thì ở đây là `rpcError(code,
 * message)`, và `live.mjs` trả nó như PostgREST: 400 kèm `code`.
 *
 * Mỗi mục có `sample`: một bộ đối số tiêu biểu mà `fixture-schema.mjs` dùng để
 * gọi hàm và so KẾT QUẢ với `Returns` trong `types.ts`. Một fixture RPC trả thừa
 * hay thiếu cột thì cổng đỏ, như một hàng fixture của bảng.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIXTURES as WORLD0, UID, dayStr } from './live-world.mjs';

const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations');

export function rpcError(code, message) {
  return Object.assign(new Error(message), { rpc: { code, message, details: null, hint: null } });
}

/* `current_date` của server: ngày UTC. */
/* Ngày UTC của server — như SQL — nhưng của MỐC NEO `LOAD` (#114), không đọc lại
   đồng hồ: một lượt vắt qua nửa đêm UTC từng cho phía này một ngày khác với
   thế giới và với trình duyệt. */
const today = () => dayStr(0);

/*
  #95: bảng giá phần thưởng ĐỌC từ chính câu `INSERT INTO public.reward_prices`
  của migration, không gõ lại — đổi giá ở SQL thì fixture đi theo, và một giá
  gõ tay lệch là đúng loại bịa mà thế giới giả không được làm.
*/
const REWARD_MIGRATION = '20260819120000_reward_amount_authority.sql';
export const REWARD_PRICES = (() => {
  const src = readFileSync(path.join(MIGRATIONS, REWARD_MIGRATION), 'utf8');
  const at = src.indexOf('INSERT INTO public.reward_prices');
  if (at < 0) throw new Error(`không thấy INSERT INTO public.reward_prices trong ${REWARD_MIGRATION}`);
  const block = src.slice(at, src.indexOf(';', at));
  const out = new Map([...block.matchAll(/\('([^']+)',\s*(\d+)\)/g)].map((m) => [m[1], Number(m[2])]));
  if (out.size === 0) throw new Error(`reward_prices trong ${REWARD_MIGRATION} không có dòng nào`);
  return out;
})();

/** `public.reward_amount_for` (20260819120000), từng nhánh: null = khoá lạ. */
export function rewardAmountFor(ref) {
  if (ref == null || ref === '') return null;
  const price = (k) => REWARD_PRICES.get(k) ?? null;
  if (ref === 'welcome') return price('welcome');
  if (ref.startsWith('d:')) {
    const parts = ref.split(':');
    if (parts.length !== 3 || !/^\d{4}-\d{2}-\d{2}$/.test(parts[1])) return null;
    /* '2026-02-31' qua được regex mà không phải một ngày — SQL bắt bằng phép ép. */
    const d = new Date(`${parts[1]}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== parts[1]) return null;
    /* Cửa sổ +1 / −2 ngày theo ngày UTC của server, như SQL. */
    const t = new Date(`${today()}T00:00:00Z`).getTime();
    const gap = (d.getTime() - t) / 86400000;
    if (gap > 1 || gap < -2) return null;
    return parts[2] === 'streak' ? price('streak:max') : price(`quest:${parts[2]}`);
  }
  if (ref.startsWith('ch:')) {
    const parts = ref.split(':');
    return parts.length === 4 ? price(`challenge:${parts[1]}`) : null;
  }
  if (ref.startsWith('w:')) return ref.slice(2) === '' ? null : price('weekly');
  if (ref.startsWith('set:')) return price(ref);
  return null;
}
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/* `(a - b)` của hai `date` trong SQL — số nguyên ngày. Cả hai là nửa đêm UTC, nên không có đổi giờ. */
const dateDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);
const round1 = (x) => Math.round(Number(x) * 10) / 10;
const rows = (world, t) => world[t] ?? [];

/* `community_blocked_between(a, b)`: một dòng chặn theo BẤT KỲ chiều nào. */
const blockedBetween = (world, a, b) =>
  rows(world, 'community_blocks').some(
    (r) => (r.blocker_id === a && r.blocked_id === b) || (r.blocker_id === b && r.blocked_id === a),
  );
const follows = (world, a, b) => rows(world, 'community_follows').some((f) => f.follower_id === a && f.followee_id === b);

/*
  `community_fold`: bảng `translate()` được ĐỌC từ migration sau cùng định
  nghĩa hàm, không chép tay — thêm một chữ vào đó thì bản giả có ngay chữ ấy.
*/
function readFold() {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort().reverse();
  for (const f of files) {
    const sql = readFileSync(path.join(MIGRATIONS, f), 'utf8');
    const m = /FUNCTION public\.community_fold\([\s\S]*?translate\(coalesce\(p, ''\),\s*'([^']*)',\s*'([^']*)'\)\)/.exec(sql);
    if (m) {
      const from = [...m[1]];
      const to = [...m[2]];
      if (from.length !== to.length) throw new Error(`community_fold trong ${f}: hai chuỗi translate dài khác nhau`);
      return { file: f, map: new Map(from.map((c, i) => [c, to[i]])) };
    }
  }
  throw new Error('không tìm thấy community_fold trong migration nào');
}
export const FOLD = readFold();
export const fold = (s) => [...(s ?? '')].map((c) => FOLD.map.get(c) ?? c).join('').toLowerCase();

/* LIKE với `%` ở cuối (và `% ` ở đầu cho vế "một từ trong tên"): đã thoát `\ % _`. */
const startsWord = (hay, q) => hay.startsWith(q) || hay.includes(` ${q}`);
/* `btrim(x)` của Postgres: CHỈ dấu cách, không phải mọi khoảng trắng như
   `String.trim()` — "\tga" không khớp gì trên máy thật (#130, search-parity.mjs). */
const btrim = (s) => String(s ?? '').replace(/^ +| +$/g, '');

/* Bài công khai, chưa ẩn, trong 14 ngày của một người — `community_follow_suggestions`. */
const recentPublic = (world, uid) => {
  const since = Date.now() - 14 * 864e5;
  return rows(world, 'community_posts').filter(
    (x) => x.author_id === uid && x.visibility === 'public' && !x.hidden && Date.parse(x.created_at) >= since,
  ).length;
};

/* `community_challenge_progress`: số NGÀY ĐỊA PHƯƠNG khác nhau có buổi tập, trong khoảng thử thách. */
function challengeProgress(world, c, uid, offsetMin) {
  const off = Math.max(-720, Math.min(840, Number(offsetMin ?? 0)));
  const days = new Set();
  for (const s of rows(world, 'workout_sessions')) {
    if (s.user_id !== uid) continue;
    const d = new Date(Date.parse(s.date_time) + off * 60000).toISOString().slice(0, 10);
    if (d >= c.starts_on && d <= c.ends_on) days.add(d);
  }
  return days.size;
}

/* Một chuỗi mỗi tuần: điểm CUỐI của mỗi tuần, tuần tính từ `v_from`. */
function weekly(pts, from) {
  const byWeek = new Map();
  for (const p of [...pts].sort((a, b) => (a.date < b.date ? -1 : 1))) byWeek.set(Math.floor((dateDiff(p.date, from) - 1) / 7), p.v);
  return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => round1(v));
}
function metric(pts, from) {
  if (pts.length < 2) return null;
  const sorted = [...pts].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { start: round1(sorted[0].v), end: round1(sorted[sorted.length - 1].v), series: weekly(pts, from) };
}

const SAMPLE_ART = (WORLD0.community_art ?? [])[0]?.id;

export const RPC_FIXTURES = {
  /* 20260930120000_community_challenges.sql */
  community_challenges_overview: {
    sample: { p_offset_min: 420 },
    run({ p_offset_min } = {}, world) {
      const now = today();
      const members = rows(world, 'community_challenge_members');
      return rows(world, 'community_challenges')
        .filter((c) => c.ends_on >= addDays(now, -7) && c.starts_on <= addDays(now, 30))
        .sort((a, b) => Number(a.ends_on < now) - Number(b.ends_on < now) || (a.ends_on < b.ends_on ? -1 : a.ends_on > b.ends_on ? 1 : 0))
        .map((c) => {
          const me = members.find((m) => m.challenge_id === c.id && m.user_id === UID);
          return {
            id: c.id, title: c.title, description: c.description, target: c.target,
            starts_on: c.starts_on, ends_on: c.ends_on, reward_coins: c.reward_coins,
            participants: members.filter((m) => m.challenge_id === c.id).length,
            joined: !!me,
            progress: me ? challengeProgress(world, c, UID, p_offset_min) : 0,
            claimed: !!me?.claimed_at,
            /* 20261005130000_community_challenges_en.sql (#172) */
            title_en: c.title_en ?? null, description_en: c.description_en ?? null,
          };
        });
    },
  },

  /* 20260930180000_community_challenge_history.sql (#41) */
  community_challenge_history: {
    sample: {},
    run(_args, world) {
      const ledger = rows(world, 'mascot_transactions');
      return rows(world, 'community_challenge_members')
        .filter((m) => m.user_id === UID && m.claimed_at != null)
        .map((m) => {
          const c = rows(world, 'community_challenges').find((x) => x.id === m.challenge_id);
          if (!c) return null;
          const t = ledger.find((x) => x.user_id === UID && x.ref_key === `cc:${c.id}`);
          return {
            id: c.id, title: c.title, description: c.description, target: c.target,
            starts_on: c.starts_on, ends_on: c.ends_on, coins: t ? t.amount : 0, claimed_at: m.claimed_at,
            title_en: c.title_en ?? null, description_en: c.description_en ?? null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (a.claimed_at < b.claimed_at ? 1 : -1))
        .slice(0, 200);
    },
  },

  /* 20261001200000_community_search_unaccent_folded_column.sql (#150: đọc cột gập sẵn —
     cùng nghĩa với fold(display_name) ở đây); trước đó #119 và bản #37 (20260930170000,
     20260930170000, định nghĩa lại 20260930160000). Nghĩa được so với SQL: #130. */
  community_search_profiles: {
    sample: { p_q: 'pham' },
    run({ p_q } = {}, world) {
      const q = fold(btrim(p_q)).replace(/^@+/, '').slice(0, 40);
      if ([...q].length < 2) return [];
      return rows(world, 'community_profiles')
        .filter((p) => p.user_id !== UID && !blockedBetween(world, UID, p.user_id))
        .filter((p) => p.handle.startsWith(q) || startsWord(fold(p.display_name), q))
        .sort((a, b) => Number(b.handle === q) - Number(a.handle === q) || Number(b.is_official) - Number(a.is_official) || (a.handle < b.handle ? -1 : 1))
        .slice(0, 20)
        .map((p) => ({
          user_id: p.user_id, handle: p.handle, display_name: p.display_name, mascot_id: p.mascot_id,
          is_official: p.is_official, bio: p.bio, i_follow: follows(world, UID, p.user_id),
        }));
    },
  },

  /* 20261001160000_community_find_recipes_one_fold.sql (#116; nghĩa của #43): vị từ của policy
     "Readers see visible posts", từng vế, và tiền tố của một từ trong tên món. */
  community_find_recipes: {
    sample: { p_q: 'chicken' },
    run({ p_q } = {}, world) {
      const q = fold(btrim(p_q)).slice(0, 40);
      if ([...q].length < 2) return [];
      return rows(world, 'community_posts')
        .filter((p) => p.kind === 'recipe')
        .filter((p) => p.author_id === UID || (!p.hidden && !blockedBetween(world, UID, p.author_id) && (p.visibility === 'public' || follows(world, UID, p.author_id))))
        .filter((p) => startsWord(fold(String(p.payload?.title ?? '')), q))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? -1 : 1))
        .slice(0, 30)
        .map((p) => ({ post_id: p.id }));
    },
  },

  /* 20260930220000_community_find_posts.sql (#182, C; fixture: #192): phân đoạn "Bài viết" của màn
     tìm — chỉ 'workout' và 'progress' (công thức là việc của hàm trên), cùng vị từ quyền đọc,
     tiền tố của một TỪ trong chú thích HAY trong tên ở payload, mới nhất trước, tối đa 30. */
  community_find_posts: {
    sample: { p_q: 'squat' },
    run({ p_q } = {}, world) {
      const q = fold(btrim(p_q)).slice(0, 40);
      if ([...q].length < 2) return [];
      return rows(world, 'community_posts')
        .filter((p) => p.kind === 'workout' || p.kind === 'progress')
        .filter((p) => p.author_id === UID || (!p.hidden && !blockedBetween(world, UID, p.author_id) && (p.visibility === 'public' || follows(world, UID, p.author_id))))
        .filter((p) => startsWord(fold(String(p.caption ?? '')), q) || startsWord(fold(String(p.payload?.title ?? '')), q))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? -1 : 1))
        .slice(0, 30)
        .map((p) => ({ post_id: p.id }));
    },
  },

  /* 20260930160000_community_search.sql */
  community_follow_suggestions: {
    sample: {},
    run(_args, world) {
      return rows(world, 'community_profiles')
        .filter((p) => p.user_id !== UID && !blockedBetween(world, UID, p.user_id) && !follows(world, UID, p.user_id))
        .map((p) => ({ p, n: recentPublic(world, p.user_id) }))
        .filter(({ p, n }) => p.is_official || n > 0)
        .sort((a, b) => Number(b.p.is_official) - Number(a.p.is_official) || b.n - a.n || (a.p.handle < b.p.handle ? -1 : 1))
        .slice(0, 10)
        .map(({ p, n }) => ({
          user_id: p.user_id, handle: p.handle, display_name: p.display_name, mascot_id: p.mascot_id,
          is_official: p.is_official, bio: p.bio, recent_posts: n,
        }));
    },
  },

  /* 20261001120000_community_badges.sql (#42), định nghĩa lại ở
     20261001140000_community_badges_no_date.sql (#88): không trả ngày nhận. */
  community_user_badges: {
    sample: { p_user: 'c0000000-0000-4000-8000-0000000011a1' },
    run({ p_user } = {}, world) {
      if (!p_user) return [];
      const on = rows(world, 'community_settings').find((s) => s.user_id === p_user)?.show_badges === true;
      if (!on || blockedBetween(world, UID, p_user)) return [];
      const byId = new Map(rows(world, 'community_challenges').map((c) => [c.id, c]));
      return rows(world, 'community_challenge_members')
        .filter((m) => m.user_id === p_user && m.claimed_at && byId.has(m.challenge_id))
        .sort((a, b) => (a.claimed_at < b.claimed_at ? 1 : -1))
        .slice(0, 50)
        .map((m) => ({ challenge_id: m.challenge_id, title: byId.get(m.challenge_id).title }));
    },
  },

  /*
    RPC GHI (#80): đổi thế giới CỦA TRANG, như bảng (#52). Dịch từ thân SQL, cả
    thứ tự các lần ném lỗi — "đã nhận" đứng trước "chưa đạt", nên bấm Nhận lần
    hai ra 23505 chứ không phải 22023.
  */
  /* 20260930120000_community_challenges.sql */
  claim_community_challenge: {
    sample: { p_challenge: 'c4a11e00-0000-4000-8000-000000000004', p_offset_min: 0 },
    run({ p_challenge, p_offset_min } = {}, world) {
      const c = rows(world, 'community_challenges').find((x) => x.id === p_challenge);
      if (!c) throw rpcError('P0002', 'challenge not found');
      const m = rows(world, 'community_challenge_members').find((x) => x.challenge_id === p_challenge && x.user_id === UID);
      if (!m) throw rpcError('P0001', 'not a member');
      if (m.claimed_at != null) throw rpcError('23505', 'already claimed');
      if (challengeProgress(world, c, UID, p_offset_min) < c.target) throw rpcError('22023', 'not completed');
      if (c.reward_coins > 0) {
        const dayStart = `${today()}T00:00:00.000Z`;
        const tx = (world.mascot_transactions ??= []);
        const got = tx.filter((t) => t.user_id === UID && t.amount > 0 && t.created_at >= dayStart).reduce((n, t) => n + t.amount, 0);
        if (got + c.reward_coins > 800) throw rpcError('22023', 'daily reward ceiling reached');
        if (!tx.some((t) => t.user_id === UID && t.ref_key === `cc:${c.id}`)) {
          tx.push({ id: randomUUID(), user_id: UID, amount: c.reward_coins, reason: `Thử thách: ${c.title}`, ref_key: `cc:${c.id}`, created_at: new Date().toISOString() });
        }
      }
      m.claimed_at = new Date().toISOString();
      return c.reward_coins;
    },
  },

  /*
    20260819120000_reward_amount_authority.sql (#95). Dịch thân SQL, cả những
    chỗ dễ đoán sai:
    - mọi `RAISE EXCEPTION` không có ERRCODE, nên mã là P0001 cho cả ba lỗi;
    - trùng `ref_key` KHÔNG phải lỗi: câu chèn là `ON CONFLICT DO NOTHING` và
      hàm vẫn trả số xu — sổ không có dòng thứ hai, người gọi không thấy gì khác;
    - trần 800 xu/ngày tính trên mọi dòng DƯƠNG của hôm nay (UTC), và xét TRƯỚC
      câu chèn, nên một lần gọi trùng khi đã gần trần vẫn có thể bị từ chối.
  */
  claim_quest_reward: {
    sample: { p_ref_key: `d:${today()}:meal`, p_reason: 'sample' },
    run({ p_ref_key, p_reason = '' } = {}, world) {
      const amount = rewardAmountFor(p_ref_key);
      if (amount == null) throw rpcError('P0001', `unknown reward ${p_ref_key}`);
      const tx = (world.mascot_transactions ??= []);
      const dayStart = `${today()}T00:00:00.000Z`;
      const got = tx.filter((t) => t.user_id === UID && t.amount > 0 && t.created_at >= dayStart).reduce((n, t) => n + t.amount, 0);
      if (got + amount > 800) throw rpcError('P0001', 'daily reward ceiling reached');
      if (!tx.some((t) => t.user_id === UID && t.ref_key === p_ref_key)) {
        tx.push({ id: randomUUID(), user_id: UID, amount, reason: p_reason, ref_key: p_ref_key, created_at: new Date().toISOString() });
      }
      return amount;
    },
  },

  /*
    20261004120000_community_hide_reasons.sql (#26). Dịch thân SQL: chỉ mục
    ĐANG ẨN của chính người gọi; số người báo là số người KHÁC NHAU; lý do
    phổ biến nhất, hoà thì theo thứ tự cố định harassment → inappropriate →
    misleading → spam → other. Không trả id người báo hay ghi chú.
  */
  community_my_hidden_reasons: {
    sample: {},
    run(_args, world) {
      const ORDER = ['harassment', 'inappropriate', 'misleading', 'spam', 'other'];
      const reports = rows(world, 'community_reports');
      const asks = rows(world, 'community_review_requests');
      const one = (key, id) => {
        const mine = reports.filter((r) => r[key] === id);
        const by = new Map();
        for (const r of mine) (by.get(r.reason) ?? by.set(r.reason, new Set()).get(r.reason)).add(r.reporter_id);
        const top = [...by].sort((a, b) => b[1].size - a[1].size || ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]))[0];
        return {
          post_id: key === 'post_id' ? id : null,
          comment_id: key === 'comment_id' ? id : null,
          reporters: new Set(mine.map((r) => r.reporter_id)).size,
          top_reason: top ? top[0] : null,
          /* 20261007130000: "đã yêu cầu" = một yêu cầu ĐANG CHỜ; thêm đã gỡ và
             đã xem lại-giữ nguyên. */
          review_requested: asks.some((q) => q[key] === id && q.status === 'open'),
          removed: !!removedAt,
          review_upheld: asks.some((q) => q[key] === id && q.status === 'upheld'),
        };
      };
      let removedAt = null;
      return [
        ...rows(world, 'community_posts').filter((p) => p.author_id === UID && p.hidden).map((p) => ((removedAt = p.removed_at ?? null), one('post_id', p.id))),
        ...rows(world, 'community_comments').filter((c) => c.author_id === UID && c.hidden).map((c) => ((removedAt = c.removed_at ?? null), one('comment_id', c.id))),
      ];
    },
  },

  /* Cùng tệp. "Không phải của mình" và "không ẩn" ra cùng một mã P0002; lần
     hai là 23505 (UNIQUE); không tự bỏ ẩn. */
  community_request_review: {
    sample: { p_post_id: 'cp000000-0000-4000-8000-000000000026' },
    run({ p_post_id = null, p_comment_id = null } = {}, world) {
      if ((p_post_id == null) === (p_comment_id == null)) throw rpcError('22023', 'exactly one of post or comment');
      const [table, key, id] = p_post_id ? ['community_posts', 'post_id', p_post_id] : ['community_comments', 'comment_id', p_comment_id];
      if (!rows(world, table).some((x) => x.id === id && x.author_id === UID && x.hidden)) throw rpcError('P0002', 'nothing hidden of yours');
      const asks = (world.community_review_requests ??= []);
      if (asks.some((q) => q[key] === id && (q.status === 'open' || q.status === 'upheld'))) throw rpcError('23505', 'duplicate key value violates unique constraint');
      asks.push({ id: randomUUID(), requester_id: UID, post_id: p_post_id, comment_id: p_comment_id, status: 'open', message: '', created_at: new Date().toISOString() });
      return null;
    },
  },

  /* 20261007120000_community_notify_more.sql: chỉ bài của mình; "không phải
     của mình" và "không có bài" là cùng một P0002. */
  community_set_comments_off: {
    sample: { p_post_id: 'cp000000-0000-4000-8000-000000000026', p_off: true },
    run({ p_post_id, p_off } = {}, world) {
      if (p_off == null) throw rpcError('22023', 'p_off is required');
      const post = rows(world, 'community_posts').find((p) => p.id === p_post_id && p.author_id === UID);
      if (!post) throw rpcError('P0002', 'post not found');
      post.comments_off = p_off;
      return null;
    },
  },

  /* Cùng tệp: thành tích chỉ trên bài NGƯỜI XEM thấy được; chặn nhau → rỗng. */
  community_user_stats: {
    sample: { p_user: 'c0000000-0000-4000-8000-0000000011a1' },
    run({ p_user } = {}, world) {
      const blocked = rows(world, 'community_blocks').some((b) => (b.blocker_id === UID && b.blocked_id === p_user) || (b.blocker_id === p_user && b.blocked_id === UID));
      if (blocked) return [];
      const follows = rows(world, 'community_follows').some((f) => f.follower_id === UID && f.followee_id === p_user);
      const seen = rows(world, 'community_posts').filter((p) => p.author_id === p_user && (p_user === UID || (!p.hidden && (p.visibility !== 'followers' || follows))));
      const ids = new Set(seen.map((p) => p.id));
      return [{
        posts: seen.length,
        likes: seen.reduce((n, p) => n + (p.like_count ?? 0), 0),
        tries: rows(world, 'community_post_tries').filter((t) => ids.has(t.post_id)).length,
      }];
    },
  },

  /* 20260930140000_community_notifications.sql */
  community_mark_notifications_read: {
    sample: {},
    run(_args, world) {
      const now = new Date().toISOString();
      let n = 0;
      for (const r of rows(world, 'community_notifications')) {
        if (r.user_id === UID && r.read_at == null) {
          r.read_at = now;
          n++;
        }
      }
      return n;
    },
  },

  /* 20260928120000_community_progress.sql */
  build_progress_payload: {
    sample: { p_weeks: 12, p_weight: true, p_waist: true },
    run({ p_weeks, p_weight = true, p_waist = false, p_lift_exercise_id = null } = {}, world) {
      if (p_weeks == null || p_weeks < 1 || p_weeks > 52) throw rpcError('22023', 'weeks out of range');
      const to = today();
      const from = addDays(to, -p_weeks * 7);
      const inRange = (d) => d > from && d <= to;
      const weight = p_weight
        ? metric(rows(world, 'weight_logs').filter((r) => r.user_id === UID && inRange(r.date)).map((r) => ({ date: r.date, v: r.weight_kg })), from)
        : null;
      const waist = p_waist
        ? metric(
            rows(world, 'body_measurements')
              .filter((r) => r.user_id === UID && r.waist_cm > 0 && inRange(r.date))
              .map((r) => ({ date: r.date, v: r.waist_cm })),
            from,
          )
        : null;
      let lift = null;
      if (p_lift_exercise_id) {
        const ex = rows(world, 'exercises').find((e) => e.id === p_lift_exercise_id && (e.user_id == null || e.user_id === UID));
        if (ex) {
          const best = new Map();
          for (const s of rows(world, 'workout_sessions')) {
            const d = s.date_time.slice(0, 10);
            if (s.user_id !== UID || !(d > from)) continue;
            for (const e of Array.isArray(s.sets) ? s.sets : []) {
              if (e.exerciseId !== p_lift_exercise_id || e.warmup || !(Number(e.weight) > 0)) continue;
              const b = Math.floor((dateDiff(d, from) - 1) / 7);
              best.set(b, Math.max(best.get(b) ?? 0, Number(e.weight)));
            }
          }
          const wk = [...best.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => round1(v));
          if (wk.length >= 2) lift = { exerciseId: p_lift_exercise_id, name: ex.name, start: wk[0], end: wk[wk.length - 1], series: wk };
        }
      }
      if (!weight && !waist && !lift) throw rpcError('22023', 'nothing to share');
      /* jsonb_strip_nulls: khoá null không có mặt */
      return Object.fromEntries(Object.entries({ weeks: p_weeks, from, to, weight, waist, lift }).filter(([, v]) => v != null));
    },
  },
  /* 20261007130000_community_admin.sql — vai trò và kiểm duyệt. Vai trò đọc từ
     `world.app_roles` (thế giới mặc định không có: người dùng thường). Mỗi hàm
     hỏi vai trò như `moderation_require`: thiếu quyền → 42501 → 403. */
  my_app_role: {
    prepare: asStaff,
    sample: {},
    run(_a, world) {
      return roleOf(world, UID);
    },
  },
  community_appeal: {
    sample: { p_post_id: 'cp000000-0000-4000-8000-000000000026', p_comment_id: null, p_message: 'x' },
    run({ p_post_id = null, p_comment_id = null, p_message = '' } = {}, world) {
      if ((p_message ?? '').length > 500) throw rpcError('22023', 'message too long');
      if ((p_post_id == null) === (p_comment_id == null)) throw rpcError('22023', 'exactly one of post or comment');
      const [table, key, id] = p_post_id ? ['community_posts', 'post_id', p_post_id] : ['community_comments', 'comment_id', p_comment_id];
      if (!rows(world, table).some((x) => x.id === id && x.author_id === UID && x.hidden && !x.removed_at)) throw rpcError('P0002', 'nothing hidden of yours');
      const asks = (world.community_review_requests ??= []);
      if (asks.some((q) => q[key] === id && (q.status === 'open' || q.status === 'upheld'))) throw rpcError('23505', 'duplicate key value violates unique constraint');
      asks.push({ id: randomUUID(), requester_id: UID, post_id: p_post_id, comment_id: p_comment_id, status: 'open', message: (p_message ?? '').trim(), created_at: new Date().toISOString() });
      return null;
    },
  },
  mod_dashboard: {
    prepare: asStaff,
    sample: {},
    run(_a, world) {
      requireRole(world, false);
      const reps = rows(world, 'community_reports');
      const posts = rows(world, 'community_posts');
      const today = new Date().toISOString().slice(0, 10);
      return {
        pending_reports: new Set(reps.filter((r) => r.status === 'open').map((r) => r.post_id ?? r.comment_id)).size,
        pending_appeals: rows(world, 'community_review_requests').filter((q) => q.status === 'open').length,
        hidden_posts: posts.filter((p) => p.hidden && !p.removed_at).length,
        hidden_comments: rows(world, 'community_comments').filter((c) => c.hidden && !c.removed_at).length,
        removed_posts: posts.filter((p) => p.removed_at).length,
        reports_today: reps.filter((r) => String(r.created_at).slice(0, 10) === today).length,
        recent: auditRows(world).slice(0, 10),
      };
    },
  },
  mod_reports: {
    prepare: asStaff,
    sample: { p_status: 'open', p_limit: 50 },
    run({ p_status = 'open', p_limit = 50 } = {}, world) {
      requireRole(world, false);
      if (!['open', 'actioned', 'dismissed'].includes(p_status)) throw rpcError('22023', 'bad status');
      const groups = new Map();
      for (const r of rows(world, 'community_reports').filter((x) => x.status === p_status)) {
        const id = r.post_id ?? r.comment_id;
        const g = groups.get(id) ?? { type: r.post_id ? 'post' : 'comment', id, who: new Set(), reasons: {}, last: r.created_at };
        g.who.add(r.reporter_id);
        g.reasons[r.reason] = (g.reasons[r.reason] ?? 0) + 1;
        if (r.created_at > g.last) g.last = r.created_at;
        groups.set(id, g);
      }
      return [...groups.values()]
        .sort((a, b) => (a.last < b.last ? 1 : -1))
        .slice(0, p_limit)
        .map((g) => {
          const t = findTarget(world, g.type, g.id);
          const appeal = rows(world, 'community_review_requests').filter((q) => (q.post_id ?? q.comment_id) === g.id).at(-1);
          return {
            target_type: g.type, target_id: g.id, report_count: g.who.size, reasons: g.reasons, last_at: g.last,
            target: t && { kind: t.kind, caption: t.caption, body: t.body, post_id: t.post_id, hidden: !!t.hidden, removed: !!t.removed_at, author_id: t.author_id, created_at: t.created_at },
            author: t ? person(world, t.author_id) : null,
            appeal: appeal ? { id: appeal.id, status: appeal.status, created_at: appeal.created_at } : null,
          };
        });
    },
  },
  mod_appeals: {
    prepare: asStaff,
    sample: { p_status: 'open', p_limit: 50 },
    run({ p_status = 'open', p_limit = 50 } = {}, world) {
      requireRole(world, false);
      if (!['open', 'restored', 'upheld'].includes(p_status)) throw rpcError('22023', 'bad status');
      return rows(world, 'community_review_requests')
        .filter((q) => q.status === p_status)
        .slice(0, p_limit)
        .map((q) => {
          const type = q.post_id ? 'post' : 'comment';
          const id = q.post_id ?? q.comment_id;
          const t = findTarget(world, type, id);
          return {
            id: q.id, status: q.status, message: q.message ?? '', created_at: q.created_at, decided_at: q.decided_at ?? null,
            target_type: type, target_id: id, excerpt: t ? (t.caption ?? t.body ?? '').slice(0, 160) : null,
            reports: new Set(rows(world, 'community_reports').filter((r) => (r.post_id ?? r.comment_id) === id).map((r) => r.reporter_id)).size,
            author: person(world, q.requester_id),
          };
        });
    },
  },
  mod_target: {
    prepare: asStaff,
    sample: { p_type: 'post', p_id: 'cp000000-0000-4000-8000-000000000026' },
    run({ p_type, p_id } = {}, world) {
      requireRole(world, false);
      if (p_type !== 'post' && p_type !== 'comment') throw rpcError('22023', 'target type must be post or comment');
      const t = findTarget(world, p_type, p_id);
      if (!t) throw rpcError('P0002', 'target not found');
      const author = person(world, t.author_id);
      return {
        type: p_type,
        target: { id: t.id, kind: t.kind, caption: t.caption, body: t.body, post_id: t.post_id, visibility: t.visibility, hidden: !!t.hidden, removed_at: t.removed_at ?? null, like_count: t.like_count, comment_count: t.comment_count, created_at: t.created_at },
        author: author && { ...author, role: roleOf(world, t.author_id) },
        reports: rows(world, 'community_reports')
          .filter((r) => (r.post_id ?? r.comment_id) === p_id)
          .map((r) => ({ id: r.id, reason: r.reason, note: r.note, status: r.status, created_at: r.created_at, reporter: person(world, r.reporter_id) })),
        appeals: rows(world, 'community_review_requests')
          .filter((q) => (q.post_id ?? q.comment_id) === p_id)
          .map((q) => ({ id: q.id, status: q.status, message: q.message ?? '', created_at: q.created_at, decided_at: q.decided_at ?? null })),
        history: auditRows(world).filter((a) => a.target_id === p_id || a.metadata?.target_id === p_id),
      };
    },
  },
  mod_hide: modAction('hide'),
  mod_restore: modAction('restore'),
  mod_remove: modAction('remove'),
  mod_dismiss: modAction('dismiss'),
  mod_decide_appeal: {
    prepare: asStaff,
    sample: { p_appeal: 'c8000000-0000-4000-8000-000000000001', p_approve: true, p_reason: 'x' },
    run({ p_appeal, p_approve, p_reason = '' } = {}, world) {
      const actor = requireRole(world, false);
      if (p_approve == null) throw rpcError('22023', 'p_approve is required');
      const q = rows(world, 'community_review_requests').find((x) => x.id === p_appeal);
      if (!q) throw rpcError('P0002', 'appeal not found');
      if (q.status !== 'open') throw rpcError('22023', 'appeal already decided');
      const type = q.post_id ? 'post' : 'comment';
      const id = q.post_id ?? q.comment_id;
      const t = findTarget(world, type, id);
      if (p_approve) {
        Object.assign(t, { hidden: false, removed_at: null, removed_by: null });
        closeReports(world, id, 'dismissed');
        closeAppeals(world, id, ['open', 'upheld'], 'restored');
      } else {
        closeReports(world, id, 'actioned');
        closeAppeals(world, id, ['open'], 'upheld');
      }
      logAudit(world, actor, p_approve ? 'APPROVE_APPEAL' : 'REJECT_APPEAL', 'appeal', p_appeal, p_reason, { target_type: type, target_id: id });
      return null;
    },
  },
  admin_audit: {
    prepare: asStaff,
    sample: { p_limit: 100 },
    run({ p_limit = 100, p_before = null, p_action = null } = {}, world) {
      requireRole(world, true);
      return auditRows(world).filter((a) => (p_before == null || a.id < p_before) && (p_action == null || a.action === p_action)).slice(0, p_limit);
    },
  },
  admin_users: {
    prepare: asStaff,
    sample: { p_query: '', p_limit: 50 },
    run({ p_query = '', p_limit = 50 } = {}, world) {
      requireRole(world, true);
      const q = (p_query ?? '').trim().toLowerCase();
      const people = [{ user_id: UID, handle: null, display_name: null }, ...rows(world, 'community_profiles')];
      const seen = new Set();
      return people
        .filter((p) => !seen.has(p.user_id) && seen.add(p.user_id))
        .map((p) => {
          const prof = rows(world, 'community_profiles').find((x) => x.user_id === p.user_id);
          const email = p.user_id === UID ? 'demo@ascnd.app' : null;
          return { prof, row: {
            user_id: p.user_id, email, handle: prof?.handle ?? null, display_name: prof?.display_name ?? null, role: roleOf(world, p.user_id),
            posts: rows(world, 'community_posts').filter((x) => x.author_id === p.user_id).length,
            hidden_posts: rows(world, 'community_posts').filter((x) => x.author_id === p.user_id && x.hidden && !x.removed_at).length,
            removed_posts: rows(world, 'community_posts').filter((x) => x.author_id === p.user_id && x.removed_at).length,
            open_reports_against: rows(world, 'community_reports').filter((r) => r.status === 'open' && findTarget(world, r.post_id ? 'post' : 'comment', r.post_id ?? r.comment_id)?.author_id === p.user_id).length,
            reports_filed: rows(world, 'community_reports').filter((r) => r.reporter_id === p.user_id).length,
          } };
        })
        .filter(({ row }) => !q || [row.handle, row.display_name, row.email, row.user_id].some((v) => v && v.toLowerCase().includes(q)))
        .map(({ row }) => row)
        .slice(0, p_limit);
    },
  },
  admin_user: {
    prepare: asStaff,
    sample: { p_user: 'c0000000-0000-4000-8000-0000000011a1' },
    run({ p_user } = {}, world) {
      requireRole(world, true);
      const prof = rows(world, 'community_profiles').find((x) => x.user_id === p_user);
      if (!prof && p_user !== UID) throw rpcError('P0002', 'user not found');
      const posts = rows(world, 'community_posts').filter((x) => x.author_id === p_user);
      const ids = new Set(posts.map((x) => x.id));
      return {
        user_id: p_user, email: p_user === UID ? 'demo@ascnd.app' : null, role: roleOf(world, p_user),
        profile: prof ? { handle: prof.handle, display_name: prof.display_name, bio: prof.bio ?? '' } : null,
        posts: posts.map((x) => ({ id: x.id, kind: x.kind, caption: (x.caption ?? '').slice(0, 160), hidden: !!x.hidden, removed: !!x.removed_at, created_at: x.created_at,
          reports: rows(world, 'community_reports').filter((r) => r.post_id === x.id).length })),
        reports_against: rows(world, 'community_reports').filter((r) => ids.has(r.post_id)).map((r) => ({ id: r.id, reason: r.reason, status: r.status, created_at: r.created_at, target_type: 'post', target_id: r.post_id })),
        reports_filed: rows(world, 'community_reports').filter((r) => r.reporter_id === p_user).length,
        history: auditRows(world).filter((a) => a.target_id === p_user || ids.has(a.target_id)),
      };
    },
  },
  admin_set_role: {
    prepare: asStaff,
    sample: { p_user: 'c0000000-0000-4000-8000-0000000011a1', p_role: 'moderator', p_reason: 'x' },
    run({ p_user, p_role, p_reason = '' } = {}, world) {
      const actor = requireRole(world, true);
      if (!['user', 'moderator', 'admin'].includes(p_role)) throw rpcError('22023', 'bad role');
      if (p_user === actor) throw rpcError('22023', 'you cannot change your own role');
      const from = roleOf(world, p_user);
      if (from === p_role) throw rpcError('22023', 'user already has that role');
      if (from === 'admin' && rows(world, 'app_roles').filter((r) => r.role === 'admin').length <= 1) throw rpcError('22023', 'cannot remove the last admin');
      world.app_roles = rows(world, 'app_roles').filter((r) => r.user_id !== p_user);
      if (p_role !== 'user') world.app_roles.push({ user_id: p_user, role: p_role, granted_by: actor, granted_at: new Date().toISOString() });
      logAudit(world, actor, 'ROLE_CHANGE', 'user', p_user, p_reason, { from, to: p_role });
      return null;
    },
  },
  /* Tạm khoá đăng (20261007235000): đúng luật của hàm — đội kiểm duyệt,
     1..720 giờ, bắt buộc lý do, không tự khoá, không khoá người trong đội. */
  mod_restrict: {
    prepare: asStaff,
    sample: { p_user: 'c0000000-0000-4000-8000-0000000011a1', p_hours: 24, p_reason: 'x' },
    run({ p_user, p_hours, p_reason = '' } = {}, world) {
      const actor = requireRole(world, false);
      if (!(p_hours >= 1 && p_hours <= 720)) throw rpcError('22023', 'hours must be between 1 and 720');
      if (!String(p_reason).trim()) throw rpcError('22023', 'a reason is required');
      if (p_user === actor) throw rpcError('22023', 'you cannot restrict yourself');
      if (['moderator', 'admin'].includes(roleOf(world, p_user))) throw rpcError('22023', 'cannot restrict a staff account');
      const until = new Date(Date.now() + p_hours * 3600e3).toISOString();
      world.community_restrictions = rows(world, 'community_restrictions').filter((r) => r.user_id !== p_user);
      world.community_restrictions.push({ user_id: p_user, until, reason: String(p_reason).trim(), created_by: actor, created_at: new Date().toISOString() });
      logAudit(world, actor, 'RESTRICT_USER', 'user', p_user, p_reason, { hours: p_hours, until });
      return until;
    },
  },
  mod_unrestrict: {
    prepare: asStaff,
    sample: { p_user: 'c0000000-0000-4000-8000-0000000022b2', p_reason: 'x' },
    run({ p_user, p_reason = '' } = {}, world) {
      const actor = requireRole(world, false);
      const now = new Date().toISOString();
      const before = rows(world, 'community_restrictions').length;
      world.community_restrictions = rows(world, 'community_restrictions').filter((r) => !(r.user_id === p_user && r.until > now));
      if (world.community_restrictions.length === before) throw rpcError('22023', 'user is not restricted');
      logAudit(world, actor, 'UNRESTRICT_USER', 'user', p_user, p_reason, {});
      return null;
    },
  },
  mod_user_restriction: {
    prepare: asStaff,
    sample: { p_user: 'c0000000-0000-4000-8000-0000000022b2' },
    run({ p_user } = {}, world) {
      requireRole(world, false);
      const now = new Date().toISOString();
      const r = rows(world, 'community_restrictions').find((x) => x.user_id === p_user && x.until > now);
      return r ? { until: r.until, reason: r.reason, created_at: r.created_at } : null;
    },
  },
  admin_art: {
    prepare: asStaff,
    sample: {},
    run(_a, world) {
      requireRole(world, true);
      return rows(world, 'community_art').map((a) => ({ ...a, used_by: rows(world, 'community_posts').filter((p) => p.art_id === a.id).length }));
    },
  },
  admin_set_art_active: {
    prepare: asStaff,
    sample: { p_art: SAMPLE_ART, p_active: false, p_reason: 'x' },
    run({ p_art, p_active, p_reason = '' } = {}, world) {
      const actor = requireRole(world, true);
      if (p_active == null) throw rpcError('22023', 'p_active is required');
      const a = rows(world, 'community_art').find((x) => x.id === p_art);
      if (!a) throw rpcError('P0002', 'image not found');
      if (a.active === p_active) throw rpcError('22023', 'image already in that state');
      a.active = p_active;
      logAudit(world, actor, p_active ? 'RESTORE_IMAGE' : 'REMOVE_IMAGE', 'image', p_art, p_reason, {});
      return null;
    },
  },
};

/* ── kiểm duyệt (20261007130000): trợ giúp cho các fixture ở trên ── */
function roleOf(world, uid) {
  return rows(world, 'app_roles').find((r) => r.user_id === uid)?.role ?? 'user';
}
function requireRole(world, adminOnly) {
  const r = roleOf(world, UID);
  if (r === 'admin' || (!adminOnly && r === 'moderator')) return UID;
  throw rpcError('42501', `forbidden: ${adminOnly ? 'admin' : 'moderator'} role required`);
}
function person(world, uid) {
  const p = rows(world, 'community_profiles').find((x) => x.user_id === uid);
  return p ? { user_id: p.user_id, handle: p.handle, display_name: p.display_name } : null;
}
function findTarget(world, type, id) {
  return rows(world, type === 'post' ? 'community_posts' : 'community_comments').find((x) => x.id === id) ?? null;
}
function closeReports(world, id, status) {
  let n = 0;
  for (const r of rows(world, 'community_reports')) if (r.status === 'open' && (r.post_id ?? r.comment_id) === id) (r.status = status), n++;
  return n;
}
function closeAppeals(world, id, from, to) {
  for (const q of rows(world, 'community_review_requests')) {
    if (from.includes(q.status) && (q.post_id ?? q.comment_id) === id) Object.assign(q, { status: to, decided_by: UID, decided_at: new Date().toISOString() });
  }
}
function logAudit(world, actor, action, type, id, reason, metadata) {
  const log = (world.moderation_audit_log ??= []);
  log.push({ id: log.length + 1, actor_id: actor, actor_role: roleOf(world, actor), action, target_type: type, target_id: id, reason: (reason ?? '').trim(), metadata, created_at: new Date().toISOString() });
}
function auditRows(world) {
  return [...rows(world, 'moderation_audit_log')].reverse().map((a) => ({ ...a, actor: person(world, a.actor_id) }));
}
function modAction(kind) {
  return {
    prepare: asStaff,
    /* hide / dismiss cần một đích ĐANG HIỆN (dismiss: có báo cáo mở — `asStaff`
       thêm một); restore / remove dùng bài đang ẩn 026. */
    sample: { p_type: 'post', p_id: kind === 'hide' || kind === 'dismiss' ? 'cp000000-0000-4000-8000-000000000003' : 'cp000000-0000-4000-8000-000000000026', p_reason: 'x' },
    run({ p_type, p_id, p_reason = '' } = {}, world) {
      const actor = requireRole(world, false);
      if (p_type !== 'post' && p_type !== 'comment') throw rpcError('22023', 'target type must be post or comment');
      const t = findTarget(world, p_type, p_id);
      if (!t) throw rpcError('P0002', 'target not found');
      const P = p_type === 'post' ? 'POST' : 'COMMENT';
      if (kind === 'hide') {
        if (t.hidden) throw rpcError('22023', 'already hidden');
        t.hidden = true;
        logAudit(world, actor, `HIDE_${P}`, p_type, p_id, p_reason, { reports_closed: closeReports(world, p_id, 'actioned') });
      } else if (kind === 'restore') {
        if (!t.hidden) throw rpcError('22023', 'not hidden');
        if (t.removed_at && roleOf(world, actor) !== 'admin') throw rpcError('42501', 'forbidden: only an admin can restore removed content');
        const was = !!t.removed_at;
        Object.assign(t, { hidden: false, removed_at: null, removed_by: null });
        const n = closeReports(world, p_id, 'dismissed');
        closeAppeals(world, p_id, ['open', 'upheld'], 'restored');
        logAudit(world, actor, `RESTORE_${P}`, p_type, p_id, p_reason, { reports_dismissed: n, was_removed: was });
      } else if (kind === 'remove') {
        if (!(p_reason ?? '').trim()) throw rpcError('22023', 'a reason is required to remove content');
        if (t.removed_at) throw rpcError('22023', 'already removed');
        Object.assign(t, { hidden: true, removed_at: new Date().toISOString(), removed_by: actor });
        const n = closeReports(world, p_id, 'actioned');
        closeAppeals(world, p_id, ['open'], 'upheld');
        logAudit(world, actor, `REMOVE_${P}`, p_type, p_id, p_reason, { reports_closed: n });
      } else {
        if (t.hidden) throw rpcError('22023', 'target is hidden: restore or remove it instead');
        const n = closeReports(world, p_id, 'dismissed');
        if (n === 0) throw rpcError('22023', 'no open reports');
        logAudit(world, actor, 'DISMISS_REPORT', p_type, p_id, p_reason, { reports_dismissed: n });
        return n;
      }
      return null;
    },
  };
}

/* Thế giới cho MẪU của các fixture kiểm duyệt (fixture-schema gọi `prepare`
   trước `run`): người dùng demo là admin, có một kháng nghị đang chờ trên bài
   ẩn 026 và một báo cáo mở trên bài đang hiện 003. Kịch bản live dựng trạng
   thái của riêng nó bằng cùng hàm này. */
export function asStaff(world, role = 'admin') {
  world.app_roles = [...rows(world, 'app_roles').filter((r) => r.user_id !== UID), { user_id: UID, role, granted_by: null, granted_at: new Date().toISOString() }];
  const asks = (world.community_review_requests ??= []);
  if (!asks.some((q) => q.id === 'c8000000-0000-4000-8000-000000000001')) {
    asks.push({ id: 'c8000000-0000-4000-8000-000000000001', requester_id: UID, post_id: 'cp000000-0000-4000-8000-000000000026', comment_id: null, status: 'open', message: 'Đây là buổi tập thật của tôi', created_at: new Date().toISOString() });
  }
  if (!rows(world, 'moderation_audit_log').length) {
    world.moderation_audit_log = [{ id: 1, actor_id: null, actor_role: 'system', action: 'ROLE_CHANGE', target_type: 'user', target_id: UID, reason: 'bootstrap', metadata: { from: 'user', to: 'admin' }, created_at: new Date().toISOString() }];
  }
  const reps = (world.community_reports ??= []);
  if (!reps.some((r) => r.id === 'c7000000-0000-4000-8000-000000000009')) {
    reps.push({ id: 'c7000000-0000-4000-8000-000000000009', reporter_id: 'c0000000-0000-4000-8000-0000000022b2', post_id: 'cp000000-0000-4000-8000-000000000003', comment_id: null, reported_user_id: null, reason: 'misleading', note: 'số liệu không thật', status: 'open', created_at: new Date().toISOString() });
  }
}
