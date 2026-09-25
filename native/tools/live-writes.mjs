/**
 * Thế giới giả NHỚ lệnh ghi, trong phạm vi một trang (#52).
 *
 * ── vì sao ──
 *
 * Trước #52 máy chủ giả của `live.mjs` trả lời `POST`/`PATCH`/`DELETE` bằng
 * những hàng khớp bộ lọc, và `FIXTURES` không đổi. Tham gia thử thách rồi đọc
 * lại tổng quan vẫn ra `joined: false`; thích rồi đọc lại vẫn ra số cũ. Mọi
 * luồng "ghi → thấy thay đổi" nằm ngoài tầm đo, và vế #27 phải dựa vào nhãn
 * "trở về" thay vì đo "đã đổi".
 *
 * ── làm gì ──
 *
 * Mỗi trang có một BẢN SAO thế giới (`structuredClone`), và lệnh ghi áp vào bản
 * sao ấy — trang sau không thấy lệnh ghi của trang trước, nên thứ tự kịch bản
 * không đổi được kết quả của nhau.
 *
 *   POST    thêm hàng; cột vắng lấy DEFAULT đọc từ migration (`now()`,
 *           `gen_random_uuid()`, `auth.uid()`, hằng số). Trùng khoá chính hay
 *           UNIQUE → 409 / `23505` như Postgres; `Prefer: resolution=merge-
 *           duplicates` (upsert) thì gộp, `ignore-duplicates` thì bỏ qua.
 *   PATCH   gộp thân vào mọi hàng khớp bộ lọc.
 *   DELETE  bỏ mọi hàng khớp bộ lọc.
 *
 * Trả về như PostgREST: có `select=` thì trả các hàng bị chạm (một object nếu
 * `Accept` đòi một), không thì 201/204 rỗng.
 *
 * ── điều KHÔNG làm, và nói ra ──
 *
 * `applyQuery` chỉ hiểu `eq`/`neq`/`in`/`is`. Một lệnh ghi có bộ lọc khác
 * (`gte`, `lt`, `like`, `or=`…) mà áp thẳng thì sẽ chạm QUÁ NHIỀU hàng — xoá
 * cả bảng vì bộ lọc ngày bị bỏ qua. Nên lệnh ấy KHÔNG được áp: nó được trả lời
 * như trước #52 (hàng khớp, thế giới không đổi) và được liệt kê cuối lượt, để
 * "không nhớ" không lặng lẽ thành "nhớ sai".
 */
import { randomUUID } from 'node:crypto';

import { readSchema } from './fixture-integrity.mjs';
import { UID, applyQuery } from './live-world.mjs';

export const SCHEMA = readSchema();

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const KNOWN_OPS = new Set(['eq', 'neq', 'in', 'is']);

/** Tham số lọc của URL mà `applyQuery` KHÔNG hiểu (tức áp lệnh ghi theo nó là đoán). */
export function unsupportedFilters(url) {
  const out = [];
  for (const [k, v] of url.searchParams) {
    if (RESERVED.has(k)) continue;
    if (k === 'or' || k === 'and' || k.includes('.')) {
      out.push(`${k}=${v}`);
      continue;
    }
    const op = v.replace(/^not\./, '').split('.')[0];
    if (!KNOWN_OPS.has(op)) out.push(`${k}=${v}`);
  }
  return out;
}

function withDefaults(table, row) {
  const d = SCHEMA[table]?.defaults ?? {};
  const out = { ...row };
  for (const [col, def] of Object.entries(d)) {
    if (out[col] !== undefined) continue;
    if (def.now) out[col] = new Date().toISOString();
    else if (def.uuid) out[col] = randomUUID();
    else if (def.uid) out[col] = UID;
    else out[col] = def.value;
  }
  return out;
}

const sameKey = (a, b, cols) => cols.every((c) => a[c] != null && b[c] != null && String(a[c]) === String(b[c]));

/**
 * Áp một lệnh ghi vào `world` (tại chỗ). Trả `{ status, body, applied }`, hoặc
 * `null` khi không phải lệnh ghi. `applied: false` nghĩa là lệnh ấy KHÔNG được
 * áp (bộ lọc không hiểu) và câu trả lời là kiểu cũ.
 */
export function applyWrite(world, table, method, url, bodyText, headers = {}) {
  if (!['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) return null;
  const rows = (world[table] ??= []);
  const wantsRows = url.searchParams.has('select');
  const one = (headers.accept ?? '').includes('vnd.pgrst.object');
  const reply = (touched, status) =>
    wantsRows
      ? { status: status === 204 ? 200 : status, body: JSON.stringify(one ? (touched[0] ?? null) : touched), applied: true }
      : { status, body: '', applied: true };

  if (method === 'POST' || method === 'PUT') {
    let incoming;
    try {
      incoming = JSON.parse(bodyText || 'null');
    } catch {
      return { status: 400, body: JSON.stringify({ code: 'PGRST102', message: 'Empty or invalid json' }), applied: true };
    }
    const list = (Array.isArray(incoming) ? incoming : [incoming]).filter((r) => r && typeof r === 'object');
    const prefer = headers.prefer ?? '';
    const merge = /resolution=merge-duplicates/.test(prefer) || method === 'PUT';
    const ignore = /resolution=ignore-duplicates/.test(prefer);
    const s = SCHEMA[table];
    /*
      Mục tiêu xung đột: `on_conflict=` nếu có, không thì khoá chính — đúng như
      PostgREST dựng `ON CONFLICT (…)`. Upsert/bỏ qua chỉ xử lý ĐÚNG ràng buộc
      ấy; trùng một ràng buộc KHÁC vẫn là 23505, như Postgres (#80). Chèn thường
      thì trùng bất kỳ khoá nào cũng là 23505.
    */
    const target = url.searchParams.get('on_conflict')?.split(',').map((c) => c.trim()) ?? s?.pk ?? ['id'];
    const allKeys = [s?.pk ?? ['id'], ...(s?.uniques ?? [])];
    const sameCols = (a, b) => a.length === b.length && a.every((c) => b.includes(c));
    const others = allKeys.filter((k) => !sameCols(k, target));
    const conflict = () => ({
      status: 409,
      body: JSON.stringify({ code: '23505', details: null, hint: null, message: `duplicate key value violates unique constraint on ${table}` }),
      applied: true,
    });
    /*
      NGUYÊN TỬ (#80): cả lô được xét trên một bản nháp, và thế giới chỉ đổi khi
      không hàng nào lỗi — Postgres huỷ cả câu lệnh, không giữ lại nửa lô. Bản
      đầu đẩy từng hàng vào `rows` rồi mới gặp trùng: `[a, b]` với `b` trùng trả
      409 mà `a` vẫn vào (A tái hiện ở #80).
    */
    const added = [];
    const merges = [];
    const touched = [];
    for (const raw of list) {
      const row = withDefaults(table, raw);
      const pool = [...rows, ...added];
      const hit = pool.find((r) => sameKey(r, row, target));
      const clash = others.map((cols) => pool.find((r) => r !== hit && sameKey(r, row, cols))).find(Boolean);
      if ((merge || ignore) && hit) {
        if (clash) return conflict();
        /* Hai hàng CÙNG lô trùng nhau: Postgres "ON CONFLICT DO UPDATE command cannot
           affect row a second time" (21000); DO NOTHING thì bỏ qua hàng sau. */
        if (added.includes(hit) || merges.some(([h]) => h === hit)) {
          if (ignore) continue;
          return { status: 500, body: JSON.stringify({ code: '21000', details: null, hint: null, message: 'ON CONFLICT DO UPDATE command cannot affect row a second time' }), applied: true };
        }
        if (ignore) continue;
        merges.push([hit, raw]);
        continue;
      }
      if (hit || clash) return conflict();
      added.push(row);
    }
    for (const [hit, raw] of merges) {
      Object.assign(hit, raw);
      touched.push(hit);
    }
    for (const row of added) {
      rows.push(row);
      touched.push(row);
    }
    return reply(touched, 201);
  }

  if (unsupportedFilters(url).length) {
    return { status: 200, body: JSON.stringify(applyQuery(rows, url)), applied: false };
  }
  const matched = applyQuery(rows, url);
  if (method === 'PATCH') {
    let patch = {};
    try {
      patch = JSON.parse(bodyText || '{}');
    } catch { /* thân rỗng */ }
    for (const r of matched) Object.assign(r, patch);
    return reply(matched, 204);
  }
  /* DELETE */
  const gone = new Set(matched);
  world[table] = rows.filter((r) => !gone.has(r));
  return reply(matched, 204);
}
