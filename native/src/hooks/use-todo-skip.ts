import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { localDateStr } from '@/lib/local-date';
import { TODO_ORDER, type TodoKey } from '@/lib/todo';
import { onUserScopedReset } from '@/lib/user-scoped-reset';

/**
 * Việc được BỎ QUA hôm nay — và chỉ hôm nay.
 *
 * ── việc này để làm gì ──
 *
 * Thẻ "Cần làm hôm nay" luôn hỏi đủ năm việc, nên một ngày nghỉ tập vĩnh viễn
 * trông như một ngày thiếu: `4/5` mà cái thiếu ấy không có gì để làm. Người
 * không có cân ở nhà thì mỗi ngày đều thiếu đúng một việc, mãi mãi.
 *
 * Vuốt từ trái sang phải để bỏ qua. Apple để mép ấy cho một lối tắt ngữ cảnh —
 * Ghim, Đã đọc, Yêu thích — chứ không cho thao tác phá huỷ, và "bỏ việc này ra
 * khỏi hôm nay" đúng là họ hàng của "Đánh dấu đã đọc": nó lấy một dòng ra khỏi
 * danh sách phải xử lý mà không giả vờ rằng đã xử lý.
 *
 * ── vì sao nó CHỈ sống một ngày ──
 *
 * Bỏ qua là câu trả lời cho HÔM NAY, không phải một tuỳ chọn. Hôm nay nghỉ tập
 * không có nghĩa là mai cũng nghỉ, và một lần bỏ qua âm thầm thành vĩnh viễn là
 * cách chắc chắn để app thôi hỏi đúng cái đáng hỏi. Nên bản ghi mang theo NGÀY
 * của nó, và một ngày khác đọc ra là danh sách rỗng — không cần ai dọn, không
 * cần một cái hẹn lúc nửa đêm.
 *
 * Ngày lấy bằng `localDateStr()`, cùng hàm mọi chỗ khác trong app dùng, nên
 * "hôm nay" ở đây và "hôm nay" của nhật ký là một.
 *
 * ── hình kho giống hệt `use-steps-goal` và vì sao ──
 *
 * State ở phạm vi module cộng `useSyncExternalStore`: thẻ To-do, con số tiến độ
 * trên đầu thẻ và (về sau) bất cứ chỗ nào hỏi "còn việc gì" đều phải thấy CÙNG
 * một câu trả lời. Chú thích của `use-steps-goal` ghi lại lần app trả giá cho
 * việc mỗi mount giữ một bản riêng.
 *
 * `settled` tách khỏi `hydrated` vì cùng lý do đã ghi ở đó: `hydrated` nghĩa là
 * "đã BẮT ĐẦU đọc", không phải "đã có giá trị". Thẻ chờ `settled` rồi mới vẽ
 * con số, nếu không thì trong khoảnh khắc trước khi đĩa trả lời, một việc đã bỏ
 * qua vẫn hiện ra là việc phải làm — và nó sẽ nhấp nháy đúng một nhịp.
 */

const STORAGE_KEY = 'ascnd-todo-skip';

type Stored = { date: string; keys: TodoKey[] };

let state: TodoKey[] = [];
let stateDate = localDateStr();
const listeners = new Set<() => void>();
let hydrated = false;
let settled = false;

function emit() {
  listeners.forEach((l) => l());
}

/** Bản ghi chỉ có giá trị cho đúng ngày nó mang theo. */
function keysFor(today: string): TodoKey[] {
  return stateDate === today ? state : [];
}

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Stored;
      /* Lọc qua `TODO_ORDER` chứ không tin đĩa: một khoá đã bị gỡ khỏi app vẫn
         nằm lại trong tệp cũ, và nó sẽ trừ vào mẫu số cho một dòng không còn
         được vẽ ra — tức `4/4` trong khi trên màn hình có năm dòng. */
      if (typeof parsed?.date === 'string' && Array.isArray(parsed.keys)) {
        stateDate = parsed.date;
        state = parsed.keys.filter((k): k is TodoKey => TODO_ORDER.includes(k));
      }
    }
  } catch {
    /* giữ danh sách rỗng — không bỏ qua gì cả là mặc định an toàn: app hỏi
       thừa một câu còn hơn im lặng về một việc người ta chưa làm */
  } finally {
    settled = true;
    emit();
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Chuỗi khoá, KHÔNG phải mảng.
 *
 * `useSyncExternalStore` so kết quả của `getSnapshot` bằng `Object.is`, nên trả
 * về một mảng mới mỗi lần gọi là một vòng render vô tận. Một chuỗi thì bằng
 * nhau khi nội dung bằng nhau.
 */
function snapshot(): string {
  return settled ? `${stateDate}|${state.join(',')}` : '';
}

onUserScopedReset(() => {
  state = [];
  stateDate = localDateStr();
  hydrated = false;
  settled = false;
  emit();
});

export function useTodoSkip() {
  const snap = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    void hydrate();
  }, []);

  const today = localDateStr();
  const skipped = snap ? keysFor(today) : [];

  return {
    /** Đã đọc xong đĩa chưa — thẻ chờ cái này rồi mới đếm. */
    ready: settled,
    skipped,
    /** Bỏ qua, hoặc lấy lại. Cùng một cú vuốt, nên cùng một hàm. */
    toggle(key: TodoKey) {
      const now = localDateStr();
      const current = keysFor(now);
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      state = next;
      stateDate = now;
      emit();
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ date: now, keys: next } satisfies Stored)).catch(
        () => {
          /* Ghi hỏng thì màn hình vẫn đúng cho phiên này. Mất một lượt bỏ qua
             khi mở lại app là hỏi thừa một câu, không phải mất dữ liệu. */
        },
      );
    },
  };
}
