import { ArrowRight } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BodyScaleFigure } from '@/components/ascnd/body-scale-figure';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { SheetHeader } from '@/components/ascnd/sheet-header';
import { Ruler, RULER_H, TICK_W } from '@/components/ascnd/weight-goal-ruler';
import { radius, spacing, type } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { useTodayWeight } from '@/hooks/use-fitness-data';
import { usePalette } from '@/hooks/use-palette';
import { useProfile } from '@/hooks/useTodayData';
import { useUnits } from '@/hooks/use-units';
import { useWeightWrite } from '@/hooks/use-weight-write';
import { nav } from '@/lib/nav';
import { BOUNDS } from '@/lib/plausible';
import { displayWeight, weightLabel, weightToKg } from '@/lib/units';

/**
 * Ghi cân nặng — chiếc cân LÀ màn hình.
 *
 * ── nó thay cái gì ──
 *
 * Trước đây dòng "Cân nặng" của thẻ Cần làm bung ra một ô gõ số ngay tại chỗ.
 * Nó ghi đúng, nhưng nó là một cái ô trong một hàng danh sách: không có chỗ cho
 * bối cảnh, và cân nặng là chỉ số đi xa nhất trong app — dải BMI, thang biểu
 * đồ, và phép khớp bình phương tối thiểu của `adaptiveTDEE` đặt ra mục tiêu
 * calo.
 *
 * ── HAI thứ màn này KHÔNG tự viết, và đó là phần quan trọng nhất ──
 *
 * `useWeightWrite()` giữ đường GHI, tách nguyên vẹn khỏi ô cũ. `Ruler` của
 * `weight-goal-ruler.tsx` giữ cái THƯỚC, vốn đã có sẵn cho màn mục tiêu cân
 * nặng.
 *
 * Tôi đã viết một cái thước THỨ HAI trước khi đi tìm, và chính cổng bắt được:
 * bước `thước cân nặng` là một luật viết riêng cho cái thước ĐANG CÓ. Bản ấy
 * biết những thứ bản của tôi không biết — vạch dài rơi đúng số nguyên ở CẢ
 * pound (bản cũ đánh theo `index % 10` nên sai mọi vạch lb), số học chạy bằng
 * PHẦN MƯỜI nguyên vì `30 / 0.1` đã là 299,999…, một `<Pattern>` thay cho 2.701
 * phần tử danh sách, và hai đầu thước có nắp che. Một bản thứ hai của đoạn ấy
 * là một bản sẽ trôi.
 *
 * ── dải của THƯỚC và dải của phép KIỂM là hai thứ ──
 *
 * Thước chạy hết `BOUNDS.weight_kg`, nên không cắt mất ai. Phép kiểm hợp lý vẫn
 * chạy độc lập trong `useWeightWrite`, trên giá trị kg sẽ được lưu — thước
 * không được là thứ duy nhất canh giới hạn, vì nó là giao diện chứ không phải
 * luật.
 *
 * ── giá trị mở đầu ──
 *
 * Cân hôm nay nếu đã ghi, rồi cân nặng trong hồ sơ, rồi mới tới một con số đặt
 * tạm. Mở ra mà kim nằm sai 20 kg thì người ta phải kéo một quãng dài trước khi
 * làm được việc của mình.
 */

/**
 * Khẩu hiệu thương hiệu — một hằng, KHÔNG phải một khoá i18n.
 *
 * Nó không được dịch, và đó là chủ ý: tên và khẩu hiệu của một thương hiệu giữ
 * nguyên ở mọi ngôn ngữ. Đặt nó vào bảng dịch thì bản tiếng Việt mang một câu
 * tiếng Anh, và `tools/i18n-*.mjs` bắt đúng điều đó — luật ấy đúng, nên chữ này
 * ra khỏi bảng chứ không phải luật bị nới.
 */
const BRAND_TAGLINE = 'Better you\nHigher everyday';

/** Chỗ đứng khi tài khoản chưa có cân nặng nào. Không phải một phép đoán về người dùng. */
const DEFAULT_KG = 70;
/** Bề rộng chiếc cân so với bề ngang màn — chừa lề, và không phình trên màn lớn. */
const SCALE_FRACTION = 0.68;
const SCALE_MAX = 300;

export default function LogWeightSheet() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { weight: wUnit } = useUnits();
  const { data: todayWeight } = useTodayWeight();
  const { data: profile } = useProfile();
  const { submit, boundError, pending } = useWeightWrite();
  const list = useRef<Animated.ScrollView>(null);

  const unit = weightLabel(wUnit);

  /*
    Số học chạy bằng PHẦN MƯỜI nguyên, đúng như `weight-goal-dialog` và vì đúng
    lý do ấy: có hàng nghìn nấc giữa hai đầu dải, và dấu phẩy động không sống
    nổi qua ngần ấy phép cộng 0,1. Phép chia ngược về số thật xảy ra một lần, ở
    cuối.
  */
  const min10 = Math.ceil(displayWeight(BOUNDS.weight_kg.min, wUnit) * 10);
  const max10 = Math.floor(displayWeight(BOUNDS.weight_kg.max, wUnit) * 10);
  const count = max10 - min10 + 1;

  const profileKg = profile?.weight_kg != null ? Number(profile.weight_kg) : null;
  const seedKg = todayWeight ?? profileKg ?? DEFAULT_KG;
  const seedIndex = useMemo(
    () => Math.max(0, Math.min(count - 1, Math.round(displayWeight(seedKg, wUnit) * 10) - min10)),
    [seedKg, wUnit, min10, count],
  );

  const [index, setIndex] = useState(seedIndex);
  /*
    Thước đã được đặt đúng chỗ cho lần mở này chưa.

    Một ref chứ không phải state: nó chặn lượt báo của thước, và lật nó không
    được tự gây render giữa một cú kéo. Cùng hình dạng với `weight-goal-dialog`,
    và vì cùng lý do đã ghi ở đó.
  */
  const placed = useRef(false);

  /* Dữ liệu về muộn hơn lần render đầu, nên kim phải đi theo — nhưng chỉ tới
     khi người dùng đã chạm vào thước. */
  useEffect(() => {
    if (!placed.current) setIndex(seedIndex);
  }, [seedIndex]);

  const onContentSizeChange = useCallback(() => {
    if (placed.current) return;
    list.current?.scrollTo({ x: seedIndex * TICK_W, animated: false });
    placed.current = true;
  }, [seedIndex]);

  /* Bố cục đang ổn định KHÔNG phải người dùng đang chọn một con số. */
  const onIndex = useCallback((next: number) => {
    if (!placed.current) return;
    setIndex(next);
  }, []);

  const value = (min10 + index) / 10;

  /*
    Hai nhãn đọc hai đầu của CỬA SỔ NHÌN THẤY, không phải hai đầu của cả dải.

    Ảnh mẫu ghi "40 kg" và "100 kg" quanh một giá trị 54,7 — tức nó nói về chỗ
    đang nhìn. Đặt `BOUNDS` lên đó (20 và 400) thì hai nhãn nói về một thứ mắt
    không thấy, và chúng thôi liên quan tới cái kim.

    Bề rộng cửa sổ suy từ chính thước: `TICK_W` điểm một vạch, mười vạch một
    đơn vị. Nó không phải một con số tôi chọn — đổi `TICK_W` thì hai nhãn này
    đi theo.
  */
  const visibleUnits = screenW / (TICK_W * 10);
  const lowEdge = Math.max(min10 / 10, value - visibleUnits / 2);
  const highEdge = Math.min(max10 / 10, value + visibleUnits / 2);

  const kg = weightToKg(value, wUnit);
  const error = boundError(kg);
  const scaleW = Math.min(SCALE_MAX, screenW * SCALE_FRACTION);

  const save = () => submit(kg, () => nav.back());

  return (
    <View style={styles.page}>
      <SheetHeader
        title=""
        onClose={() => nav.back()}
        right={<Text style={styles.tagline}>{BRAND_TAGLINE}</Text>}
      />

      <View style={styles.body}>
        <Animated.View entering={FadeIn.duration(duration.appear)}>
          <Text style={styles.title}>{i18n.nWeighTitle}</Text>
          <Text style={styles.sub}>{i18n.nWeighSub}</Text>
        </Animated.View>

        {/* Chiếc cân vào sau tiêu đề một nhịp: thứ bậc đọc được thành thứ tự. */}
        <Animated.View entering={FadeInDown.duration(duration.move).delay(60)} style={styles.stage}>
          <BodyScaleFigure value={value.toFixed(1)} unit={unit} width={scaleW} />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(duration.move).delay(120)}
          style={styles.rulerWrap}>
          <View style={styles.edges}>
            <Text style={styles.edge}>{`${lowEdge.toFixed(1)} ${unit}`}</Text>
            <Text style={styles.edge}>{`${highEdge.toFixed(1)} ${unit}`}</Text>
          </View>
          <View style={styles.ruler}>
            <Ruler
              count={count}
              min10={min10}
              width={screenW}
              scrollRef={list}
              onIndex={onIndex}
              onContentSizeChange={onContentSizeChange}
            />
            {/* Vạch mà thước được đọc theo. */}
            <View style={styles.needle} pointerEvents="none" />
          </View>
          <Text style={styles.hint}>{i18n.nWeighHint}</Text>
        </Animated.View>
      </View>

      <View style={[styles.foot, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.nWeighSave}
          accessibilityState={{ disabled: pending || !!error }}
          style={[styles.save, (pending || !!error) && styles.saveOff]}
          disabled={pending || !!error}
          onPress={save}>
          {pending ? (
            <ActivityIndicator color={c.primaryForeground} size="small" />
          ) : (
            <>
              <Text style={styles.saveText}>{i18n.nWeighSave}</Text>
              <Icon icon={ArrowRight} size={18} color={c.primaryForeground} />
            </>
          )}
        </PressScale>
      </View>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  page: { flex: 1, backgroundColor: c.background },
  tagline: { ...type.caption, color: c.mutedForeground, textAlign: 'right' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: {
    ...type.largeTitle,
    color: c.foreground,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  sub: {
    ...type.footnote,
    color: c.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  /* Chiếc cân là trung tâm, nên nó lấy khoảng trắng lớn nhất trên trang. */
  stage: { marginTop: spacing.xl, marginBottom: spacing.lg, alignItems: 'center' },
  /* Thước chạy HẾT bề ngang màn — nó là một dụng cụ, và một dụng cụ bị thụt lề
     hai bên đọc ra là một cái thẻ. Nhãn hai đầu thì vẫn thụt. */
  rulerWrap: { width: '100%' },
  edges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  edge: { ...type.footnote, color: c.mutedForeground },
  ruler: { height: RULER_H, alignSelf: 'stretch', justifyContent: 'center' },
  needle: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 0,
    width: 3,
    height: 68,
    borderRadius: 1.5,
    backgroundColor: c.foreground,
  },
  hint: { ...type.footnote, color: c.mutedForeground, textAlign: 'center', marginTop: spacing.sm },
  foot: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  save: {
    height: 58,
    borderRadius: radius.full,
    backgroundColor: c.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  saveOff: { opacity: 0.4 },
  saveText: { ...type.headline, color: c.primaryForeground },
  error: { ...type.footnote, color: c.readinessRed, textAlign: 'center' },
}));
