import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { duration } from '@/constants/motion';
import { PickRow } from '@/components/ascnd/pick-row';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';

/**
 * One segmented control, and the selection travels between segments.
 *
 * ── what this replaced ──
 *
 * Five copies of the same control: nutrition, progress, the shop, the mascot
 * room, and a local `Segmented` inside `edit-profile`. All five did the same
 * thing the same way — map the options, swap a background colour on whichever
 * one matched — and none of them moved. Pressing a segment cut the highlight
 * from one box to another between frames, which is the difference between a
 * control that responds and one that merely changes.
 *
 * Five copies also meant five sets of paddings and radii drifting apart, and
 * five places to fix anything found here.
 *
 * ── why a travelling pill and not a fade ──
 *
 * A segmented control is a spatial statement: *this one, out of these*. When
 * the highlight moves, the movement is the answer to which one — it carries
 * the relationship between where you were and where you are, and a cross-fade
 * throws that away. Apple's own segmented controls slide for this reason.
 *
 * ── and why it is a transform ──
 *
 * The pill is one segment wide and moves by `translateX` alone. Nothing about
 * its geometry animates: no `left`, no `width`. `tools/motion.mjs` exists in
 * this repository because animating layout re-runs layout every frame, and it
 * caught exactly that mistake in the companion a few commits ago.
 *
 * ── it no longer owns the moving part ──
 *
 * It used to compute the pill itself: every segment is `flex: 1`, so segment
 * `i` sits at `i × (row / n)` and `translateX` did the whole job with nothing
 * to resize. That was true and it was still a second implementation, sitting
 * next to `pick-row.tsx`, which does the same thing for chips that are not all
 * one width. Two mechanisms for one behaviour is the bug this repository keeps
 * finding, and it had already been found twice in the two commits before this
 * one. So this is now a thin control on top of `PickRow`: it supplies the
 * track, the equal-width segments and the label styling, and the travelling
 * highlight is the app's only travelling highlight.
 */

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
  /** optional leading glyph — nutrition and progress use one, the shop does not */
  icon?: React.ComponentProps<typeof Icon>['icon'];
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  height = 44,
  compact = false,
  variant = 'pill',
}: {
  options: readonly SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** 44 by default — Apple's floor for a touch target */
  height?: number;
  /** the mascot room's row is a smaller control inside a card */
  compact?: boolean;
  /**
   * `pill` — nhỏ, chữ 11 điểm, thumb SÁNG hơn ray. Cho control nằm bên TRONG
   * một thẻ, nơi nó phải nhỏ hơn nội dung quanh nó.
   *
   * `capsule` — dạng của iOS trên nền tối, dùng cho điều hướng mục ở đầu màn:
   * ray là một viên nang rộng hết hàng, sáng hơn nền và có viền tóc; thumb thì
   * TỐI bằng nền, cũng có viền tóc. Chữ 17 điểm, cả hai nhãn sáng đầy đủ.
   *
   * Cùng một cơ chế trượt cho cả hai — chỉ khác kích thước và ai sáng hơn ai.
   */
  variant?: 'pill' | 'capsule';
}) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  /* Viên nang mỏng hơn: 2 điểm đệm thay vì 3, nên thumb gần sát mép ray như
     control của hệ thống. */
  const pad = variant === 'capsule' ? 2 : 3;
  const cap = variant === 'capsule';
  const r = cap || compact ? radius.full : radius.sm;

  return (
    <PickRow
      value={value}
      /*
        Thumb TỐI hơn ray, và đó là chỗ dễ làm ngược nhất.

        Trên nền sáng, segmented control của iOS có thumb sáng hơn ray — nó nổi
        lên. Trên nền TỐI thì đảo lại: ray sáng hơn nền, thumb tối bằng nền và
        đeo một viền tóc, nên nó đọc ra là một ô LÕM ôm lấy mục đang chọn chứ
        không phải một miếng dán lên. Đó là khác biệt giữa "giống Apple" và
        "giống một segmented control mặc định".
      */
      fill={cap ? c.background : c.accent}
      border={cap ? { width: StyleSheet.hairlineWidth, color: m.inset.border } : undefined}
      radius={cap ? radius.full : compact ? radius.full : r - pad}
      height={cap ? CAP_H : height}
      gap={0}
      style={[cap ? styles.capRow : styles.row, { borderRadius: r, padding: pad }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <PickRow.Item
            key={o.key}
            itemKey={o.key}
            accessibilityLabel={o.label}
            style={[styles.seg, { height: cap ? CAP_H : height }]}
            onPress={() => {
              if (on) return;
              Haptics.selectionAsync();
              onChange(o.key);
            }}>
            {/*
              Viên nang: CẢ HAI nhãn sáng đầy đủ.

              Thứ bậc do VỊ TRÍ của thumb kể — nó là một ô lõm ôm lấy mục đang
              chọn — nên làm mờ nhãn kia nữa là kể cùng một chuyện hai lần, và
              làm cái ray trông như đang hỏng một nửa.
            */}
            <View style={styles.inner}>
              {o.icon ? (
                <Icon
                  icon={o.icon}
                  size={cap ? 15 : 13}
                  color={cap || on ? c.foreground : c.mutedForeground}
                />
              ) : null}
              <Text
                style={[styles.label, cap && styles.capLabel, (cap || on) && styles.labelOn]}
                numberOfLines={1}>
                {o.label}
              </Text>
            </View>
          </PickRow.Item>
        );
      })}
    </PickRow>
  );
}

/**
 * Chiều cao của viên nang: 38, không phải 44.
 *
 * 44 là sàn cho một nút ĐƠN LẺ. Thanh này thì mỗi mục rộng gần nửa màn hình, nên
 * vùng chạm thật lớn hơn sàn nhiều lần theo chiều ngang — thứ giới hạn không
 * phải là ngón tay mà là mắt. Ở 44 cộng chữ 17 điểm, cả thanh nặng hơn tiêu đề
 * màn đứng ngay trên nó.
 *
 * 38 là quãng mà segmented control của hệ thống nằm trong đó.
 */
const CAP_H = 38;

const stylesFor = makeStyles((c, m) => ({
  row: { flexDirection: 'row', backgroundColor: 'rgba(24,24,27,0.6)' },
  seg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  label: { ...type.caption, fontWeight: '600', color: c.mutedForeground },
  labelOn: { color: c.foreground },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  /* ── biến thể viên nang ──
     Ray SÁNG hơn nền (nền trang #070708, ray #18181b) và đeo một viền tóc, nên
     bản thân cái ray đã đọc ra là một rãnh. Thumb thì tối bằng nền — xem ghi
     chú ở `fill`, đó là chỗ dễ làm ngược nhất. */
  capRow: {
    flexDirection: 'row',
    backgroundColor: c.secondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: m.inset.border,
  },
  /* 15 điểm, không phải 17. Thanh này là mục lục của màn; ở 17 điểm nó đọc ra
     nặng hơn chính cái tiêu đề nó dẫn tới. Nét 600 giữ lại độ chắc đã mất. */
  capLabel: { ...type.body, fontWeight: '600' },
}));

/**
 * The panel under the control, when the control changes.
 *
 * Sliding the pill and then cutting the content is half a transition: the eye
 * follows the pill, arrives, and the thing it came to look at was replaced
 * between frames.
 *
 * ── the shape of the fade is not a preference ──
 *
 * `day-plan.tsx` had already found this and left the reasoning: it first used a
 * staggered spring cascade, and "every tap replayed up to half a second of
 * staggered springing for what should be an immediate swap. Tapping T2, T3, T4
 * in sequence left three cascades overlapping each other."
 *
 * So: one uniform fade, no stagger, at `duration.appear` — the token for
 * "something arriving that was not on screen a moment ago", which is exactly
 * what a panel you have just switched to is. day-plan reached 140ms by moving
 * away from half a second of staggered springing, and 200 does not walk that
 * back: it is still a short uniform fade, and it is a number the motion
 * vocabulary already has a name for rather than a fifth one invented here.
 * The panel is being **replaced**, not
 * arriving, and that is enough to stop it being a hard cut without becoming a
 * movement anybody has to wait through.
 *
 * That rule lived in one file and five other segmented controls never got it.
 * It is here now, beside the control it belongs to, and `day-plan` uses this
 * one rather than its own copy.
 *
 * ── and why this is not the thing `screen.tsx` rejected ──
 *
 * That file records two failed attempts at animating **tab** changes, both of
 * which blinked, "because `FadeInDown` begins at invisible… it is wrong on a
 * page that is already drawn: replaying an entrance there has to un-draw it
 * first."
 *
 * This is the opposite case and the distinction is the whole reason it is safe:
 * the panel here genuinely is not on screen yet. Nothing is being un-drawn,
 * because what it replaces is already gone.
 */
export const SEGMENT_SWAP = FadeIn.duration(duration.appear)
  /*
    ── và lập luận trên đúng cho một cú ĐỔI, không đúng cho lần đầu ──

    "Panel ở đây thật sự chưa có trên màn hình" là thật khi người dùng vừa bấm
    sang segment khác. Nó KHÔNG thật ở lần mount đầu tiên: lúc đó panel chính là
    nội dung khởi đầu của màn hình, và `screen.tsx` ghi rằng một
    `UITabBarController` mount MỌI tab một lần rồi giữ — nên lần mount ấy rơi
    đúng vào lúc app đang khởi động và mọi thứ khác cũng đang dựng.

    Khung hình trong quãng đó bị bỏ lỡ thì thứ còn lại là giá trị đầu của
    `FadeIn`, tức opacity 0. Đã bị báo từ máy thật, và đúng ở SEGMENT ĐẦU TIÊN
    của cả hai màn dùng nó: "today bên nutrition bị tối khi mới mở app, weight
    bên progress cũng tương tự".

    `SegmentPanel` bên dưới bỏ hiệu ứng ở lần đầu, và đây là sàn cho mọi lần
    còn lại: bắt đầu ở 0.9 thì chế độ hỏng tệ nhất là "nhạt đi một phần mười",
    không phải "mất nội dung". Cùng luật `lib/entrance.ts` và `settle.tsx` đã
    phải học — một hiệu ứng vào là trang trí, nên nó không bao giờ được là thứ
    quyết định nội dung có nhìn thấy hay không.
  */
  .withInitialValues({ opacity: 0.9 });

/**
 * Wraps a segmented control's panel so it fades when the segment changes.
 *
 * `key` is the whole mechanism: React tears the old subtree down and mounts a
 * new one, which is what gives `entering` something to animate. Without it the
 * same node is reused and nothing enters.
 */
export function SegmentPanel({
  segment,
  children,
  gap = spacing.stack,
}: {
  segment: string;
  children: React.ReactNode;
  /**
   * The spacing this wrapper has to reproduce.
   *
   * ── why this prop is not optional in spirit ──
   *
   * A panel is several cards, and before this wrapper existed they were
   * several children of `Screen`, which stacks its children with
   * `gap: spacing.stack`. Wrapping them turns N children into ONE, so all N−1
   * gaps inside collapse and the cards close up against each other. Measured
   * off `/progress` at x=200, before and after: above the wrapper the page
   * shows for exactly 20px (y=114–133) — `spacing.stack`, intact. Inside it,
   * zero: the BMI card's last row is y=194 and the next card's top edge is
   * y=195. Not "tighter" — touching. What looked like a small gap in the
   * screenshot was the cards' own lit top edge.
   *
   * Nothing catches that. It type-checks, no rule sees it, no route throws, and
   * the app is still perfectly usable — it just quietly looks worse everywhere
   * this component is used. All four screens using it stack at
   * `spacing.stack`, so that is the default; the prop exists for a panel that
   * one day sits inside a container spacing its children differently, because
   * the failure there would be just as silent.
   */
  gap?: number;
}) {
  /*
    Lần đầu thì hiện ngay, mọi lần ĐỔI mới có hiệu ứng.

    `key={segment}` ép mount lại phần bên trong mỗi lần đổi segment — đó là cơ
    chế, và nó cũng làm `entering` chạy ở lần dựng ĐẦU. Ref này sống ở
    `SegmentPanel`, thứ KHÔNG bị `key` mount lại, nên nó phân biệt được "lần đầu
    của cả panel" với "một cú đổi segment thật".
  */
  const swapped = useRef(false);
  useEffect(() => {
    swapped.current = true;
  }, [segment]);

  return (
    <Animated.View
      key={segment}
      entering={swapped.current ? SEGMENT_SWAP : undefined}
      style={{ gap }}>
      {children}
    </Animated.View>
  );
}
