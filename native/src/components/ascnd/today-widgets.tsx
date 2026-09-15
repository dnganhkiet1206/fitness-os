import * as Haptics from 'expo-haptics';
import { nav } from '@/lib/nav';
import { Check, ChevronRight, PartyPopper, Sparkles } from 'lucide-react-native';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { PressScale } from '@/components/ascnd/press-scale';
import { WeightEntry } from '@/components/ascnd/weight-entry';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles, palettes, type Palette } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useReadinessHistory, useTodayWeight, useWeightHistory } from '@/hooks/use-fitness-data';
import { useSupplementChecklist, useToggleSupplement } from '@/hooks/use-library';
import { useSmartNudges } from '@/hooks/use-smart-nudges';
import { useProfile } from '@/hooks/useTodayData';
import { useUnits } from '@/hooks/use-units';
import { getLocale } from '@/lib/i18n';
import { localDateStr, parseLocalDate } from '@/lib/local-date';
import { displayWeight, weightLabel } from '@/lib/units';

/**
 * Tông TRUNG TÍNH của chip cân nặng — hai vai, vì bản tối đang đóng băng.
 *
 * `#9aa0aa` từng là một mã màu viết cứng dùng cho CẢ HAI diện mạo, cạnh hai
 * tông kia vốn đã đọc token (`c.readinessGreen`, `c.readinessRed`). Trên giấy
 * nó đo được **2,39:1** — chữ 13px/700 cần 4,5.
 *
 * Vai sáng KHÔNG phải một màu bịa ra: nó là `champagne` của bản sáng
 * (`#6c6f79`), và lý do nó khớp đã ghi trong `palette.ts` — champagne giữ THÉP
 * lạnh, đúng nghĩa "không xanh không đỏ" mà tông này mang. Ở bản tối, mã cứng
 * cũ và `champagne` (`#9fa3ad`) chỉ lệch ΔEok **0,0115**, dưới một JND — tức
 * đây là một mã màu đã TRÔI khỏi token của chính nó, không phải một màu riêng.
 *
 * Nhưng vai tối vẫn giữ đúng `#9aa0aa`: "gần như không thấy" không phải "không
 * thấy", và bản tối đang đóng băng.
 *
 *     tối   #9aa0aa trên rgba(154,160,170,0.12)/#0e0e11 → 6,19:1
 *     sáng  #6c6f79 trên cùng nền ấy trên thẻ trắng     → 4,55:1  ✓
 *
 * Nền 12% ở dưới KHÔNG đổi theo token, và đó là một phép đo chứ không phải một
 * chỗ bỏ sót: chuyển nó sang `alpha(token, 0.12)` làm nền chip ĐẬM hơn trên
 * giấy và kéo chữ xuống — trung tính 4,55 → 4,32, xanh 4,43 → 4,23, đỏ
 * 4,14 → 4,05. Sửa cho "nhất quán" ở đây là đổi một con số đạt thành một con
 * số trượt.
 */
const NEUTRAL_DARK = '#9aa0aa';

/**
 * Colour a weight change by health goal, not just direction: for an
 * underweight person gaining is good (green) and losing is bad (red); for an
 * overweight person it's reversed; in the normal range (or unknown BMI) any
 * change is neutral grey. `diff` sign is the direction; BMI decides meaning.
 */
/*
  Bảng màu vào bằng THAM SỐ, không bằng hook.

  Đây không phải component — nó là một hàm thuần được gọi từ trong một `map`,
  nên gọi `usePalette()` ở đây là gọi hook có điều kiện và trong vòng lặp: đúng
  hai thứ quy tắc hook cấm. Cái duy nhất nó cần là ba mã màu, và tham số là cách
  đưa chúng vào mà không kéo cả React vào theo.
*/
/**
 * Dưới ngưỡng này thì chênh lệch là dư âm của phép làm tròn, không phải thay
 * đổi. Cùng con số `weight-changes.tsx` dùng, và vì cùng một lý do:
 * `displayWeight` chốt ở một chữ số thập phân, nên 0,05 là nửa bước cuối cùng
 * mà màn hình còn phân biệt được.
 */
const WEIGHT_EPS = 0.05;

/** Bao nhiêu lần cân CŨ hiện dưới số lớn — xem ghi chú ở chỗ vẽ danh sách. */
const WEIGHT_ROWS = 3;

/**
 * `↑ 0.4` / `↓ 0.3` — một chỗ, nên bốn ô chênh lệch trên cùng một thẻ không
 * thể viết khác nhau.
 *
 * Mũi tên ĐÃ mang dấu, nên số bỏ dấu đi. Bản cũ in `↓ -0.3`: dấu trừ lặp lại
 * điều mũi tên vừa nói. Bản cũ chỉ có MỘT ô nên chuyện đó là chuyện thẩm mỹ; ở
 * đây bốn ô nằm thẳng hàng, và một cột số có cái thò dấu trừ ra cái không thì
 * đọc lệch hẳn.
 */
function deltaText(delta: number): string {
  return `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}`;
}

/**
 * `T4, 10 thg 9` — cùng ba trường và cùng thứ tự như danh sách cân nặng bên
 * màn Tiến trình (`weight-log-list.tsx`), để một ngày trông giống nhau ở cả hai
 * chỗ app in ra lần cân.
 *
 * Thứ trong tuần không phải trang trí: cân buổi sáng thứ Hai và cân buổi sáng
 * Chủ nhật là hai phép đo khác nhau, và thứ là thứ duy nhất nói ra điều đó.
 *
 * `parseLocalDate` chứ không phải `new Date(iso)`: chuỗi `YYYY-MM-DD` trần
 * được `Date` hiểu là UTC, nên ở Hà Nội mọi hàng lùi một ngày.
 */
function dayLabel(date: string, lang: 'vi' | 'en'): string {
  return parseLocalDate(date).toLocaleDateString(getLocale(lang), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function weightDiffTone(c: Palette, bmi: number | null, diff: number): { color: string; bg: string } {
  const green = { color: c.readinessGreen, bg: 'rgba(32,181,131,0.12)' };
  const red = { color: c.readinessRed, bg: 'rgba(220,47,47,0.12)' };
  /* Vai tối / vai sáng — xem `NEUTRAL_DARK`. Nhận diện theme bằng cách so bảng
     màu, cùng cách `gradientFor` trong `readiness-gauge.tsx` làm: hàm này là
     một hàm thuần nhận `c`, không phải component, nên nó không gọi hook được. */
  const neutralColour = c === palettes.dark ? NEUTRAL_DARK : c.champagne;
  const neutral = { color: neutralColour, bg: 'rgba(154,160,170,0.12)' };
  if (bmi == null || (bmi >= 18.5 && bmi < 25)) return neutral; // normal / unknown
  const gaining = diff > 0;
  if (bmi < 18.5) return gaining ? green : red; // underweight: gain good
  return gaining ? red : green; // overweight (bmi >= 25): lose good
}

/**
 * Weight check-in — the latest reading, what it changed, and the readings
 * behind it. The logger is one tap in.
 *
 * ── vì sao thẻ này thôi mở sẵn ô nhập ──
 *
 * Chủ dự án chỉ vào thẻ: *"vì phía trên đã có ghi cân nặng rồi, thẻ này giờ chỉ
 * dùng để hiện thông tin — ví dụ thay nút ghi bằng lịch sử thay đổi cân nặng
 * sau mỗi lần log"*.
 *
 * Câu "phía trên đã có ghi cân nặng rồi" là ĐÚNG, và đúng từ chính lượt tách
 * `weight-entry.tsx` ra: thẻ *Cần làm hôm nay* dựng cùng ô nhập ấy, ngay tại
 * chỗ, và nó nằm TRÊN cả dãy nhóm widget trong `(tabs)/index.tsx` — nên trên
 * một màn hình có đúng hai ô nhập cân nặng, cái ở trên biết hôm nay đã ghi hay
 * chưa còn cái ở đây thì không. Chú thích của chính `TodoCard` đã đếm ra điều
 * đó trước: *"năm chỗ cho một câu hỏi, trên một trang phải cuộn"*, và ô nhập
 * trong thẻ Cân nặng là một trong năm.
 *
 * Nên ô nhập ở đây KHÔNG bị xoá — nó lùi vào sau một cú chạm lên mặt thẻ, đúng
 * cử chỉ mà trạng thái "đã ghi" vốn đã có — và mặt thẻ trả lại cho thứ thẻ này
 * làm tốt hơn thẻ kia: nói cân nặng đang đi đâu.
 *
 * ── và cái bị thay không phải một thứ đang chạy ──
 *
 * Viên chênh lệch cũ tính `todayWeight − profileWeight`, mà `useLogWeight` gọi
 * `syncProfileWeight` rồi `invalidate(['profile'])`: ghi xong thì
 * `profiles.weight_kg` CHÍNH LÀ số vừa ghi, hiệu bằng 0, và viên tự ẩn. Nó chỉ
 * hiện trong khoảnh khắc giữa lúc ghi và lúc `profile` tải lại. Tức thứ đáng lẽ
 * nói "hôm nay thay đổi bao nhiêu" thực tế gần như không bao giờ nói được gì.
 *
 * Lịch sử bên dưới lấy hiệu giữa hai LẦN CÂN liền nhau, nên nó không phụ thuộc
 * vào một cột mà chính lần ghi ấy vừa sửa.
 */
export function WeightCheckinCard({ profileWeight }: { profileWeight: number | null }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { weight: wUnit } = useUnits();
  const { data: todayWeight } = useTodayWeight();
  const { data: profile } = useProfile();
  /*
    90 ngày, KHÔNG phải 30 — và không phải vì thẻ này cần 90 ngày.

    Thẻ chỉ vẽ bốn lần cân gần nhất. Nhưng `['weight_history', uid, days]` có
    `days` trong khoá, nên một cửa sổ khác là một khoá khác là một lượt mạng
    khác. Màn Tiến trình đã đọc đúng `useWeightHistory(90)`; dùng lại con số ấy
    thì hai màn dùng chung một bản cache, còn hạ xuống 30 sẽ tạo thêm một mục
    cache thứ hai cho cùng một bảng.
  */
  const { data: weightHistory } = useWeightHistory(90);
  const [editing, setEditing] = useState(false);

  // BMI from the current weight (kg) + height decides how a change reads
  const heightCm = Number(profile?.height_cm) || 0;
  const currentKg = todayWeight ?? profileWeight ?? 0;
  const bmi = heightCm > 0 && currentKg > 0 ? currentKg / Math.pow(heightCm / 100, 2) : null;

  // Stored values are kg; show in the user's unit
  const profileDisp = profileWeight != null ? displayWeight(profileWeight, wUnit) : null;

  /*
    Mỗi lần cân, và lần ấy làm cân nặng đổi bao nhiêu. Mới nhất trước.

    Đổi đơn vị TRƯỚC rồi mới trừ. `displayWeight` làm tròn về một chữ số thập
    phân, nên hiệu của hai số ĐÃ làm tròn đúng bằng hiệu của hai số đang in ra
    màn hình. Trừ trong kg rồi mới đổi thì ở bản lb hai hàng 165.3 và 165.1 có
    thể in ra chênh lệch 0.3 — đúng kiểu sai mà `weight-log-list.tsx` đã ghi
    lại một lần.

    Hàng cũ nhất trong cửa sổ không có hàng nào trước nó, nên `delta` là `null`
    — không phải 0. Đó là "không biết", và 0 là "không đổi"; in 0 ở đó là bịa
    ra một lần cân không hề tồn tại.
  */
  const entries = useMemo(() => {
    const src = weightHistory ?? [];
    const out: { date: string; value: number; delta: number | null }[] = [];
    for (let i = src.length - 1; i >= 0; i--) {
      const v = displayWeight(src[i].value, wUnit);
      const prev = i > 0 ? displayWeight(src[i - 1].value, wUnit) : null;
      out.push({ date: src[i].date, value: v, delta: prev == null ? null : v - prev });
    }
    return out;
  }, [weightHistory, wUnit]);

  /*
    Số lớn là LẦN CÂN GẦN NHẤT, không còn là "cân nặng hôm nay".

    Trước đây chưa cân hôm nay thì thẻ không có số để vẽ, nên nó bật thẳng ô
    nhập. Nay thẻ luôn có thứ để nói: lần cân gần nhất trong 90 ngày, và nếu
    ngay cả thế cũng không có thì `profiles.weight_kg` — con số onboarding đã
    hỏi. Chỉ khi cả hai đều rỗng thẻ mới thật sự trống.
  */
  const latest = entries[0] ?? null;
  const headDisp = latest?.value ?? profileDisp;
  const diff = latest?.delta ?? null;
  const olderRows = entries.slice(1, 1 + WEIGHT_ROWS);
  const showLogger = editing;

  /** Ngày của số lớn, chỉ khi nó không phải hôm nay. */
  const staleOn =
    latest != null && latest.date !== localDateStr() ? dayLabel(latest.date, lang) : null;

  /*
    ── ô nhập ở `weight-entry.tsx`, không còn ở đây ──

    Thẻ "Cần làm hôm nay" cũng cần ghi cân nặng, và cân nặng là việc duy nhất
    không có màn riêng để mở — nên ô nhập phải chạy được ở hai chỗ. Chép nó
    sang thẻ kia sẽ là bản thứ hai của một logic GHI, mà mọi thứ khó đều nằm
    trong nó: quy đổi kg/lb, ngưỡng hợp lý theo giá trị sẽ được LƯU, và đường
    ghi offline có `mutationKey` bền. Nên nó được CHUYỂN đi, không nhân đôi;
    chú thích của từng lỗi đã trả giá đi theo mã sang tệp ấy.

    Và vì nó chạy được ở hai chỗ, `showLogger` ở đây mới hạ được xuống còn
    `editing`: trước kia nó là `editing || todayWeight == null`, tức mỗi ngày
    trước lần cân đầu tiên thẻ tự bung ô nhập — hai ô nhập cùng mở trên một
    trang, cho cùng một con số.
  */
  return (
    <GlassCard>
      <Text style={styles.cardTitle}>{i18n.nWeightTitle}</Text>
      {showLogger ? (
        <WeightEntry onLogged={() => setEditing(false)} />
      ) : (
        <View>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.nWeightTitle}
            /* Thẻ mất cái nút, nên lối vào giờ là chính mặt thẻ. Với người dùng
               VoiceOver thì "chạm được" không suy ra được từ bố cục, phải nói. */
            accessibilityHint={i18n.nWeightTapToLog}
            style={styles.weightDisplay}
            onPress={() => {
              Haptics.selectionAsync();
              setEditing(true);
            }}>
            <View style={styles.weightValueRow}>
              <Text style={styles.weightValue}>{headDisp != null ? headDisp.toFixed(1) : '—'}</Text>
              <Text style={styles.weightUnit}>{weightLabel(wUnit)}</Text>
              {/*
                Số lớn chỉ mang ngày khi ngày ấy KHÔNG phải hôm nay.

                Một con số trên trang tổng quan mặc định đọc là "bây giờ", nên
                dán "hôm nay" vào nó là nói thừa. Nhưng khi số gần nhất là của
                ba hôm trước thì im lặng thành nói dối — cùng một chỗ, cùng một
                cỡ chữ, mà nghĩa đã khác.
              */}
              {staleOn ? <Text style={styles.weightWhen}>{staleOn}</Text> : null}
            </View>
            {/*
              Ô bên phải luôn có đúng một việc, và việc ấy là việc đang sống:
              chưa cân hôm nay thì nói cách cân, cân rồi thì nói nó đổi bao nhiêu.
            */}
            {todayWeight == null ? (
              <Text style={styles.weightTapHint}>{i18n.nWeightTapToLog}</Text>
            ) : diff != null && Math.abs(diff) >= WEIGHT_EPS ? (() => {
              const tone = weightDiffTone(c, bmi, diff);
              return (
                <View style={[styles.diffPill, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.diffText, { color: tone.color }]}>{deltaText(diff)}</Text>
                </View>
              );
            })() : null}
          </PressScale>

          {/*
            ── lịch sử: những lần cân ĐỨNG SAU số lớn ──

            `slice(1, …)`, không phải `slice(0, …)`: số lớn ở trên CHÍNH LÀ
            `entries[0]`, nên cho nó xuống hàng đầu danh sách là in một lần cân
            hai lần, cách nhau hai mươi điểm — cùng con số, cùng chênh lệch.

            Ba hàng. Thẻ này sống trên màn Hôm nay, nơi câu hỏi là "đang đi
            hướng nào", không phải "hàng nào sai" — hàng nào sai là việc của
            `WeightLogList` bên màn Tiến trình, nơi có nút xoá. Cùng với số lớn
            là bốn lần cân: đủ để thấy ba bước liên tiếp, tức đủ để phân biệt
            một lần nhiễu với một chiều hướng.
          */}
          {olderRows.length > 0 ? (
            <>
              <View style={styles.weightSep} />
              <View style={styles.weightHistory}>
                {olderRows.map((e) => (
                  <View key={e.date} style={styles.weightHistRow}>
                    <Text style={styles.weightHistWhen} numberOfLines={1}>{dayLabel(e.date, lang)}</Text>
                    <Text style={styles.weightHistValue}>
                      {e.value.toFixed(1)}
                      <Text style={styles.weightHistUnit}> {weightLabel(wUnit)}</Text>
                    </Text>
                    {/* `—` là "không có lần cân nào trước nó để so", khác hẳn
                        `0.0` là "cân rồi, không đổi". */}
                    {e.delta == null ? (
                      <Text style={styles.weightHistFlat}>—</Text>
                    ) : Math.abs(e.delta) < WEIGHT_EPS ? (
                      <Text style={styles.weightHistFlat}>{i18n.nWcNoChange}</Text>
                    ) : (
                      <Text
                        style={[styles.weightHistDelta, { color: weightDiffTone(c, bmi, e.delta).color }]}>
                        {deltaText(e.delta)}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      )}
    </GlassCard>
  );
}

/** Supplement checklist — tap to toggle taken; hidden when user has none */
export function SupplementChecklistCard() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { data: supplements } = useSupplementChecklist();
  const toggle = useToggleSupplement();

  if (!supplements || supplements.length === 0) return null;

  const takenCount = supplements.filter((s) => s.taken).length;
  const allDone = takenCount === supplements.length;

  return (
    <GlassCard>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{i18n.nSupplements}</Text>
        <Text style={styles.cardHint}>
          {takenCount}/{supplements.length} {i18n.nTakenToday}
        </Text>
      </View>
      {allDone ? (
        <View style={styles.allDoneRow}>
          <Icon icon={PartyPopper} size={15} color={c.readinessYellow} />
          <Text style={styles.allDone}>{i18n.nAllSupplementsDone}</Text>
        </View>
      ) : (
        <View style={styles.suppList}>
          {supplements.map((s, i) => (
            <Fragment key={s.id}>
              {i > 0 ? <View style={styles.suppSep} /> : null}
              <PressScale
              style={styles.suppRow}
              onPress={() => toggle.mutate({ supplementId: s.id, taken: !s.taken })}>
              <View style={[styles.checkbox, s.taken && styles.checkboxOn]}>
                {s.taken && <Icon icon={Check} size={15} color="#fff" strokeWidth={3} />}
              </View>
              <View style={styles.suppInfo}>
                <Text style={[styles.suppName, s.taken && styles.suppNameDone]} numberOfLines={1}>
                  {s.name}
                </Text>
                {s.dose_text ? <Text style={styles.suppDose}>{s.dose_text}</Text> : null}
              </View>
            </PressScale>
            </Fragment>
          ))}
        </View>
      )}
    </GlassCard>
  );
}

/* Nhận bảng màu qua THAM SỐ, không gọi hook: nó được gọi trong một `.map()`
   của bảy cột, và một hook ở đó là lỗi lúc chạy mà kiểu không nhìn thấy. */
const readinessZone = (c: Palette, v: number) =>
  v >= 75 ? c.readinessGreen : v >= 50 ? c.readinessYellow : c.readinessRed;

/**
 * Cùng một vùng, vẽ cho một HÌNH thay vì cho một con số.
 *
 * ── vì sao phải có hai hàm ──
 *
 * Một giá trị 72 ở đây vẽ ra HAI thứ cạnh nhau: một cái thanh, và con số 72
 * in bên phải nó. Trước đây cả hai lấy cùng một màu, nên cái thanh bị kéo
 * xuống độ sáng của CHỮ — thứ duy nhất trong hai cái thật sự nợ 4,5:1. Trên
 * giấy khoản thuế ấy trả bằng 17% sắc độ của sắc 95°, và đó là lý do dải
 * "vừa phải" đọc ra ô-liu trong ảnh máy thật.
 *
 * Chỉ vàng tách; lục và đỏ giữ nguyên một giá trị cho cả hai vai vì gamut của
 * chúng ở sàn chữ đã đủ sắc — xem `readinessYellowGraphic` trong `palette.ts`.
 * Nên hai hàm này chỉ khác nhau ở đúng một nhánh, và đó là điều đúng: nếu một
 * ngày lục cũng cần tách, chỗ sửa là ở đây chứ không phải ở bảy chỗ vẽ.
 */
const readinessZoneGraphic = (c: Palette, v: number) =>
  v >= 75 ? c.readinessGreen : v >= 50 ? c.readinessYellowGraphic : c.readinessRed;

/**
 * Readiness 7-day analysis — matches the web "Phân tích": one bar per day
 * coloured by zone, avg/max/min stats, and the three-zone legend. Hidden
 * until there are 2+ points.
 */
export function ReadinessTrendCard() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { data: history } = useReadinessHistory(7);

  if (!history || history.length < 2) return null;

  const values = history.map((h) => h.value);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  const stats = [
    { label: lang === 'vi' ? 'TB' : 'Avg', value: avg },
    { label: lang === 'vi' ? 'Cao nhất' : 'Max', value: max },
    { label: lang === 'vi' ? 'Thấp nhất' : 'Min', value: min },
  ];
  /* Chú giải là các CHẤM, không phải chữ — chữ của nó là `trendLegendText`,
     màu trung tính. Nên chúng đọc bảng đồ hoạ, cùng bảng với các thanh chúng
     giải thích; một chấm sáng hơn cái thanh nó chú giải là sai. */
  const legend = [
    { c: c.readinessGreen, t: lang === 'vi' ? '75+ Tập luyện' : '75+ Train' },
    { c: c.readinessYellowGraphic, t: lang === 'vi' ? '50–74 Vừa phải' : '50–74 Moderate' },
    { c: c.readinessRed, t: lang === 'vi' ? '<50 Phục hồi' : '<50 Recover' },
  ];

  return (
    <GlassCard style={styles.trendCard}>
      <View>
        <Text style={styles.cardTitle}>{i18n.nReadinessTrend}</Text>
        <Text style={styles.cardHint}>
          {lang === 'vi'
            ? 'Mức độ sẵn sàng tập luyện của bạn trong tuần qua'
            : 'Your training readiness over the past week'}
        </Text>
      </View>

      <View style={styles.trendBars}>
        {history.map((h, i) => {
          const day = parseLocalDate(h.date).toLocaleDateString(locale, { weekday: 'short' });
          /* Cùng một vùng, hai vai, cạnh nhau trên một dòng: cái thanh là
             hình, con số là chữ. Đây là chỗ phép tách phải nhìn thấy được —
             nếu hai bên trông như hai màu khác nhau thì đã tách sai. */
          const zone = readinessZone(c, h.value);
          const zoneGraphic = readinessZoneGraphic(c, h.value);
          return (
            <View key={h.date} style={styles.trendRow}>
              <Text style={styles.trendDay}>{day}</Text>
              <ProgressBar pct={h.value} color={zoneGraphic} height={8} radius={4} delay={i * 60} style={styles.trendBar} />
              <Text style={[styles.trendVal, { color: zone }]}>{Math.round(h.value)}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.trendStats}>
        {stats.map((s) => (
          <View key={s.label} style={styles.trendStat}>
            <Text style={styles.trendStatLabel}>{s.label}</Text>
            <Text style={[styles.trendStatValue, { color: readinessZone(c, s.value) }]}>{s.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.trendLegend}>
        {legend.map((z) => (
          <View key={z.t} style={styles.trendLegendItem}>
            <View style={[styles.trendLegendDot, { backgroundColor: z.c }]} />
            <Text style={styles.trendLegendText}>{z.t}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

/**
 * The dashboard's door into today's insight.
 *
 * ── it used to compute them here ──
 *
 * This card called the edge function on tap and dropped the result when it
 * unmounted, so pressing it twice produced two different readings of the same
 * unchanged day — a paid model call each time, and advice that looked like it
 * was being made up on the spot because in a sense it was.
 *
 * The insight lives on the Health Assistant now, where the hero says what the
 * app can see and this says what it means. Two places computing it would be two
 * answers to one question, so this one only points.
 *
 * ── it still shows something ──
 *
 * `enabled: false` reads the day's cache without ever requesting: if the
 * assistant has already been opened today, the card says how many there are.
 * If not, it says what is behind the door. Either way it costs nothing, and it
 * never triggers the call itself — that belongs to the page that displays the
 * result.
 *
 * ── and it goes quiet again when the day moves ──
 *
 * The key carries a coarse stamp of today (see `use-smart-nudges`), so logging
 * a meal invalidates the count this card is showing. It falls back to
 * "Xem insight hôm nay", which is right rather than a gap: the number would be
 * a promise about a reading that no longer matches the day, and tapping now
 * genuinely does produce a different one.
 */
export function SmartTipsCard() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const cached = useSmartNudges(false);
  const count = cached.data?.length ?? null;

  const live =
    count != null && count > 0
      ? vi
        ? `${count} gợi ý cho hôm nay`
        : `${count} suggestions for today`
      : null;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`${i18n.nSmartTips} — ${live ?? i18n.nTipsHint}`}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        nav.push('/assistant');
      }}>
      <GlassCard style={styles.tipsCard}>
        <View style={styles.tipsChip}>
          <Icon icon={Sparkles} size={20} color={c.metricPurple} />
        </View>
        <View style={styles.tipsCopy}>
          <Text style={styles.tipsLead} numberOfLines={1}>{i18n.nSmartTips}</Text>
          {/*
            Dòng phụ mang TRẠNG THÁI, không mang lời quảng cáo.

            Trước đây nó luôn là "AI từ dữ liệu gần đây" — một câu mô tả chính
            nó, đúng ở mọi ngày nên không nói gì về hôm nay. Con số thì có nói,
            mà nó lại bị nhét vào nhãn của cái nút. Đổi chỗ hai thứ: tên thẻ lên
            dòng đầu, trạng thái xuống dòng phụ. Đó đúng là cách `toolRowSub`
            bên Tập luyện đang làm ("Đã ghi 1 buổi tập").

            Câu mô tả vẫn còn, nhưng chỉ ở NGÀY CHƯA CÓ SỐ — lúc ấy nó là thứ
            duy nhất còn nói được điều gì.
          */}
          <Text style={styles.tipsSub} numberOfLines={1}>{live ?? i18n.nTipsHint}</Text>
        </View>
        <Icon icon={ChevronRight} size={17} color={c.mutedForeground} />
      </GlassCard>
    </PressScale>
  );
}


const stylesFor = makeStyles((c, m) => ({
  // Web dashboard micro-title: 12px semibold uppercase, wide tracking
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: c.mutedForeground,
  },
  cardHint: { ...type.footnote, color: c.mutedForeground, marginTop: 2 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },

  // Weight
  /*
    ── một thẻ, một hình dạng ──

    Thẻ này có hai trạng thái và trước đây chúng vẽ CÙNG một con số theo hai
    cách khác nhau: đã ghi thì `weightValue` — 28 điểm, mono, màu đầy; chưa ghi
    thì `fontSize: 18` nằm trong một cái hộp có viền và nền riêng. Nên mỗi ngày
    một lần, đúng lúc bạn ghi cân, cả thẻ đổi hình.

    Nay hai trạng thái dùng chung một bộ xương: số lớn mono bên trái, đơn vị
    trên cùng đường chân chữ, hành động bên phải. Cái đổi giữa hai trạng thái
    chỉ còn là gạch chân của ô nhập và viên chênh lệch — tức là thứ THẬT SỰ
    khác nhau, chứ không phải toàn bộ bố cục.

    ── vì sao bỏ hộp ──

    Cái hộp (viền + nền + bo góc) là chrome của một cái FORM. Trên một trang
    tổng quan, một ô nhập có hộp đọc ra như việc chưa làm xong. Số thì vẫn sửa
    được, chỉ là nó thôi mặc đồng phục biểu mẫu: gạch chân mảnh nói "gõ được"
    mà không dựng thêm một hình chữ nhật thứ hai bên trong thẻ.
  */
  /*
    `center`, KHÔNG phải `baseline` — và đây là lý do bản đầu bị trả về.

    Căn theo đường chân chữ đọc thì đúng hơn: "kg" ngồi trên cùng đường với đáy
    con số, y như trạng thái đã ghi. Nhưng nó là thứ DUY NHẤT trong cả thẻ này
    làm đổi CÁCH TÍNH bố cục — Yoga phải đo đường chân chữ của từng con, mà một
    trong ba con là `TextInput`. Bỏ viền hộp, chốt bề rộng, thu nhỏ nút đều là
    giá trị tĩnh; chỉ mình nó kéo thêm một lượt đo.

    Người dùng báo bấm Ghi thì giật, và mốc bắt đầu đúng là lúc thẻ này đổi
    thiết kế. `center` cho ra hình gần như y hệt ở cỡ chữ này, nên đây là chỗ
    nhường rẻ nhất: giữ toàn bộ phần nhìn, bỏ đúng một dòng đắt.
  */
  weightUnit: { ...type.body, color: c.mutedForeground },
  weightDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  weightValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  /* Cùng `gap` và cùng đường chân chữ như ô nhập ở `weight-entry.tsx`, để hai
     trạng thái đặt số và đơn vị vào đúng một chỗ. */
  weightValue: { ...type.largeTitle, ...type.mono, color: c.foreground },
  /* Ngày của số lớn: cùng đường chân chữ với "kg", nhưng nhỏ hơn một bậc và
     mang màu phụ — nó chú thích con số, không đứng ngang hàng với nó. */
  weightWhen: { ...type.footnote, color: c.mutedForeground, marginLeft: 2 },
  /* Lời mời chạm, KHÔNG phải một cái nút giả.
     Không nền, không viền, không bo góc — ba thứ ấy là chữ ký của một vùng
     chạm riêng, mà ở đây vùng chạm là cả hàng. Vẽ chúng ra là hứa một cú chạm
     nhỏ hơn cú chạm thật. */
  weightTapHint: { ...type.footnote, fontWeight: '600', color: c.mutedForeground },
  diffPill: { paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.full },
  diffText: { ...type.footnote, fontWeight: '700', fontVariant: ['tabular-nums'] },

  /*
    ── lịch sử cân nặng ──

    Một đường kẻ ngang chia số lớn với danh sách. Đây là chỗ DUY NHẤT trong thẻ
    cần một đường: trên nó là "bây giờ", dưới nó là "trước đó", và hai thứ ấy
    trả lời hai câu hỏi khác nhau. Không có đường thì bốn con số cùng cỡ đọc ra
    thành một khối, và số lớn mất vai trò dẫn dắt.

    Tràn hết bề rộng thẻ (`-spacing.card`, đúng padding của `GlassCard`) vì lý
    do `quickSep` bên `dashboard-cards.tsx` đã ghi: đường ngắn hơn thẻ đọc ra
    thành đồ trang trí nằm giữa chứ không phải một ranh giới. Và `c.border` là
    màu mà `suppSep` ngay trong tệp này đã dùng — một mã cứng ở đây sẽ trôi
    khỏi hai diện mạo ngay lượt sửa bảng màu tiếp theo.
  */
  weightSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
    marginHorizontal: -spacing.card,
    marginTop: spacing.md,
  },
  weightHistory: {
    marginTop: spacing.sm,
    gap: 2,
  },
  weightHistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    /* 28, không phải 44. Hàng này KHÔNG chạm được — nó nằm trong vùng chạm của
       cả thẻ, và sàn 44 điểm của Apple áp cho mục tiêu chạm, không cho dòng
       chữ. Nhét ba dòng cao 44 vào một thẻ tổng quan là dựng một cái bảng. */
    minHeight: 28,
    gap: spacing.sm,
  },
  weightHistWhen: { ...type.footnote, color: c.mutedForeground, flex: 1 },
  /*
    Cùng `type.mono` như số lớn, nên chữ số của ba hàng thẳng cột với nhau.
    Chữ số tỷ lệ sẽ làm ba hàng so le.

    Và cột được CHỐT bề rộng, canh phải. Mono giữ cho các chữ số bằng nhau
    nhưng không giữ cho SỐ CHỮ SỐ bằng nhau: một hàng `72.1 kg` cạnh một hàng
    `100.5 kg` lệch nhau đúng một ô chữ, và cột số nào lệch thì so hàng này với
    hàng kia phải đọc chứ không liếc được nữa. 76 là chỗ cho `100.5 kg` — giá
    trị dài nhất hợp lý ở cả kg lẫn lb.
  */
  weightHistValue: {
    ...type.footnote,
    ...type.mono,
    color: c.foreground,
    minWidth: 76,
    textAlign: 'right',
  },
  weightHistUnit: { color: c.mutedForeground },
  /* Chốt bề rộng để cột chênh lệch thẳng hàng dù hàng trên là `↑ 0.4`, hàng
     dưới là `—` hay `Không đổi`. */
  weightHistDelta: {
    ...type.footnote,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 58,
    textAlign: 'right',
  },
  weightHistFlat: {
    ...type.footnote,
    color: c.mutedForeground,
    minWidth: 58,
    textAlign: 'right',
  },

  // Readiness 7-day analysis
  trendCard: { gap: spacing.md },
  trendBars: { gap: spacing.sm },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trendDay: { width: 34, fontSize: 11, color: c.mutedForeground, textTransform: 'capitalize' },
  trendBar: { flex: 1 },
  trendVal: { width: 28, textAlign: 'right', fontSize: 12, fontFamily: 'Menlo', fontWeight: '700', fontVariant: ['tabular-nums'] },
  trendStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  trendStat: { alignItems: 'center', gap: 2 },
  trendStatLabel: { fontSize: 11, color: c.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  trendStatValue: { fontSize: 20, fontFamily: 'Menlo', fontWeight: '700', fontVariant: ['tabular-nums'] },
  trendLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, rowGap: 4 },
  trendLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trendLegendDot: { width: 7, height: 7, borderRadius: 4 },
  trendLegendText: { fontSize: 11, color: c.mutedForeground },

  // Supplements
  allDone: { ...type.body, color: c.readinessGreen },
  allDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  suppList: { marginTop: spacing.sm },
  /*
    Vạch tóc giữa các hàng, thay cho một khoảng trống.

    Hai hàng cách nhau 8 điểm trên cùng một nền thì mắt phải tự đoán chúng là
    hai mục riêng. Một vạch thụt vào — thụt qua bề rộng ô tick cộng khoảng
    cách, nên nó bắt đầu đúng dưới chữ — nói thẳng điều đó. Đây là idiom sẵn
    có: `foodListStyles.sep` bên Dinh dưỡng làm y hệt.
  */
  suppSep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 26 + spacing.md,
    backgroundColor: c.border,
  },
  /* Cao tối thiểu 44: đây là hàng BẤM ĐƯỢC và 44 là sàn chạm của Apple. Đệm
     dọc cũng cho hai hàng thở ra thay vì dính nhau. */
  suppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  /*
    Ô tick phải TÁCH khỏi thẻ, không hoà vào nó.

    Bản cũ để `borderColor: colors.border` — đúng màu viền của chính thẻ
    (#2b2b31) — và không có nền riêng. Nên thứ duy nhất bấm được trên thẻ lại
    là một đường viền cùng tông với mọi đường viền quanh nó.

    Hai thay đổi: nền TỐI HƠN mặt thẻ (#070708 so với #0e0e11) nên nó đọc ra
    là một cái lõm chờ được đánh dấu; và viền sáng hơn gấp đôi để cái lõm có
    mép. Cùng nguyên tắc đã ghi ở thumb của thanh điều hướng mục: trên nền
    tối, thứ nổi lên là thứ TỐI hơn có viền sáng, không phải thứ sáng hơn.
  */
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: alpha(m.ink, 0.28),
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: c.readinessGreen, borderColor: c.readinessGreen },
  checkmark: { color: '#fff', fontSize: 15, fontWeight: '700' },
  suppInfo: { flex: 1, minWidth: 0 },
  suppName: { ...type.body, color: c.foreground },
  suppNameDone: { color: c.mutedForeground, textDecorationLine: 'line-through' },
  suppDose: { ...type.caption, color: c.mutedForeground },

  // Smart tips
  /*
    ── ba nhãn cho một cánh cửa ──

    Thẻ cũ có tiêu đề "GỢI Ý THÔNG MINH", câu phụ "AI từ dữ liệu gần đây", rồi
    một nút xám rộng hết bề ngang ghi "Xem insight hôm nay". Ba dòng chữ nói
    gần cùng một điều, và thứ nặng nhất trên thẻ — tấm xám cao 44 — chỉ để mở
    một trang. Trong khi mọi thẻ khác ở Dashboard đều hiện một con số, thẻ này
    là cánh cửa duy nhất, và nó đeo ba tấm biển.

    Nay cả thẻ LÀ cái nút, nên tấm xám không còn lý do tồn tại: hình dạng đã
    nói "bấm được" qua ô icon có nền màu và mũi chevron, đúng như mọi hàng dẫn
    đi chỗ khác trong app.

    Ô icon 40×40 nền 12% alpha là idiom có sẵn của "GHI BỮA ĂN" (`chip` trong
    `meal-log-actions`), không phải thứ tôi bịa ra ở đây. Tím `metricPurple` là
    màu Sparkles vẫn dùng.

    Cao 135 điểm xuống còn một hàng — và không mất thông tin nào, vì thứ mất là
    hai bản sao của cùng một câu.
  */
  tipsCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  tipsChip: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(c.metricPurple, 0.12),
  },
  tipsCopy: { flex: 1, minWidth: 0, gap: 1 },
  /* 17 điểm màu đầy, không phải 12 in hoa màu mờ: đây là tên của thẻ, và ở cỡ
     cũ nó đọc ra nhỏ hơn cả câu phụ nằm dưới nó. */
  tipsLead: { ...type.body, fontWeight: '600', color: c.foreground },
  tipsSub: { ...type.footnote, color: c.mutedForeground },
}));
