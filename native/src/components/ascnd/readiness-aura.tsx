import { useIsFocused } from 'expo-router';
import { useEffect, useId } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { makeStyles, type PaletteKey } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * The colour behind Today, taken from how recovered you are.
 *
 * ── why the background is allowed to say something ──
 *
 * The reference this follows puts the day's state in the whole surface: a warm
 * sky behind strain, a green one behind recovery. Reading it as decoration
 * misses the point — it is the one thing on the screen you take in before you
 * have read anything, and spending it on a fixed pastel would be spending the
 * first half-second on nothing.
 *
 * So it is the readiness colour, and it is the same three the ring itself uses.
 * The background and the number cannot disagree, because they are one value.
 *
 * ── why it is barely there ──
 *
 * This app is dark, and the reference is not. Translating a pastel wash
 * literally would mean a bright field behind white text, so what carries over
 * is the IDEA — the day has a colour — at the strength a dark screen can hold.
 * `AURA_ALPHA` is where that is decided, and the ceiling is set by the text
 * that sits on top of it rather than by taste: `constants/ascnd.ts` records the
 * contrast work behind these colours, and a wash that eats a ratio it measured
 * would be a regression it cannot see.
 *
 * ── why SVG and not a gradient library ──
 *
 * `expo-linear-gradient` is not in this project, and adding it means a native
 * rebuild for one wash. `react-native-svg` is already here and already draws
 * every gradient in the app; `assistant-aura.tsx` does exactly this.
 */

/**
 * The strongest the wash gets, at its centre.
 *
 * 0.13. Above about 0.18 the amber state starts lifting the page behind the
 * muted body text enough to matter, and muted text on this background is the
 * pairing `constants/ascnd.ts` says was already the tightest in the palette.
 */
const AURA_ALPHA = 0.13;

/**
 * Độ mờ của trạng thái NGHỈ — khi chưa có số đo nào.
 *
 * 0,10, và con số này được ĐO chứ không chọn. Xem phép tính trong thân hàm:
 * trên 0,10 thì chữ phụ tụt xuống dưới 4,5:1 ở trường hợp xấu nhất.
 */
const RESTING_ALPHA = 0.1;

/**
 * Đỉnh của lớp nâng trên GIẤY — 0,50 trắng, ra 1,05:1 so với trang.
 *
 * Không phải `AURA_ALPHA` đổi màu: hai con số ấy trả lời hai câu hỏi khác
 * nhau. 0,13 là "bao nhiêu ánh sáng màu rọi lên một phòng tối trước khi chữ
 * bắt đầu khó đọc"; 0,50 là "bao nhiêu trắng trên giấy thì thấy được mà chưa
 * thành một cái đốm". Trần vật lý của câu thứ hai là 1,097:1 (trắng đặc), nên
 * 0,50 dùng 46% quãng còn lại — thấy được, và còn chỗ để đẩy nếu máy thật nói
 * là quá mờ.
 */
const PAPER_ALPHA = 0.5;

/**
 * Nhịp trôi của trạng thái nghỉ, và vì sao chỉ trạng thái nghỉ mới trôi.
 *
 * ── cái được mượn từ Apple Music, và cái không ──
 *
 * Nền "Now Playing" của Apple Music dựng bằng BỐN bản sao ảnh bìa ở 25/50/80/
 * 125% bề ngang khung nhìn, xoay tại chỗ và trôi theo quỹ đạo tròn, làm mờ qua
 * một Metal shader có phép "twist". Không có gì trong đó bê thẳng sang được:
 * app này không có ảnh bìa để lấy màu, và không có pipeline shader — thêm một
 * cái là một lần dựng lại native cho đúng một hiệu ứng.
 *
 * Thứ chuyển được là NGUYÊN LÝ: ánh sáng có nguồn, và nguồn ấy chuyển động
 * chậm tới mức bạn không bắt được nó đang chuyển, chỉ thấy màn hình không chết.
 *
 * ── và chỉ trạng thái nghỉ ──
 *
 * Wash MÀU là một phát biểu về hôm nay, và một phát biểu thì đứng yên. Trạng
 * thái nghỉ không phát biểu gì, nên nó được phép thở. Cho cả hai cùng trôi là
 * làm màu trạng thái bớt dứt khoát đi để đổi lấy một chuyển động không ai xin.
 *
 * 22 giây: đủ chậm để trong một lần liếc màn hình nó đứng yên, đủ động để nhìn
 * lâu thì thấy khác. `assistant-aura.tsx` ghi lại vì sao việc này gần như miễn
 * phí — `<Svg>` vẽ MỘT lần, chỉ `Animated.View` bọc ngoài chạy transform, nên
 * "tám giây trôi tốn đúng bằng ngồi yên".
 */
const DRIFT_MS = 22_000;
/** Biên độ trôi, theo tỉ lệ bề ngang màn hình. Nhỏ có chủ đích. */
const DRIFT = 0.06;
/**
 * Lớp được vẽ to hơn màn hình bao nhiêu, để cú trôi không bao giờ hở mép.
 *
 * Ràng buộc là `OVERSCALE ≥ 1 + DRIFT` — xem phép tính ở chỗ dùng. Giữ hai
 * hằng số cạnh nhau vì chúng chỉ đúng khi đi cùng nhau, và
 * `tools/resting-aura.mjs` kiểm chính bất đẳng thức ấy.
 */
const OVERSCALE = 1.08;

/** How far down the screen the two POOLS reach before they are gone. */
const REACH = 0.52;

/**
 * Và dưới hai vũng ấy, cả trang vẫn có không khí.
 *
 * ── lỗi nó sinh ra để sửa ──
 *
 * `REACH = 0.52` nói hai vũng tắt ở giữa màn. Dưới mốc ấy, trang là nền TRẦN —
 * `#070708` ở bản tối. Dựng ảnh cả màn Chi tiết giấc ngủ thì thấy rõ: một phần
 * ba trên có bầu trời, hai phần ba dưới là một tấm đen phẳng có mấy cái thẻ
 * nổi trên đó. Ảnh tham chiếu chủ dự án gửi thì ngược lại — nền của nó đi một
 * quãng từ trên xuống dưới, và đó là thứ làm nó ra "một không gian" chứ không
 * phải "một danh sách thẻ".
 *
 * ── vì sao nó KHÔNG đụng tới một phép đo nào ──
 *
 * Mọi luật tương phản của kho này đo ĐỈNH: `glass-stack.mjs` dựng wash ở đúng
 * độ mờ đầy của hai vũng, `sleep-ramp.mjs` đo dải ngủ trên mặt kính của cái
 * wash ấy. Lớp nền này bắt đầu ở **0 tại đỉnh** và chỉ dày lên khi đi xuống,
 * nên đỉnh không đổi một count nào. Đo ra:
 *
 *     đỉnh wash  #121324  L 0.0072      ← không đổi
 *     đáy trang  #150c1d  L 0.0051      ← 0,71× đỉnh, tức vẫn dưới ca xấu nhất
 *     trên đáy:  chữ phụ 6,48 · dải ngủ 3,55 · chữ chính 8,91   (sàn 4,5 / 3,0)
 *
 * Đẩy tới 0,26 thì đáy vượt đỉnh (1,09×) và phép đo ở đỉnh thôi là ca xấu
 * nhất — lúc ấy mọi luật đang canh nhầm chỗ. 0,18 để lại biên.
 *
 * ── trên GIẤY nó KHÔNG được là một sắc lạnh, và đó là một lỗi đã xảy ra ──
 *
 * Bản đầu của lớp này tô `tint2` lên giấy ở độ mờ 0,10, kèm một câu tôi tự
 * khẳng định chứ không đo: "ở độ mờ THẤP một sắc tint không nhuộm". Chủ dự án
 * nhìn ảnh và nói app mất màu be. Đo lại trên chính ảnh đã dựng:
 *
 *     giấy khai trong bảng  #f7f4ef   hue  38°   bão hoà 33,3%
 *     đáy trang, trước      #f7f4ef   hue  38°   bão hoà 33,3%
 *     đáy trang, sau        #eceeed   hue 150°   bão hoà  5,6%
 *
 * Hue LẬT từ hổ phách sang lục-lam và bão hoà sập còn một phần sáu. Một sắc
 * lạnh phủ lên một nền ấm không làm nó sâu hơn, nó TRUNG HOÀ nền ấy — và 0,10
 * đã quá đủ cho một tờ giấy chỉ bão hoà 33%. Đúng điều chú thích của `paint`
 * ngay dưới đây đã ghi, chỉ ở một độ mờ thấp hơn mức họ đang nói tới.
 *
 * Nên giấy đi sâu bằng CHÍNH HỌ MÀU CỦA NÓ: `accent` #e9e3d8, một sắc be đậm
 * hơn. Đo ở 0,34 ra #f2eee7 — hue 38°, đúng bằng hue của giấy, bão hoà 29,7%,
 * chữ phụ 5,00:1. Đáy sâu lại thấy được mà không mất một độ ấm nào.
 *
 * `tools/paper-warmth.mjs` canh đúng phép đo ấy, vì lỗi này `tsc` không thấy,
 * bảng màu không thấy, và luật tương phản không thấy: cả ba chỉ số đều đạt
 * trong khi màu nhận diện của app biến mất.
 */
const FLOOR_ALPHA = 0.18;
const FLOOR_ALPHA_PAPER = 0.34;

/*
  Khoá của bảng màu, không phải mã màu: một mã màu ở phạm vi module bị ĐÓNG BĂNG
  lúc import và sẽ giữ màu của theme tối kể cả khi người dùng bật theme sáng.
  Bảng vẫn là hằng thật; chỗ vẽ — nơi luôn có `c` — mới đổi khoá thành màu.
*/
const TINT: Record<string, PaletteKey> = {
  green: 'readinessGreen',
  yellow: 'readinessYellow',
  red: 'readinessRed',
};

export function ReadinessAura({
  status,
  tint: override,
  tint2,
}: {
  status: 'green' | 'yellow' | 'red' | null;
  /**
   * A colour that is not a readiness state.
   *
   * Today's hero is a deck now, and the wash follows whichever card you swiped
   * to — so the activity page paints its own colour rather than the readiness
   * one. Passing a colour is how a page that is not ABOUT readiness says so;
   * without it the background would keep asserting a readiness state under a
   * card that is measuring something else, which is the same class of lie the
   * `useId` note below is about.
   */
  tint?: string;
  /**
   * Màu thứ hai, đặt lệch tâm.
   *
   * Một wash tròn duy nhất của MỘT màu đọc ra đơn điệu vì nó không có hướng:
   * nó sáng ở giữa và tối dần đều ra mọi phía, tức là mắt không có gì để đi
   * theo. Ảnh tham chiếu có hai tông chuyển vào nhau chéo qua khung hình, và đó
   * là thứ làm nó ra "một bầu trời" chứ không phải "một vệt sáng".
   *
   * Nên lớp thứ hai neo ở một góc khác, phủ chồng lên lớp thứ nhất. Hai hình
   * tròn lệch tâm chồng nhau cho ra một dải chuyển màu mà không cần đến một
   * gradient tuyến tính thứ ba, và mỗi lớp vẫn tắt hẳn ở rìa của nó nên không
   * có mép nào.
   */
  tint2?: string;
}) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const { width, height } = useWindowDimensions();
  /*
    Ids in SVG are document-global on native rather than local to the `<Svg>`
    that declares them, so two of these mounted at once would both draw whichever
    was registered last. `status-scrim.tsx` records that this "has caught the app
    three times; `useId` is the rule" — and here the consequence would be a
    specific lie: a screen showing one person's readiness colour under another
    screen's number.
  */
  const tint = override ?? (status ? c[TINT[status]] : null);
  /*
    Chưa đo được thì KHÔNG tô màu readiness — nhưng cũng không để trang đen.

    ── câu cũ, và nửa nào của nó vẫn đúng ──

    Chỗ này từng `return null` kèm lý do: "A default wash would be the screen
    asserting a state before anything has been measured." Nửa ấy vẫn đúng và
    không được động vào: xanh/vàng/đỏ là TÍN HIỆU, tô một trong ba khi chưa có
    số đo là nói dối về cơ thể người dùng.

    Nửa sai là kết luận. "Không tô màu trạng thái" không kéo theo "không tô gì":
    người dùng mở app lần đầu, chưa nối Apple Health, và nhận một màn hình đen
    tuyền với một vòng tròn xám — trang trông như hỏng chứ không như đang chờ.

    ── nên trạng thái nghỉ dùng BẠC THƯƠNG HIỆU ──

    `constants/ascnd.ts` ghi thẳng về nhóm bạc: "It is an identity, not a
    signal." Đó chính xác là thứ cần ở đây — một màu không phát biểu gì về sức
    khoẻ hôm nay, chỉ nói rằng đây là app này. Không có cách đọc nhầm nào: bạc
    không nằm trên thang xanh–vàng–đỏ.
  */
  const resting = !tint;

  /*
    Cú trôi.

    Hook khai vô điều kiện — React không cho gọi hook trong nhánh — còn việc
    CHẠY hay không thì quyết định bên trong effect. Ba cổng, và cả ba đều là
    thứ `tools/aura-cost.mjs` đòi ở lớp aura kia:

      · `resting`      — wash màu là một phát biểu, và phát biểu thì đứng yên
      · `useIsFocused` — màn hình bị che thì không có ai nhìn cái gì cả
      · Reduce Motion  — một vòng lặp vô hạn là đúng thứ cài đặt ấy tồn tại để tắt

    `cancelAnimation` khi gỡ: một hiệu ứng không ai nhìn là một cái máy nóng.
  */
  const t = useSharedValue(0);
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const moving = resting && focused && !reduceMotion;

  useEffect(() => {
    if (!moving) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: DRIFT_MS, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [moving, t]);

  /* Chỉ transform — không chạm vào thuộc tính nào của SVG. `assistant-aura.tsx`
     ghi lại vì sao: `react-native-svg` vẽ lại cả `<Svg>` khi bất kỳ prop con
     nào đổi, nên animate một `<Stop>` là cách đắt nhất để làm một vệt mờ chuyển
     động. Ở đây `<Svg>` là bitmap tĩnh và chỉ cái vỏ quanh nó đi. */
  const drift = useAnimatedStyle(() => ({
    transform: [
      { translateX: (t.value - 0.5) * width * DRIFT },
      { translateY: (0.5 - t.value) * width * DRIFT * 0.6 },
      /*
        `OVERSCALE`, không phải 1.

        Bản đầu ở đây là `scale: 1 + t.value * 0.04`, và ở `t = 0` lớp bị dịch
        TRÁI 3% bề ngang trong khi vẫn đúng cỡ màn hình — tức là hở một dải 3%
        không vẽ gì ở mép phải, và pool thứ hai nằm ở cx=88% nên chỗ hở đó có
        màu ngay bên cạnh. Một đường dọc cứng vắt qua màn hình, cùng loại với
        vết cắt ngang mà chú thích về bán kính `r` ở dưới đã ghi lại.

        Lớp phải LUÔN lớn hơn màn hình đủ để nuốt hết biên độ trôi: scale `s`
        nới mỗi bên `(s − 1) / 2`, còn quãng dịch lớn nhất là `DRIFT / 2`. Nên
        điều kiện là `(s − 1) / 2 ≥ DRIFT / 2`, tức `s ≥ 1 + DRIFT`. 1.08 với
        DRIFT 0.06 để lại 1% dự phòng.
      */
      { scale: OVERSCALE + t.value * 0.04 },
    ],
  }));

  const uid = useId();
  const gid = `readinessAura-${uid}`;
  const gid2 = `readinessAura2-${uid}`;
  const gid3 = `readinessAura3-${uid}`;


  /* Ở trạng thái nghỉ, hai tông là hai sắc bạc cạnh nhau trên cùng thang —
     `primary` và `goldLight` — nên phép chồng chéo vẫn cho ra một dải chuyển
     màu chứ không phải một vệt sáng đơn. Xem chú thích `tint2`.

     Ngoài trạng thái nghỉ: mặc định là chính `tint` — một màu vẫn vẽ được, chỉ
     là phẳng hơn; không bịa ra một tông thứ hai khi chỗ gọi chưa chọn. */
  /*
    ── và trên GIẤY, cả hai tông đều là TRẮNG ──

    Hai vũng này là ánh sáng của trạng thái rọi lên một trang gần đen: chúng
    CỘNG sáng. Trên #f7f4ef thì phép composite đảo chiều — `readinessGreen` ở
    13% không rọi xanh lên giấy, nó NHUỘM giấy thành xanh và làm tối đi. Đó
    đúng là "rgba(state, 0.135) trên nền giấy" mà bản thiết kế cấm, và hạ độ
    mờ không sửa được vì hướng đã sai.

    Nên bản sáng nâng bằng TRẮNG, đích **1,05:1 ở đỉnh** so với trang — cùng
    con số và cùng lý do với bốn vũng của `assistant-aura.tsx`; hai hệ ánh sáng
    trong một app không được có hai định nghĩa "sáng lên bao nhiêu". Hình dạng
    vẫn còn: hai radial ở hai vị trí khác nhau chồng lên nhau, và độ mờ vẫn đổ
    dốc 1 → 0,42 → 0 như cũ. Chỉ MÀU biến mất.

    Trần thì phải nói ra: trắng ĐẶC trên giấy chỉ nâng được 1,097:1. Đẩy hết cỡ
    cũng không tới 1,125 của bản tối, và không màu nào sửa được điều đó.

    ── và cái trần độ mờ ở dưới KHÔNG ràng bản sáng ──

    `RESTING_ALPHA = 0.10` được đo từ ràng buộc "chữ phụ trên wash phải ≥4,5:1"
    trên nền TỐI, nơi wash làm nền SÁNG lên và kéo chữ sáng lại gần nền. Trên
    giấy, nâng về trắng làm nền sáng hơn và chữ MỰC càng tách ra — ràng buộc ấy
    lỏng ra chứ không siết lại. Nên bản sáng dùng đích của riêng nó.
  */
  const paper = !m.lit;
  const paint = paper ? c.card : (tint ?? c.primary);
  const second = paper ? c.card : resting ? c.goldLight : (tint2 ?? paint);
  /*
    Trần độ mờ của trạng thái nghỉ, ĐO chứ không chọn.

    Bạc `#a8afbd` sáng hơn hẳn ba màu tín hiệu neon, nên cùng một alpha nó nâng
    nền lên nhiều hơn. Chữ phụ (`mutedForeground` #828282) là cặp chặt nhất
    trong bảng màu — `constants/ascnd.ts` ghi lại cả phép đo đưa nó từ 3,39:1
    lên 4,71:1 — nên nó là thứ quyết định trần ở đây.

    Đo trên nền `background` #070708, trường hợp xấu nhất là wash ở đỉnh sáng
    nằm ngay dưới chữ phụ:

        alpha 0.10 → 4,63:1   ✓
        alpha 0.12 → 4,47:1   ✗ dưới 4,5

    Nên 0.10, và nó an toàn ở MỌI chỗ trên màn hình chứ không chỉ ở chỗ wash
    tình cờ yếu. Kiểm lại bằng:

        node -e "const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
        const lin=c=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4};
        const L=v=>0.2126*lin(v[0])+0.7152*lin(v[1])+0.0722*lin(v[2]);
        const bg=hex('#070708'),s=hex('#a8afbd'),m=hex('#828282'),a=0.10;
        const o=s.map((v,i)=>v*a+bg[i]*(1-a));
        console.log(((Math.max(L(m),L(o))+0.05)/(Math.min(L(m),L(o))+0.05)).toFixed(2))"
  */
  const alpha = paper ? PAPER_ALPHA : resting ? RESTING_ALPHA : AURA_ALPHA;

  const h = height * REACH;
  /* Trên nền TỐI: màu của vũng THỨ HAI. Vũng một neo trên trái, vũng hai ở
     phải-giữa, nên đi từ trên xuống là đi từ tông một sang tông hai; lớp nền
     nối tiếp quãng ấy thay vì lặp lại tông đã ở trên.

     Trên GIẤY: `accent`, không phải một tông của trang. Lý do và phép đo ở
     chú thích của `FLOOR_ALPHA_PAPER` — một sắc lạnh ở đây đã từng xoá mất
     màu be của app. */
  const floorPaint = paper ? c.accent : second;
  const floorAlpha = paper ? FLOOR_ALPHA_PAPER : FLOOR_ALPHA;

  return (
    <View style={styles.fill} pointerEvents="none">
      <Animated.View style={drift}>
      {/*
        `<Svg>` cao HẾT màn, nhưng hai `<Rect>` của vũng vẫn cao đúng `h`.

        Gradient toả dùng `objectBoundingBox`, tức hệ quy chiếu là CHÍNH hình
        được tô chứ không phải `<Svg>` — nên nới `<Svg>` không kéo giãn hai
        vũng một chút nào. Đó là điều kiện để câu "đỉnh không đổi một count
        nào" ở trên đúng theo nghĩa đen, và là lý do lớp nền được thêm vào
        cùng một `<Svg>` thay vì một lớp thứ hai: một `<Svg>` phủ màn hình nữa
        là một bề mặt nữa mà `UIVisualEffectView` phải lấy mẫu lại mỗi khung
        hình cuộn — đúng chi phí mà `aura-window.mjs` đã đo và cắt.
      */}
      <Svg width={width} height={height}>
        <Defs>
          {/*
            The shape being filled and the gradient's frame are the same box,
            and the first version got that wrong in a way that drew NOTHING.

            It filled an ellipse centred on `cy={0}` with `ry={h}`, so the
            shape's bounding box ran from −h to +h — twice the visible height,
            half of it above the screen. A gradient in objectBoundingBox units
            measures against that box, so `cy="0%"` put the bright centre at the
            TOP of it, off-screen, and the radius ran out at exactly y = 0.
            Everything anybody could see was past the last stop.

            Measured on the shipped build before the fix: the page's red channel
            was within one count of its blue at every height, on an AMBER day.
            It compiled, it mounted, the gradient was in the document, and it
            painted nothing.

            A rect over exactly the visible band fixes it because the box is now
            the thing you are looking at. The corners are not a problem the way
            an earlier note here feared: the last stop is fully transparent, so
            where the circle does not reach there is nothing to see.
          */}
          <RadialGradient id={gid} cx="22%" cy="0%" r="95%">
            <Stop offset="0" stopColor={paint} stopOpacity={alpha} />
            <Stop offset="0.55" stopColor={paint} stopOpacity={alpha * 0.42} />
            <Stop offset="1" stopColor={paint} stopOpacity={0} />
          </RadialGradient>
          {/*
            r phải NHỎ HƠN khoảng cách từ tâm tới đáy hình chữ nhật, nếu không
            lớp wash vẫn còn màu đúng lúc hình chữ nhật hết vẽ — và đó là một
            đường ngang cứng vắt qua màn hình.

            Ở đây tâm là cy=26%, nên khoảng cách tới đáy là 1 − 0.26 = 0.74.
            Bản đầu để r=85% > 0.74 và cắt thật: đo trên bản đã ship, ngay tại
            y = height × REACH, cột x=88% (dưới đúng tâm này) nhảy 5 count trong
            một hàng, còn cột x=6 nhảy 0 — nên phép đo đầu tiên của tôi, đo ở
            mép trái, đã báo "không có vết cắt" cho một vết cắt có thật.

            Gradient thứ nhất có cy=0% nên khoảng cách của nó là 1.0 và r=95%
            vẫn an toàn.
          */}
          <RadialGradient id={gid2} cx="88%" cy="26%" r="70%">
            <Stop offset="0" stopColor={second} stopOpacity={alpha * 0.85} />
            <Stop offset="0.6" stopColor={second} stopOpacity={alpha * 0.3} />
            <Stop offset="1" stopColor={second} stopOpacity={0} />
          </RadialGradient>
          {/* 0 ở đỉnh — nên nó cộng đúng 0 vào chỗ mọi luật đang đo — rồi dày
              dần xuống đáy. Mốc giữa ở 0,45 để quãng đi phi tuyến: nửa trên
              gần như không có gì, nửa dưới mới thật sự sâu lại. */}
          <LinearGradient id={gid3} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={floorPaint} stopOpacity={0} />
            <Stop offset="0.45" stopColor={floorPaint} stopOpacity={floorAlpha * 0.28} />
            <Stop offset="1" stopColor={floorPaint} stopOpacity={floorAlpha} />
          </LinearGradient>
        </Defs>
        {/* Nền đi TRƯỚC: hai vũng phải nằm trên nó, không phải dưới. */}
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${gid3})`} />
        <Rect x={0} y={0} width={width} height={h} fill={`url(#${gid})`} />
        <Rect x={0} y={0} width={width} height={h} fill={`url(#${gid2})`} />
      </Svg>
      </Animated.View>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  /* Behind everything, and out of the way of every touch. `zIndex` is not set:
     being first in the tree is what puts it at the back, and a z-index here
     would be a second answer to a question already answered. */
  fill: { position: 'absolute', top: 0, left: 0, right: 0 },
}));
