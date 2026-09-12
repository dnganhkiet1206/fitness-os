import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { SkeletonBlock } from '@/components/ascnd/skeleton';
import { DayMeals } from '@/components/ascnd/today-meals';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { usePalette } from '@/hooks/use-palette';
import { useTodayLog } from '@/hooks/use-nutrition';
import { localDateStr, parseLocalDate, shiftLocalDate } from '@/lib/local-date';
import { nav } from '@/lib/nav';

/**
 * Nhật ký bữa ăn của MỘT NGÀY BẤT KỲ — chỗ sửa lại thứ đã ghi nhầm.
 *
 * ── lỗ hổng màn này lấp ──
 *
 * Nhật ký sửa/xoá được từng món, nhưng CHỈ hôm nay: không màn nào trong app
 * đọc bữa ăn của một ngày đã qua. Mà người ta phát hiện ghi nhầm chủ yếu vào
 * hôm sau — nhìn vòng calo hôm qua thấy vô lý — và tới lúc ấy thì không còn
 * đường nào chạm vào nó nữa.
 *
 * ── tầng dữ liệu đã chờ sẵn ở đây, không ai tới ──
 *
 * Mười ba hook nhận `date?`: `useTodayLog`, `useDeleteMealItem`,
 * `useUpdateMealItemServings`, `useDailyLog`, `useTodayWater`,
 * `useSupplementChecklist`… và `log-meal.tsx` nhận cả `?date=` từ route, với
 * chú thích nói thẳng *"Màn Dinh dưỡng mở màn này bằng `/log-meal?date=...`
 * khi người dùng đang xem một ngày khác"*.
 *
 * Không một chỗ gọi nào truyền ngày. Cả bộ tham số ấy chưa từng chạy khác mặc
 * định một lần nào, và câu chú thích kia tả một chỗ gọi không tồn tại — đúng
 * hình dạng "chú thích mô tả một bài kiểm không có" mà repo này đã dính vài
 * lần. Màn này là chỗ gọi ấy.
 *
 * ── vì sao là màn RIÊNG, không phải điều hướng ngày ngay trong tab ──
 *
 * Chú thích của `log-meal.tsx` hình dung vế còn lại nằm trong tab Dinh dưỡng.
 * Tôi làm khác, và lý do là ngữ nghĩa chứ không phải công sức: tab ấy là HÔM
 * NAY từ đầu tới cuối — vòng calo, nước, thực phẩm bổ sung, bốn ô ghi bữa,
 * nhiệm vụ ngày. Cho cả tab lùi ngày là biến mọi con số trên đó thành thứ phải
 * kiểm ngày trước khi đọc, mỗi lần mở tab, để phục vụ một việc làm vài tuần
 * một lần. Vòng calo đọc nhầm ngày là một câu sai về cơ thể người ta.
 *
 * Ở đây thì không có gì để nhầm: cả màn chỉ có một ngày, và tên ngày là thứ to
 * nhất trên đầu.
 *
 * ── ngày sống trong state, không trong URL ──
 *
 * Bấm mũi tên là ĐỔI cái đang xem, không phải đi tới một trang mới. Đẩy mỗi
 * ngày thành một route thì nút quay lại phải bấm bảy lần để thoát khỏi một
 * tuần vừa xem. `?date=` vẫn đọc được một lần lúc mở, để chỗ khác trỏ thẳng
 * vào một ngày cụ thể.
 */
export default function DiaryScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();

  const today = localDateStr();
  /*
    Tham số route chỉ là GIÁ TRỊ ĐẦU. Nó cũng được kẹp về hôm nay: `?date=` đến
    từ bên ngoài và một ngày ở tương lai sẽ dựng ra một màn không bao giờ có gì
    trong đó, kèm mũi tên "ngày sau" mời đi xa hơn nữa.
  */
  const [dateStr, setDateStr] = useState(
    dateParam && dateParam <= today ? dateParam : today,
  );
  const isToday = dateStr === today;

  const { data: meals, isError: diaryFailed, isPending } = useTodayLog(dateStr);

  const go = (days: number) => {
    const next = shiftLocalDate(dateStr, days);
    if (next > today) return;
    Haptics.selectionAsync();
    setDateStr(next);
  };

  /*
    Tổng của ngày cộng từ CHÍNH danh sách bên dưới, không đọc `daily_logs`.

    Hai lý do. Một: nó không thể lệch với thứ đang hiện ra — mà "tổng trên đầu
    không khớp các thẻ bên dưới" là đúng loại lỗi nhật ký sinh ra để bắt. Hai:
    thêm một truy vấn là thêm một trạng thái hỏng nữa phải kể cho người dùng
    nghe, cho một con số mà dữ liệu đã có sẵn trong tay.
  */
  const total = (meals ?? []).reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      p: a.p + m.protein_g,
      c: a.c + m.carbs_g,
      f: a.f + m.fat_g,
    }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );

  /* Hôm nay và hôm qua gọi bằng tên; xa hơn thì đọc ngày ra. Một người nhìn
     "Hôm qua" hiểu ngay, còn "Thứ Năm, 11 tháng 9" thì phải đối chiếu. */
  const dayLabel = isToday
    ? i18n.nDiaryToday
    : dateStr === shiftLocalDate(today, -1)
      ? i18n.nDiaryYesterday
      : parseLocalDate(dateStr).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });

  return (
    <Screen refreshable back title={i18n.nDiaryTitle}>
      <GlassCard style={styles.nav}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.nDiaryPrevDay}
          hitSlop={6}
          style={styles.arrow}
          onPress={() => go(-1)}>
          <Icon icon={ChevronLeft} size={20} color={c.foreground} />
        </PressScale>

        <View style={styles.dayBox}>
          <Text style={styles.day} numberOfLines={1}>{dayLabel}</Text>
          {/* Ngày đầy đủ ở dòng dưới khi dòng trên là một cái TÊN — nếu không,
              "Hôm qua" không nói được hôm qua là ngày mấy. */}
          {isToday || dateStr === shiftLocalDate(today, -1) ? (
            <Text style={styles.daySub} numberOfLines={1}>
              {parseLocalDate(dateStr).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
                day: 'numeric',
                month: 'short',
              })}
            </Text>
          ) : null}
        </View>

        {/*
          Mũi tên "ngày sau" ở hôm nay thì MỜ ĐI chứ không biến mất.

          Bỏ hẳn nó đi sẽ làm nhãn ngày nhảy sang phải mỗi lần chạm tới hôm nay,
          và một hàng điều khiển đổi hình dạng dưới ngón tay là một hàng người
          ta bấm nhầm. `disabled` cũng nói cho VoiceOver biết vì sao nó không
          làm gì, thứ mà một nút vắng mặt không nói được.
        */}
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.nDiaryNextDay}
          accessibilityState={{ disabled: isToday }}
          disabled={isToday}
          hitSlop={6}
          style={[styles.arrow, isToday && styles.arrowOff]}
          onPress={() => go(1)}>
          <Icon icon={ChevronRight} size={20} color={c.foreground} />
        </PressScale>
      </GlassCard>

      {/* Lối về hôm nay, chỉ hiện khi đang ở chỗ khác. Lùi bảy ngày rồi bấm
          mũi tên bảy lần để về là thứ không ai nên phải làm. */}
      {isToday ? null : (
        <PressScale
          accessibilityRole="button"
          style={styles.todayPill}
          onPress={() => {
            Haptics.selectionAsync();
            setDateStr(today);
          }}>
          <Text style={styles.todayPillText}>{i18n.nDiaryToday}</Text>
        </PressScale>
      )}

      {/*
        Ba trạng thái, ba câu khác nhau — và ĐANG TẢI là một trạng thái riêng.

        Đổi ngày là đổi `queryKey`, nên có một quãng `data` là `undefined` trước
        khi ngày mới về. Để nó rơi xuống `DayMeals` với mảng rỗng thì màn hình
        nói "Ngày này chưa ghi bữa nào" về một ngày nó chưa đọc xong — và người
        đọc câu ấy sẽ đi ghi lại một bữa họ đã ghi rồi. Cùng cái lỗi mà thẻ dinh
        dưỡng ở tab kia đã phải tách `isPending` ra để sửa.
      */}
      {diaryFailed ? (
        <LoadFailed i18n={i18n} />
      ) : isPending ? (
        <View style={styles.loading}>
          <SkeletonBlock height={70} />
          <SkeletonBlock height={70} />
        </View>
      ) : (
        <>
          {total.kcal > 0 ? (
            <GlassCard style={styles.total}>
              <Text style={styles.totalLabel}>{i18n.nDiaryDayTotal}</Text>
              <Text style={styles.totalValue}>
                {Math.round(total.kcal).toLocaleString()} <Text style={styles.unit}>kcal</Text>
                <Text style={styles.totalMacros}>
                  {'  '}P{Math.round(total.p)} · C{Math.round(total.c)} · F{Math.round(total.f)}
                </Text>
              </Text>
            </GlassCard>
          ) : null}

          <DayMeals meals={meals ?? []} i18n={i18n} lang={lang} date={dateStr} />

          {/*
            Nút ghi thêm chỉ đứng đây khi ngày ĐÃ CÓ bữa. Ngày trống đã có thẻ
            "chưa ghi bữa nào — nhấn để ghi" của `DayMeals`, và hai lối vào cùng
            một màn xếp chồng nhau là thứ khiến người ta phải chọn giữa hai cái
            giống hệt.
          */}
          {total.kcal > 0 ? (
            <PressScale
              accessibilityRole="button"
              style={styles.add}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                nav.push(isToday ? '/log-meal' : `/log-meal?date=${dateStr}`);
              }}>
              <Icon icon={Plus} size={16} color={c.primary} />
              <Text style={styles.addText}>{i18n.nDiaryAddMeal}</Text>
            </PressScale>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const stylesFor = makeStyles((c, m) => ({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  /* 44 — sàn chạm của Apple HIG. Hai mũi tên này là điều khiển chính của màn,
     nên chúng không được là thứ phải ngắm. */
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(m.ink, 0.07),
  },
  /* 0.35: còn thấy được là một cái nút, đủ mờ để đọc ra là đang tắt. Giữ nền
     nên hàng không đổi hình dạng khi chạm tới hôm nay. */
  arrowOff: { opacity: 0.35 },
  dayBox: { flex: 1, minWidth: 0, alignItems: 'center', gap: 1 },
  day: { ...type.headline, color: c.foreground },
  daySub: { ...type.caption, color: c.mutedForeground },
  /* 44, không 32. Bản đầu để 32 và `tools/tap-target.mjs` bắt đúng: dưới sàn
     chạm 44 của Apple HIG mà không có `hitSlop` bù.

     Chọn cao lên thật chứ không vá bằng `hitSlop`, vì đây là lối THOÁT duy
     nhất khỏi một ngày ở xa — lùi bảy ngày rồi bấm mũi tên bảy lần là thứ nó
     tồn tại để khỏi phải làm. `sheet-header.tsx` đã ghi lý do cho đúng lựa
     chọn này: hitSlop là vô hình, nên nó không làm một nút 32 điểm bớt TRÔNG
     như một nút 32 điểm. */
  todayPill: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(m.ink, 0.07),
  },
  todayPillText: { ...type.footnote, fontWeight: '600', color: c.primary },
  loading: { gap: spacing.sm },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { ...type.caption, color: c.mutedForeground },
  totalValue: { ...type.headline, color: c.foreground, fontVariant: ['tabular-nums'] },
  totalMacros: { ...type.caption, color: c.mutedForeground },
  unit: { ...type.caption, color: c.mutedForeground },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  addText: { ...type.footnote, fontWeight: '600', color: c.primary },
}));
