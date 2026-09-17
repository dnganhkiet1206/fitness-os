/**
 * How long a thing takes to respond to you.
 *
 * ── what is in here, and what is deliberately left out ──
 *
 * Only the *response* band: the app answering a tap or a state change. Four
 * values, because a survey of the app found it was already speaking with four —
 * 180, 200, 240 and 320 across seven places. This gives those four a name so
 * the eighth place does not invent 190.
 *
 * Two whole categories are **not** here, and leaving them out is the point:
 *
 *   - **The character rig.** Koa's blink, nod, squash and weight-shift, the
 *     celebration sequences, the studio loop. Twenty sites and thirteen values,
 *     and they are choreography — 90ms and 110ms next to each other are two
 *     beats of one gesture, not two picks off a scale. Every spring the app had
 *     when this file was written was in that category; `press` below is the
 *     first one that is not, and it is here rather than in a component because
 *     it is the app's answer to *every* tap.
 *   - **The arrival cascade.** The tab bar leaves over 300ms, the cards land at
 *     340 (220 plus a 30ms-per-card stagger), the light finishes at 420. Those
 *     three numbers are one composition: they are in that order, with those
 *     gaps, because light filling a room is the slowest part of any real
 *     arrival and the cards would look late if the aura beat them. Exposed as
 *     tokens they would get reused apart from each other, and the first time
 *     somebody "harmonised" them the sequence would be gone. They stay as
 *     literals next to the comments explaining them.
 *
 * ── how to pick one ──
 *
 * By how much of the screen is changing, not by how important the thing feels.
 * That is the whole ordering principle here, and it is why the four are spaced
 * the way they are: an icon spinning in place has almost no distance to cover,
 * a card exchanging its entire contents has a lot, and the eye wants the time
 * to match the distance. Something big that moves fast reads as a glitch;
 * something small that moves slowly reads as lag.
 *
 * If a new animation does not obviously fit one of these, that is worth a
 * moment's thought rather than a new number — usually it means the thing being
 * animated is doing more than one job.
 */
export const duration = {
  /** An icon swapping between two states in place — a toggle, a chevron flip. */
  toggle: 180,
  /** Something arriving that was not on screen a moment ago. */
  appear: 200,
  /** A control sliding to a new position; a disclosure opening or turning. */
  move: 240,
  /** A surface exchanging its contents for different contents. */
  swap: 320,
} as const;

/**
 * Lò xo, viết theo hai con số người ta CẢM được thay vì ba con số vật lý.
 *
 * ── vì sao đổi cách viết ──
 *
 * `{ damping: 18, stiffness: 260 }` không nói cho ai biết nó sẽ nảy bao nhiêu.
 * Muốn biết thì phải tự tính tỉ số tắt dần, và không ai tính — nên các con số
 * được chọn bằng cách thử, và mỗi lò xo mới trong app lại là một lần thử khác.
 * Đo lại toàn bộ lò xo của trình sắp xếp widget thì ra:
 *
 *     LIFT        bounce 0.44   ← nảy hơn cả preset nảy nhất Apple ship
 *     GAP_SPRING  bounce 0.26   ← thứ "nhường chỗ" mà lại nảy
 *     RELEASE     bounce 0.13
 *
 * Không ai chọn 0.44. Nó là thứ rơi ra từ hai con số gõ tay.
 *
 * ── cách Apple viết, và vì sao mượn đúng cách ấy ──
 *
 * Từ iOS 17, SwiftUI tham số hoá lò xo bằng `Spring(duration:bounce:)`:
 * `duration` là chu kỳ cảm nhận được, `bounce` là mức nảy trong khoảng
 * −1…1 (0 = tắt dần tới hạn, không vượt quá đích một chút nào).
 *
 * Quy đổi sang mô hình khối-lò-xo-giảm-chấn mà Reanimated dùng — CÙNG mô hình
 * vật lý, chỉ khác tên gọi:
 *
 *     mass      = 1
 *     stiffness = (2π / duration)²
 *     damping   = 4π(1 − bounce) / duration          (bounce ≥ 0)
 *     damping   = 4π / (duration × (1 + bounce))     (bounce < 0)
 *
 * Đây là bản ĐÃ SỬA. Công thức chiếu trong WWDC23 session 10158 sai ở vế
 * damping (`1 − 4π × bounce ÷ duration`), và Apple đính chính trên diễn đàn
 * nhà phát triển. Bản dưới đây tương đương với định nghĩa sạch hơn qua tỉ số
 * tắt dần: `ζ = 1 − bounce`, `damping = 2ζ√(stiffness × mass)` — và
 * `tools/spring-model.mjs` kiểm chính đẳng thức ấy chứ không tin lời tệp này.
 *
 * Nguồn: developer.apple.com/videos/play/wwdc2023/10158 và đính chính ở
 * developer.apple.com/forums/thread/739811.
 */
/*
  ── `'worklet'`, và nó KHÔNG phải trang trí ──

  Hàm này được gọi từ bên trong một worklet: `riseIn` ở `neon-toast.tsx` là
  animation VÀO-CÂY của thanh toast, và animation vào-cây chạy trên luồng UI.
  Gọi một hàm không-worklet từ đó là ném thẳng, và một lỗi JS ném ra từ luồng
  UI thì React Native không bắt được — nó đi qua `throwPendingError` rồi
  `std::terminate`. App THOÁT, không phải hiện màn đỏ.

  Đo trên `.ips` chủ dự án gửi (2026-09-14 23:30, hai lần cách nhau 20 giây):
  `SIGABRT`, luồng chính, và stack đọc thẳng ra chuỗi

      RCTMountingManager performTransaction
        → LayoutAnimationsProxy_Legacy::startEnteringAnimation
        → LayoutAnimationsManager::startLayoutAnimation
        → jsi::Function::call  → HermesRuntimeImpl::throwPendingError
        → __cxa_throw → std::terminate → abort

  Toast hiện mỗi lần ghi xong một thứ, nên triệu chứng là "cứ log là thoát".

  Chữ ký này KHÁC A9 (`__assert_rtn` → `JSScheduler::scheduleOnJS`), và
  `docs/SO-GHI-LOI.md` đã viết sẵn cách đọc: "Đổi chữ ký = một lỗi khác".

  `tools/worklet-callable.mjs` canh cho mọi hàm của app được gọi từ trong một
  worklet đều mang chỉ thị này.
*/
export function spring(duration: number, bounce: number) {
  'worklet';
  const stiffness = (2 * Math.PI) / duration;
  return {
    mass: 1,
    stiffness: stiffness * stiffness,
    damping:
      bounce >= 0
        ? (4 * Math.PI * (1 - bounce)) / duration
        : (4 * Math.PI) / (duration * (1 + bounce)),
  };
}

/**
 * Ba hình dạng lò xo Apple ship, ở đúng `duration` mặc định 0,5 giây.
 *
 * Chúng không phải để dùng nguyên xi ở mọi chỗ — `duration` là thứ mỗi chuyển
 * động tự chọn. Chúng ở đây để làm THANG ĐO: `bounce` của app không được vượt
 * quá `bouncy`, vì đó là mức nảy nhất mà hệ điều hành này cho là còn nghiêm
 * túc. Ra ngoài nó thì giao diện thôi đọc như một công cụ.
 *
 *   · `smooth` — tắt dần tới hạn, không vượt đích. Cho thứ NHƯỜNG CHỖ: một
 *     hàng đang tránh đường mà vượt quá ô rồi bò ngược lại thì đọc ra là mất
 *     ổn định, không phải là mềm mại.
 *   · `snappy` — nảy vừa đủ để có cảm giác vật chất. Cho thứ NGƯỜI DÙNG VỪA
 *     BUÔNG: một vật rơi vào chỗ của nó.
 *   · `bouncy` — trần. Chưa chỗ nào trong app cần tới đây.
 */
export const BOUNCE = { smooth: 0, snappy: 0.15, bouncy: 0.3 } as const;

/**
 * Nhịp một hàng vuốt chạy nốt quãng còn lại sau khi thả tay.
 *
 * ── vì sao nó ở đây chứ không ở component ──
 *
 * `today-meals.tsx` khai đúng hằng này cho cú vuốt của nó, và `swipe-row.tsx`
 * thì QUÊN — nó để nguyên mặc định của thư viện, `{ mass: 2, damping: 1000,
 * stiffness: 700, overshootClamping: true }`. Damping 1000 trên mass 2 là tắt
 * dần quá mức tới hạn rất xa: hàng không lướt về chỗ, nó khựng lại. Chủ dự án
 * báo đúng bằng câu "không có độ trượt mượt như apple".
 *
 * Hai chỗ cùng làm một cử chỉ mà một chỗ có nhịp còn chỗ kia không, chỉ vì hằng
 * số nằm trong tệp của một trong hai. Nên nó lên đây, và cả hai ĐỌC nó.
 *
 * `snappy` chứ không `smooth`: chú thích của `BOUNCE` đã chọn sẵn — "cho thứ
 * NGƯỜI DÙNG VỪA BUÔNG: một vật rơi vào chỗ của nó". Và `overshootClamping:
 * false` để cái nảy ấy thật sự xảy ra; mặc định của thư viện kẹp nó lại.
 *
 * ── 0,40 chứ không 0,24, và mỗi nấc đều được đo ──
 *
 * Chủ dự án: *"thanh trượt thẻ của todo còn hơi nhanh nên không tạo ra được
 * cảm giác mượt apple, làm nó trượt từ từ nên mượt hơn"*.
 *
 * `duration` ở đây là tham số của `spring()`, và nó tỉ lệ NGHỊCH với ω₀:
 * `stiffness = (2π/duration)²`. Nên kéo dài nó là hạ tần số riêng, giữ nguyên
 * tỉ số giảm chấn — hàng vẫn hạ cánh y hệt, chỉ đi quãng ấy chậm hơn. Đó đúng
 * là "trượt từ từ" chứ không phải "nảy nhiều hơn".
 *
 * Đo bằng ba hàm lò xo trích nguyên văn khỏi bản Reanimated đang cài, tích
 * phân theo đúng vòng lặp `spring.ts` ở 60fps, trên quãng mở 72 điểm:
 *
 *     duration  ω₀     90%      settle   vọt lố khi bắn mạnh
 *     0,24      26,2   133ms    433ms    0,7 điểm
 *     0,34      18,5   183ms    600ms    1,4 điểm
 *     0,40      15,7   217ms    717ms    2,4 điểm     ← bản này
 *     0,50      12,6   267ms    883ms    5,4 điểm
 *
 * ── hai lượt, và lượt hai là chủ dự án chọn ──
 *
 * Tôi dừng ở 0,34 và nêu lý do: vọt lố là thứ trả giá, vì hàng vọt qua 0 là
 * hàng trượt sang phía ĐỐI DIỆN, và tấm nút bên ấy nằm ngay dưới — vọt lố lớn
 * là một vệt màu của cái nút người dùng không hề vuốt tới, nháy lên rồi tắt.
 * Chủ dự án thử rồi trả lời: *"chậm nữa đi, 0.40"*.
 *
 * Nên 0,40, và cái giá được ghi ra chứ không giấu: **2,4 điểm** vọt lố ở cú
 * bắn 1.200 px/s trong mô phỏng. Con số ấy là cận TRÊN. Ở 0,50 thì cận trên
 * nhảy lên 5,4, và đó là chỗ tôi sẽ nói lại nếu có lượt ba.
 *
 * ── rồi đo lại trên bản dựng thật, vì mô phỏng không phải bằng chứng ──
 *
 * Thả tay ở −60 (đã qua ngưỡng cam kết 47,5), hàng nghỉ đúng −72 — mở hết,
 * không hụt:
 *
 *     90% quãng ở ~176ms · đứng yên sau ~528ms · vọt lố phía đối diện 0,3 điểm
 *
 * Ngắn hơn bảng mô phỏng (217/717) vì quãng thật chỉ 12 điểm chứ không phải cả
 * 72: Reanimated dừng lò xo theo NĂNG LƯỢNG, nên biên độ nhỏ thì chạm ngưỡng
 * sớm hơn. Hai con số nói hai chuyện khác nhau và không được trộn.
 *
 * Ba lượt đo đầu đều hỏng, chép lại để khỏi hỏng lần nữa: kéo 9 nấc là đã quá
 * mở nên lò xo chỉ đi 2 điểm; kéo 6 nấc là chưa tới ngưỡng nên hàng bật NGƯỢC
 * về 0 — cú đóng chứ không phải cú mở; và mốc đo lấy theo hộp của cái nhãn ra
 * chỗ nghỉ −67,1 trong khi hình học nói −72, vì nhãn nằm bên trong phần tử
 * đang co 0,82 (HANDOVER_SCALE) nên hộp của nó trộn hai chuyển động. Mốc đúng
 * là translateX của chính tấm thẻ.
 *
 * Hằng này dùng ở HAI chỗ (`swipe-row.tsx`, `today-meals.tsx`), nên cả hai cùng
 * chậm lại — đúng điều đoạn trên vừa lập luận: một cử chỉ, một nhịp.
 */
export const SWIPE_SNAP = { ...spring(0.40, BOUNCE.snappy), overshootClamping: false };

/**
 * How a press answers.
 *
 * ── the depth ──
 *
 * 0.97. The app was using 0.92, 0.95 and 0.98 in different files, which is
 * three answers to one question. 0.92 on a full-width card is a lurch — the
 * whole surface visibly shrinks away from the finger; the same 0.92 on a small
 * icon button is barely visible, because the *absolute* distance travelled is
 * what the eye reads, not the ratio. 0.97 is the value that stays legible on a
 * 44pt button and stays polite on a 350pt card, which is the range this app
 * actually has.
 *
 * ── the spring ──
 *
 * ζ = 0.707, ωn = 28.3 rad/s. Integrated rather than guessed at: it covers 90%
 * of the press depth in 94ms and is within a thousandth of its target by 118ms,
 * which is fast enough that the surface is already down before a normal tap
 * lifts.
 *
 * The overshoot is 4% of the travel, and 4% of a 1 → 0.97 press is 0.0012 of
 * scale — 0.05pt on a 44pt button, 0.4pt on a 350pt card. Sub-pixel at both
 * ends of the range this app actually has, which is the point: overshoot you
 * *can* see turns a button into a toy, and these are mostly cards carrying
 * numbers about somebody's body.
 *
 * The same spring runs both ways. A press-in that is snappier than the release
 * is the usual instinct and it feels wrong here: the release is the half you
 * watch, because your finger is out of the way by then.
 */
export const press = {
  scale: 0.97,
  /**
   * For controls small enough that 3% is nothing.
   *
   * The eye reads the *distance* a thing moves, not the ratio, so 0.97 on a
   * 24pt icon is 0.7pt of travel — below the threshold where it registers as a
   * response at all. Every place in the app that had reached for a deeper press
   * on its own turned out to be exactly this: the back chevron, the two FABs,
   * a tab-bar icon, the awards icon, a small stepper. Six sites, all under a
   * finger's width, none of them a card.
   *
   * 0.92 rather than the 0.88–0.94 they variously used, for the same reason
   * there is one `scale` and not fifty.
   */
  deep: 0.92,
  /**
   * The dim that goes with it, kept at the value the app already used
   * everywhere so migrating a call site changes *how* it moves and not *how
   * far*. Scale alone is too quiet on a large card — there is no edge near
   * enough to your finger to see 3% by; the dim is what carries the feedback at
   * card size, and the scale is what carries it at button size.
   */
  opacity: 0.85,
  spring: { damping: 20, stiffness: 400, mass: 0.5 },
} as const;

/*
  ── why there are no easing tokens ──

  Because every call site already passes its own curve, and the curve is a
  bigger part of how a motion feels than its length. Two of the seven places
  migrated to these tokens run on Reanimated's default `inOut(quad)` and the
  rest on `out(cubic)` or a bespoke bezier; handing out an `ease` token invites
  the next edit to apply it "for consistency", which would change the feel of
  animations nobody asked to change.

  Durations are safe to share because a duration is a quantity. A curve is a
  shape, and the shapes here are doing different jobs.
*/
