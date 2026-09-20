import * as Haptics from 'expo-haptics';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type {
  SwipeableMethods,
  SwipeDirection,
} from 'react-native-gesture-handler/lib/typescript/components/ReanimatedSwipeable/ReanimatedSwipeableProps';
import type { LucideIcon } from 'lucide-react-native';
import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import {
  Alert,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { radius, spacing, type } from '@/constants/ascnd';
import { BOUNCE, spring, SWIPE_SNAP } from '@/constants/motion';
import { alpha, makeStyles } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';

/**
 * A row you can swipe, with the actions growing out from under it.
 *
 * ── what makes the iOS one feel the way it does ──
 *
 * Four things, and none of them is the easing curve:
 *
 *   · **It tracks the finger.** Not "animates to a state on release" — the
 *     action is exactly as far open as you have dragged, on every frame. That
 *     is why `renderRightActions` is handed Reanimated shared values rather
 *     than a React number: the button's size is computed on the UI thread from
 *     the same drag the row is following, so the two can never lag apart.
 *   · **It commits before you let go.** Past the threshold the row is going to
 *     open whatever you do next, and it says so — the label appears and a tick
 *     of haptic fires. The reference material puts the same rule on the haptic:
 *     fire it on the causal event, on the same frame as the visual.
 *   · **A little hysteresis.** About ten points of movement before the gesture
 *     commits to a direction, so a vertical scroll that wanders sideways does
 *     not peel rows open on the way past.
 *   · **The row itself changes shape.** Dragged open it rounds its corners and
 *     reads as a card that has been pulled aside, not as a strip of list that
 *     slid. Chủ dự án chỉ đúng chi tiết này trong ảnh Nhắc nhở của iOS.
 *
 * ── why this wraps `ReanimatedSwipeable` instead of a pan handler ──
 *
 * The physics — friction, overshoot, the release decision, the interaction with
 * a scrolling parent — is the hard part and `react-native-gesture-handler` 2.32
 * already ships it, tested, with exactly the knobs above. Writing a
 * `Gesture.Pan()` version means reimplementing a scroll conflict resolver, and
 * this repository has spent whole sessions removing second implementations of
 * things it already had.
 *
 * What is ours is the presentation, and one thing the library does NOT have:
 * kéo dài ra để làm luôn, không cần bấm nút. Xem `FULL_SWIPE_AT`.
 *
 * ── a swipe is never the only way ──
 *
 * `today-meals.tsx` argued this and was right: "Not a swipe and not a
 * long-press. Both are invisible until guessed." So every action reachable by
 * swiping here is also on a button somewhere the eye can find it, and every one
 * of them is an `accessibilityAction` as well — VoiceOver never "sees" a
 * gesture. Xem `tools/swipe.mjs`.
 */

/**
 * Bề rộng một nút, và hình học bên trong nó.
 *
 * ── bản trước sai ở đâu ──
 *
 * Nút cũ là một viên thuốc CAO BẰNG CẢ HÀNG (`flex: 1`, `alignSelf: stretch`)
 * với icon và chữ chồng lên nhau ở giữa. Trên máy thật nó đọc ra là một khối
 * đen to bằng cả dòng, và chủ dự án gửi ảnh Nhắc nhở của iOS kèm yêu cầu: "icon
 * phải nhỏ hơn thẻ và chữ xuất hiện bên dưới icon", "các nút tách ra".
 *
 * Trong ảnh ấy mỗi nút là một ô VUÔNG bo góc chỉ chứa icon, icon nhỏ hơn ô khá
 * nhiều, và CHỮ nằm bên dưới ô chứ không nằm trong. Ba ô cách nhau rõ ràng.
 *
 * Các con số dưới đây đọc ra từ ảnh ấy bằng MẮT, không phải bằng phép đo pixel
 * — ảnh không nằm trên đĩa để đo. Tỉ lệ icon/ô ≈ 20/46, tức icon chiếm chưa
 * tới một nửa bề ngang ô, đúng cái làm nó "nhỏ hơn thẻ".
 */
/**
 * Viên nang cao ĐÚNG BẰNG nút "Ghi" của hàng, và đó là số học chứ không phải
 * thẩm mỹ.
 *
 * Hàng To-do cao 52 (ô icon 44 + đệm 4 hai bên). Nút "Ghi" cao 44, căn giữa,
 * nên tâm nó ở 26. Một cột "viên nang + khe + dòng chữ" cao 51 căn giữa trong
 * 52 sẽ đặt tâm viên nang ở 17,5 — LỆCH 8,5 điểm so với nút "Ghi" ngay cạnh.
 * Chạy phép tính ấy ra hai lối, và chỉ hai:
 *
 *     bỏ dòng chữ, viên nang 44   → lệch 0,0
 *     giữ dòng chữ, thẳng hàng    → hàng phải cao 69 thay vì 52
 *
 * Chủ dự án đã chốt "thẻ giữ nguyên kích thước mặc định", nên lối thứ hai bị
 * loại bởi chính ràng buộc ấy: 17 điểm × năm hàng là 85 điểm thẻ dài thêm.
 *
 * Dòng chữ vì thế đi, và nó không mất nghĩa: `label` vẫn là thứ VoiceOver đọc
 * và vẫn là tên của accessibility action. Cái mất là một từ in ra; cái được là
 * hai nút nằm đúng một đường với nút của hàng — thứ chủ dự án gọi là "cùng hình
 * dạng với nút ghi", và là chỗ ảnh chụp máy thật cho thấy còn lệch.
 */
const CAPSULE_H = 44;
const CAPSULE_ICON = 20;
/** Nút + khe + dòng chữ. Hai nút là 144 điểm trên một màn 393. */
const OPEN_W = 72;
/** Viên nang hẹp hơn cột, nên hai nút tách rời chứ không dính thành một dải. */
const CAPSULE_W = OPEN_W - 12;
/**
 * Mép trái viên nang, tính từ mép cột.
 *
 * Là một hằng riêng vì nó làm hai việc: căn giữa viên nang trong cột khi chưa
 * nở, và làm ĐIỂM NEO khi nở. Xem `swell`.
 */
const CAPSULE_INSET = (OPEN_W - CAPSULE_W) / 2;
/**
 * Chiều cao NHÌN THẤY của cả nút: viên nang + khe + dòng chữ.
 *
 * Đây mới là đích chạm, không phải riêng viên nang — cả cột `OPEN_W` đều bấm
 * được, nên vùng chạm là 72 × 51. Trên sàn 44 của Apple HIG và WCAG 2.5.5 ở cả
 * hai chiều, và nó là vùng NHÌN THẤY chứ không phải một `hitSlop` vô hình.
 */
/** Cột nút CHÍNH LÀ viên nang: không còn gì nằm dưới nó. */
const ACTION_H = CAPSULE_H;

/**
 * Where the action commits.
 *
 * Under this and letting go springs the row shut; over it and the row opens.
 * Two thirds rather than a half, so a flick that was really a scroll does not
 * leave a row hanging open; and well under the full width, so there is a moment
 * where you have decided but not finished — that is the moment the haptic and
 * the label are for.
 *
 * ── "hai phần ba" của CÁI GÌ ──
 *
 * Của quãng mở THẬT, và quãng ấy là `OPEN_W × số nút` — tấm nút rộng đúng thế
 * (`actionWrap` là `width: OPEN_W`, một cột mỗi nút). Một hằng số đơn thì chỉ
 * đúng ở hàng MỘT nút:
 *
 *     1 nút   47,5 / 72   = 66%   ← đúng câu trên
 *     2 nút   47,5 / 144  = 33%
 *     3 nút   47,5 / 216  = 22%
 *
 * Tức hàng càng nhiều nút càng dễ bị mở nhầm, mà nó lại là hàng mở ra xa nhất.
 * Thẻ "Cần làm hôm nay" có cả hai loại trên cùng một màn, nên hai hàng cạnh
 * nhau cam kết ở hai tỉ lệ khác hẳn nhau.
 *
 * `friction` là 1 nên ngưỡng này đọc thẳng ra quãng NGÓN TAY: `handleRelease`
 * so nó với `userDrag / friction`.
 */
const COMMIT_FRACTION = 0.66;
const commitAt = (count: number) => OPEN_W * Math.max(count, 1) * COMMIT_FRACTION;

/** Movement before the gesture takes the row, so a scroll can drift. */
const HYSTERESIS = 10;

/** Tấm nút đi chậm hơn hàng bao nhiêu phần một cột. Xem `stack`. */
const PARALLAX = 0.6;

/**
 * Cuộc BÀN GIAO giữa nút của hàng và nút vuốt, bằng MỘT cặp số dùng chung.
 *
 * Nút "Ghi" của thẻ To-do nhường chỗ bằng `opacity 1 → 0` và
 * `scale 1 → HANDOVER_SCALE` trong khoảng `[0, HANDOVER_AT]` của độ mở; nút
 * vuốt làm đúng phép ấy ĐẢO CHIỀU trong đúng khoảng ấy. Hai bên đọc chung hai
 * hằng số này chứ không chép, nên chúng không thể lệch nhau — mà lệch nhau thì
 * có một quãng hai nút cùng hiện, hoặc một quãng không nút nào.
 *
 * `0,55` chứ không `1`: cuộc bàn giao phải XONG trước khi hàng tới nơi. Chạy
 * tới 1 thì nút vuốt còn nhạt và còn nhỏ hơn chỗ nó chiếm ở gần hết quãng kéo,
 * và đó đúng là bản chủ dự án đã bác — "trong quá trình di chuyển nút bị mờ".
 */
export const HANDOVER_AT = 0.55;
export const HANDOVER_SCALE = 0.82;

/**
 * Hàng ĐỤC hẳn ở bao nhiêu phần trăm cú kéo — và vì sao nó nhỏ.
 *
 * Mặt hàng chạy từ trong suốt (lúc nghỉ, để mặt thẻ hiện thẳng qua và không
 * sinh dải) tới đặc. Trong lúc nó còn dở dang thì viên nút phía sau — tấm nút
 * là `absoluteFill` NGAY SAU hàng — hiện xuyên qua.
 *
 * Rò tại vị trí `p` là `(1 − p/LIFT_AT) × (p/HANDOVER_AT)`: vế đầu là phần hàng
 * còn trong suốt, vế sau là độ hiện của viên nút. Cực đại ở `p = LIFT_AT/2`,
 * bằng `LIFT_AT / (2·HANDOVER_AT)`:
 *
 *     LIFT_AT   rò lớn nhất (mô hình)   quãng ngón tay để đục hẳn
 *     0,08      7,3%                    5,8 điểm
 *     0,12      10,9%                   8,6 điểm     ← bản này
 *     0,20      18,2%                   14,4 điểm
 *     0,30      27,3%                   21,6 điểm
 *
 * Xuống dưới nữa thì nó thôi là một cú chuyển và thành một cú nhảy.
 *
 * ĐO trên bản dựng thì rò lớn nhất là **5,3%**, ở lúc hàng mới dịch 5 điểm —
 * bằng nửa mô hình. Mô hình coi mặt hàng và ngón tay đi cùng nhịp, còn thật ra
 * mặt hàng chạy theo `openness`, vốn LÙI sau ngón tay đúng 10 điểm nhận diện
 * (`HYSTERESIS`), nên lúc viên nút bắt đầu hiện thì mặt hàng đã đục sẵn một
 * phần. Bảng trên vì thế là cận TRÊN, và nó được giữ lại đúng vì thế.
 *
 *     hàng dịch   đục mặt hàng   nút hiện   rò
 *      1 điểm      0,12           0,03      2,2%
 *      3 điểm      0,35           0,08      4,9%
 *      5 điểm      0,58           0,13      5,3%   ← đỉnh
 *      7 điểm      0,81           0,18      3,4%
 *      9 điểm      1              0,23      0%
 */
const LIFT_AT = 0.12;

/**
 * Cú hích của cái nhún lúc hàng tới nơi.
 *
 * 6% trên một viên nang 60 điểm là 3,6 điểm — thấy được mà không chồm sang ô
 * bên cạnh, vốn chỉ cách nó `CAPSULE_INSET × 2` = 12 điểm.
 */
const POP_KICK = 1.06;

/**
 * Kéo quá đây là LÀM LUÔN, không cần bấm nút.
 *
 * ── vì sao phải tự dựng ──
 *
 * `UISwipeActionsConfiguration` của iOS có `performsFirstActionWithFullSwipe`,
 * và SwiftUI có `allowsFullSwipe`. `ReanimatedSwipeable` 2.32 thì KHÔNG —
 * đọc hết `ReanimatedSwipeableProps.d.ts` của đúng bản đang cài: có `friction`,
 * `leftThreshold`, `overshootLeft`, `overshootFriction`, các callback mở/đóng,
 * và `swipeableMethods` ({ close, openLeft, openRight, reset }). Không có cờ
 * nào cho cú kéo dài.
 *
 * Nên nó được ghép từ những thứ có: cho phép kéo quá bề rộng nút
 * (`overshootLeft`) với ma sát 8 để nó nặng dần lên như của Apple; theo dõi
 * `translation` — thứ thư viện đưa thẳng vào hàm dựng nút — và khi nó vượt
 * `FULL_SWIPE_AT` thì bật cờ cùng một tiếng haptic NẶNG hơn tiếng cam kết
 * thường, để ngón tay biết mình vừa bước qua một ngưỡng khác. Lúc thả,
 * `onSwipeableWillOpen` đọc cờ ấy, chạy hành động đầu tiên rồi `close()`.
 *
 * 0,45 chứ không phải 0,5: ngón cái với tới giữa màn là hết tầm thoải mái, và
 * một ngưỡng người ta phải rướn mới qua được thì không ai dùng lần thứ hai.
 */
const FULL_SWIPE_AT = 0.45;

/**
 * Một hành động vuốt.
 *
 * Là một KIỂU chứ không phải bốn prop rời, vì một hàng mở ra được nhiều nút mỗi
 * bên — thẻ "Cần làm hôm nay" đòi ba nút ở mép phải (sửa lại, hẹn giờ, bật/tắt
 * nhắc) và một nút ở mép trái.
 */
export type SwipeAction = {
  icon: LucideIcon;
  /**
   * Luôn phải có, kể cả khi KHÔNG vẽ ra.
   *
   * Nó là thứ VoiceOver đọc và là tên của accessibility action, nên một nút chỉ
   * có glyph vẫn phải khai. `glyphOnly` chỉ quyết định có in chữ ấy ra hay
   * không, chứ không quyết định nó có tồn tại hay không.
   */
  label: string;
  tint?: string;
  /**
   * Màu mực trên ô, khi mặc định không đúng.
   *
   * Mặc định là `primaryForeground`, và nó ĐẢO giữa hai diện mạo: trắng ở bản
   * sáng, gần đen ở bản tối. Với chữ trên nền đỏ điều đó đúng (5,78:1 bản tối).
   * Nhưng chủ dự án đặt hàng nút bỏ qua là "một dấu trừ màu TRẮNG nền đỏ", và
   * trắng ở cả hai diện mạo thì token đúng là `destructiveForeground` — thứ vốn
   * sinh ra cho mực trên mặt đỏ. Đo: 4,96:1 bản sáng · 3,48:1 bản tối, trên sàn
   * 3:1 của WCAG 1.4.11 cho một vật thể đồ hoạ mang nghĩa.
   */
  ink?: string;
  /**
   * Hỏi lại trước khi làm, bằng hộp thoại của HỆ ĐIỀU HÀNH.
   *
   * Chỉ dùng cho cú KÉO DÀI: bấm thẳng vào nút là một hành động có chủ đích và
   * hỏi lại ở đó chỉ làm phiền. Cú kéo dài thì khác — nó bắt đầu giống hệt một
   * cú vuốt thường và chỉ khác ở chỗ ngón tay dừng lại, nên nó là cú dễ lỡ tay
   * nhất trong cả bộ cử chỉ. Đó cũng là cách Nhắc nhở của iOS làm: kéo hết cỡ
   * rồi thả ra thì hàng ĐỨNG YÊN ở chỗ đã kéo và một hộp thoại hệ thống hỏi
   * lại, chứ không làm luôn.
   *
   * `Alert.alert` là hộp thoại thật của hệ điều hành, không phải một tấm tự vẽ.
   */
  confirm?: { title: string; message?: string; ok: string };
  onPress: () => void;
};

/**
 * Bao nhiêu nút là quá nhiều.
 *
 * Apple để tối đa 3–4 nút mỗi mép. Ở đây chốt 3: mỗi nút rộng `OPEN_W`, nên ba
 * nút đã chiếm 216 điểm trên một màn 393 — hàng chỉ còn ~177 điểm để nhìn thấy
 * mình là hàng nào. Nút thứ tư biến cú vuốt thành một thực đơn.
 */
const MAX_ACTIONS = 3;

/**
 * Hàng nào đang mở — đúng MỘT, trên toàn app.
 *
 * Chủ dự án: "khi một thẻ đang được kéo, khi kéo một thẻ khác thì thẻ đã được
 * kéo tự động thu về". Đó là cách iOS làm và `ReanimatedSwipeable` không làm:
 * mỗi hàng là một component độc lập, không hàng nào biết hàng khác tồn tại, nên
 * ba hàng mở cùng lúc là chuyện bình thường với nó — và trên máy thật chủ dự án
 * chụp được đúng cảnh ấy.
 *
 * Một biến ở phạm vi module là chỗ đúng: "đang mở" là một sự thật của CẢ MÀN
 * chứ không của một hàng, y như cách `use-steps-goal` giữ mục tiêu bước chân.
 * Không cần context, vì không có gì phải render lại — chỉ cần gọi `close()` lên
 * cái cũ.
 */
let openRow: SwipeableMethods | null = null;

/**
 * Thu hàng đang mở về, vì người dùng vừa làm một việc KHÁC.
 *
 * ── đây là vế còn thiếu của cùng một luật ──
 *
 * `openRow` ở trên mới giải nửa bài: mở hàng B thì hàng A thu về. Nửa còn lại
 * là mọi thao tác KHÔNG PHẢI mở một hàng khác — cuộn trang, rời màn — và chủ
 * dự án chụp đúng cảnh ấy: hai nút còn nằm đó sau khi đã cuộn đi.
 *
 * iOS điều phối cả ba vế trong một chỗ (`swipeActionsContainer()` của SwiftUI):
 * mỗi lần chỉ một hàng mở, cuộn thì thu về, chạm ra ngoài hàng thì thu về.
 * UIKit thì đặt vế thứ hai ở `scrollViewWillBeginDragging`. Vế thứ ba app đã
 * có sẵn — `ReanimatedSwipeable` bật một `Gesture.Tap()` khi hàng mở
 * (`shouldEnableTap`), nên chạm vào chính hàng ấy là nó đóng.
 *
 * ── vì sao là một HÀM Ở PHẠM VI MODULE ──
 *
 * Vì chỗ gọi nó là một worklet: bộ xử lý cuộn của Today chạy trên luồng UI,
 * nên nó phải đi qua `runOnJS`. Một hàm ở phạm vi module có danh tính CỐ ĐỊNH
 * suốt vòng đời tiến trình — đúng thứ `tools/runonjs-stable.mjs` sinh ra để
 * đòi, sau khi một danh tính đổi mỗi lần render làm app `SIGABRT` trong
 * `JSScheduler::scheduleOnJS`.
 */
export function closeOpenSwipeRow() {
  openRow?.close();
}

function Action({
  progress,
  translation,
  full,
  action,
  index,
  count,
  side,
}: {
  progress: SharedValue<number>;
  translation: SharedValue<number>;
  /** 0 → 1 khi cú kéo đã đủ tầm để làm luôn. Có lò xo, nên nó NẢY. */
  full: SharedValue<number>;
  action: SwipeAction;
  index: number;
  count: number;
  side: 'left' | 'right';
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  /*
    `progress` is 1 at the open position and 0 closed, so the capsule reaches
    full size exactly when the row does — the two are the same drag.

    ── và vì sao có `lag` ──

    Nhiều nút xuất hiện CÙNG một lúc đọc ra là một khối đặc trượt vào. iOS thì
    mở lần lượt từ mép vào trong. `lag` đẩy điểm bắt đầu của từng nút theo thứ
    tự ấy — nút ngoài cùng (index 0, sát mép) mở trước — nhưng cả ba vẫn về
    đích ở cùng `progress` 1, nên không nút nào còn đang bò khi hàng đã dừng.
  */
  /*
    ── nút được LỘ RA, không phải hiện lên ──

    Chủ dự án: "trong quá trình di chuyển nút bị mờ". Đúng, và nó là một phỏng
    đoán sai của tôi chứ không phải một lỗi cài đặt: bản trước cho nút chạy từ
    `opacity` 0 lên 1 và từ `scale` 0,86 lên 1 theo cú kéo, nên suốt quãng kéo
    nó vừa nhạt vừa nhỏ hơn chỗ nó chiếm — mặt thẻ ánh qua và nó đọc ra là một
    tấm mờ đang trôi tới.

    iOS không làm thế. Nút ở đó sẵn, đặc, đủ cỡ, NẰM DƯỚI hàng; thứ chuyển động
    là HÀNG, và nút lộ ra đúng bằng phần hàng đã đi khỏi. Cấu trúc ở đây vốn đã
    đúng để làm vậy — tấm nút là `absoluteFill` nằm sau, còn hàng có nền đặc phủ
    kín — nên chỉ cần thôi vẽ thêm.

    Và với nút NỞ, `scale` còn sai về hình học: thu nhỏ 0,86 một viên nang rộng
    238 làm nó còn 205, tức cái khe 6 điểm vừa tính kỹ ở lượt trước biến thành
    39 điểm suốt quãng kéo.

    Còn lại đúng một phép: `translateX` xếp chồng các nút lúc đóng để chúng lộ
    ra LẦN LƯỢT từ mép vào, chứ không đồng loạt.
  */
  /*
    `index + PARALLAX`, không phải `index`.

    Với `index` trần thì nút ĐẦU mỗi mép có độ lệch 0 — nó đứng yên tuyệt đối
    và chỉ được hàng trượt đi để lộ ra. Mép trái chỉ có MỘT nút, nên ở đó không
    có chuyển động nào cả: chủ dự án báo "hiệu ứng khi nút mở ra chưa rõ rệt".

    `PARALLAX` đẩy cả cụm thêm hơn nửa cột về phía mép lúc đóng, nên nút đầu
    cũng có quãng đường của nó. Đó cũng là hình dạng thật ở iOS: tấm nút đi CHẬM
    HƠN hàng, nên nó như đang đuổi theo.
  */
  const stack = (index + PARALLAX) * OPEN_W * (side === 'right' ? 1 : -1);

  /*
    ── cái nhún lúc hàng MỞ XONG, và vì sao nó nghỉ ở 1 ──

    Nó quay lại ở ĐÚNG CHỖ sau khi `scale` bị gỡ khỏi phép bám ngón tay: một
    giá trị riêng, chạy bằng lò xo khi hàng đã tới nơi. Kéo tới đâu nút vẫn ở
    đúng đó; cái nhún chỉ xảy ra ở khoảnh khắc thả tay, và lệch nhau theo chỉ
    số nên ba nút nhún nối tiếp chứ không cùng lúc.

    Bản trước viết nó là `interpolate(pop, [0, 1], [0.9, 1])` với `pop` khởi
    tạo 0. `pop` chỉ rời 0 khi vượt ngưỡng, nên MỌI lúc khác `scale` là 0,9 —
    nút bị vẽ ở 90% cỡ suốt cú kéo VÀ cả khi đã mở hẳn. Đo trên bản dựng:
    `matrix(0.9, 0, 0, 0.9, 0, 0)` ở mọi vị trí kéo, không đổi sau khi thả.
    Một "cái nhún" mà trạng thái nghỉ của nó là 0,9 thì không phải cái nhún, nó
    là một phép thu nhỏ thường trực.

    Nay `pop` LÀ hệ số nhân, nghỉ ở 1, và cú nhún là một cái HÍCH: gán thẳng
    `POP_KICK` rồi thả lò xo về 1.

    Nút NỞ (mép trái, index 0) vẫn không nhún: nó đang ôm sát cạnh thẻ và bề
    rộng của nó bám ngón tay qua `swell`, nên một cú phình ở đó vừa chồm lên
    thẻ vừa đánh nhau với phép bám. Cái nảy của nó nằm ở glyph — xem `glyphPop`.
  */
  const pop = useSharedValue(1);
  const nudges = !(side === 'left' && index === 0);
  useAnimatedReaction(
    () => progress.value > 0.92,
    (open, before) => {
      if (before !== null && open === before) return;
      if (open && nudges) {
        pop.value = POP_KICK;
        pop.value = withSpring(1, spring(0.26 + index * 0.05, BOUNCE.bouncy));
      } else {
        pop.value = 1;
      }
    },
  );

  /*
    ── MỘT style, vì hai style cùng đặt `transform` thì cái sau THAY THẾ ──

    Bản trước là `style={[styles.actionWrap, grow, bounce]}` với `grow` đặt
    `transform: [{ translateX }]` và `bounce` đặt `transform: [{ scale }]`.
    React Native gộp style theo THUỘC TÍNH, không gộp bên trong một mảng
    `transform`: cái sau thắng trọn vẹn. Nên `translateX` của parallax bị nuốt
    sạch ở mọi nút trừ nút NỞ (nút duy nhất `bounce` trả về `{}`).

    Đo trên bản dựng, nút mép phải: `matrix(0.9, 0, 0, 0.9, 0, 0)` — scale 0,9,
    translateX **0** — ở cả bốn vị trí kéo và cả sau khi thả. Parallax đã chết
    im lặng, và chủ dự án báo đúng bằng câu "hiệu ứng khi nút mở ra chưa rõ".

    `tsc` không thấy: hai style hợp lệ. Ảnh chụp không thấy: nút vẫn ở đúng chỗ
    nó phải tới khi mở hẳn. Chỉ có transform đọc ra khỏi DOM mới nói được.

    ── và hiệu ứng HIỆN RA, soi theo nút "Ghi" ──

    Chủ dự án: *"cho mấy cái nút action đằng sau thẻ có hiệu ứng hiện ra như
    nút ghi"*. Nút "Ghi" của thẻ To-do NHƯỜNG CHỖ bằng đúng hai phép, lái bằng
    chính `openness` của cú kéo (`todo-card.tsx`):

        opacity  1 → 0     trong khoảng [0, HANDOVER_AT]
        scale    1 → HANDOVER_SCALE

    Nên nút vuốt làm ĐÚNG phép ấy, đảo chiều, trong đúng khoảng ấy — hai thứ
    dùng CHUNG hằng số chứ không chép, nên một bên đổi là bên kia đổi theo. Cái
    người ta thấy là một cuộc bàn giao: "Ghi" lùi đi đúng lúc nút vuốt tới.

    Đây KHÔNG phải cái "fade-in độc lập" đã bị bác ở lượt trước. Bản bị bác
    chạy opacity tới tận `progress` 1, nên nút nhạt suốt cú kéo — chủ dự án gọi
    đúng tên: "trong quá trình di chuyển nút bị mờ". Bản này xong ở 55%, và nó
    lái bằng cùng một giá trị với chuyển động của hàng chứ không có thời gian
    biểu riêng.
  */
  const reveal = useAnimatedStyle(() => {
    const t = interpolate(progress.value, [0, HANDOVER_AT], [0, 1], 'clamp');
    /* Nút NỞ giữ nguyên cỡ: bề rộng của nó đã bám ngón tay qua `swell`, và một
       `scale` chồng lên đó là hai phép cùng đòi một kích thước. */
    const grow_ = nudges ? interpolate(t, [0, 1], [HANDOVER_SCALE, 1]) : 1;
    return {
      opacity: t,
      transform: [
        { translateX: interpolate(progress.value, [0, 1], [stack, 0], 'clamp') },
        { scale: grow_ * pop.value },
      ],
    };
  });

  /*
    ── nút GIÃN THEO THẺ từ điểm ảnh đầu tiên, không chờ ngưỡng ──

    Chủ dự án: "nút đỏ này phải được kéo giãn ra theo thẻ mỗi khi kéo ra". Bản
    trước nhân bề rộng với `full` — thứ chỉ lên 1 SAU khi qua ngưỡng kéo-dài —
    nên suốt quãng trước đó nút đứng nguyên 60 điểm trong khi hàng đi mỗi lúc
    một xa, và khoảng trắng giữa hai thứ càng kéo càng to. Đúng ảnh chụp.

    Nay bề rộng bám thẳng `translation`: hàng nhường ra bao nhiêu, nút chiếm
    bấy nhiêu, trừ đúng một khe mỗi bên. `full` thôi làm việc của bề rộng và
    chuyển sang làm việc của nó — cái nảy ở đúng khoảnh khắc qua ngưỡng.
  */
  const swell = useAnimatedStyle(() => {
    if (index !== 0 || side !== 'left') return {};
    /*
      Bề rộng để mép phải viên nang dừng cách nội dung hàng đúng `CAPSULE_INSET`
      — cùng khe với mép trái, nên nút lấp KÍN khoảng hàng vừa nhường ra.

      Bản trước tính `|translation| - spacing.sm * 2` và để viên nang căn GIỮA
      trong cột 72. Nở ra thì nó giãn đều hai phía: với một cú kéo 250 điểm,
      77 điểm chạy ra ngoài mép trái và bị cắt, còn mép phải chỉ tới 149 — để
      hở 101 điểm trắng giữa nút và thẻ. Đúng ảnh chủ dự án chụp.
    */
    return { width: Math.max(CAPSULE_W, Math.abs(translation.value) - CAPSULE_INSET * 2) };
  });

  /*
    Cái nảy nay thuộc về GLYPH, không thuộc bề rộng.

    Bề rộng phải bám ngón tay từng khung hình, nên không được có lò xo trong đó.
    Còn khoảnh khắc qua ngưỡng vẫn cần một dấu hiệu nhìn thấy được ngoài tiếng
    haptic — nên dấu trừ nhún một cái, bằng chính lò xo `bouncy` mà `full` chạy.
  */
  const glyphPop = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(full.value, [0, 1], [1, 1.18]) }],
  }));

  const ink = action.ink ?? c.primaryForeground;

  return (
    <Animated.View style={[styles.actionWrap, reveal]}>
      {/* Cả cột là đích chạm, phủ lên chứ không bọc quanh — một `Pressable` bọc
          ngoài sẽ tranh cử chỉ với chính cú vuốt. */}
      <Text
        accessibilityRole="button"
        accessibilityLabel={action.label}
        onPress={action.onPress}
        style={styles.hit}
      />
      <Animated.View style={[styles.capsule, { backgroundColor: action.tint ?? c.readinessRed }, swell]}>
        <Animated.View style={glyphPop}>
          <Icon icon={action.icon} size={CAPSULE_ICON} color={ink} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Độ mở của hàng, đọc được từ BÊN TRONG nội dung hàng.
 *
 * ── vì sao là context chứ không phải một prop ──
 *
 * Nội dung hàng đôi khi phải biết hàng đang bị kéo: nút "Ghi" của thẻ To-do
 * phải NHƯỜNG CHỖ khi nút vuốt hiện ra, không thì hai nút cùng đòi chỗ ở một
 * đầu hàng và cái nào cũng chỉ còn một nửa.
 *
 * Đưa `openness` ra ngoài bằng prop thì chỗ dùng phải tự giữ một shared value
 * rồi truyền ngược vào — tức hai nơi cùng sở hữu một con số. Context thì nó vẫn
 * thuộc về `SwipeRow`, và ai cần thì hỏi.
 *
 * Trả `null` khi đứng ngoài một `SwipeRow`, nên chỗ dùng phải tự lo phần "không
 * có cú vuốt nào" thay vì nhận một số 0 giả.
 */
const OpennessContext = createContext<SharedValue<number> | null>(null);

export function useSwipeOpenness(): SharedValue<number> | null {
  return useContext(OpennessContext);
}

/**
 * Chép `progress` của thư viện sang một shared value của MÌNH.
 *
 * Bo góc hàng phải chạy theo cú kéo, mà `progress` chỉ được thư viện đưa vào
 * hàm dựng nút — không đưa ra ngoài. Đây là cây cầu: một component (nên gọi
 * hook được) sống trong tấm nút, không vẽ gì cả, chỉ chuyển giá trị ra.
 *
 * Không vẽ gì nên không tốn một lớp nào trong cây.
 */
function Track({ from, to }: { from: SharedValue<number>; to: SharedValue<number> }) {
  useAnimatedReaction(
    () => from.value,
    (v) => {
      to.value = v;
    },
  );
  return null;
}

export function SwipeRow({
  children,
  right,
  left,
  fullSwipe = false,
  lifts = false,
  style,
  cancelLabel,
}: {
  children: React.ReactNode;
  /**
   * Mép PHẢI — vuốt từ phải sang trái.
   *
   * Apple để mép này cho thao tác kết thúc ngữ cảnh hoặc phá huỷ (Xoá, Lưu
   * trữ) và cho nhóm nhiều nút. Nút ĐẦU danh sách nằm ngoài cùng, sát mép,
   * đúng thứ tự `UISwipeActionsConfiguration` dựng.
   */
  right: SwipeAction[];
  /**
   * Mép TRÁI — vuốt từ trái sang phải. Thường chỉ MỘT nút.
   *
   * Apple để mép này cho một lối tắt ngữ cảnh: Ghim, Đã đọc, Yêu thích. Không
   * phải chỗ của thao tác phá huỷ, và không phải chỗ của một thực đơn.
   */
  left?: SwipeAction[];
  /**
   * Kéo dài qua mép trái là làm luôn hành động đầu tiên bên ấy.
   *
   * Chỉ bật ở nơi hành động ấy HOÀN TÁC ĐƯỢC. Một cú kéo dài là cú dễ lỡ tay
   * nhất trong cả bộ cử chỉ: nó bắt đầu giống hệt một cú vuốt thường và chỉ
   * khác ở chỗ ngón tay dừng lại. Xem `FULL_SWIPE_AT`.
   */
  fullSwipe?: boolean;
  /**
   * Mặt hàng mượn khi nó được NHẤC lên — MỘT màu, và phải là hex ĐẶC.
   *
   * ── vì sao không còn là một cặp `{ rest, lifted }` ──
   *
   * Cặp cũ để chỗ gọi tự khai mặt lúc NGHỈ, và chỗ gọi khai `m.bg` — "màu mặt
   * thẻ". Cái tên ấy nghĩa khác nhau ở hai diện mạo: bản sáng `#ffffff` ĐẶC nên
   * sơn lại đúng bằng mặt thẻ (1,000:1, vô hình); bản tối
   * `rgba(255,255,255,0.06)` chồng lên mặt thẻ vốn cũng mờ, ra `#242425` trên
   * `#161617` — 1,166:1, tức MỖI HÀNG thành một dải ngang. Xem `Material.liftedRow`.
   *
   * Nên `rest` không còn là một lựa chọn: hàng đang nghỉ sơn ĐÚNG KHÔNG GÌ CẢ,
   * mặt thẻ hiện thẳng qua. Không dải, ở cả hai diện mạo, và không nhờ trùng
   * khít mà nhờ không có lớp thứ hai.
   *
   * ── nhưng lúc NHẤC thì phải đặc ──
   *
   * `ReanimatedSwipeable` dựng tấm nút là `absoluteFill` ngay SAU hàng, nên một
   * mặt mờ để viên nút hiện xuyên qua chính hàng đang kéo. Hợp đồng "hex đặc"
   * được ép bằng chính `alpha()`: nó ném với mọi thứ không phải `#rgb`/`#rrggbb`,
   * nên truyền một `rgba(…)` vào đây là hỏng ngay lúc dựng chứ không âm thầm.
   *
   * TUỲ CHỌN, và đó là chủ ý: hai chỗ dùng còn lại (`sessions`, chế độ sắp xếp
   * dashboard) tự vẽ nền trong chính nội dung hàng của chúng. Không khai thì
   * khung bọc không tô gì cả và hai màn ấy giữ nguyên từng điểm ảnh.
   */
  lifts?: boolean;
  /**
   * Style cho khung ngoài cùng của hàng.
   *
   * Có vì một lý do cụ thể: thẻ To-do có đệm 20 điểm, nên một hàng trượt đi sẽ
   * kẹt vào đúng cái đệm ấy và chữ dừng lại ở mép thẻ mà không bị cắt — đọc ra
   * là một lỗi bố cục chứ không phải một hàng đang trượt. Danh sách của iOS thì
   * chạy HẾT bề ngang; phần thụt vào nằm bên trong hàng. Chỗ dùng bù lại đệm
   * bằng margin âm qua prop này.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Chữ trên nút huỷ của hộp thoại xác nhận.
   *
   * Truyền vào chứ không gọi `useI18n()` ở đây: component này là hạ tầng dùng
   * chung, và một chuỗi dịch nằm trong hạ tầng là chỗ để bảng dịch và component
   * trôi khỏi nhau. Chỗ dùng nào cần `confirm` thì chỗ ấy đưa chữ.
   */
  cancelLabel?: string;
}) {
  /* One tick, when the row crosses into "letting go will open this". Fired from
     the will-open callback rather than from a progress watcher so it cannot
     repeat while the finger wobbles on the line. */
  const i18nCancel = cancelLabel ?? 'Cancel';
  /* Màu lúc NHẤC đọc thẳng khỏi chất liệu, không nhận từ chỗ gọi. Chỗ gọi chỉ
     nói CÓ nhấc hay không (`lifts`); chọn màu nào là việc của hệ thống thiết
     kế, và gom về đây thì `tools/row-surface.mjs` đo được nó ở cả hai diện mạo
     thay vì đo một prop có thể là bất cứ chuỗi gì. */
  const m = useMaterial();
  /*
    Hai đầu của phép nội suy được tính Ở ĐÂY, trên luồng JS, rồi worklet chỉ
    BẮT hai chuỗi.

    `alpha()` là một hàm JS thường, không phải worklet. Gọi nó bên trong thân
    `useAnimatedStyle` là gọi một Remote Function trên UI runtime, và Worklets
    ném thẳng: *"Tried to synchronously call a Remote Function"* — app chết ngay
    khung hình đầu. Tôi đã viết đúng lỗi ấy và bộ chạy web KHÔNG thấy được: trên
    RN Web không có UI runtime riêng, worklet chạy cùng luồng JS nên `alpha()`
    gọi được. Chỉ máy thật mới nói ra.

    Hằng bắt được vào worklet phải là giá trị THUẦN. Hai chuỗi màu thì được.
  */
  const liftFrom = lifts ? alpha(m.liftedRow, 0) : m.liftedRow;
  const liftTo = m.liftedRow;
  const buzzed = useRef(false);
  /* Cú kéo dài: cờ được bật trên luồng UI, đọc lúc thả. */
  const armed = useRef(false);
  const methods = useRef<SwipeableMethods | null>(null);
  /* Bề rộng hàng là SHARED VALUE, không phải ref: ngưỡng kéo-dài được so trên
     luồng UI, và một `ref.current` đọc lúc render thì worklet nhìn thấy giá trị
     của lần render ấy — tức 0 ở lần đầu, khi `onLayout` còn chưa chạy. */
  const width = useSharedValue(0);
  const openness = useSharedValue(0);
  /* 0 → 1 khi cú kéo đã đủ tầm để làm luôn; có lò xo nên nó NẢY sang. */
  const full = useSharedValue(0);
  /* Mép phải không có cú kéo dài, nên nó nhận một giá trị đứng yên ở 0 thay vì
     một nhánh `if` trong `useAnimatedStyle` — hook thì không có điều kiện. */
  const zero = useSharedValue(0);

  const rightSet = right.slice(0, MAX_ACTIONS);
  const leftSet = (left ?? []).slice(0, MAX_ACTIONS);
  const firstLeft = leftSet[0];

  /*
    ── HAI HÀM NÀY PHẢI ỔN ĐỊNH, và đó là một lỗi ĐÃ LÀM APP THOÁT ──

    `onSwipeableWillOpen`/`WillClose` KHÔNG phải callback thường: thư viện gọi
    chúng qua `runOnJS` từ trong một worklet (`ReanimatedSwipeable.tsx`,
    `dispatchImmediateEvents`), và cái worklet ấy `useCallback` trên đúng danh
    tính của hai prop này. Truyền arrow inline ⇒ mỗi lần render là một danh
    tính mới ⇒ worklet dựng lại ⇒ một `SerializableRemoteFunction` MỚI, cái cũ
    bị thả. Một lệnh đã lên lịch còn đang bay lúc ấy sẽ đi tìm một hàm không
    còn nữa — `SIGABRT` trong `JSScheduler::scheduleOnJS`, đúng chữ ký A9
    trong hai báo cáo sự cố từ máy thật.

    Bản rà 11/09 không bắt được chỗ này vì nó đi tìm chữ `runOnJS` VIẾT TRONG
    code app. Ở đây không có chữ ấy: `runOnJS` nằm trong thư viện, còn app chỉ
    truyền một hàm. Cùng một lỗi, khác chỗ nhìn.

    Danh sách phụ thuộc chỉ có `firstLeft`, thứ DUY NHẤT hai hàm đọc ngoài các
    ref (ref thì danh tính cố định trọn đời component).
    `tools/runonjs-stable.mjs` canh để chỗ này không quay lại.
  */
  const onWillOpen = useCallback(
    (direction: SwipeDirection) => {
      /* Hàng khác đang mở thì thu nó về TRƯỚC, không thì hai hàng cùng mở. */
      if (openRow && openRow !== methods.current) openRow.close();
      openRow = methods.current;

      /*
        ── cú kéo dài: hàng ĐỨNG YÊN, rồi hệ điều hành hỏi lại ──

        Chủ dự án mô tả đúng luồng của Nhắc nhở: "thẻ sẽ dừng ở điểm kéo đó sau
        đó sẽ có pop up hệ thống hiện lên hỏi có chắc chắn muốn xoá không".

        Nên ở đây KHÔNG đóng hàng. Hàng ở nguyên chỗ đã mở — nó là ngữ cảnh của
        câu hỏi, và đóng nó lại trước khi hỏi là hỏi về một thứ vừa biến mất.
        Chỉ sau khi người ta trả lời thì hàng mới đi: đồng ý thì làm rồi đóng,
        huỷ thì đóng suông.

        Không có `confirm` thì làm luôn — một hành động hoàn tác được không cần
        ai hỏi lại.
      */
      /*
        ── `'right'`, KHÔNG phải `'left'` — và đây là lỗi thứ hai ──

        Thư viện đặt tên hướng theo chiều HÀNG DỊCH CHUYỂN, không theo mép nào
        mở ra. `ReanimatedSwipeable.js:76`:

            runOnJS(onSwipeableWillOpen)(toValue > 0 ? RIGHT : LEFT)

        Mở tấm nút bên TRÁI nghĩa là `toValue = leftWidth`, một số DƯƠNG, nên nó
        báo `RIGHT`. Bản trước so với `'left'`, tức nhánh cú-kéo-dài không bao
        giờ chạy dù cờ đã bật đúng.

        `armed` tự nó đã đủ — chỉ tấm nút bên trái mới bật được nó — nhưng phép
        so vẫn giữ lại làm lưới chắn, với đúng giá trị và đúng lý do ghi cạnh.
      */
      if (armed.current && direction === 'right' && firstLeft) {
        armed.current = false;
        const done = () => {
          full.value = 0;
          methods.current?.close();
        };
        if (!firstLeft.confirm) {
          firstLeft.onPress();
          done();
          return;
        }
        const { title, message, ok } = firstLeft.confirm;
        Alert.alert(title, message, [
          { text: i18nCancel, style: 'cancel', onPress: done },
          {
            text: ok,
            style: 'destructive',
            onPress: () => {
              firstLeft.onPress();
              done();
            },
          },
        ]);
        return;
      }
      if (buzzed.current) return;
      buzzed.current = true;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [firstLeft, full, i18nCancel],
  );
  /*
    Hàng đi khỏi cây trong lúc còn mở thì sổ ghi phải QUÊN nó.

    Không gọi `close()` ở đây: component đang chết, và chạy một animation trên
    một thứ sắp biến mất là cách `log-weight.tsx` đã ghi lại — "cú `withTiming`
    sau đó chạy trên một component đã đi". Chỉ cần buông con trỏ.

    Nếu không, `openRow` còn trỏ vào một hàng đã tháo, và hàng kế tiếp mở ra sẽ
    gọi `.close()` lên một cái xác.
  */
  useEffect(
    () => () => {
      if (openRow === methods.current) openRow = null;
    },
    [],
  );

  const onWillClose = useCallback(() => {
    buzzed.current = false;
    armed.current = false;
    full.value = 0;
    if (openRow === methods.current) openRow = null;
  }, [full]);

  /* Ngưỡng kéo-dài đã qua: một tiếng NẶNG hơn tiếng cam kết thường, vì đây là
     một ngưỡng khác chứ không phải cùng một ngưỡng lặp lại. */
  const armFull = useCallback(
    (on: boolean) => {
      if (armed.current === on) return;
      armed.current = on;
      full.value = withSpring(on ? 1 : 0, spring(0.34, BOUNCE.bouncy));
      if (on) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [full],
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      width.value = e.nativeEvent.layout.width;
    },
    [width],
  );

  /*
    Hàng bo góc lại khi bị kéo ra.

    Đây là chi tiết chủ dự án chỉ trong ảnh Nhắc nhở của iOS: hàng không trượt
    đi như một dải danh sách, nó CO LẠI thành một tấm thẻ có góc bo. Bán kính
    chạy theo chính cú kéo (`openness`, chép từ `progress` của thư viện), nên nó
    là cùng một chuyển động chứ không phải một hiệu ứng chạy song song.

    Bo bằng MỘT LỚP CỦA MÌNH, không nhét vào `childrenContainerStyle` của thư
    viện: chỗ ấy chạy được (thư viện gắn thẳng vào một `Animated.View` —
    `ReanimatedSwipeable.js`: `style: [animatedStyle, childrenContainerStyle]`)
    nhưng kiểu của nó khai là `StyleProp<ViewStyle>`, nên đặt style động vào đó
    phải ép kiểu. Một cú ép kiểu ở đây là một lời hứa rằng tôi đã đọc mã thư
    viện và nó sẽ không đổi — lời hứa không ai kiểm được. Thêm một `Animated.View`
    có `overflow: hidden` thì đúng kiểu, và nó cũng CẮT nền hàng theo góc bo,
    thứ `borderRadius` trên lớp ngoài không tự làm được.
  */
  const rounded = useAnimatedStyle(() => ({
    borderRadius: interpolate(openness.value, [0, 1], [0, radius.md], 'clamp'),
    /*
      ── mặt hàng ĐỔI khi nó được chọn ──

      Chủ dự án: "thẻ khi được chọn chưa có điểm nhấn như apple". Trong ảnh Nhắc
      nhở, hàng bị vuốt không chỉ bo góc — nó đổi hẳn sang một mặt khác, tách ra
      khỏi danh sách như một viên nang được nhấc lên.

      Chỉ ĐỘ MỜ chạy, không phải màu: hai đầu là cùng một RGB, khác nhau ở alpha
      0 và 1. Nội suy màu giữa hai RGB khác nhau sẽ đi qua một dải trung gian
      không ai chọn; ở đây không có dải ấy vì không có hai màu.

      `LIFT_AT` chứ không phải 1 — và đây là phần phải đúng, không phải phần cho
      đẹp. Tấm nút là `absoluteFill` NGAY SAU hàng, nên chừng nào hàng còn mờ
      thì viên nút còn hiện xuyên qua nó. Rò lớn nhất là
      `(1 − p/LIFT_AT) × (p/HANDOVER_AT)`, cực đại ở `p = LIFT_AT/2` và bằng
      `LIFT_AT / (2·HANDOVER_AT)` — ở 0,12 là 10,9% và nó được ĐO lại trên bản
      dựng chứ không chỉ tính. Kéo dài `LIFT_AT` ra là mở lại đúng lỗi "viên nút
      hiện xuyên qua hàng".
    */
    ...(lifts
      ? {
          backgroundColor: interpolateColor(
            interpolate(openness.value, [0, LIFT_AT], [0, 1], 'clamp'),
            [0, 1],
            [liftFrom, liftTo],
          ),
        }
      : null),
  }));

  /*
    Mọi hành động vuốt cũng là một hành động TRỢ NĂNG.

    Một cú vuốt vô hình với VoiceOver: người dùng rotor không có cách nào đoán
    ra nó. `accessibilityActions` là cách hệ điều hành hỏi "hàng này làm được
    gì", nên mỗi nút ở đây phải có mặt trong câu trả lời ấy — xem chú thích
    "a swipe is never the only way" ở đầu tệp, và `tools/swipe.mjs`.
  */
  const all = [...leftSet, ...rightSet];

  const panel = (
    side: 'left' | 'right',
    set: SwipeAction[],
    progress: SharedValue<number>,
    translation: SharedValue<number>,
    api: SwipeableMethods,
  ) => {
    methods.current = api;
    return (
      <View style={side === 'left' ? styles_panelLeft : styles_panelRight}>
        <Track from={progress} to={openness} />
        {side === 'left' && fullSwipe ? (
          <FullSwipeWatch translation={translation} width={width} onArm={armFull} />
        ) : null}
        {set.map((a, i) => (
          <Action
            key={a.label}
            progress={progress}
            translation={translation}
            full={side === 'left' ? full : zero}
            action={a}
            index={i}
            count={set.length}
            side={side}
          />
        ))}
      </View>
    );
  };

  return (
    <View
      style={style}
      onLayout={onLayout}
      accessibilityActions={all.map((a) => ({ name: a.label, label: a.label }))}
      onAccessibilityAction={(e) => {
        all.find((a) => a.label === e.nativeEvent.actionName)?.onPress();
      }}>
      <ReanimatedSwipeable
        /*
          ── `friction` 1, và vì sao 2 là con số làm cú kéo dài KHÔNG THỂ xảy ra ──

          Tài liệu thư viện: "value of 1 will indicate that the swipeable panel
          should exactly follow the gesture, 2 means it is going to be two times
          slower". iOS thì bám ngón tay 1:1, nên 1 vốn đã là con số đúng.

          Nhưng quan trọng hơn: `overshootFriction` 8 CỘNG với friction 2 đẩy
          ngưỡng kéo-dài ra ngoài tầm vật lý. Chạy chính công thức của thư viện
          (`ReanimatedSwipeable.js:69` — `interpolate` với extrapolation EXTEND,
          nên quá bề rộng nút thì mỗi điểm `offsetDrag` chỉ sinh `1/overshootFriction`
          điểm dịch chuyển):

              friction 2 · overshoot 8 → ngón tay phải đi 1.592 điểm
              friction 2 · overshoot 1 → 325 điểm
              friction 1 · overshoot 1 → 163 điểm

          Màn hình rộng 393. Nên bản đã ship đòi một cú kéo dài GẤP BỐN LẦN bề
          ngang máy — đó là lý do thật của "nút xoá vẫn chưa kéo hết và xoá
          được", chứ không phải chỗ tôi sửa lượt trước.

          163 điểm là đúng cái chủ dự án mô tả: "kéo đến giữa màn hình".
        */
        friction={1}
        rightThreshold={commitAt(rightSet.length)}
        dragOffsetFromRightEdge={HYSTERESIS}
        overshootRight={false}
        /* Kéo quá bề rộng nút chỉ có nghĩa khi cú kéo dài được bật, và khi bật
           thì KHÔNG thêm ma sát: hàng phải theo ngón tay tới giữa màn hình. */
        overshootLeft={fullSwipe}
        overshootFriction={1}
        {...(leftSet.length
          ? {
              leftThreshold: commitAt(leftSet.length),
              dragOffsetFromLeftEdge: HYSTERESIS,
              renderLeftActions: (
                progress: SharedValue<number>,
                translation: SharedValue<number>,
                api: SwipeableMethods,
              ) => panel('left', leftSet, progress, translation, api),
            }
          : null)}
        animationOptions={SWIPE_SNAP}
        onSwipeableWillOpen={onWillOpen}
        onSwipeableWillClose={onWillClose}
        renderRightActions={(progress, translation, api) =>
          panel('right', rightSet, progress, translation, api)
        }>
        <Animated.View style={[styles_clip, rounded]}>
          <OpennessContext.Provider value={openness}>{children}</OpennessContext.Provider>
        </Animated.View>
      </ReanimatedSwipeable>
    </View>
  );
}

/**
 * Canh cú kéo dài, trên luồng UI.
 *
 * Là một component riêng vì nó cần `useAnimatedReaction`, và vì nó chỉ được
 * dựng khi `fullSwipe` bật — một hook có điều kiện thì không hợp lệ, một
 * component có điều kiện thì hợp lệ.
 *
 * `onArm` phải ổn định (nó là `useCallback` ở trên): `runOnJS` gói lại một danh
 * tính hàm, và đổi danh tính giữa chừng là đúng lớp lỗi đã làm app thoát.
 */
function FullSwipeWatch({
  translation,
  width,
  onArm,
}: {
  translation: SharedValue<number>;
  width: SharedValue<number>;
  onArm: (on: boolean) => void;
}) {
  /*
    Cả phép so chạy TRÊN LUỒNG UI, và nó so `translation` với một ngưỡng tính
    từ bề rộng hàng đo được — không phải từ một hằng đoán trước.

    Bản trước tính ngưỡng ở thân component, tức trên luồng JS, từ một `ref` mà
    `onLayout` có thể chưa kịp điền. Khi nó là 0 thì ngưỡng rơi về `OPEN_W *
    1,6` = 115 điểm, gần bằng bề rộng một tấm nút — nên cú kéo hoặc không bao
    giờ đủ dài, hoặc kích hoạt ngay khi vừa mở. Chủ dự án báo đúng triệu chứng:
    "nút xoá vẫn chưa kéo hết và xoá được".

    Điều kiện đổi-trạng-thái cũng được viết rõ ra thay vì dựa vào thứ tự ưu tiên
    toán tử: bản trước là `now !== prev > at`, đọc ra là `now !== (prev > at)` —
    đúng một cách tình cờ, và không ai đọc nổi.
  */
  useAnimatedReaction(
    () => {
      const at = Math.max(width.value * FULL_SWIPE_AT, OPEN_W * 1.6);
      return translation.value > at;
    },
    (now, before) => {
      if (before !== null && now === before) return;
      runOnJS(onArm)(now);
    },
  );
  return null;
}

/*
  Thứ tự nút: cái ĐẦU danh sách nằm sát mép người ta vuốt từ đó.

  iOS dựng như thế (`UISwipeActionsConfiguration`: "the system arranges the
  actions from the outside edge inward"), nên ở mép PHẢI hàng phải đảo chiều —
  một `flexDirection: 'row'` thường sẽ đặt nút đầu vào trong cùng.
*/
/*
  `alignItems: 'center'` — và đây là một LỖI ĐÃ SHIP, không phải một tuỳ chọn.

  Tấm nút là con của một khung `StyleSheet.absoluteFill` do thư viện dựng, tức
  nó CAO BẰNG CẢ HÀNG. Cột nút thì có chiều cao cố định (`ACTION_H`), và trong
  một hàng flex mà cha để `alignItems` mặc định là `stretch`, một đứa con đã có
  chiều cao riêng sẽ rơi về cross-start — tức DÍNH MÉP TRÊN.

  Trên máy thật điều đó đọc ra đúng như chủ dự án chụp lại: viên nang đội lên
  cao hơn nút "Ghi" của hàng và gần chạm tiêu đề thẻ, còn dòng chữ dưới nó thì
  thò xuống quá đáy hàng. Ở Nhắc nhở của iOS thì cả cụm nút nằm CHÍNH GIỮA
  chiều cao hàng — đó là chỗ khác nhau duy nhất, và nó chỉ là một dòng.

  Không màn nào đỏ vì chuyện này: `tsc` không biết flexbox, và bộ chạy web dựng
  ra đúng cái lệch ấy mà không có gì báo. Nên nó thành một luật ở
  `tools/swipe.mjs`.
*/
const styles_panelRight = { flexDirection: 'row-reverse', alignItems: 'center' } as const;
const styles_panelLeft = { flexDirection: 'row', alignItems: 'center' } as const;
/* `overflow: hidden` là thứ biến `borderRadius` thành một cú CẮT: không có nó
   thì nền của hàng vẫn vuông và góc bo chẳng thấy đâu. */
const styles_clip = { overflow: 'hidden' } as const;

const stylesFor = makeStyles((c) => ({
  /* Ô + chữ xếp DỌC, căn giữa theo cả hai chiều của cột `OPEN_W`. `gap` là khe
     giữa ô và chữ; khe giữa các NÚT do `paddingHorizontal` tạo ra, nên ba nút
     tách rời nhau như trong ảnh chứ không dính thành một dải. */
  /* Cột cao ĐÚNG phần nhìn thấy, không kéo dài theo hàng: hàng cao bao nhiêu
     cũng được, nút không bị cắt mất dòng chữ. Trước bản này cột `stretch` theo
     hàng, nên khi đồng hồ biến mất và hàng co lại thì chữ dưới nút bị `overflow:
     hidden` của thư viện xén ngang — đúng cái chủ dự án chụp lại. */
  actionWrap: {
    width: OPEN_W,
    height: ACTION_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* CÙNG hình với nút "Ghi" trên hàng — `radius.full`, không phải một ô vuông
     bo góc. Chủ dự án: "nhỏ hơn và cùng hình dạng với nút ghi". */
  /*
    ── viên nang NEO vào mép, không căn giữa ──

    `position: absolute` + `left` cố định là thứ biến phép nở thành một chiều:
    nó lớn về phía nội dung hàng và đứng yên ở phía kia. Căn giữa thì nó giãn
    đều hai bên, một nửa chạy ra ngoài khung và bị cắt.

    Khi CHƯA nở, `left: CAPSULE_INSET` đặt nó đúng giữa cột — 6 điểm mỗi bên —
    nên hai nút không nở vẫn cân.

    ── glyph neo mép PHẢI, tức bám theo thẻ ──

    Chủ dự án: "nút - ở giữa sẽ kéo về gần thẻ chính ở cuối góc phải của thẻ
    xoá". `justifyContent: 'flex-end'` với đệm bằng nửa phần thừa làm đúng hai
    việc bằng một con số: chưa nở thì glyph nằm đúng giữa viên nang; nở ra thì
    nó đứng yên cách mép PHẢI đúng khoảng ấy — mà mép phải là mép đi theo thẻ,
    nên dấu trừ trôi cùng thẻ chứ không ở lại phía sau.
  */
  capsule: {
    position: 'absolute',
    left: CAPSULE_INSET,
    top: 0,
    width: CAPSULE_W,
    height: CAPSULE_H,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: (CAPSULE_W - CAPSULE_ICON) / 2,
  },
  /* The whole capsule is the target, laid over it rather than wrapping it — a
     Pressable around an Animated.View would fight the swipe for the gesture. */
  hit: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 1 },
  /* Chữ nằm NGOÀI ô, bên dưới nó, và mang màu chữ của trang chứ không mang mực
     của ô: nó đứng trên nền hàng, không đứng trên nền màu. */
}));
