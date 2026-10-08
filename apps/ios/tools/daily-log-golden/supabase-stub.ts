/**
 * Supabase giả trong bộ nhớ cho golden `daily-log` — CHỈ phần PostgREST mà
 * `recomputeDailyLog` gọi: select / eq / gte / lt / order / limit / single /
 * maybeSingle / insert / update(...).eq().eq().select().
 *
 * Bảng lấy từ `globalThis.__tables`; mọi truy vấn và lệnh ghi được ghi vào
 * `globalThis.__log` để golden chép lại ĐÚNG cửa sổ thời gian RN đã hỏi.
 * Cột thời điểm (có 'T') so như timestamptz — theo thời điểm, không theo chuỗi.
 */
type Row = Record<string, unknown>;
type Filter = { op: 'eq' | 'gte' | 'lt'; col: string; val: unknown };

const g = globalThis as unknown as { __tables: Record<string, Row[]>; __log: unknown[]; __failTables?: string[] };

function cmp(a: unknown, b: unknown): number {
  const sa = String(a);
  const sb = String(b);
  if (sa.includes('T') && sb.includes('T')) {
    const ta = Date.parse(sa);
    const tb = Date.parse(sb);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

class Query {
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private write: { kind: 'insert' | 'update'; row: Row } | null = null;
  private columns = '*';
  private returning = false;

  constructor(private table: string) {}

  select(cols = '*') {
    if (this.write) this.returning = true;
    else this.columns = cols;
    return this;
  }
  eq(col: string, val: unknown) { this.filters.push({ op: 'eq', col, val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ op: 'gte', col, val }); return this; }
  lt(col: string, val: unknown) { this.filters.push({ op: 'lt', col, val }); return this; }
  order(col: string, o: { ascending: boolean }) { this.orderBy = { col, asc: o.ascending }; return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  insert(row: Row) { this.write = { kind: 'insert', row }; return this; }
  update(row: Row) { this.write = { kind: 'update', row }; return this; }

  private matches(r: Row) {
    return this.filters.every((f) =>
      f.op === 'eq' ? String(r[f.col]) === String(f.val)
      : f.op === 'gte' ? cmp(r[f.col], f.val) >= 0
      : cmp(r[f.col], f.val) < 0,
    );
  }

  private run(): { data: unknown; error: { message: string; code?: string } | null } {
    const rows = (g.__tables[this.table] ??= []);
    g.__log.push({ table: this.table, columns: this.columns, filters: this.filters, order: this.orderBy, limit: this.max, mode: this.mode, write: this.write });
    if (g.__failTables?.includes(this.table)) return { data: null, error: { message: 'boom' } };
    if (this.write?.kind === 'insert') {
      rows.push({ id: `dl-${rows.length + 1}`, updated_at: '2026-01-01T00:00:00.000000+00:00', ...this.write.row });
      return { data: null, error: null };
    }
    if (this.write?.kind === 'update') {
      const hit = rows.filter((r) => this.matches(r));
      for (const r of hit) Object.assign(r, this.write.row);
      return { data: this.returning ? hit.map((r) => ({ id: r.id })) : null, error: null };
    }
    let out = rows.filter((r) => this.matches(r));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]));
    }
    if (this.max != null) out = out.slice(0, this.max);
    if (this.mode === 'single') {
      return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } };
    }
    if (this.mode === 'maybe') return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }

  then<T>(ok: (v: ReturnType<Query['run']>) => T, bad?: (e: unknown) => T) {
    try { return Promise.resolve(ok(this.run())); } catch (e) { return bad ? Promise.resolve(bad(e)) : Promise.reject(e); }
  }
}

export const supabase = { from: (table: string) => new Query(table) };
