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

import { UID } from './live-world.mjs';

const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations');

export function rpcError(code, message) {
  return Object.assign(new Error(message), { rpc: { code, message, details: null, hint: null } });
}

/* `current_date` của server: ngày UTC. */
const today = () => new Date().toISOString().slice(0, 10);

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
          };
        })
        .filter(Boolean)
        .sort((a, b) => (a.claimed_at < b.claimed_at ? 1 : -1))
        .slice(0, 200);
    },
  },

  /* 20260930170000_community_search_unaccent.sql (định nghĩa lại bản của 20260930160000) */
  community_search_profiles: {
    sample: { p_q: 'pham' },
    run({ p_q } = {}, world) {
      const q = fold(String(p_q ?? '').trim()).replace(/^@+/, '').slice(0, 40);
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
};
