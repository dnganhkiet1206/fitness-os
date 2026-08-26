import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration } from '@/constants/motion';

/**
 * A section that opens by animating a real height.
 *
 * ── why a height and not a layout animation ──
 *
 * `today-meals.tsx` measured the alternative and wrote down what happened:
 * Reanimated's `LinearTransition` on the card "looks right until you watch what
 * is under it. Measured on an open: the card below jumped straight to its final
 * position on the first frame while this one grew over a quarter second, so a
 * 94px hole opened between them and slowly closed. `layout` animates the view
 * it is on; it did not carry the sibling with it."
 *
 * A height does carry them, because a height is a layout value: whatever is
 * below is pushed down by exactly as much as this has grown, on every frame,
 * for free. That is why `tools/motion.mjs` has to be told about this file — it
 * bans layout properties inside `useAnimatedStyle`, and here the layout IS the
 * mechanism rather than a lazy way to make something appear.
 *
 * ── why this is a component and the other two are not ──
 *
 * Three screens want this and each had written its own. `template-list.tsx`
 * deliberately does something else and says why — a measured height "did not
 * show anything, and I could not find out why from reading the two", so it
 * staggers its rows instead. `today-meals.tsx` keeps its own because its rows
 * read the same `grow` shared value to land on a stagger, so the height and the
 * rows are one mechanism there rather than a container and its contents.
 *
 * This is for the ordinary case: something that opens, with nothing inside it
 * that needs to know how far open it is.
 *
 * ── the cost, and why it is the right one ──
 *
 * The body stays mounted while closed, clipped by a zero-high box, so there is
 * something to measure. That buys a measurement that is always current: content
 * that changed while closed opens to the right height rather than to the height
 * it had last time.
 */
const OPEN_EASE = Easing.out(Easing.cubic);

/**
 * Điều gì CHỞ cú mở ra: một lớp mờ dần, hay chính mép cắt.
 *
 * ── vì sao đây là một lựa chọn chứ không phải một mặc định ──
 *
 * `'fade'` chạy chiều cao VÀ độ mờ trên cùng một shared value. Đó là điều
 * `card-deck.tsx` cần và nó nói ra ở chỗ gọi: hàng chấm phải mờ đi ĐÚNG LÚC nó
 * co lại, vì một hàng chấm cao 8 điểm co lại mà vẫn đậm màu thì mắt đọc ra là
 * một cú giật vẽ chứ không phải một cú đóng.
 *
 * `'clip'` chỉ chạy chiều cao. Hai hệ quả, và cả hai đều là lý do nó tồn tại:
 *
 *   1. **Không còn lượt vẽ ngoài màn.** `opacity` đặt trên một view NHIỀU CON
 *      buộc iOS gộp cả nhóm ra một bề mặt riêng rồi mới pha vào — mỗi khung
 *      hình, suốt cả cú mở. Với hàng chấm thì nhóm ấy là vài chấm; với phần chi
 *      tiết của thẻ sẵn sàng thì nhóm ấy là năm ô, một nhận xét và cả khối giải
 *      thích. Đó là lượt vẽ đắt nhất trong cả cú chạm, và nó không mua gì.
 *
 *   2. **Hết cảnh chữ đã đậm mà vẫn bị cắt ngang.** Độ mờ đi theo cùng đường
 *      cong với chiều cao, mà `out(cubic)` dốc ở đầu: quá nửa thời gian thì chữ
 *      đã gần đậm hẳn trong khi mép dưới vẫn đang xén ngang dòng. Mắt đọc ra
 *      một tấm đã vẽ xong bị một con dao chạy qua.
 *
 * ── và vì sao `'clip'` đổi luôn đường cong ──
 *
 * Vì nó vừa lấy mất tín hiệu kia. Ở `'fade'` mép cắt chỉ là một nửa của cú mở;
 * ở `'clip'` nó là TẤT CẢ. `out(cubic)` xuất phát ở tốc độ gấp ba tốc độ trung
 * bình — trên hàng chấm 8 điểm thì đó là 0,1 điểm mỗi mili giây, không ai thấy;
 * trên khối chi tiết cao khoảng 400 điểm thì đó là 5 điểm mỗi mili giây ngay ở
 * khung hình đầu, và một mép duy nhất bật ra từ vận tốc đó đọc ra là "bung"
 * chứ không phải "mở". `inOut(cubic)` xuất phát từ ĐỨNG YÊN và đỉnh chỉ gấp
 * đôi, nên cú mở có chỗ để bắt đầu.
 *
 * Một prop chứ không phải hai, vì đây là một quyết định: cái gì chở cú mở. Tách
 * ra thành `fade` và `ease` là mời người sau chọn `fade={false}` mà quên đường
 * cong, rồi tự hỏi vì sao nó bung.
 */
const CLIP_EASE = Easing.inOut(Easing.cubic);

export type Reveal = 'fade' | 'clip';

/**
 * The moving part, mounted only once the body has been measured.
 *
 * ── it is a separate component for the reason `tools/measured-worklet.mjs`
 *    exists ──
 *
 * `useAnimatedStyle` computes its style once, on the hook's first render, and
 * re-applies that frozen value on every later one. A worklet that reads a
 * `useState` written by `onLayout` therefore freezes at zero — which for this
 * component is a section that can never open. The first draft did exactly that
 * and the rule caught it.
 *
 * So the height arrives as a prop that is already real, and is then held in a
 * shared value: a plain prop would fix the frozen initial and leave a second
 * bug behind it, because the mapper is driven by shared values alone. Content
 * that grew while the section was already open would not move the height, since
 * `grow` had not changed.
 */
function Grow({
  open,
  height,
  reveal,
  children,
}: {
  open: boolean;
  height: number;
  reveal: Reveal;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const grow = useSharedValue(open ? 1 : 0);
  const h = useSharedValue(height);
  const fade = reveal === 'fade';

  useEffect(() => {
    h.value = height;
  }, [height, h]);

  useEffect(() => {
    const to = open ? 1 : 0;
    const easing = fade ? OPEN_EASE : CLIP_EASE;
    grow.value = reduceMotion ? to : withTiming(to, { duration: duration.move, easing });
  }, [open, reduceMotion, grow, fade]);

  /*
    Hai worklet chứ không phải một worklet có `if`, vì `reveal` không đổi trong
    đời một chỗ gọi — chỗ gọi viết ra hằng số. Nhánh nào không dùng thì không có
    mặt trong style chút nào, nên ở `'clip'` không có khoá `opacity` nào để iOS
    nhìn thấy mà gộp nhóm.
  */
  const faded = useAnimatedStyle(() => ({ height: grow.value * h.value, opacity: grow.value }));
  const clipped = useAnimatedStyle(() => ({ height: grow.value * h.value }));

  return <Animated.View style={[styles.clip, fade ? faded : clipped]}>{children}</Animated.View>;
}

export function Expander({
  open,
  reveal = 'fade',
  children,
}: {
  open: boolean;
  reveal?: Reveal;
  children: React.ReactNode;
}) {
  const [bodyH, setBodyH] = useState(0);

  const measure = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setBodyH((prev) => (Math.abs(prev - h) < 1 ? prev : h));
  };

  /* Absolutely positioned so its own height is never the box's height — the
     box's height is the animated one, and a child that pushed it open would
     make the measurement chase itself. */
  const body = (
    <View style={styles.body} onLayout={measure}>
      {children}
    </View>
  );

  /* Before the first measurement there is nothing to animate, so it is drawn at
     zero height purely to be measured. One frame, on a section that starts
     closed and therefore looks identical either way. */
  if (bodyH <= 0) return <View style={styles.clip}>{body}</View>;

  return (
    <Grow open={open} height={bodyH} reveal={reveal}>
      {body}
    </Grow>
  );
}

const styles = StyleSheet.create({
  /*
    `alignSelf: 'stretch'` — và việc thiếu nó là lý do KHÔNG thẻ hero nào mở ra
    được.

    Hộp này đo chiều cao bằng một con TUYỆT ĐỐI (`body` bên dưới). Trong một cột
    căn trái/phải thì hộp vẫn rộng bằng cha, nên con tuyệt đối có bề rộng và đo
    ra một chiều cao thật. Trong một cột `alignItems: 'center'` — thứ mà cả bốn
    trang hero là — hộp co theo NỘI DUNG, nội dung duy nhất của nó là con tuyệt
    đối, và một con tuyệt đối không đóng góp gì vào kích thước cha. Bề rộng 0,
    chữ xuống dòng thành không có gì, chiều cao đo ra 0 — và `Expander` coi 0 là
    "chưa đo được" nên nó không bao giờ chuyển sang trạng thái mở.

    Không có lỗi nào, không có cảnh báo nào: mũi tên xoay, và bên dưới không có
    gì. Neo bề rộng ở đây thay vì bắt từng chỗ gọi nhớ, vì chỗ gọi không có cách
    nào biết điều này trừ khi đã gặp.
  */
  clip: { overflow: 'hidden', alignSelf: 'stretch' },
  body: { position: 'absolute', left: 0, right: 0, top: 0 },
});
