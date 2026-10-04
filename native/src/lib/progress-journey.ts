/**
 * Hành trình tiến trình của một người (đề xuất 3, A 04/10): gộp mọi bài
 * Progress người xem ĐƯỢC THẤY thành một dòng cho mỗi chỉ số — từ số đầu của
 * lần chia sẻ đầu tiên tới số cuối của lần mới nhất.
 *
 * ── chỉ từ những gì đã đăng ──
 *
 * Không đọc thêm số liệu nào: mọi con số ở đây là con số người ấy đã chọn
 * đăng, và chỉ những bài RLS cho người xem thấy (bài chỉ-người-theo-dõi, bài bị
 * ẩn không có mặt). Một chỉ số người ấy tắt ở mọi bài thì không bao giờ xuất hiện.
 *
 * ── vì sao cần ít nhất hai lần ──
 *
 * Một bài đơn lẻ đã tự nói đầu/cuối của nó ngay bên dưới. Một "hành trình" một
 * điểm chỉ là bài ấy viết lại, nên một chỉ số phải có mặt ở ≥ 2 bài mới thành
 * một dòng.
 *
 * ── bài tập sức mạnh ──
 *
 * Mỗi bài chỉ mang MỘT bài tập, và hai bài có thể là hai bài tập khác nhau. Gộp
 * số của Bench với số của Squat là bịa, nên chỉ lấy bài tập xuất hiện ở NHIỀU
 * bài nhất (hoà thì bài tập của lần mới nhất).
 */

export interface JourneyPost {
  id: string;
  createdAt: string;
  payload: unknown;
}

export type JourneyKey = 'weight' | 'waist' | 'lift';

export interface JourneyLine {
  key: JourneyKey;
  /** tên bài tập, chỉ với `lift` */
  name?: string;
  start: number;
  end: number;
  /** số bài mang chỉ số này */
  updates: number;
  firstAt: string;
  lastAt: string;
}

export interface Journey {
  lines: JourneyLine[];
  /** số bài Progress đã gộp (kể cả bài không góp dòng nào) */
  posts: number;
  firstAt: string | null;
  lastAt: string | null;
}

interface Point {
  at: string;
  start: number;
  end: number;
}

function metric(v: unknown): { start: number; end: number } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const start = Number(o.start);
  const end = Number(o.end);
  if (o.start == null || o.end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

function line(key: JourneyKey, pts: Point[], name?: string): JourneyLine | null {
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  return { key, ...(name ? { name } : {}), start: first.start, end: last.end, updates: pts.length, firstAt: first.at, lastAt: last.at };
}

export function buildJourney(posts: readonly JourneyPost[]): Journey {
  /* Cũ trước, và ổn định khi trùng giờ (id phân xử) — không tin thứ tự gọi vào. */
  const sorted = [...posts].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const weight: Point[] = [];
  const waist: Point[] = [];
  const lifts = new Map<string, Point[]>();
  const liftLast = new Map<string, number>();

  sorted.forEach((p, i) => {
    const o = (p.payload && typeof p.payload === 'object' ? p.payload : {}) as Record<string, unknown>;
    const w = metric(o.weight);
    if (w) weight.push({ at: p.createdAt, ...w });
    const ws = metric(o.waist);
    if (ws) waist.push({ at: p.createdAt, ...ws });
    const l = metric(o.lift);
    const name = o.lift && typeof (o.lift as Record<string, unknown>).name === 'string' ? ((o.lift as Record<string, unknown>).name as string).trim() : '';
    if (l && name) {
      const list = lifts.get(name) ?? [];
      list.push({ at: p.createdAt, ...l });
      lifts.set(name, list);
      liftLast.set(name, i);
    }
  });

  let liftName: string | null = null;
  for (const [name, pts] of lifts) {
    const best = liftName ? lifts.get(liftName)! : null;
    if (!best || pts.length > best.length || (pts.length === best.length && liftLast.get(name)! > liftLast.get(liftName!)!)) liftName = name;
  }

  const lines = [
    line('weight', weight),
    line('waist', waist),
    liftName ? line('lift', lifts.get(liftName)!, liftName) : null,
  ].filter((x): x is JourneyLine => x !== null);

  return {
    lines,
    posts: sorted.length,
    firstAt: sorted[0]?.createdAt ?? null,
    lastAt: sorted[sorted.length - 1]?.createdAt ?? null,
  };
}
