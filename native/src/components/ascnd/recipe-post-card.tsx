import { haptics as Haptics } from '@/lib/haptics';
import { Beef, ChevronRight, Flame, Milk, UtensilsCrossed, Wheat } from 'lucide-react-native';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { PostShell } from '@/components/ascnd/post-parts';
import { PressScale } from '@/components/ascnd/press-scale';
import { MACRO_TINT, radius, spacing, type } from '@/constants/ascnd';
import { graphicOf } from '@/constants/palette';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import type { FeedPost } from '@/hooks/use-community';
import { useLogPlannedMeal, useTodayLog } from '@/hooks/use-nutrition';
import { usePalette } from '@/hooks/use-palette';
import { getLocale } from '@/lib/i18n';
import { nav } from '@/lib/nav';
import { plannedMealIsLoggedToday } from '@/lib/planned-meal';
import { readRecipePayload, toPlannedFoods } from '@/lib/recipe-post';
import { toast } from '@/lib/toast';
import { fillCopy } from '@/lib/copy-fill';

/** Ba dòng trên feed, đủ để thấy món gồm gì; phần còn lại ở trang bài. */
const PREVIEW = 3;

/**
 * Thẻ bài RECIPE (#7, người làm: B) — một ĐỐI TƯỢNG DÙNG ĐƯỢC, không phải ảnh món.
 *
 * Khung chung (đầu thẻ, menu an toàn, chú thích, Thích · Bình luận · Lưu · Chia
 * sẻ) là `PostShell` của A. Tệp này chỉ vẽ phần THÂN, và đi đúng nhịp của thẻ
 * Workout để hai loại bài đọc ra là một bộ:
 *
 *   tên món + kcal    `type.title`, rồi một hàng số — như "Push Day · ~45 phút"
 *   ba chip macro     cùng TỪ với màn Dinh dưỡng (`nProtein`/`nCarbs`/`nFat`:
 *                     "Đạm / Tinh bột / Béo"), không chép chữ tiếng Anh
 *                     "protein / carbs / fat" của mockup — cùng một con số mà
 *                     hai màn gọi hai tên là bắt người ta tự dịch
 *   nguyên liệu       CÁC DÒNG trong một mặt lõm, như các bài tập của thẻ
 *                     Workout — không phải bốn ô vuông như mockup: chủ dự án đã
 *                     chọn "chỉ thẻ dựng từ dữ liệu", và bốn ô không ảnh là bốn
 *                     ô trống có chữ
 *   Thêm vào bữa ăn   hành động RIÊNG của loại bài này, cùng khuôn với "Thử
 *                     workout": viên trầm, không đặc
 *
 * ── "Lưu công thức" là nút Lưu CÓ SẴN ──
 *
 * Mockup vẽ một nút lớn "Lưu công thức". `PostShell` đã có nút Lưu cho MỌI loại
 * bài; thêm nút thứ hai là hai điều khiển cho một hành động. Nên nút riêng của
 * thẻ là thứ chỉ Recipe làm được — biến món của người khác thành bữa của mình.
 *
 * ── số trên thẻ ĐỌC LẠI từ các dòng ──
 *
 * `readRecipePayload` tính lại tổng từ nguyên liệu, không tin trường tổng trên
 * payload. "Thêm vào bữa ăn" ghi CÁC DÒNG, nên số in ở đây đúng bằng số sẽ
 * rơi vào nhật ký người xem, dù payload có từ một bản cache cũ.
 */
export function RecipePostCard({
  post,
  full = false,
  preview = false,
}: {
  post: FeedPost;
  full?: boolean;
  preview?: boolean;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const locale = getLocale(lang);
  const addMeal = useLogPlannedMeal();
  /* Nhật ký hôm nay, để hỏi lại khi bữa ấy đã ghi rồi (#177) — cùng truy vấn
     màn Dinh dưỡng và Kế hoạch ăn đọc, nên không thêm lượt đọc riêng nào. */
  const { data: todayMeals } = useTodayLog();

  const p = useMemo(() => readRecipePayload(post.raw), [post.raw]);
  const title = p.title || i18n.nRcRecipe;
  const lines = full ? p.ingredients : p.ingredients.slice(0, PREVIEW);
  const more = p.ingredients.length - lines.length;
  const fmt = (n: number) => Math.round(n).toLocaleString(locale);
  /* Đơn vị là khoá `dcActivityKcal` CÓ SẴN (vòng hoạt động dùng nó) — "kcal"
     giống nhau ở hai thứ tiếng có chủ đích, và nó đã nằm trong danh sách
     giữ nguyên của `tools/i18n.mjs` kèm lý do. Một khoá `{n} kcal` thứ hai là
     một ngoại lệ thứ hai cho cùng một chữ. */
  const kcal = (n: number) => `${fmt(n)} ${i18n.dcActivityKcal}`;

  const openPost = () => nav.push({ pathname: '/community-post', params: { id: post.id } });

  /* #159: icon và màu của mỗi macro là CÙNG bộ thẻ macro ở Hôm nay dùng
     (`dashboard-cards.tsx`: Beef/Wheat/Milk, `graphicOf(MACRO_TINT)`) — một
     macro trông giống nhau ở mọi nơi nó xuất hiện trong app, như Apple Fitness
     giữ màu của từng vòng ở mọi màn. */
  const macros = [
    { key: 'p', label: i18n.nProtein, g: p.protein, icon: Beef, tint: graphicOf(c, MACRO_TINT.protein) },
    { key: 'c', label: i18n.nCarbs, g: p.carbs, icon: Wheat, tint: graphicOf(c, MACRO_TINT.carbs) },
    { key: 'f', label: i18n.nFat, g: p.fat, icon: Milk, tint: graphicOf(c, MACRO_TINT.fat) },
  ];

  const shareText = () => {
    const head = i18n.nRcShareText.replace('{title}', title).replace('{kcal}', fmt(p.kcal));
    const macroLine = macros.map((m) => `${m.label} ${fmt(m.g)} g`).join(' · ');
    const body = p.ingredients
      .map((i) => `• ${i.name}${i.grams ? ` — ${i18n.nRcGrams.replace('{n}', fmt(i.grams))}` : ''}`)
      .join('\n');
    return `${head}\n${macroLine}\n\n${body}`;
  };

  /*
    Người xem TỰ CHỌN bữa. Không đoán theo giờ: `log-meal` cũng không đoán — nó
    mặc định "Bữa trưa" và để người ta chọn — và bữa của người ĐĂNG ("lunch")
    chẳng nói gì về việc người XEM đang ăn bữa nào.

    `Alert`, không một bảng chọn tự dựng: đó là mẫu mà mọi lựa chọn nhiều phương
    án của app đang dùng, kể cả menu Báo cáo/Chặn/Xoá của `PostShell`.

    Rung chọn ngay lúc CHẠM, không đợi lượt ghi xong (#7: rung chọn thuộc về
    `onMutate`, không thuộc `onSuccess`).
  */
  const addToMeal = () => {
    Haptics.selection();
    const foods = toPlannedFoods(p);
    if (foods.length === 0) return;
    const write = async (mealType: string, label: string) => {
      try {
        /* Mất mạng thì bữa vào hàng đợi bền và câu báo nói đúng thế (#57) —
           không chờ một mutation bị tạm dừng, thứ chỉ xong khi có mạng lại. */
        const r = await addMeal.log({ mealType, foods });
        toast.success((r === 'queued' ? i18n.nRcAddedQueued : i18n.nRcAdded).replace('{meal}', label));
      } catch (e) {
        toast.fail(e as Error);
      }
    };
    /*
      Hỏi lại, không từ chối — cùng luật và cùng câu với Kế hoạch ăn
      (`lib/planned-meal`, #177): cú chạm thứ hai lỡ tay và phần thứ hai ăn thật
      trông y hệt nhau từ đây, và chỉ một trong hai là nhầm. Trước #177 thẻ này
      ghi luôn, nên chạm hai lần là hai bữa y hệt, không một câu nào.
    */
    const pick = (mealType: string, label: string) => () => {
      if (plannedMealIsLoggedToday(foods, mealType, todayMeals ?? [])) {
        Alert.alert(i18n.nMpAgainTitle, i18n.nMpAgainBody.replace('{m}', label.toLowerCase()), [
          { text: i18n.nCancel, style: 'cancel' },
          { text: i18n.nMpAgainYes, onPress: () => void write(mealType, label) },
        ]);
        return;
      }
      void write(mealType, label);
    };
    Alert.alert(i18n.nRcAddWhich, undefined, [
      { text: i18n.nBreakfast, onPress: pick('breakfast', i18n.nBreakfast) },
      { text: i18n.nLunch, onPress: pick('lunch', i18n.nLunch) },
      { text: i18n.nDinner, onPress: pick('dinner', i18n.nDinner) },
      { text: i18n.nSnack, onPress: pick('snack', i18n.nSnack) },
      { text: i18n.nCancel, style: 'cancel' },
    ]);
  };

  return (
    <PostShell post={post} full={full} preview={preview} shareText={shareText}>
      {/* ── tên món + kcal ── */}
      <Text style={styles.title}>{title}</Text>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Icon icon={Flame} size={15} color={c.mutedForeground} />
          <Text style={styles.statText}>{kcal(p.kcal)}</Text>
        </View>
      </View>

      {/* ── ba chip macro ── */}
      <View style={styles.chips}>
        {macros.map((m) => (
          <View key={m.key} style={styles.chip} accessible accessibilityLabel={`${m.label} ${fmt(m.g)} g`}>
            <View style={styles.chipHead}>
              <Icon icon={m.icon} size={13} color={m.tint} />
              <Text style={styles.chipLabel} numberOfLines={1}>
                {m.label}
              </Text>
            </View>
            <Text style={styles.chipValue} numberOfLines={1}>{`${fmt(m.g)} g`}</Text>
          </View>
        ))}
      </View>

      {/* ── nguyên liệu ── */}
      <View style={styles.panel}>
        {lines.map((i, n) => (
          <View key={`${i.name}-${n}`} style={[styles.line, n > 0 && styles.lineRule]}>
            <Text style={styles.lineName} numberOfLines={1}>
              {i.name}
              {/* Khối lượng CHỈ khi biết — dòng gõ tay không có món gốc thì im. */}
              {i.grams ? <Text style={styles.lineGrams}>{`  ${i18n.nRcGrams.replace('{n}', fmt(i.grams))}`}</Text> : null}
            </Text>
            <Text style={styles.lineValue}>{kcal(i.kcal)}</Text>
          </View>
        ))}
        {more > 0 ? (
          <Pressable accessibilityRole="button" onPress={openPost} style={[styles.line, styles.lineRule]}>
            <Text style={styles.moreText}>{fillCopy(i18n.nRcMoreIngredients, { n: String(more) })}</Text>
            <Icon icon={ChevronRight} size={16} color={c.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {!post.mine && !preview ? (
        <PressScale
          accessibilityRole="button"
          onPress={addToMeal}
          disabled={addMeal.isPending}
          style={styles.addBtn}>
          <Icon icon={UtensilsCrossed} size={16} color={c.foreground} />
          <Text style={styles.addText}>{i18n.nRcAddToMeal}</Text>
        </PressScale>
      ) : null}
    </PostShell>
  );
}

/*
  Cùng số đo với thẻ Workout (`workout-post-card.tsx`), từng giá trị: hai thẻ
  nằm cạnh nhau trên một feed, và một khác biệt 2 điểm ở lề hay ở cỡ chữ đọc ra
  là hai sản phẩm.
*/
const stylesFor = makeStyles((c, m) => ({
  title: { ...type.title, color: c.foreground },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: -spacing.xs },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { ...type.footnote, color: c.foreground, fontVariant: ['tabular-nums'] },
  /*
    Ô macro: cùng mặt lõm với bảng nguyên liệu ngay dưới (`m.inset`), để ba
    con số đọc ra là DỮ LIỆU của thẻ chứ không phải ba cái nút. Nhãn mờ, số đậm
    — con số là thứ người ta tìm.

    Từng là ba viên chip nằm ngang "Protein 52 g". Thêm icon macro (#159) thì
    ở 402 điểm chip thứ ba rớt xuống hàng hai, đứng lẻ (đo trên ảnh chụp
    29/09). Nay là ba Ô, cùng số đo từng giá trị với ô số liệu của thẻ Tiến
    trình (`progress-post-card.tsx`): chia đều một hàng, icon + nhãn trên, số
    dưới — hai thẻ nằm cạnh nhau trên một feed nói cùng một ngôn ngữ.
  */
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexGrow: 1,
    flexBasis: 92,
    minWidth: 0,
    gap: 4,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    backgroundColor: m.inset.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: m.inset.border,
  },
  chipHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipLabel: { ...type.footnote, color: c.mutedForeground, flexShrink: 1 },
  chipValue: { ...type.headline, color: c.foreground, fontVariant: ['tabular-nums'] },
  panel: {
    backgroundColor: m.inset.bg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: m.inset.border,
    paddingHorizontal: spacing.md,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  lineRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: m.inset.border },
  lineName: { ...type.body, color: c.foreground, flex: 1 },
  lineGrams: { ...type.body, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  lineValue: { ...type.body, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  moreText: { ...type.body, color: c.mutedForeground, flex: 1 },
  addBtn: {
    height: 44,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addText: { ...type.headline, color: c.foreground },
}));
