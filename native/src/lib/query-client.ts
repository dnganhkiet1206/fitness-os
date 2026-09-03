import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, onlineManager } from '@tanstack/react-query';

import { isUsable, registerBusyProbe, startNetWatch } from '@/lib/net-status';
import { registerOfflineWrites } from '@/lib/offline-write';
import { resetPersonalModel } from '@/lib/personal-model';
import { runUserScopedResets } from '@/lib/user-scoped-reset';

/**
 * Offline-aware React Query client.
 *
 * - onlineManager is wired to NetInfo so queries pause while offline and
 *   refetch automatically on reconnect (React Native has no built-in
 *   connectivity signal).
 * - The cache is persisted to AsyncStorage (see asyncStoragePersister), so
 *   the last-seen data is shown instantly on launch and while offline.
 */

/*
  Có mạng hay không được quyết định ở MỘT chỗ: `isUsable` trong `net-status.ts`.

  Dòng cũ ở đây là `setOnline(state.isConnected !== false)`, và nó bỏ qua hẳn
  `isInternetReachable` — nên Wi-Fi quán cà phê chưa bấm đồng ý điều khoản đọc
  ra là ONLINE. Xem đoạn dài trong `net-status.ts` về vì sao đó không phải ca
  hiếm mà là dạng mất mạng phổ biến nhất trên điện thoại, và vì sao nó làm
  `offlineNow()` cho phép app vẽ ra những con số chưa hề được gửi đi.
*/
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(isUsable(state));
  }),
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep entries a full day so the persisted cache is useful offline
      gcTime: 1000 * 60 * 60 * 24,
      staleTime: 1000 * 60, // 1 min: serve cache first, refresh in background
      retry: 2,
      refetchOnReconnect: true,
    },
  },
});

/*
  Taught before anything is restored.

  Module scope on purpose: `PersistQueryClientProvider` reads the cache back as
  soon as it mounts, and a paused mutation that returns before its default
  function exists is discarded. Registering inside a component would be a race
  whose losing side looks like a write that was never made.
*/
registerOfflineWrites(queryClient);

/*
  Cùng lý do module-scope như dòng ngay trên, và phải nằm SAU `queryClient`:
  hai lệnh này đọc nó thật.

  Chiều phụ thuộc chỉ có một — query-client → net-status. Chiều ngược lại là
  hàm được ĐƯA VÀO chứ không phải import, nên "đã tải xong phần đã lỡ chưa" trả
  lời được mà không sinh ra một vòng import ở tầng chạy.
*/
registerBusyProbe(() => queryClient.isFetching() > 0);
startNetWatch();

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'ascnd_rq_cache',
  throttleTime: 1000,
});

/**
 * Bump when the cache shape changes to invalidate old persisted data.
 *
 * ── v2, và vì sao ──
 *
 * `use-mascot-room.ts` từng trả về `claimed: new Set(...)`. Cache này đi qua
 * JSON.stringify, và một `Set` serialize thành `{}` — nên mọi máy đã chạy bản
 * cũ đang giữ trên đĩa một `claimed` là OBJECT RỖNG.
 *
 * Sửa nguồn thành mảng là đúng nhưng chưa đủ: dữ liệu cũ vẫn được hydrate lại
 * và `{}` thì không phải `undefined`, nên `?? []` không cứu được và
 * `new Set({})` ném "iterator method is not callable" — vẫn ngay trong Mascot,
 * vẫn trên màn hình đầu tiên. Đó chính xác là việc mà con số này tồn tại để
 * làm: hình dạng cache đã đổi, nên bản cũ phải bị bỏ đi chứ không phải được
 * đọc lại.
 *
 * Bump là cách dọn MỘT LẦN. Nó không thay cho việc đọc phòng thủ ở chỗ dùng —
 * xem `use-daily-quests.ts` — vì một giá trị hỏng có thể tới từ nơi khác, và
 * repo này đã ghi cùng một luật cho `personal-model` và cho ngân sách xuất
 * hiện: "một mô hình lưu HỎNG không còn thành mô hình đang chạy".
 */
export const CACHE_BUSTER = 'v2';

/** Drop the in-memory + persisted cache — call on sign-out to avoid leaking
 *  one user's data into the next session. */
export async function clearPersistedCache() {
  queryClient.clear();
  try {
    await AsyncStorage.removeItem('ascnd_rq_cache');
  } catch {
    // ignore
  }
}

/**
 * Everything on this device that belongs to the person, rather than to the
 * device.
 *
 * ── what sign-out used to leave behind ──
 *
 * `clearPersistedCache()` above removes exactly one key. Sixteen others were
 * left in place, and three of them are not merely stale — they make the app
 * behave incorrectly for whoever signs in next:
 *
 *   · **`ascnd_personal_model_v1`** — the learned daily rhythm and the bandit
 *     state. Koa asks person B at person A's training hour, having "learned" it
 *     from somebody else's weeks.
 *   · **`ascnd_reminder_plan`** — the signature of the notification schedule
 *     last written to the OS. `use-reminders.ts` exits early when the signature
 *     matches, so if B's plan hashes to the same string as A's, **no reminder
 *     is ever scheduled again**, permanently, while the settings screen shows
 *     them all switched on.
 *   · **`ascnd-weight-goal-kg`**, **`ascnd-steps-goal`** — A's targets drawn on
 *     B's charts.
 *
 * ── and what is deliberately kept ──
 *
 * Language, units and the app lock belong to the handset, not the account.
 * Wiping them would reset somebody's phone to English and kilograms because a
 * second person borrowed it, which is a worse bug than the one being fixed.
 *
 * The list is explicit rather than a prefix sweep of `ascnd*`. A sweep would
 * quietly take the device preferences with it the day somebody renames one, and
 * — being invisible — would take any future key too, including ones that ought
 * to survive. A name that has to be added by hand is a decision somebody makes
 * once; a sweep is a decision nobody ever makes.
 */
const DEVICE_KEYS = [
  'ascnd_lang',
  'ascnd-volume-unit',
  'ascnd_app_lock',
  /* Sáng/tối là cách người này muốn nhìn CÁI MÁY NÀY, không phải một trường
     trong hồ sơ. Cùng lý do như ngôn ngữ và đơn vị ngay trên: cho mượn máy
     đăng nhập một lần không được làm chủ máy nhận lại máy ở một theme khác. */
  'ascnd_theme',
  /* Nhật ký sự cố ghi lại điều CÁI MÁY NÀY đã làm, không phải điều người dùng
     đã làm — nó không chứa dữ liệu tài khoản nào, và cái sự cố xảy ra hôm qua
     vẫn còn đáng đọc sau khi đăng xuất. Xoá theo tài khoản là vứt đúng thứ mà
     lần mở app sau cần để nói ra chuyện gì đã xảy ra. */
  'ascnd_crash_log',
];

const USER_KEYS = [
  'ascnd_reminder_plan',
  'ascnd_reminders',
  'ascnd-weight-goal-kg',
  'ascnd-steps-goal',
  'ascnd-help-nudge',
  'ascnd-widget-config',
  /* Cả hai phiên bản: khoá cũ vẫn nằm trên máy của người đã cài bản trước, và
     đăng xuất mà để lại nó là để lại số đo của người này cho người sau. Xoá một
     khoá không tồn tại là vô hại. */
  'ascnd-widget-heights',
  'ascnd-widget-heights-v2',
  'ascnd_mascot_enabled',
  'ascnd_mascot_companion',
  'ascnd_mascot_selected',
  'ascnd_mascot_seen_unlocked',
  'ascnd_test_mascot_inventory',
  'ascnd_test_mascot_tx',
  'health:lastAutoSync',
];

export async function clearUserScopedStorage() {
  /* One at a time, each guarded. The batch API is spelled differently across
     versions of this library (`multiRemove` in older ones, `removeMany` in the
     installed one) and `removeItem` is the call that has never moved. It also
     means one key that refuses to delete cannot take the other twelve with it —
     a half-cleared sign-out is the failure this whole function is about. */
  for (const key of USER_KEYS) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // keep going; a stale preference is better than a stale everything
    }
  }
  /* Module-scope state, which no `removeItem` can reach — see
     `resetPersonalModel`. */
  await resetPersonalModel();
  /*
    And the other five stores of the same shape, which this line used to miss.

    Five of the keys above are read once per launch into a module-scope `let`
    behind a `hydrated` latch. Deleting the key left the value live in memory
    *and* stopped the next account from ever reading its own, so the list above
    was doing none of what the comment beneath it claims for
    `ascnd-weight-goal-kg` and `ascnd-steps-goal`: with real modules and real
    storage, B signed in and saw A's 15 000-step goal and A's 62.5 kg target
    with AsyncStorage completely empty.

    They live in `hooks/`, and `lib/` may not import upwards, so each registers
    its own reset instead — see `lib/user-scoped-reset.ts`.
  */
  runUserScopedResets();
}

/** Exported for `tools/signed-out.mjs`, which checks the two lists cover every
 *  key the app actually writes and that they never overlap. */
export const STORAGE_KEYS = { device: DEVICE_KEYS, user: USER_KEYS };
