/**
 * Việc xếp hàng lúc mất mạng phải nằm trên đĩa NGAY khi nó tạm dừng — không
 * sau một giây.
 *
 * ── lỗ nó lấp (đo 30/09, TanStack Query 5.101.2) ──
 *
 * `createAsyncStoragePersister({ throttleTime: 1000 })` ghi lượt ĐẦU ngay lập
 * tức, với bản `dehydrate` chụp ở sự kiện đầu tiên — `added`, lúc mutation còn
 * `idle`. `dehydrate` chỉ giữ mutation `isPaused`, nên lượt ghi ấy KHÔNG có nó.
 * Một mili-giây sau mutation tạm dừng (`updated`), nhưng bản có nó phải chờ
 * throttle: đo trong node và trên bản web, nó lên đĩa sau ~1 000 ms. App bị
 * tắt trong giây ấy thì lần mở sau không có gì để gửi — bữa ăn vừa bấm Lưu
 * lúc mất mạng biến mất, không một câu nào.
 *
 * ── cách lấp, và điều nó KHÔNG đổi ──
 *
 * Bọc persister, không thay nó: vẫn `createAsyncStoragePersister`, vẫn cùng
 * khoá, cùng AsyncStorage, cùng hàng đợi và `registerOfflineWrites`.
 *   · Mọi sự kiện trong CÙNG một tick được gộp (setTimeout 0), nên lượt ghi đầu
 *     mang bản mới nhất — bản có mutation đã tạm dừng.
 *   · Một mutation tạm dừng MỚI (chưa có trong lượt ghi trước) thì ghi ngay ở
 *     tick kế, không chờ nhịp throttle — lần bấm thứ hai trong cùng một giây
 *     cũng không có cửa sổ nào.
 *   · Còn lại giữ đúng nhịp cũ: ghi ở mép đầu, rồi tối đa một lần mỗi
 *     `throttleMs`, luôn với bản mới nhất.
 * Mọi lượt ghi đi qua MỘT persister bên trong (throttle 0: ghi tuần tự, luôn
 * bản mới nhất nó được đưa), nên hai lượt ghi không bao giờ đảo thứ tự.
 *
 * Thuần: không React, không AsyncStorage — `tools/persist-paused.mjs` chạy thật
 * nó cùng TanStack Query thật.
 */
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

const pausedIds = (c: PersistedClient): Set<string> =>
  new Set(
    (c.clientState?.mutations ?? [])
      .filter((m) => m.state?.isPaused)
      .map((m) => JSON.stringify([m.mutationKey ?? null, m.state.submittedAt ?? 0, m.state.variables ?? null])),
  );

export function persistPausedNow(inner: Persister, throttleMs: number): Persister {
  let latest: PersistedClient | null = null;
  let written = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let due = 0;
  let nextAllowed = 0;

  const flush = () => {
    timer = null;
    const c = latest;
    latest = null;
    if (!c) return;
    written = pausedIds(c);
    nextAllowed = Date.now() + throttleMs;
    inner.persistClient(c);
  };
  const schedule = (at: number) => {
    if (timer && due <= at) return;
    if (timer) clearTimeout(timer);
    due = at;
    timer = setTimeout(flush, Math.max(0, at - Date.now()));
  };

  return {
    ...inner,
    persistClient: (client: PersistedClient): void => {
      latest = client;
      const fresh = [...pausedIds(client)].some((id) => !written.has(id));
      schedule(fresh ? Date.now() : Math.max(Date.now(), nextAllowed));
    },
  };
}
