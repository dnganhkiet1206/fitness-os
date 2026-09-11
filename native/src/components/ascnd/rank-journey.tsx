import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useMaterial, usePalette } from '@/hooks/use-palette';
import type { AppLang } from '@/lib/i18n';
import type { RankDef } from '@/lib/mascot-room';

/**
 * A milestone timeline of the whole rank ladder — the buddy's journey at
 * a glance. Reached ranks are filled dots on a coloured line; the current
 * rank glows with a "you are here" pill; future ranks are hollow. Only
 * the compact level threshold sits under each node, so long localized
 * rank names never collide. Learns from Duolingo/Strava path visuals.
 */

const VW = 340; // viewBox width (rendered at 100% of the card)
const VH = 72;

export function RankJourney({
  ranks,
  currentKey,
  lang,
  cardBg = '#0e0e11',
}: {
  ranks: RankDef[];
  currentKey: string;
  lang: AppLang;
  /** Card colour behind the ring cut-outs, so the dot centres read clean */
  cardBg?: string;
}) {
  /*
    ── vì sao tệp này nay đọc bảng màu ──

    Năm mã màu dưới đây là màu của PHÒNG TỐI, dùng ở cả hai diện mạo, và trên
    giấy chúng lật ngược đúng cái nghĩa chúng phải nói:

        nhãn bậc ĐÃ đạt    #c9c9cf → 1,65:1 trên mặt thẻ trắng — gần như biến mất
        nhãn bậc CHƯA đạt  #5a5a60 → 6,85:1 — đọc rõ hơn hẳn bậc đã đạt
        chấm chưa đạt      #151518 → 18,22:1 — ĐEN ĐẶC, dấu đậm nhất cả hàng
        vành chấm ấy       #3a3a3f → 11,31:1
        đường nền          #26262c → đường đen chạy suốt, thay vì một rãnh mờ

    Tức là trên giấy, bậc bạn ĐÃ đạt là bậc bạn không đọc được, còn bậc chưa
    tới thì hét lên. Đó không phải chuyện tương phản, đó là nghĩa bị đảo.

    Vai TỐI giữ nguyên từng mã màu (bốn trong năm — mã thứ năm đổi ở khối ngay
    dưới, vì đo ra nó cũng hỏng ở bản tối); vai SÁNG lấy token đúng nghĩa của nó:
    `foreground`/`mutedForeground` cho hai bậc nhãn (17,57 so với 5,78 — đã đạt
    nổi hơn chưa đạt, đúng chiều), `ringTrack` cho đường nền và vành chấm (1,89
    — một cái rãnh, không phải một nét mực), `secondary` cho ruột chấm chưa đạt
    (1,20 — mờ ngang mức `#151518` mờ trên nền tối).
  */
  /*
    ── và nhãn bậc CHƯA đạt còn hỏng ở bản TỐI nữa ──

    Vòng sửa trước chỉ chạm bản sáng vì bản tối đang đóng băng. Chủ dự án mở
    đóng băng cho đúng chỗ này, nên đo lại — và phép đo đầu tiên đã sai NỀN.

    ── nền thật không phải `cardBg` ──

    Dễ tưởng nhãn nằm trên `#0e0e11`, vì đó là thứ `mascot-room` truyền xuống
    qua prop `cardBg`. Nhưng prop ấy chỉ dùng để KHOÉT lòng chấm; cái nằm sau
    chữ là mặt `GlassCard`, và mặt ấy là nhiều lớp chồng chứ không phải một
    `backgroundColor` nào của tổ tiên — dò bằng DOM sẽ rơi thẳng xuống nền
    trang. Nên đo ĐIỂM ẢNH đã tô xong, trên bundle web thật của `live.mjs`:

        mặt kính bản tối   #181819  (không phải #0e0e11)
        mặt kính bản sáng  #ffffff

    Trên mặt ấy, chênh lệch của bản cũ còn tệ hơn con số từng ghi:

        tối   #5a5a60 → 2,59:1  (từng ghi 2,81 vì đo trên #0e0e11)
        tối   #828282 → 4,62:1  qua sàn 4,5; đã đạt 10,76 → còn nổi hơn 2,33×
        sáng  #6b6559 → 5,78:1  không đổi; đã đạt 17,57 → nổi hơn 3,04×

    `mutedForeground` là đáp án ở CẢ HAI diện mạo, nên nhánh theme biến mất.

    Hai ứng viên kia qua sàn nhưng thua ở chỗ khác: `champagne` 7,03 chỉ cách
    nhãn đã-đạt 1,53×, `secondaryForeground` 6,23 cách 1,73× — thứ bậc "đã tới
    / chưa tới" nhoè đi. Sàn không phải tiêu chí duy nhất; khoảng cách giữa hai
    vai mới là thứ nhãn này tồn tại để nói, và 2,33× là rộng nhất trong ba.

    ── và một điều phép đo nói ra mà đừng đọc quá lời ──

    Lõi nét chữ tô ra KHÔNG đạt đúng màu danh nghĩa ở bản tối: histogram của
    một nhãn cho `#7d7d7d`×29 và không có điểm `#828282` nào, nên tương phản
    điểm-ảnh của năm nhãn nằm ở 4,31–4,66 chứ không phẳng 4,62. Bản sáng thì
    đúng tăm tắp (`#6b6559`×33). Khác biệt là chuyện khử răng cưa một con chữ
    10px trên nền tối có vân, không phải chuyện màu: WCAG 1.4.3 tính trên màu
    ĐƯỢC KHAI BÁO, không tính trên điểm ảnh ở mép nét.

    Và mặt kính `#181819` là của react-native-web. Trên máy, `GlassCard` đi qua
    `expo-blur`, nền sau chữ sẽ khác — chưa ai đo nó trên iOS, kể cả lượt này.
  */
  const c = usePalette();
  const m = useMaterial();
  const n = ranks.length;
  const current = Math.max(0, ranks.findIndex((r) => r.key === currentKey));
  const cur = ranks[current];
  const padX = 18;
  const y = 40;
  const step = (VW - padX * 2) / Math.max(1, n - 1);
  const x = (i: number) => padX + i * step;
  const px = x(current);

  return (
    <Svg width="100%" height={VH} viewBox={`0 0 ${VW} ${VH}`}>
      {/* base line + filled portion up to the current rank */}
      <Line x1={x(0)} y1={y} x2={x(n - 1)} y2={y} stroke={m.lit ? '#26262c' : c.ringTrack} strokeWidth={3} strokeLinecap="round" />
      <Line x1={x(0)} y1={y} x2={px} y2={y} stroke={cur.color} strokeWidth={3} strokeLinecap="round" />

      {/* "you are here" pill above the current node */}
      <Rect x={px - 32} y={0} width={64} height={19} rx={9.5} fill={cur.color} />
      <Path d={`M ${px - 4} 19 L ${px + 4} 19 L ${px} 24 Z`} fill={cur.color} />
      <SvgText x={px} y={13.5} textAnchor="middle" fontSize={10.5} fontWeight="800" fill={cardBg}>
        {cur.name[lang]}
      </SvgText>

      {ranks.map((rk, i) => {
        const reached = i <= current;
        const isCur = i === current;
        const cx = x(i);
        return (
          <G key={rk.key}>
            {isCur ? (
              <>
                <Circle cx={cx} cy={y} r={14} fill="none" stroke={rk.color} strokeWidth={2} opacity={0.35} />
                <Circle cx={cx} cy={y} r={9} fill={rk.color} />
                <Circle cx={cx} cy={y} r={3.5} fill={cardBg} />
              </>
            ) : reached ? (
              <Circle cx={cx} cy={y} r={6.5} fill={rk.color} />
            ) : (
              <Circle cx={cx} cy={y} r={6} fill={m.lit ? '#151518' : c.secondary} stroke={m.lit ? '#3a3a3f' : c.ringTrack} strokeWidth={2} />
            )}
            <SvgText
              x={cx}
              y={y + 24}
              textAnchor="middle"
              fontSize={10}
              fontWeight="700"
              fill={reached ? (m.lit ? '#c9c9cf' : c.foreground) : c.mutedForeground}>
              {rk.minLevel}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
