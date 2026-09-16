import { Trash2 } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/ascnd/progress-bar';
import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { effortTint, radius, spacing } from '@/constants/ascnd';
import { alpha, blend, makeStyles } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';
import type { useI18n } from '@/hooks/use-app-settings';
import { getLocale, type AppLang } from '@/lib/i18n';
import { displayWeight, weightLabel, type WeightUnit } from '@/lib/units';

export interface SessionSummary {
  id: string;
  date_time: string;
  template_name: string | null;
  session_rpe: number | null;
  volume_load: number | null;
}

/**
 * One logged workout, as a row.
 *
 * Lifted out of the Workouts tab when the tab started showing only the newest
 * three and a second screen took the rest. Two lists of the same thing drawn
 * by two pieces of code is how they end up disagreeing about the date format,
 * where the effort badge sits, and whether the delete is a red glyph or a muted
 * one — differences nobody decides on and everybody notices.
 *
 * The group and the hairlines belong to whoever lays these out; a row draws
 * neither. Same arrangement as the food rows, and for the same reason: a
 * `marginLeft` to inset a border moves the whole row and the trailing column
 * stops lining up.
 */
export function SessionRow({
  session,
  wUnit,
  lang,
  i18n,
  onDelete,
  compactDate = false,
  volumeRatio,
  activeKcal,
}: {
  session: SessionSummary;
  wUnit: WeightUnit;
  lang: AppLang;
  i18n: ReturnType<typeof useI18n>;
  onDelete: (id: string, date_time: string, label: string) => void;
  /**
   * Drop the month from the date.
   *
   * Set by lists that are already grouped by month, where "Th 5, 6 thg 8" under
   * a heading reading THÁNG 8 spends a third of the line restating the heading.
   */
  compactDate?: boolean;
  /**
   * This session's volume as a fraction of the heaviest one on screen.
   *
   * Draws a short meter under the date line. Every row was the same shape and
   * the same weight of grey, so a fortnight of training was a wall of text you
   * had to read number by number to find the big day in. Omitted where there is
   * nothing to compare against — one row, or a list with no volumes.
   */
  volumeRatio?: number;
  /**
   * Calo HOẠT ĐỘNG ước lượng của buổi này — `null` khi hồ sơ chưa đủ để tính.
   *
   * Tính ở chỗ gọi chứ không ở đây: hàng này được vẽ trong một danh sách, và
   * một component hàng tự đi lấy hồ sơ là N lần truy vấn cho N hàng.
   */
  activeKcal?: number | null;
}) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const vi = lang === 'vi';
  const name = session.template_name || (vi ? 'Buổi tập' : 'Workout');
  const at = new Date(session.date_time);
  const day = at.toLocaleDateString(
    getLocale(lang),
    compactDate
      ? { weekday: 'short', day: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short' },
  );
  const wl = weightLabel(wUnit);
  const rpe = session.session_rpe;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.meta}>
            {day}
            {session.volume_load != null
              ? `  ·  ${Math.round(displayWeight(Number(session.volume_load), wUnit)).toLocaleString()} ${wl}`
              : ''}
            {/*
              Dấu ngã ở đây mang đúng nghĩa nó mang trên ba vòng hoạt động:
              con số này là ƯỚC LƯỢNG, không phải số đo từ thiết bị. Cùng một
              ký hiệu cho cùng một loại khẳng định, để người đọc chỉ phải học
              nó một lần.
            */}
            {activeKcal != null ? `  ·  ~${activeKcal.toLocaleString()} kcal` : ''}
          </Text>
          {/*
            The meter, inside the text column and 96pt wide.

            It was full-bleed across the row, under everything, and at that
            width a 2pt rule is a *separator* — which is what it looked like
            beside the real hairline between rows, on a screen whose whole job
            is to be scannable. Short and left-aligned under the line it
            measures, it can only be read as belonging to that line.
          */}
          {volumeRatio != null ? (
            <ProgressBar
              pct={Math.max(3, Math.min(volumeRatio, 1) * 100)}
              height={3}
              radius={1.5}
              trackColor={alpha(m.ink, 0.09)}
              /* Ruột thanh là DỮ LIỆU (khối lượng so với lần trước), nên
                 nó chịu sàn 3,0 của WCAG 1.4.11; `alpha(m.ink, 0.32)` chỉ được
                 2,05:1. Rãnh phía sau vẫn là nền nên vẫn được mờ. */
              color={c.mutedForeground}
              style={styles.barTrack}
            />
          ) : null}
        </View>
        {rpe != null && (
          /* Tinted by value, from the app's one effort ramp. A badge that is
             the same orange at 6 as at 10 is decoration — it takes up the
             position of a signal and carries none. */
          <View style={[styles.rpeBadge, { backgroundColor: alpha(c[effortTint(rpe)], 0.12) }]}>
            <Text style={[styles.rpeText, { color: c[effortTint(rpe)] }]}>
              {vi ? 'gắng sức' : 'effort'} {rpe}
            </Text>
          </View>
        )}
        {/* Muted, like the template rows — a red glyph on every line would make
            deleting the loudest thing in a list that exists to show the training
            happened. */}
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yDelete}
          hitSlop={10}
          onPress={() => onDelete(session.id, session.date_time, `${name} · ${day}`)}
          style={styles.del}>
          <Icon icon={Trash2} size={15} color={c.mutedForeground} />
        </PressScale>
      </View>
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  wrap: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  info: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 14, fontWeight: '500', color: c.foreground },
  meta: {
    fontSize: 11,
    color: c.mutedForeground,
    fontVariant: ['tabular-nums'],
    textTransform: 'capitalize',
  },
  rpeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  rpeText: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  // 28pt of ink with hitSlop 10 on top — 48pt of target, past the 44pt minimum
  del: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  /* 96pt, not the row's width. See the comment at the call site: a 2pt rule
     spanning the whole row is a separator, whatever it was drawn to mean. */
  /* Only the bits ProgressBar does not own. It draws its own height, radius,
     track colour and clip; this is where the bar sits and how wide it is. */
  barTrack: { width: 96, marginTop: 1 },
}));

/**
 * The group these rows sit in, and the hairline between two of them.
 *
 * Là một HOOK vì nó được xuất ra và dùng ở hai màn — `sessions.tsx` và
 * `workouts/library.tsx` — cùng lý do đã ghi ở `useFoodListStyles` trong
 * `food-cards.tsx`. (Câu cũ ghi "ba màn khác"; đếm lại chỉ có hai.)
 */
/** Độ mờ của lớp tint nhóm. MỘT chỗ, vì `group` và `rowFace` phải khớp. */
const GROUP_TINT = 0.06;

const sessionListStylesFor = makeStyles((c, m) => ({
  group: {
    borderRadius: radius.md,
    backgroundColor: alpha(m.ink, GROUP_TINT),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(m.ink, 0.12),
    overflow: 'hidden',
  },
  /*
    Mặt ĐẶC của một hàng, cho hàng nào VUỐT ĐƯỢC.

    ── lỗi nó đóng ──

    `ReanimatedSwipeable` dựng tấm nút là `absoluteFill` nằm SAU hàng; hàng là
    lớp trước trượt đè lên, và nút được lộ ra bằng hình học. Phép ấy chỉ đúng
    khi lớp trước ĐỤC. Hàng buổi tập thì không có nền riêng — nó ngồi trên lớp
    tint 6% của `group`, vốn trong suốt — nên suốt cú kéo viên nút đỏ hiện
    XUYÊN QUA chính hàng: ảnh chụp giữa chừng cho ra hai cái icon thùng rác
    chồng lên nhau, một của hàng và một của nút.

    Thẻ "Cần làm hôm nay" đã gặp và đã ghi đúng điều này (`rowSwipe` trong
    `todo-card.tsx`: "hàng vuốt được phải có NỀN ĐẶC"). Đây là cùng một luật,
    áp cho danh sách này.

    ── vì sao là `blend` chứ không phải một token ──

    Màu phải bằng ĐÚNG cái mắt đang thấy, nếu không cả dải hàng sẽ đọc ra sáng
    hoặc tối hơn nhóm bọc nó. Cái mắt thấy là `alpha(m.ink, 0.06)` chồng lên
    nền trang, và không token nào mang sẵn kết quả ấy — đo trên bản dựng sáng:
    trang `rgb(247,244,239)`, nhóm `rgb(234,230,225)`. Nên nó được TÍNH từ hai
    token đang dùng, dùng chung `GROUP_TINT` với `group` để hai bên không trôi
    khỏi nhau.

    ── cái nó không với tới, đo thành số ──

    `Screen` vẽ `AmbientLight` GIỮA nền trang và thứ đặt lên. `blend` composite
    trên nền TRẦN, nên chỗ nào aura còn đậm thì hàng lệch khỏi nhóm đúng bằng
    phần aura ấy. Đo trên bản dựng, ở đúng chỗ nhóm nằm: lệch **1 mức** trên
    256 ở một kênh, tức dưới ngưỡng nhìn thấy — và nó chỉ lộ ra ở mép trong của
    nhóm, nơi hàng không phủ tới.
  */
  rowFace: { backgroundColor: blend(m.ink, c.background, GROUP_TINT) },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md, backgroundColor: c.border },
}));

export function useSessionListStyles() {
  return sessionListStylesFor(usePalette());
}
