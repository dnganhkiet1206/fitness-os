import * as Haptics from 'expo-haptics';
import { nav } from '@/lib/nav';
import { Plus, Star } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { MACRO_TINT, glass, radius, spacing } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useI18n } from '@/hooks/use-app-settings';
import {
  useCreateFoodItem,
  useToggleFavoriteFood,
  type FoodItemRow,
  type RecentFood,
} from '@/hooks/use-nutrition';

/**
 * A saved food, as a row in a group.
 *
 * ── it was a card, and there were twelve of them ──
 *
 * Every food carried its own border and its own fill. Three sections of four
 * meant twelve bordered rectangles down one screen, each one drawing an edge
 * around a line of text — and the eye spends its effort on edges before it
 * spends any on words. Rows in one inset group say the same thing with one
 * border for the whole set, which is how the plan screens, the plan list and
 * every table view on the platform do it.
 *
 * The group and its hairlines belong to whoever lays these out; a row draws
 * neither. It only knows its own padding.
 *
 * ── one trailing control, not two ──
 *
 * It had a star *and* a trash on every row: twenty-four icon buttons on a
 * screen whose job is to let you look at food, half of them destructive and
 * sitting under the thumb of somebody scrolling.
 *
 * The star stays — it is a toggle, it is cheap, and its state is information.
 * Delete goes to the food editor, which the row already opens on a tap and
 * which has had a delete of its own all along. Nothing is lost except the
 * chance to remove a food you meant to scroll past.
 */
/**
 * P · C · F trên một hàng món, mỗi chữ cái mang màu của chính chất đó.
 *
 * ── vì sao đổi ──
 *
 * Bản cũ là một chuỗi xám duy nhất: `P10 · C50 · F60`. Ba con số quan trọng
 * khác nhau nằm cùng một màu, cùng một cỡ, không dấu hiệu nào tách chúng — nên
 * đọc một hàng món là đọc từ trái sang phải, từng ký tự. Bản tham chiếu người
 * dùng gửi tô ba chữ cái ba màu, và đó không phải trang trí: nó biến ba con số
 * thành ba CỘT mà mắt nhảy thẳng tới.
 *
 * Màu lấy từ `MACRO_TINT`, đúng bảng mà bốn ô macro ở đầu trang này và mọi
 * thanh tiến độ chất đang dùng. Bịa ba mã màu ở đây là dựng bản thứ hai của một
 * bảng đã có — và bản thứ hai luôn trôi khỏi bản đầu, thứ `MACRO_BAR` đã phải
 * ghi lại nguyên một đoạn để tránh.
 *
 * ── và đơn vị được trả lại ──
 *
 * `P10` không nói 10 cái gì. Bản tham chiếu ghi `P 10g`, và một gam là thứ duy
 * nhất ba con số này có thể là — nên chữ `g` không thêm thông tin cho người đã
 * biết, nhưng nó xoá một khoảnh khắc ngờ cho người chưa.
 *
 * Con số vẫn mono và `tabular-nums`: ba số ở ba hàng chỉ thẳng cột khi chữ số
 * cùng bề rộng, và đó là toàn bộ lý do tiêu một mặt chữ mono ở đây.
 */
/*
  Ba tham số từng tên là `p`, `c`, `f`.

  `c` ở đây là CARBS. Từ khi bảng màu đọc lúc chạy, `c` cũng là tên của bảng
  màu trong mọi component của repo — nên `Macros` là một trong hai chỗ mà hai
  nghĩa ấy đụng nhau, và `tools/theme-migrate.mjs` phải từ chối chạm vào nó.

  Đổi tên ở đây chứ không đổi tên bảng màu: bảng màu xuất hiện trong 115 tệp,
  ba tham số này trong ba chỗ gọi. Và `p`/`c`/`f` viết đủ chữ thì hàng dưới đọc
  ra là protein/carbs/fat mà không cần đối chiếu với chữ cái đứng cạnh nó.
*/
function Macros({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <Text style={styles.macros} numberOfLines={1}>
      <Text style={{ color: MACRO_TINT.protein }}>P</Text> {Math.round(protein)}g
      <Text style={styles.dot}> · </Text>
      <Text style={{ color: MACRO_TINT.carbs }}>C</Text> {Math.round(carbs)}g
      <Text style={styles.dot}> · </Text>
      <Text style={{ color: MACRO_TINT.fat }}>F</Text> {Math.round(fat)}g
    </Text>
  );
}

export function FoodCard({ f }: { f: FoodItemRow }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const toggleFav = useToggleFavoriteFood();

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`${f.name}, ${Math.round(Number(f.kcal))} kcal`}
      style={styles.row}
      onPress={() => {
        Haptics.selectionAsync();
        nav.push({ pathname: '/food-editor', params: { id: f.id } });
      }}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {f.name}
          {f.brand ? <Text style={styles.brand}>  {f.brand}</Text> : null}
        </Text>
        <Macros protein={Number(f.protein_g)} carbs={Number(f.carbs_g)} fat={Number(f.fat_g)} />
      </View>

      {/* Right-aligned, like the value in any table row — it is the number you
          scan a list of food for, and it was buried mid-sentence between the
          macros. */}
      <Text style={styles.kcal}>{Math.round(Number(f.kcal))} kcal</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.a11yFavourite}
        accessibilityState={{ selected: !!f.is_favorite }}
        hitSlop={12}
        onPress={() => {
          Haptics.selectionAsync();
          toggleFav.mutate({ id: f.id, is_favorite: !f.is_favorite });
        }}>
        <Icon
          icon={Star}
          size={17}
          color={f.is_favorite ? c.readinessYellow : c.mutedForeground}
          strokeWidth={f.is_favorite ? 2.5 : 2}
        />
      </Pressable>
    </PressScale>
  );
}

/** A recently-logged food as a card; + saves it into My Foods (hidden if already saved). */
export function RecentFoodCard({ r, saved }: { r: RecentFood; saved: boolean }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const createFood = useCreateFoodItem();

  const quickAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createFood.mutate({
      name: r.food_name,
      brand: '',
      serving_g: r.serving_g || 100,
      kcal: r.kcal,
      protein_g: r.protein_g,
      carbs_g: r.carbs_g,
      fat_g: r.fat_g,
      fiber_g: r.fiber_g,
    });
  };

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{r.food_name}</Text>
        <Macros protein={Number(r.protein_g)} carbs={Number(r.carbs_g)} fat={Number(r.fat_g)} />
      </View>
      <Text style={styles.kcal}>{r.kcal} kcal</Text>
      {/* A fixed slot whether or not there is a button in it, so the kcal
          column does not jog left on the rows that are already saved. */}
      <View style={styles.slot}>
        {!saved ? (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yAdd}
            hitSlop={13}
            disabled={createFood.isPending}
            onPress={quickAdd}>
            <Icon icon={Plus} size={18} color={c.primary} strokeWidth={2.5} />
          </PressScale>
        ) : null}
      </View>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  /* No border and no fill: the group these sit in draws one border for all of
     them. A row that carries its own is a card, and twelve cards is what this
     screen looked like. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  info: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '500', color: c.foreground },
  brand: { fontSize: 12, fontWeight: '400', color: c.mutedForeground },
  /* Monospace, because three numbers in a column only line up if the digits
     are the same width — that is the whole reason to spend a mono face here. */
  /*
    12, không phải 11.

    Đặt cạnh bản tham chiếu ở CÙNG bề rộng thẻ, dòng macro bên ta nhỏ hơn thấy
    rõ: tên món 15 điểm rồi tụt thẳng xuống 11: một bậc rưỡi trong khi bản kia
    chỉ tụt một. Nó là dòng thông tin thứ hai của hàng, không phải chú thích.

    Vẫn vừa hàng: hàng cao tối thiểu 52 với 10 điểm đệm mỗi đầu, nên phần chữ
    được 32 điểm; 15 + 2 + 12 = 29.
  */
  macros: { fontSize: 12, fontFamily: 'Menlo', color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  /* Chữ cái mang màu chất, con số ở lại xám — xem `Macros`. */
  /* Dấu chấm ngăn ba chất mờ hơn cả con số: nó là dấu ngắt chứ không phải
     nội dung, và ở cùng độ sáng nó cạnh tranh với chính thứ nó ngăn ra. */
  dot: { color: c.border },
  kcal: { fontSize: 13, fontWeight: '500', color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  slot: { width: 18, alignItems: 'flex-end' },
}));

/**
 * The group these rows live in, and the hairline between two of them.
 *
 * Exported so every screen that lists foods draws the same object rather than
 * its own approximation of one. The separator is a element, never a border on
 * the row: a `marginLeft` to inset a border moves the whole row, and the
 * trailing column stops lining up.
 *
 * ── vì sao nó là một HOOK chứ không còn là một hằng ──
 *
 * `StyleSheet.create` ở phạm vi module đóng băng màu lúc import, nên bản cũ vẽ
 * đúng một `c.border` cho cả hai theme. Nó được xuất ra và dùng ở 11 chỗ trong
 * 3 tệp, tức nó là một trong những chỗ mà một giá trị đóng băng lan xa nhất.
 *
 * Hook thay vì `foodListStylesFor(c)` để nơi gọi không phải tự đi lấy bảng màu
 * rồi có cơ hội lấy nhầm — chữ ký cũ là `foodListStyles.group`, chữ ký mới là
 * `useFoodListStyles().group`, và không có đường nào ở giữa để đi sai.
 */
const foodListStylesFor = makeStyles((c) => ({
  group: {
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    overflow: 'hidden',
  },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md, backgroundColor: c.border },
}));

export function useFoodListStyles() {
  return foodListStylesFor(usePalette());
}
