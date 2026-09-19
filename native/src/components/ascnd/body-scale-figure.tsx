import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';

/**
 * Chiếc cân — dựng bằng vector, không phải một tấm ảnh.
 *
 * ── tỉ lệ đọc ra khỏi ảnh mẫu ──
 *
 * Chủ dự án đưa một ảnh dựng và bảo bám sát nó. Các con số dưới đây là tỉ lệ đo
 * trên chính ảnh ấy rồi quy về hộp 210×200, không phải ước lượng:
 *
 *     thân cân       590 × 560 điểm ảnh  →  1,054 : 1
 *     màn hình       rộng 0,39 · cao 0,29 của thân, nằm TRÊN–GIỮA
 *     tấm cảm biến   rộng 0,16 · cao 0,20 của thân, bốn góc
 *     bo góc thân    ≈ 0,095 bề rộng
 *
 * Bốn tấm cảm biến KÈM hai bên màn hình chứ không nằm dưới nó: trong ảnh, mép
 * trên của tấm bắt đầu cao hơn mép trên màn hình một chút. Giữ đúng thế, vì đó
 * là thứ làm người ta nhận ra "cái cân điện tử" chứ không phải "một hình vuông
 * có bốn chấm".
 *
 * ── vì sao con số là `<Text>` của RN, không phải `<Text>` của SVG ──
 *
 * Nó là DỮ LIỆU, và nó phải đi theo thang chữ của app, theo Dynamic Type, theo
 * bảng màu. SVG `<Text>` không nhận mấy thứ ấy. Nên phần HÌNH là SVG, phần CHỮ
 * là RN, chồng lên nhau bằng PHẦN TRĂM của hộp thiết kế — nên cả hai co giãn
 * cùng nhau trên mọi cỡ iPhone mà không ai phải gõ lại toạ độ.
 *
 * ── hai lớp viền, và lớp trong là thứ dễ mất nhất ──
 *
 * Ảnh mẫu có một viền mềm ở mép ngoài và MỘT đường nữa lùi vào trong. Bỏ lớp
 * trong đi thì chiếc cân phẳng ra và đọc thành một cái thẻ bo góc.
 *
 * ── màu: MỘT độ mờ cho cả hai diện mạo là không đủ, và đây là bằng chứng ──
 *
 * Bản đầu dùng đúng một `alpha(c.foreground, …)` cho mỗi lớp ở cả hai diện mạo.
 * Lập luận nghe rất gọn: mực bản sáng là màu tối, bản tối là màu sáng, nên một
 * dòng cho ra "đậm hơn mặt dưới" ở sáng và "sáng hơn mặt dưới" ở tối.
 *
 * Trên ảnh MÁY THẬT nó sai. Chủ dự án: *"Trong Dark Mode hiện tại, thân cân và
 * background gần như hoà vào nhau."* Và phép đo của tôi đã NÓI ra điều đó rồi —
 * thân cân/trang 1,084 ở tối so với 1,104 ở sáng — mà tôi lý giải nó đi, gọi là
 * "minh hoạ, chấp nhận được". Hai con số gần bằng nhau, hai kết quả khác nhau:
 * ở vùng gần đen, một tỉ số 1,08 là một chênh lệch độ sáng TUYỆT ĐỐI rất nhỏ,
 * và màn OLED nén nốt phần còn lại. Tỉ số tương phản nói quá về độ nhìn thấy ở
 * đầu tối của thang.
 *
 * Nên độ mờ TÁCH theo diện mạo, và mỗi con số của bản tối được chọn để khớp
 * THỨ BẬC của bản sáng chứ không phải khớp con số của nó:
 *
 *     lớp                     sáng α → tỉ số    tối α → tỉ số
 *     thân cân / trang        0,05    1,104     0,11    1,237
 *     viền ngoài / trang      0,13    1,298     0,17    1,484
 *     viền trong / thân       0,07    1,150     0,06    1,167
 *     tấm cảm biến / thân     0,08    1,173     0,06    1,167
 *     màn hình / thân         (card)  1,211     0,07    1,200
 *     chữ ASCND / thân        0,28    1,808     0,20    1,810
 *
 * Để ý ba lớp có α bản tối THẤP hơn bản sáng: chúng nằm trên một thân cân đã
 * sáng hơn (0,11 thay vì 0,05), nên ít mực hơn vẫn ra đúng bậc ấy. Đó là phép
 * composite tự lo, không phải một sự trùng hợp.
 *
 * Và mặt MÀN HÌNH ở bản tối nay nhẹ hơn hẳn bản trước (0,07 thay vì 0,13). Chủ
 * dự án gọi bản cũ là *"một khối xám quá nặng"*, và nguyên nhân không nằm ở màn
 * hình: thân cân quá tối nên màn hình đọc ra như một tấm bê tông rời. Sửa thân
 * cân thì màn hình về đúng sức nặng tương đối của nó.
 *
 * Mọi lựa chọn viết thẳng ở prop dạng `fill={m.lit ? a : b}` — thứ
 * `tools/theme-shape.mjs` gọi là MÀU chứ không phải hình dạng, nên không nhánh
 * cây nào được dựng thêm. `tools/body-scale.mjs` đọc lại từng cặp số này.
 */

/* Hộp thiết kế. Mọi số bên dưới là điểm trong hộp này, nên đổi cỡ ở ngoài
   không phải sửa gì ở đây. */
const VB = { w: 210, h: 200 } as const;

const PLATE = { x: 4, y: 4, w: 202, h: 192, r: 20 } as const;
/* Lùi vào 9 điểm: đúng tỉ lệ đường viền trong của ảnh mẫu. */
const INNER = { x: 13, y: 13, w: 184, h: 174, r: 13 } as const;
const SCREEN = { w: 82, h: 56, y: 21, r: 10 } as const;
const PAD = { w: 33, h: 41, r: 10, side: 17, top: 25, bottom: 24 } as const;

/* Giữa hai tấm cảm biến dưới, đúng chỗ ảnh mẫu đặt chữ. */
const WORDMARK_Y = 138;

/**
 * Hai TRẠNG THÁI của chiếc cân: đứng chờ, và vừa có người bước lên.
 *
 * ── đặt hàng ──
 *
 * Chủ dự án: *"khi người dùng vuốt thanh cân nặng, chiếc cân phải sáng thức dậy
 * giống như một chiếc cân điện tử thật vừa có người bước lên"* — display là
 * điểm sáng chính, bốn tấm cảm biến là điểm sáng phụ, viền chỉ rõ thêm một
 * chút. Không glow, không LED xanh, không particle.
 *
 * ── MÀN HÌNH là một ĐÈN NỀN, và đó là lý do công thức chỉ có một ──
 *
 * Bản đầu tôi định làm mặt màn hình bằng `alpha(c.foreground, …)` như mọi lớp
 * khác. Nó sai hướng ở bản sáng: mực bản sáng là màu TỐI, nên "sáng lên" lại ra
 * tối đi. Một cái đèn nền thì TRẮNG ở mọi diện mạo — nó là nguồn sáng, không
 * phải một token theme. Nên mặt màn hình là **trắng ở một độ mờ**, và độ mờ ấy
 * chính là công tắc.
 *
 * Ở bản tối, 0,06 là một tấm TỐI và 0,92 là một tấm SÁNG — nên chữ số đảo màu
 * theo tấm, đúng như một màn LCD có đèn nền vừa bật trong phòng tối. Đó không
 * phải một hiệu ứng thêm vào; đó là hệ quả của việc tấm nền thật sự sáng lên.
 *
 * ── vì sao bản SÁNG phải DỊU ĐI ở trạng thái nghỉ ──
 *
 * Ở bản sáng, mặt màn hình vốn đã là `#ffffff` và chữ số vốn đã là `foreground`
 * — KHÔNG còn chỗ nào để sáng thêm. Nên trạng thái "hoạt động" giữ đúng mức
 * hiện tại, và trạng thái "nghỉ" mới là cái được hạ xuống. Chủ dự án nói đúng
 * điều này: *"Hãy hình dung chiếc cân hiện tại đang ở trạng thái STANDBY"* —
 * hoá ra ở bản sáng nó đang ở trạng thái ACTIVE, và standby là thứ chưa tồn tại.
 *
 * ── LẦN ĐẦU LÀM SAI, và cái sai là gì ──
 *
 * Vòng trước tôi nâng MỌI lớp cùng lúc: thân 0,11→0,14, tấm cảm biến 0,06→0,12,
 * viền 0,17→0,22. Chủ dự án xem render và bác: *"Đây không được là chuyện đổi
 * màu cái cân từ tối sang sáng"*, và liệt kê đúng thứ tôi vừa làm vào danh sách
 * cấm — *"❌ brightness filter cho toàn bộ cái cân"*.
 *
 * Lý do nó sai không phải con số nào quá cao. Nó sai vì nâng đều thì **không có
 * gì phản ứng**: nếu cả thân, cả tấm cảm biến, cả viền đều sáng thêm 30% thì mắt
 * đọc ra "ảnh này vừa được làm sáng lên", chứ không phải "cái đèn trong vật này
 * vừa bật". Một thiết bị thật thức dậy theo kiểu ngược lại: **thân không đổi gì,
 * chỉ một chỗ phát sáng**. Chênh lệch giữa các lớp mới là tín hiệu, không phải
 * mức sáng của từng lớp.
 *
 * Nên lần này thân cân ĐÓNG BĂNG, và con số nói ra nó đóng băng thật:
 *
 *     thân cân đổi        bộ đã bị bác        bộ này
 *     sáng                1,0375×             1,0092×
 *     tối                 1,0908×             1,0119×
 *
 * `tools/body-scale.mjs` đặt TRẦN 1,03 cho vế này — ở giữa hai cột, có biên cả
 * hai phía — và chạy lại chính bộ số đã bị bác để chứng minh trần ấy đỏ được.
 * Đó là lý do luật này không chỉ là một lời hứa trong chú thích.
 *
 * ── HAI ĐƯỜNG VIỀN THÂN CÂN: một vòng kéo về, rồi bị hoàn lại ──
 *
 * Trần trên chỉ canh MẶT thân cân. Có một vòng tôi mở nó ra cho cả hai đường
 * VIỀN, vì chủ dự án vừa chốt *"Body và outer border gần như giữ nguyên"* mà đo
 * ra thì viền là hai lớp động mạnh nhất cả hình sau display:
 *
 *     lớp             sáng      tối
 *     viền ngoài      1,0930×   1,1926×
 *     viền trong      1,0708×   1,1054×
 *     mặt thân        1,0092×   1,0119×
 *
 * Lập luận của tôi: 1,1926× nâng sáng cả CHU VI chiếc cân, tức đúng hình dạng
 * của *"viền sáng xung quanh"* trong danh sách cấm. Tôi kéo viền về 1,03×.
 *
 * Rồi chủ dự án nhìn hai bản cạnh nhau và chọn bản CŨ: *"tôi thích cách cân
 * sáng như cũ hơn"*. Nên viền ở đây là bộ số trước đó — tối 0,22/0,09, sáng
 * 0,17/0,10 — và trần cho viền đã gỡ khỏi `tools/body-scale.mjs`.
 *
 * Giữ đoạn này lại vì nó là bài học, không phải vì nó là lịch sử: **phép đo của
 * tôi không sai, nó chỉ không phải là thứ quyết định.** Tôi suy "chu vi sáng
 * lên = viền sáng xung quanh" ra từ một câu nguyên tắc; người đặt ra câu ấy
 * nhìn ảnh thật rồi nói không phải thế. Đừng kéo viền xuống lại chỉ vì thấy con
 * số 1,19 — nó đã được hỏi và đã được trả lời.
 *
 * ── bản SÁNG: hai kênh được nâng, rồi cũng hoàn lại cùng vòng ấy ──
 *
 * Cùng vòng đó tôi nâng `padEdge` 0,22→0,30 và `bezel` 0,22→0,28 ở bản sáng,
 * theo gợi ý *"Light Mode có thể tăng cảm giác ACTIVE một chút bằng
 * hierarchy/contrast của DISPLAY và SENSOR RIM"*. Cú hoàn lại trả cả hai về
 * 0,22, nên rim bản sáng đo 1,557:1 và khung 1,602:1 — vẫn trên sàn 1,5 mà
 * `tools/body-scale.mjs` đòi, nên đây là một lựa chọn thẩm mỹ chứ không phải
 * một vế rớt sàn.
 *
 * Cú thức dậy dồn vào ba chỗ, qua ba KÊNH THỊ GIÁC KHÁC NHAU thay vì ba lần
 * cùng một phép tăng độ mờ:
 *
 * ── kênh 1 · độ sáng · tấm đèn ──
 *
 * Chỉ MỘT lớp đi xa: mặt màn hình. Tối 0,06 → 0,92. Đó là thứ duy nhất trong cả
 * hình được phép "bật".
 *
 * ── kênh 2 · ĐẢO CHIỀU · khung kính màn hình ──
 *
 * Đây là chi tiết làm một tấm sáng đọc ra *tấm màn hình* chứ không phải *một lỗ
 * trắng*: trên máy thật, ánh sáng không đi qua được cái khung nhựa quanh kính,
 * nên khi đèn bật, viền quanh nó là đường TỐI NHẤT của cả mặt cân.
 *
 * Suy ra viền ấy không thể là một độ mờ đi lên. Nó phải ĐỔI TOKEN:
 *
 *     tối   nghỉ  `foreground` 0,13  (tấm đen → viền phải SÁNG mới tách khỏi thân)
 *     tối   hoạt  `background` 0,55  (tấm trắng → viền phải TỐI mới thành khung)
 *
 * Bản sáng không đảo, vì ở đó cả trang đã sáng nên khung tối là đúng ở cả hai
 * trạng thái — chỉ đậm thêm (0,10 → 0,22) và dày thêm.
 *
 * ── kênh 3 · HÌNH DẠNG · bốn tấm cảm biến ──
 *
 * Chủ dự án: *"đây là phần tôi muốn bạn chú ý hơn"*, và phải giống *cảm biến áp
 * lực đang được kích hoạt*, không phải đèn.
 *
 * Nên bốn tấm KHÔNG sáng lên chút nào: `pad` giữ NGUYÊN một con số ở cả hai
 * trạng thái (sáng 0,08 · tối 0,06). Toàn bộ phản ứng của chúng là một **đường
 * rim** mọc ra: `padEdge` 0 → 0,22, dày 0 → 1,2 điểm. Ở trạng thái nghỉ chúng là
 * bốn vệt phẳng không mép; ở trạng thái hoạt động chúng có một đường viền chạy
 * quanh, đo 1,56:1 (sáng) · 1,91:1 (tối) so với chính mặt tấm.
 *
 * Đó là một kênh cảm nhận khác hẳn độ sáng: thêm mép vào một vật làm nó đọc ra
 * "vào nét / thành vật thể", đúng cảm giác bốn miếng kim loại vừa ăn tiếp xúc.
 * Và nó là lý do `padEdge` tồn tại như một khoá riêng thay vì cộng thêm vào
 * `pad`: một con số không nói được "có mép" và "sáng hơn" cùng lúc — mà ở đây
 * câu trả lời đúng là "có mép" VÀ "không sáng hơn", nên một con số thì không đủ.
 *
 * Bộ đã bị bác nâng tấm cảm biến 0,06 → 0,12, đo 1,3263× ở bản tối. Bộ này đo
 * 1,0140× — và cái 1,0140 ấy không phải do `pad` đổi mà do THÂN dưới nó đổi
 * 1,0119. Luật đặt trần 1,05 cho vế này.
 *
 * ── kênh 4 · BỀ DÀY ──
 *
 * `bezelW`/`padW` là độ dày nét, tính bằng điểm, không phải độ mờ. Chúng ở đây
 * vì chủ dự án nói rõ: *"đừng cố ép mọi thay đổi vào một opacity duy nhất"*.
 * Một đường nét dày lên đọc ra "chắc lại", không phải "sáng lên".
 *
 * ── sàn ──
 *
 * `tools/body-scale.mjs` đọc lại bảng này ra khỏi mã: mọi ô chữ ≥4,5 (WCAG
 * 1.4.3), bậc màn hình/thân ≥1,134, và — luật riêng của vòng này — **cú nhảy của
 * thân cân phải NHỎ HƠN cú nhảy của mọi lớp phản ứng**. Đó là luật chặn đúng cái
 * lỗi ở trên quay lại.
 */
const TONE = {
  light: {
    idle: {
      plate: 0.05, edge: 0.13, inner: 0.07,
      pad: 0.08, padEdge: 0, padW: 0,
      lamp: 0.72, bezelOn: 'foreground', bezel: 0.1, bezelW: 1,
      digits: 'secondaryForeground', unit: 'mutedForeground', unitAlpha: 1,
    },
    active: {
      plate: 0.055, edge: 0.17, inner: 0.1,
      pad: 0.08, padEdge: 0.22, padW: 1.2,
      lamp: 1, bezelOn: 'foreground', bezel: 0.22, bezelW: 1.6,
      digits: 'foreground', unit: 'secondaryForeground', unitAlpha: 1,
    },
  },
  dark: {
    idle: {
      plate: 0.11, edge: 0.17, inner: 0.06,
      pad: 0.06, padEdge: 0, padW: 0,
      lamp: 0.06, bezelOn: 'foreground', bezel: 0.13, bezelW: 1,
      digits: 'foreground', unit: 'secondaryForeground', unitAlpha: 1,
    },
    /* Tấm nền SÁNG → chữ gần đen. `background` của bản tối là #070708. Đơn vị
       là chính màu ấy ở 65%: không token nào của bảng màu qua được sàn chữ trên
       một tấm gần trắng. Và `bezelOn` đảo sang chính token ấy — xem kênh 2. */
    active: {
      plate: 0.115, edge: 0.22, inner: 0.09,
      pad: 0.06, padEdge: 0.22, padW: 1.2,
      lamp: 0.92, bezelOn: 'background', bezel: 0.55, bezelW: 1.6,
      digits: 'background', unit: 'background', unitAlpha: 0.65,
    },
  },
} as const;

/** Đèn nền. Trắng ở cả hai diện mạo, vì một nguồn sáng không đổi màu theo theme. */
const LAMP = '#ffffff';

const SCREEN_X = (VB.w - SCREEN.w) / 2;

/*
  Hộp của con số, tính SẴN ở phạm vi module thành phần trăm.

  Không phải để né `tools/progress-bar.mjs` — luật ấy đi săn một thanh tiến độ
  dựng bằng `width` phần trăm ĐỔI theo từng khung hình, và bốn con số này không
  đổi bao giờ. Tính sẵn là cách nói ra điều đó: chúng là hình học của chiếc cân,
  cùng hạng với `SCREEN` và `PAD` ngay trên, chứ không phải dữ liệu.
*/
const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(3)}%` as `${number}%`;

const READOUT_BOX: ViewStyle = {
  left: pct(SCREEN_X, VB.w),
  top: pct(SCREEN.y, VB.h),
  width: pct(SCREEN.w, VB.w),
  height: pct(SCREEN.h, VB.h),
};

const MARK_TOP: ViewStyle = { top: pct(WORDMARK_Y, VB.h) };
const PAD_Y2 = VB.h - PAD.bottom - PAD.h;
const PAD_X2 = VB.w - PAD.side - PAD.w;

export function BodyScaleFigure({
  value,
  unit,
  width,
  lit = false,
}: {
  /** Số hiện trên mặt cân. Dữ liệu thật của màn hình, không phải chữ trang trí. */
  value: string;
  unit: string;
  width: number;
  /**
   * Cân vừa có người bước lên chưa.
   *
   * Một prop chứ không phải state nội bộ: chỗ biết người dùng đang kéo thước là
   * màn hình, không phải cái hình. Và nó là BOOLEAN chứ không phải một shared
   * value, vì `react-native-svg` raster lại cả hình khi một prop con đổi — cú
   * chuyển tiếp mượt sẽ là hai hình xếp lớp, đổi `opacity`, chứ không phải nội
   * suy từng thuộc tính. Xem `weight-goal-ruler.tsx` cho đúng bài học ấy.
   */
  lit?: boolean;
}) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const height = (width * VB.h) / VB.w;
  /*
    Cỡ chữ đi theo BỀ RỘNG hình, không phải một token cố định.

    Đo trên ảnh mẫu: con số rộng ~150 trên thân cân 590, tức nó lấp khoảng 65%
    bề ngang màn hình nhỏ. Với một token cứng (`largeTitle` 28) thì ở bề rộng
    273 nó chỉ lấp 50% — màn hình trông rỗng và con số thôi là nhân vật chính.
    Tỉ lệ thì đúng ở mọi cỡ máy, mà đó cũng là lý do cả hình nhận `width`.
  */
  const numSize = Math.round(width * 0.125);

  /*
    Một cờ dẫn xuất duy nhất, và nó CHỈ chọn màu — đã đăng ký ở `CO_MAU` của
    `tools/theme-shape.mjs`. Số node dựng ra không đổi theo diện mạo: cùng một
    cây, khác mấy con số.
  */
  const tone = m.lit ? TONE.dark : TONE.light;
  const t = lit ? tone.active : tone.idle;
  /* Mặt đèn: trắng ở độ mờ của trạng thái. Đây là công tắc của cả hiệu ứng. */
  const lamp = alpha(LAMP, t.lamp);
  /*
    Màu chữ cũng đọc từ `TONE`, không tính lại ở đây. Bốn ô, bốn cặp — và ở bản
    SÁNG cặp ấy là toàn bộ cú thức dậy: tấm nền đã gần trắng nên nó chỉ đổi
    1,045 lần, còn chữ số đi từ `secondaryForeground` (6,05:1) lên `foreground`
    (17,57:1), tức 2,9 lần. Ở bản tối thì ngược lại — tấm nền đổi 8,2 lần.
    `tools/body-scale.mjs` đòi ít nhất một kênh rõ rệt ở mỗi diện mạo.
  */
  const digits = c[t.digits];
  const unitColour = t.unitAlpha === 1 ? c[t.unit] : alpha(c[t.unit], t.unitAlpha);
  /*
    Khung kính của màn hình. `bezelOn` là TOKEN, không phải độ mờ — ở bản tối nó
    đảo từ `foreground` sang `background` khi đèn bật, vì một cái khung nhựa thì
    chắn sáng chứ không dẫn sáng. Xem "kênh 2" ở chú thích của `TONE`.
  */
  const bezel = alpha(c[t.bezelOn], t.bezel);
  /* Rim của tấm cảm biến. Ở trạng thái nghỉ `padEdge` là 0 — không mép, và một
     nét dày 0 thì `react-native-svg` không vẽ gì cả, nên cây node y nguyên. */
  const padRim = alpha(c.foreground, t.padEdge);

  return (
    <View
      style={{ width, height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${value} ${unit}`}>
      <Svg width={width} height={height} viewBox={`0 0 ${VB.w} ${VB.h}`}>
        <Rect
          x={PLATE.x}
          y={PLATE.y}
          width={PLATE.w}
          height={PLATE.h}
          rx={PLATE.r}
          fill={alpha(c.foreground, t.plate)}
          stroke={alpha(c.foreground, t.edge)}
          strokeWidth={1.2}
        />
        <Rect
          x={INNER.x}
          y={INNER.y}
          width={INNER.w}
          height={INNER.h}
          rx={INNER.r}
          fill="none"
          stroke={alpha(c.foreground, t.inner)}
          strokeWidth={1}
        />
        {/* Bốn tấm cảm biến: kèm hai bên màn hình, rồi lặp lại ở đáy. */}
        {[
          [PAD.side, PAD.top],
          [PAD_X2, PAD.top],
          [PAD.side, PAD_Y2],
          [PAD_X2, PAD_Y2],
        ].map(([x, y]) => (
          <Rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={PAD.w}
            height={PAD.h}
            rx={PAD.r}
            fill={alpha(c.foreground, t.pad)}
            stroke={padRim}
            strokeWidth={t.padW}
          />
        ))}
        {/* Màn hình — mặt sáng nhất của cả hình, vì con số đứng trên nó. Khung
            của nó là đường TỐI NHẤT khi đèn bật: xem "kênh 2" ở `TONE`. */}
        <Rect
          x={SCREEN_X}
          y={SCREEN.y}
          width={SCREEN.w}
          height={SCREEN.h}
          rx={SCREEN.r}
          fill={lamp}
          stroke={bezel}
          strokeWidth={t.bezelW}
        />
      </Svg>

      {/* Con số nằm ĐÚNG trong ô màn hình, định vị bằng phần trăm của hộp thiết
          kế — nên nó không trôi khi bề rộng đổi theo màn máy. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          READOUT_BOX,
          styles.readout,
        ]}>
        <Text
          style={[
            styles.value,
            { fontSize: numSize, lineHeight: Math.round(numSize * 1.12), color: digits },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}>
          {value}
        </Text>
        <Text style={[styles.unit, { color: unitColour }]}>{unit}</Text>
      </View>

      {/* Chữ ASCND ở nửa dưới thân cân — ảnh mẫu có nó, và nó là thứ giữ cho
          nửa dưới không rỗng. Vị trí theo phần trăm như mọi thứ khác ở đây. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, MARK_TOP, styles.markBox]}>
        <Text style={[styles.mark, { color: m.lit ? alpha(c.foreground, 0.2) : alpha(c.foreground, 0.28) }]}>
          ASCND
        </Text>
      </View>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  readout: { alignItems: 'center', justifyContent: 'center' },
  /*
    `tabular-nums` chứ KHÔNG phải `type.mono`.

    Chú thích của thang chữ đã quyết chuyện này rồi: Menlo ở cỡ lớn "đọc ra là
    một dòng terminal chứ không phải một chỉ số sức khoẻ", và `fontVariant`
    cho đúng phần lợi ích — chữ số không đổi bề ngang khi kéo thước — mà không
    đổi mặt chữ. Không có nó thì con số nhảy ngang mỗi lần đổi chữ số, và cú
    kéo đọc ra là giật.
  */
  /* MÀU đặt ở prop: nó đổi theo tấm đèn, không theo bảng màu. */
  value: { ...type.largeTitle, fontVariant: ['tabular-nums'] },
  /*
    `secondaryForeground`, KHÔNG phải `mutedForeground`.

    Mặt màn hình của chiếc cân ở bản TỐI là `alpha(ink, 0.13)` = #2f2f2f — một
    mặt khá sáng, vì nó phải là thứ sáng nhất của cả hình. Trên nó
    `mutedForeground` (#828282) chỉ còn **3,48:1**, dưới sàn 4,5 của WCAG 1.4.3.
    Và không hạ độ đậm mặt màn xuống được: ở α 0,07 nó mới lên 4,14 mà bậc so
    với thân cân đã tụt còn 1,168.

    `secondaryForeground` đo 4,70 (tối) · 7,75 (sáng) — qua ở cả hai, và vẫn
    nhạt hơn hẳn con số (11,44 · 17,57) nên thứ bậc không đảo.

    Bản sáng không đổi về mặt ĐẠT/RỚT: `mutedForeground` ở đó vốn 5,78, đã qua.
    Đổi token là để MỘT dòng đúng ở cả hai diện mạo thay vì một nhánh theo theme.
  */
  unit: { ...type.caption, marginTop: 1 },
  markBox: { alignItems: 'center' },
  /* Nhạt hơn hẳn con số: nó là nhãn trên một vật, không phải một thông tin.
     MÀU đặt ở prop chứ không ở đây, vì `makeStyles` chỉ nhận bảng màu chứ không
     nhận chất liệu, mà độ mờ của nhãn này tách theo diện mạo. */
  mark: { ...type.caption, letterSpacing: 2 },
}));
