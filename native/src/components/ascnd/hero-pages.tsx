import { Droplets, Flame, Moon, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { HeroPanel, HeroRing, HeroTiles } from '@/components/ascnd/hero-panel';
import { useHelpTopic } from '@/components/ascnd/help-button';
import { NutritionExplainer } from '@/components/ascnd/nutrition-explainer';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useVolumeUnit } from '@/hooks/use-volume-unit';
import { displayVolume, volumeLabel } from '@/lib/units';
import { SLEEP_QUALITY_MAX } from '@/lib/sleep-note';
import { SleepNoteBlock } from '@/components/ascnd/sleep-note-block';

/** Cùng khoá với thẻ dinh dưỡng dạng danh sách: nút ở hai chỗ phải đếm lượt
 *  nhắc chung một tên, nếu không một chỗ im còn chỗ kia nhắc mãi. */
const NUTRITION_HELP_TOPIC = 'nutrition';

/**
 * Nutrition and water, as pages of the hero deck.
 *
 * ── why they are not the cards that already exist ──
 *
 * `NutritionCard` and `WaterWidget` are LIST cards: a small ring beside a row
 * of text, sized to sit among a dozen others. Dropped into the deck they were
 * two pages of a different shape, and — because `card-deck.tsx` makes the stage
 * as tall as its tallest page — the taller one left a hole under the readiness
 * ring. Measured on the shipped build: 115pt of empty between the chevron and
 * the pips.
 *
 * They still exist and are still right where they are: somebody who moves
 * nutrition back into a group in edit mode gets the list card again. These are
 * the same numbers wearing the hero's shell.
 *
 * ── one number in the ring, the rest behind the chevron ──
 *
 * The same rule the other two pages follow, and the reason the deck works at
 * all: the top half of Today answers ONE question per page. Macros matter, and
 * they are one tap away — but a ring with four numbers around it is a card, and
 * a card is what this stopped being.
 */
export function NutritionHero({
  onOpenDetail,
  kcal,
  calorieTarget,
  protein,
  carbs,
  fat,
  detailOpen,
  onToggleDetail,
}: {
  kcal: number;
  calorieTarget: number;
  protein: number;
  carbs: number;
  fat: number;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  onOpenDetail?: () => void;
}) {
  const c = usePalette();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const target = calorieTarget > 0 ? calorieTarget : 1;
  const left = Math.max(0, Math.round(target - kcal));
  /*
    Sheet giải thích ĐÃ CÓ, và cho tới giờ chỉ thẻ dạng danh sách mở được nó —
    trang hero, thứ phần lớn người dùng thật sự nhìn thấy, thì không có lối vào
    nào. Cùng một sheet, cùng khoá đếm lượt nhắc, hai chỗ mở.

    Nó trả lời đúng câu hỏi mà một vòng calo không tự trả lời được: vì sao tập
    xong con số này KHÔNG tăng lên (hệ số vận động đã bao gồm việc tập, cộng
    thêm buổi tập là tính cùng một giờ hai lần).
  */
  const help = useHelpTopic(NUTRITION_HELP_TOPIC);

  return (
    <HeroPanel
      title={i18n.nKcalToday}
      detailOpen={detailOpen}
      onToggleDetail={onToggleDetail}
      help={
        detailOpen
          ? {
              label: lang === 'vi' ? 'Giải thích mục tiêu calo' : 'Explain the calorie target',
              onPress: help.openHelp,
            }
          : undefined
      }
      more={onOpenDetail ? { label: i18n.nHeroMore, onPress: onOpenDetail } : undefined}
      ring={
        <HeroRing
          pct={kcal / target}
          from={c.readinessGreen}
          to={c.metricOrange}
          /* Ngọn lửa cam — đúng biểu tượng và đúng màu mà thẻ dinh dưỡng cũ
             dùng, để cùng một phép đo không đổi mặt khi nó đổi chỗ. */
          icon={Flame}
          iconColor={c.metricOrange}
          value={Math.round(kcal)}
          /* Còn lại, không phải mục tiêu. Mục tiêu là con số bạn đã biết; số
             còn lại là con số quyết định bữa tới ăn gì. */
          caption={`${left} ${i18n.nKcalLeft}`}
          captionColor={c.mutedForeground}
        />
      }>
      <HeroTiles
        tiles={[
          { label: i18n.nProtein, value: String(Math.round(protein)), unit: 'g', color: c.metricBlue },
          { label: i18n.nCarbs, value: String(Math.round(carbs)), unit: 'g', color: c.metricOrange },
          { label: i18n.nFat, value: String(Math.round(fat)), unit: 'g', color: c.metricPurple },
          { label: i18n.nKcalToday, value: String(Math.round(kcal)), unit: `/ ${Math.round(target)}` },
        ]}
      />
      <NutritionExplainer visible={help.open} onClose={help.close} />
    </HeroPanel>
  );
}

function Macro({ label, grams, tint }: { label: string; grams: number; tint: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.macro}>
      <View style={[styles.macroDot, { backgroundColor: tint }]} />
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{Math.round(grams)}g</Text>
    </View>
  );
}

export function WaterHero({
  onOpenDetail,
  ml,
  targetMl,
  detailOpen,
  onToggleDetail,
}: {
  ml: number;
  targetMl: number;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  onOpenDetail?: () => void;
}) {
  const c = usePalette();
  const i18n = useI18n();
  const { unit } = useVolumeUnit();
  const target = targetMl > 0 ? targetMl : 1;
  const pct = Math.round((ml / target) * 100);

  return (
    <HeroPanel
      title={i18n.nWater}
      detailOpen={detailOpen}
      onToggleDetail={onToggleDetail}
      more={onOpenDetail ? { label: i18n.nHeroMore, onPress: onOpenDetail } : undefined}
      ring={
        <HeroRing
          pct={ml / target}
          from={c.metricBlue}
          to={c.metricCyan}
          /* Giọt nước xanh #3ba6ff — cùng icon và cùng màu thẻ nước cũ. */
          icon={Droplets}
          iconColor={c.metricBlue}
          value={displayVolume(ml, unit)}
          /* `displayVolume` làm tròn ml về số nguyên và oz về một chữ số thập
             phân — nên số lẻ chỉ tồn tại ở oz. */
          decimals={unit === 'oz' ? 1 : 0}
          caption={volumeLabel(unit)}
          captionColor={c.mutedForeground}
        />
      }>
      {/*
        Hai ô, không phải bốn.

        Nước có đúng một phép đo và một mục tiêu. Bịa thêm hai ô cho cân đối với
        trang dinh dưỡng là nói rằng có thứ chưa đo được — lưới này co theo số
        phép đo có thật, và hàng lẻ nằm bên trái chứ không bị kéo giãn.
      */}
      <HeroTiles
        tiles={[
          {
            label: i18n.nWater,
            value: String(displayVolume(ml, unit)),
            unit: `/ ${displayVolume(targetMl, unit)} ${volumeLabel(unit)}`,
            color: c.metricBlue,
          },
          { label: '%', value: String(pct), unit: `/ 100`, color: c.metricCyan },
        ]}
      />
    </HeroPanel>
  );
}

const stylesFor = makeStyles((c) => ({
  emptyLine: { ...type.footnote, color: c.mutedForeground, textAlign: 'center', lineHeight: 19 },
  macro: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  macroDot: { width: 7, height: 7, borderRadius: 4 },
  macroLabel: { ...type.footnote, color: c.mutedForeground, flex: 1 },
  macroValue: { ...type.footnote, color: c.foreground, fontVariant: ['tabular-nums'] },
}));


/**
 * Giấc ngủ, dạng hero.
 *
 * Vòng tròn là GIỜ NGỦ so với mục tiêu — không phải điểm chất lượng. Hai con số
 * đều thật, nhưng chỉ một cái là thứ bạn tác động được tối nay: điểm là hệ quả,
 * giờ là quyết định. Điểm nằm ở phần chi tiết, cạnh giờ đi ngủ và giờ dậy đã
 * tạo ra nó.
 */
export function SleepHero({
  totalMin,
  targetHours,
  quality,
  bedtime,
  waketime,
  detailOpen,
  onToggleDetail,
  onOpenDetail,
}: {
  totalMin: number;
  targetHours: number;
  quality: number | null;
  bedtime?: string | null;
  waketime?: string | null;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  onOpenDetail?: () => void;
}) {
  const c = usePalette();
  const i18n = useI18n();
  const targetMin = targetHours > 0 ? targetHours * 60 : 1;
  const hours = Math.round((totalMin / 60) * 10) / 10;
  const clock = (v?: string | null) => (v ? String(v).slice(11, 16) : '—');

  return (
    <HeroPanel
      title={i18n.nSleep}
      detailOpen={detailOpen}
      onToggleDetail={onToggleDetail}
      more={onOpenDetail ? { label: i18n.nHeroMore, onPress: onOpenDetail } : undefined}
      ring={
        <HeroRing
          pct={totalMin / targetMin}
          from={c.metricPurple}
          to={c.metricBlue}
          value={hours}
          decimals={1}
          caption="h"
          captionColor={c.mutedForeground}
          icon={Moon}
          iconColor={c.metricPurple}
        />
      }>
      <HeroTiles
        tiles={[
          { label: i18n.nSleep, value: String(hours), unit: `/ ${targetHours} h`, color: c.metricPurple },
          ...(quality != null
            ? [
                {
                  label: i18n.nQuality,
                  value: String(Math.round(quality)),
                  /*
                    `/10`, KHÔNG phải `/100`.

                    `quality` là điểm người dùng TỰ CHẤM, và thang của nó là
                    1–10: `log-sleep.tsx` cho chọn năm mặt cười với giá trị
                    2/4/6/8/10, và cột `quality` trong migration mặc định 5.

                    Dán `/100` lên nó biến điểm TỐI ĐA thành "10 trên 100" —
                    người ngủ ngon nhất có thể và tự chấm mặt cười tươi nhất
                    thì thấy một con số đọc ra là gần bét. Người dùng bắt được
                    đúng chỗ này: thẻ Sẵn sàng ghi "SLEEP 90/100" còn thẻ Giấc
                    ngủ ghi "CHẤT LƯỢNG 10/100", và hai con số trông như mâu
                    thuẫn nhau.

                    Chúng KHÔNG mâu thuẫn — chúng là hai đại lượng khác nhau:
                    90 là điểm ngủ do app tính từ thời lượng so với mục tiêu,
                    còn 10 là điểm bạn tự chấm. Cái sai chỉ là mẫu số, và chính
                    cái mẫu số sai làm hai thẻ trông như bất đồng dữ liệu.
                  */
                  unit: `/${SLEEP_QUALITY_MAX}`,
                  color: c.metricBlue,
                },
              ]
            : []),
          { label: i18n.nBedtime, value: clock(bedtime), unit: '' },
          { label: i18n.nWaketime, value: clock(waketime), unit: '' },
        ]}
      />

      {/*
        Nhận xét đứng NGAY DƯỚI ô chất lượng, không chôn ở thẻ khác.

        ── vì sao ──

        App đã sinh sẵn nhận xét cho đúng tình huống "ngủ đủ giờ mà vẫn thấy
        mệt" (`felt_worse_than_clock`). Nhưng nó chỉ hiện trong phần chi tiết
        của thẻ SẴN SÀNG — một thẻ khác, phải mở ra mới thấy.

        Nên người dùng ngủ đủ 8 tiếng, chọn mặt cười đỏ, nhìn thẻ Giấc ngủ và
        kết luận rằng mặt cười chẳng làm gì. Nhận xét đúng, chỗ đứng sai: nó
        cách chỗ gây thắc mắc một thẻ và một cú bấm.

        Câu thứ hai giữ cho câu thứ nhất trung thực — chất lượng tự chấm KHÔNG
        vào công thức điểm (quyết định sản phẩm, `tools/sleep-note.mjs` canh),
        nên nhận xét không được đọc ra thành "cảm giác của bạn đã đổi điểm".
      */}
      <SleepNoteBlock quality={quality} durationMin={totalMin} targetMin={targetMin} />
    </HeroPanel>
  );
}


/**
 * Một trang hero chưa có số.
 *
 * ── lỗi nó sửa ──
 *
 * Trang sẵn sàng khi chưa đủ dữ liệu vẽ ra một `GlassCard` ngắn, trong khi bốn
 * trang kia là vỏ hero cao ~400pt. `card-deck.tsx` cho sân khấu cao bằng trang
 * CAO NHẤT, nên trang ngắn để lại một khoảng đen — đo trên máy: khoảng 250pt
 * giữa dòng chữ và hàng pip.
 *
 * Trạng thái rỗng phải mang đúng hình dạng của trạng thái đầy. Nếu không thì
 * "chưa có dữ liệu" trông giống hệt "màn hình bị hỏng", và đó là câu người dùng
 * đọc được đầu tiên khi mở app lần đầu.
 *
 * ── vòng tròn vẫn vẽ, chỉ là rỗng ──
 *
 * Không phải một khối skeleton nhấp nháy: vòng tròn ở đây KHÔNG chờ dữ liệu về
 * trong vài giây, nó chờ ba ngày ghi chép. Một hiệu ứng "đang tải" cho một thứ
 * cần ba ngày là một lời hứa sai. Nên nó là một vòng tròn thật, rỗng, với dấu
 * gạch ở giữa và câu giải thích ngay bên dưới — hình dạng của thứ sắp có, cộng
 * lý do nó chưa có.
 */
export function EmptyHero({
  title,
  message,
  tint,
  icon,
  detailOpen,
  onToggleDetail,
  onOpenDetail,
}: {
  title: string;
  message: string;
  tint: string;
  icon?: LucideIcon;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  onOpenDetail?: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  return (
    <HeroPanel
      title={title}
      detailOpen={detailOpen}
      onToggleDetail={onToggleDetail}
      more={onOpenDetail ? { label: i18n.nHeroMore, onPress: onOpenDetail } : undefined}
      ring={
        <HeroRing
          pct={0}
          from={tint}
          to={tint}
          value={0}
          caption="—"
          captionColor={c.mutedForeground}
          icon={icon}
          iconColor={c.mutedForeground}
        />
      }>
      <Text style={styles.emptyLine}>{message}</Text>
    </HeroPanel>
  );
}
