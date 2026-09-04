import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { nav } from '@/lib/nav';
import * as Haptics from 'expo-haptics';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale } from '@/components/ascnd/press-scale';
import { AmbientLight } from '@/components/ascnd/ambient-light';
import { ReadinessAura } from '@/components/ascnd/readiness-aura';
import { Icon } from '@/components/ascnd/icon';
import { StatusScrim } from '@/components/ascnd/status-scrim';
import { BottomTabInset } from '@/constants/expo-template-theme';
import { useI18n } from '@/hooks/use-app-settings';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeMaterialStyles, makeStyles, type PaletteKey, alpha } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';
import { press } from '@/constants/motion';
import { setActiveScroller } from '@/lib/scroll-to-top';
import { handleTabScroll } from '@/lib/tab-bar-visibility';

/**
 * ── do not reintroduce `maintainVisibleContentPosition` here ──
 *
 * It was added to all three scroll views in this file to stop pages drifting
 * while they loaded. It did not fix the drift, and it broke scrolling.
 *
 * The drift was never a content-above-the-viewport problem: Today swaps a
 * ~100pt widget placeholder for a 208pt ring gauge the moment the daily log
 * resolves, and that is what moved the page. It is fixed at the source by
 * holding the widgets back until `useDailyLog` settles (`dayPending` in
 * `(tabs)/index.tsx`), so nothing changes height under your thumb.
 *
 * What the prop *did* do is what the user reported as "cuộn không có điểm
 * dừng": on iOS it re-adjusts `contentOffset` on every layout pass, so a page
 * never settles at the end of its content — the scroll keeps being nudged and
 * there is no stop. Applying it blanket-wise to every page in the app made
 * that true everywhere.
 *
 * If a specific page ever genuinely needs anchoring (a chat-style list that
 * prepends), put it on that list, not on this scaffold.
 */

/**
 * ── do not put `automaticallyAdjustKeyboardInsets` back on these ──
 *
 * It was on all three scroll views, and it is what made pages scroll on past
 * the end of their content into empty space.
 *
 * On iOS it works by adding to the scroll view's bottom `contentInset` when
 * the keyboard appears, and it does not survive
 * `contentInsetAdjustmentBehavior="never"` — which every branch here sets,
 * because these pages lay out their own safe-area padding. The inset it adds
 * is not reliably taken back off, so each appearance of the keyboard leaves
 * more room below the content to scroll into.
 *
 * It was first narrowed to the six pages that have a text input, on the
 * assumption that the other nineteen were collateral. Nutrition was one of the
 * six and went on doing it, which is what settled the question: the prop is
 * the fault, not the number of pages carrying it.
 *
 * What is lost: nothing scrolls itself up when the keyboard covers it. Every
 * text field on these pages sits near the top — a search box under the tab
 * bar, the first field of a short form — so none of them are behind it. If a
 * form ever grows long enough for that to stop being true, wrap that form's
 * fields in a `KeyboardAvoidingView`; do not put this prop back on the
 * scaffold.
 */

/**
 * Height of the fixed header bar, matching UIKit's navigation bar.
 *
 * Only the bar's own height now — while the bar overlaid the content this also
 * had to be the content's top padding, and the two had to agree. It stays a
 * constant because a magic 44 in a stylesheet is a number nobody can look up.
 */
const HEADER_H = 44;

interface ScreenProps extends ViewProps {
  title: string;
  /** Optional line above the large title (date, context) */
  eyebrow?: string;
  /** Accessory rendered on the right of the header */
  headerRight?: React.ReactNode;
  /**
   * Sub-page mode — mirrors the web PageHeader: fixed 44pt bar with a
   * back chevron on the left and the 17px semibold title centered.
   * Tabs keep the large-title layout (web LargeTitle).
   */
  back?: boolean;
  /**
   * Floating header — the 44pt bar (back chevron + title + accessory) is
   * transparent and overlays the content, which starts at the very top so a
   * full-bleed hero can render behind it. Title/chevron get a shadow for
   * legibility. Requires `back`.
   */
  transparentHeader?: boolean;
  /**
   * Cặp màu nền của trang, lấy từ `PAGE_TINT`.
   *
   * Dashboard đổi nền theo thẻ bạn đang vuốt tới; một trang thì đứng yên ở một
   * mặt, nên nó nhận thẳng cặp màu của mặt đó. Trang dinh dưỡng mang đúng màu
   * thẻ dinh dưỡng, trang tập luyện mang màu thẻ vận động — mở một thẻ ra xem
   * thì màu đi theo, và người dùng biết mình vẫn ở trong cùng một thứ.
   *
   * Cả BA nhánh return của component này đều phải vẽ nó. Thiếu một nhánh thì
   * trang nào đi qua nhánh đó sẽ mất nền mà không có lỗi nào báo.
   *
   * Không truyền thì trang không có nền màu, đúng như trước.
   */
  /* Cặp KHOÁ bảng màu, không phải cặp mã màu: `PAGE_TINT` ở phạm vi module và
     một mã màu ở đó bị đóng băng ở bản tối. `Screen` giải ra ngay dưới đây —
     một chỗ giải cho cả sáu trang truyền nó vào. */
  aura?: readonly [PaletteKey, PaletteKey];
  /** report the header height (insets.top + 44) so content can offset under it */
  onHeaderHeight?: (h: number) => void;
  /**
   * Shrink the scroll area when the keyboard is up, for pages with text fields
   * below the fold.
   *
   * ── why this exists, and why it is not the banned prop ──
   *
   * The note above says every field on these pages sits near the top, so none
   * of them are behind the keyboard, and that if a form ever grows past that
   * it should be wrapped in a `KeyboardAvoidingView` rather than having
   * `automaticallyAdjustKeyboardInsets` put back on the scaffold. The week's
   * day panel is that form: it grew a weight box and a rep box on every set,
   * which on a twelve-set day is two dozen fields running the length of a
   * scrolling list.
   *
   * This is the wrap that note asks for, made available to the scaffold's own
   * scroll view because a tab page does not own one to wrap. It is off by
   * default, so the other pages behave exactly as before, and it is a
   * `KeyboardAvoidingView` rather than the inset prop — the inset prop's
   * failure was that it did not survive `contentInsetAdjustmentBehavior="never"`
   * and leaked a growing bottom inset. This shrinks a height and puts it back.
   *
   * `log-workout.tsx` has used the same wrap around its own scroll view since
   * it was written, which is the only reason this is a known quantity rather
   * than a guess.
   */
  keyboardAware?: boolean;
  /**
   * Set false to lock the page while something on it is being dragged.
   *
   * It used to be honoured only by the floating-header layout, which made it a
   * prop that silently did nothing on every other page. The weight chart's
   * scrubber is why that mattered: on iOS a ScrollView pans with a *native*
   * gesture recogniser, so a child refusing to give up the JS responder does
   * not stop it. Nothing in the responder system can. The page has to be told.
   */
  contentScrollEnabled?: boolean;
  /**
   * Kéo xuống để tải lại.
   *
   * ── vì sao nó ở ĐÂY chứ không ở từng màn ──
   *
   * Trước bản này, đúng MỘT màn trong cả app có kéo-để-tải-lại: Today. Ba mươi
   * màn còn lại đọc dữ liệu server và không màn nào phản ứng với cú kéo.
   *
   * Không màn nào NÓI DỐI — không có vòng xoay giả nào quay rồi không làm gì —
   * nhưng "không có gì xảy ra" và "đã tải lại xong, không có gì mới" trông y
   * hệt nhau, nên người dùng không có cách nào biết cử chỉ ấy có tồn tại hay
   * không. Họ kéo, không thấy gì, và kết luận app treo. Đó chính là điều đã xảy
   * ra khi màn Today hỏng bố cục: cú kéo có chạy thật, dữ liệu có về thật, và
   * nó không sửa được gì vì thứ hỏng là BỐ CỤC chứ không phải dữ liệu.
   *
   * Đặt ở scaffold thì một màn bật nó bằng một từ, và `tools/refreshable.mjs`
   * bắt được màn nào đọc dữ liệu server mà quên bật.
   */
  refreshable?: boolean;
  /**
   * Forwarded to the page's ScrollView, along with `scrollEventThrottle`.
   *
   * `ViewProps` does not carry these, and they already reach the ScrollView
   * through `...props` — this only makes them typed. `mascot-room` uses them
   * to stop the studio's clocks once the stage has scrolled out of sight; a
   * page that does not pass them is unaffected.
   */
  onScroll?: ScrollViewProps['onScroll'];
  onScrollBeginDrag?: ScrollViewProps['onScrollBeginDrag'];
  scrollEventThrottle?: number;
}

/**
 * Page scaffold matching the web app's two header patterns.
 */
/**
 * The scroll area, optionally shrunk by the keyboard.
 *
 * A plain `View` when the page did not ask, rather than a KeyboardAvoidingView
 * with `behavior: undefined` — an untouched page should not gain a component
 * in its tree at all, so nothing about its layout can change by accident.
 *
 * Android is left alone on purpose, the same way `log-workout.tsx` leaves it:
 * `windowSoftInputMode` already resizes the window there, and padding on top of
 * that is padding twice.
 */
function ScrollFrame({ on, children }: { on: boolean; children: React.ReactNode }) {
  const styles = stylesFor(usePalette());
  if (!on) return <>{children}</>;
  return (
    <KeyboardAvoidingView
      style={styles.scroller}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * Nền màu của trang, ĐÃ được dập xuống.
 *
 * ── vì sao có lớp phủ ──
 *
 * Thẻ ở app này là kính: `glass.bg` là trắng 6%, tức 94% những gì nằm sau nó đi
 * xuyên qua. Đặt lên một nền đen thì đó là một tấm kính hơi sáng; đặt lên một
 * dải tím-cam thì chính tấm kính đó NHUỐM tím-cam, và mọi thẻ trên trang cùng
 * ngả một tông. Màu riêng của từng thẻ — cam của protein, lơ của carb, đỏ của
 * nhóm cơ — không còn đọc ra được, vì chúng đang cạnh tranh với một lớp màu phủ
 * đều lên tất cả.
 *
 * Lớp phủ nằm giữa nền màu và nội dung, nên nó dập WASH chứ không dập thẻ. Thẻ
 * vẫn lấy mẫu thứ sau lưng nó, chỉ là thứ đó giờ tối và trung tính hơn.
 *
 * ── vì sao con số này ──
 *
 * Đủ để màu của trang còn nhận ra được nhưng không còn đủ sức nhuộm một tấm
 * kính 6%. Đo lại góc trên sau khi thêm: sắc màu vẫn phân biệt được giữa ba
 * trang, chỉ nhạt đi — nếu nó dập tới mức ba trang đọc ra giống nhau thì lớp
 * phủ đã ăn mất chính thứ nó được đặt ở đây để bảo vệ.
 *
 * Viết một chỗ vì cả BA nhánh return của `Screen` đều dùng: hai câu rời nhau sẽ
 * lệch ngay lần đầu ai đó chỉnh một bên.
 */
/*
  Nhẹ đi một bậc: 0.55 → 0.44.

  Đã được yêu cầu trực tiếp sau khi nhìn máy thật — Nutrition, Workouts và
  Progress đọc ra tối hơn mức cần. Today không dùng `Screen` nên không đụng tới,
  đúng như đã dặn.

  Vẫn nằm trong lằn ranh mà đoạn trên đặt ra: đủ để dập cái wash khỏi nhuộm một
  tấm kính 6%, chưa tới mức ba trang mất luôn màu riêng. Nếu còn hạ nữa thì thứ
  bắt đầu hỏng là màu của thẻ, không phải độ sáng của trang.
*/
const AURA_DIM = 0.44;

function PageAura({ tint }: { tint: readonly [PaletteKey, PaletteKey] }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <>
      <ReadinessAura status={null} tint={c[tint[0]]} tint2={c[tint[1]]} />
      <View pointerEvents="none" style={styles.auraDim} />
    </>
  );
}

export function Screen({ title, eyebrow, headerRight, back, transparentHeader, aura, onHeaderHeight, contentScrollEnabled = true, keyboardAware = false, refreshable = false, children, style, ...props }: ScreenProps) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const headerStyles = headerStylesFor(m);
  const insets = useSafeAreaInsets();

  /**
   * Một cú kéo, và nó tải lại THẬT.
   *
   * `invalidateQueries()` không tham số: đánh dấu mọi truy vấn là cũ và fetch
   * lại những cái đang được dùng. Đó đúng là việc người ta muốn — họ không kéo
   * để làm mới một bảng, họ kéo vì màn hình có vẻ cũ.
   *
   * `finally` chứ không phải hai dòng gán: nếu lời hứa kia hỏng, vòng xoay sẽ
   * quay mãi mãi trên một màn không còn tải gì. Một vòng xoay không bao giờ
   * dừng là một lời nói dối lâu hơn cả một cú kéo không làm gì.
   *
   * Rung ngay khi cú kéo ĂN, không đợi dữ liệu về: cử chỉ này không có nút nào
   * để nhấn, nên phản hồi duy nhất xác nhận nó đã được nhận là cái rung ấy.
   */
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);
  /**
   * Vòng xoay vẽ ở đâu.
   *
   * iOS vẽ nó ở đỉnh KHUNG của scroll view. Ở hai bố cục chạy sát mép trên màn
   * hình, khung ấy bắt đầu dưới Dynamic Island, nên vòng xoay hiện ra sau đồng
   * hồ và dưới lớp mờ của status scrim: cú kéo có tải lại, chỉ là không nhìn
   * thấy gì — không phân biệt được với một trang không có cử chỉ này.
   *
   * `(tabs)/index.tsx` đã dính đúng lỗi đó và ghi lại nguyên nhân. Con số ở đây
   * lấy từ CÙNG một chỗ với phần đệm trên của nội dung, chứ không phải một số
   * thứ hai chọn cho vừa mắt.
   */
  const refresher = (offset: number) =>
    refreshable ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={c.mutedForeground}
        progressViewOffset={offset}
      />
    ) : undefined;
  const i18n = useI18n();

  /**
   * Lend this page's scroll view to the tab bar, so tapping the tab you are
   * already on returns to the top. Claimed on focus and released on blur, so
   * the slot always points at the page in front of you — see `scroll-to-top`.
   *
   * Every branch below gets the ref, not just the tab layout: a pushed page is
   * not reachable from the tab bar today, but a scaffold that only sometimes
   * supports its own affordance is the kind of thing that surprises the next
   * person to use it.
   */
  const scroller = useRef<ScrollView>(null);

  /*
   * ── an entrance cannot be replayed on a page that is already on screen ──
   *
   * Reanimated's `entering` runs on mount, and a `UITabBarController` mounts
   * each tab once and keeps it, so `rise(i)` on the cards plays on the first
   * visit of a session and never again. Two attempts to bring it back are
   * recorded here because both failed the same way, and the reason is not a
   * setting anyone can tune:
   *
   *   - a fade on focus, 0 to 1 — one frame of an empty page before it starts,
   *     on every tab change
   *   - a `key` on a `Fragment` around the content, remounting it so the
   *     `entering` animations re-run — the same empty frame, then the cascade
   *
   * Both blink because `FadeInDown` begins at invisible. That is right when a
   * screen is arriving from nothing, which is what the old JS navigator did —
   * it mounted the tab on entry, so the page genuinely was not there yet. It
   * is wrong on a page that is already drawn: replaying an entrance there has
   * to un-draw it first.
   *
   * So the cards animate once, on the visit that mounts them, and tab changes
   * are instant. Which is also what iOS does.
   *
   * Today looks like an exception and is not doing anything different — its
   * widgets sit behind `dayPending`, so a refetch takes them out of the tree
   * and puts them back, and the cascade comes along for the ride.
   *
   * If tab changes should have motion, it has to be an animation that starts
   * from the page as it is — a small settle, not an entrance — which is a
   * different effect, not this one replayed.
   */
  useFocusEffect(
    useCallback(() => {
      setActiveScroller(() => scroller.current?.scrollTo({ y: 0, animated: true }));
      return () => setActiveScroller(null);
    }, []),
  );

  if (back) {
    const headerBar = (
      <View style={styles.pageHeaderRow}>
        <PressScale to={press.deep}
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yBack}
          hitSlop={8}
          style={styles.backBtn}
          onPress={() => {
            Haptics.selectionAsync();
            nav.back();
          }}>
          <Icon icon={ChevronLeft} size={22} color={transparentHeader ? '#fff' : c.primary} />
        </PressScale>
        <Text style={[styles.pageTitle, transparentHeader && styles.pageTitleFloat]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.pageHeaderRight}>{headerRight}</View>
      </View>
    );

    if (transparentHeader) {
      // Header floats over a full-bleed hero; content starts at the very top.
      return (
        <View style={styles.root}>
          <AmbientLight />
          {aura ? <PageAura tint={aura} /> : null}
          <ScrollFrame on={keyboardAware}>
            <ScrollView
              ref={scroller}
              style={styles.scroller}
              contentContainerStyle={[styles.subContentFlush, { paddingBottom: insets.bottom + spacing.xl }, style]}
              refreshControl={refresher(insets.top + 12)}
              contentInsetAdjustmentBehavior="never"
              scrollEnabled={contentScrollEnabled}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              {...props}>
              {children}
            </ScrollView>
          </ScrollFrame>
          {/*
            The hero runs under the clock here by design, so this is the one
            sub-page layout that needs the strip. It sits under the floating
            header (zIndex 10 against 20), so the chevron and title stay crisp
            on top of it.
          */}
          <StatusScrim />
          <View
            style={[styles.pageHeaderFloat, { paddingTop: insets.top }]}
            pointerEvents="box-none"
            onLayout={(ev) => onHeaderHeight?.(ev.nativeEvent.layout.height)}>
            {headerBar}
          </View>
        </View>
      );
    }

    /*
     * Sub-page header — a solid bar above the scroll view, in layout flow.
     *
     * It briefly overlaid the content instead, with a blur behind it so text
     * softened as it slid underneath. The blur is gone, and an overlaying bar
     * with nothing behind it is just a title with content running through it,
     * so the bar owns its 44pt again and the page starts below it.
     */
    return (
      <View style={styles.root}>
        <AmbientLight />
        {aura ? <PageAura tint={aura} /> : null}
        {/* Web PageHeader: glass bar, 44pt, back chevron + centered title */}
        <View style={[styles.pageHeader, headerStyles.surface, { paddingTop: insets.top }]}>{headerBar}</View>
        <ScrollFrame on={keyboardAware}>
          <ScrollView
            ref={scroller}
            style={styles.scroller}
            contentContainerStyle={[styles.subContent, { paddingBottom: insets.bottom + spacing.xl }, style]}
            refreshControl={refresher(12)}
            contentInsetAdjustmentBehavior="never"
            scrollEnabled={contentScrollEnabled}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            {...props}>
            {children}
          </ScrollView>
        </ScrollFrame>
      </View>
    );
  }

  /*
   * A tab page scrolls all the way up to the status bar, so it is the layout
   * `StatusScrim` exists for. The scroll view used to be this branch's root; it
   * sits in a wrapper so the light and the strip have somewhere to hang that is
   * not inside the scroll — anything inside would scroll away with the content.
   *
   * The strip is the wrapper's *last* child on purpose. Order is what stacks
   * siblings in React Native, and `zIndex` only reorders within the same
   * parent, so a strip written above the ScrollView would be painted under it
   * and cover nothing at all.
   */
  return (
    <View style={styles.root}>
      <AmbientLight />
      {aura ? <PageAura tint={aura} /> : null}
      <ScrollFrame on={keyboardAware}>
        <ScrollView
          ref={scroller}
          style={styles.scroller}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + spacing.sm, paddingBottom: BottomTabInset + insets.bottom + spacing.lg },
            style,
          ]}
          refreshControl={refresher(insets.top + 12)}
          contentInsetAdjustmentBehavior="never"
          scrollEnabled={contentScrollEnabled}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScroll={(e) => handleTabScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          {...props}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
              <Text style={styles.title}>{title}</Text>
            </View>
            {headerRight}
          </View>
          {children}
        </ScrollView>
      </ScrollFrame>
      <StatusScrim />
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  /* Làm dịu bằng màu của CHÍNH THEME, không phải luôn luôn đen — xem `Aura.scrim`. */
  auraDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: alpha(m.aura.scrim, AURA_DIM) },
  root: { flex: 1, backgroundColor: c.background },
  /**
   * Transparent, not `colors.background`.
   *
   * The wrapper behind it already paints the page colour, so this would only
   * be painting it a second time — and painting over anything the scaffold
   * ever puts between the two. Nothing looks different; there is one fewer
   * opaque layer in the way.
   */
  scroller: { flex: 1, backgroundColor: 'transparent' },

  // Sub-page header — bề mặt của nó nằm ở `headerStylesFor` bên dưới
  pageHeader: {},
  pageHeaderRow: {
    height: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pageTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: c.foreground,
    textAlign: 'center',
  },
  /*
    ── QUYẾT ĐỊNH THIẾT KẾ CÒN MỞ, không phải một phép đổi token ──

    Bóng đen sau chữ là đúng khi chữ SÁNG nằm trên một tấm ảnh. Ở bản sáng thì
    không: `pageTitleFloat` không đặt lại màu, nên nó thừa `color: c.foreground`
    = #1a1917 — chữ gần đen, và một bóng đen sau chữ gần đen không làm gì cả.
    Cùng lúc đó mũi quay lại ngay cạnh nó bị ghim cứng `'#fff'` (dòng 389), nên
    ở bản sáng hai thứ trong cùng một hàng đầu trang đang nói hai chuyện khác
    nhau.

    Hai màn dùng nó: `mascot-room` và `shop`. Cả hai chưa từng được chụp ở bản
    sáng, và câu hỏi "đầu trang trong suốt trên nền sáng thì chữ màu gì" là một
    quyết định thiết kế chưa ai ra, chứ không phải một mã màu chép nhầm. Ghi
    lại ở đây thay vì đoán.
  */
  pageTitleFloat: {
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  pageHeaderFloat: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'transparent',
  },
  subContentFlush: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.stack,
    gap: spacing.stack,
  },
  pageHeaderRight: {
    minWidth: 44,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingRight: spacing.sm,
  },
  subContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.stack,
    gap: spacing.stack,
  },

  // Tab-page large title (web LargeTitle)
  content: {
    paddingHorizontal: spacing.md,
    gap: spacing.stack,
  },
  header: {
    marginBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerText: { flex: 1, gap: 2 },
  eyebrow: { ...type.footnote, color: c.mutedForeground, textTransform: 'capitalize' },
  title: { ...type.largeTitle, color: c.foreground },
}));

/*
  Bề mặt của đầu trang phụ, đọc CHẤT LIỆU chứ không đọc bảng màu.

  Ở bản tối nó là kính: trắng 6% với một viền tơ trắng 12%, để nội dung cuộn
  bên dưới lộ mờ qua. Ở bản giấy nó là chính mặt thẻ — trắng đục — vì một lớp
  phủ trắng 6% trên giấy trắng không tách được đầu trang khỏi nội dung, và
  đường phân cách phải do viền làm.
*/
const headerStylesFor = makeMaterialStyles((m) => ({
  surface: {
    backgroundColor: m.bg,
    borderBottomWidth: m.borderWidth,
    borderBottomColor: m.border,
  },
}));
