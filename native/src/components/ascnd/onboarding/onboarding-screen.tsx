import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { radius, spacing, type } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import { alpha, makeStyles } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';

/**
 * Khung chung của mười ba màn onboarding.
 *
 * ── vì sao nó ra đời MUỘN hơn kế hoạch ──
 *
 * Giai đoạn 1 có `OnboardingScreen` trong danh sách và cố ý lùi nó lại:
 * `tools/linked.mjs` bắt đúng những export không ai gọi, và một cái khung chưa
 * có màn nào dùng thì không duyệt được — nó mới là một lời hứa về bố cục. Nay
 * nó vào cùng bốn màn đầu tiên dùng nó, nên nhìn được nó làm gì.
 *
 * ── nó sở hữu cái gì ──
 *
 * Đúng phần KHUNG, thứ giống nhau ở cả mười ba màn: thanh tiến độ, nút quay
 * lại, lề ngang, và cụm nút ở chân màn. Phần RUỘT thì không — mỗi màn tự dựng
 * lấy, vì mười ba màn ấy khác nhau ở đúng chỗ đó và một prop `variant` chỉ là
 * cách viết mười ba nhánh `if` ở một tệp khác.
 *
 * ── ba con số không phải tôi chọn ──
 *
 * Nút chính cao 58, bo `radius.full`, nền `m.actionSurface`, chữ `type.headline`
 * — ĐÚNG bằng nút Lưu của `log-weight.tsx`. Đây là cùng một nút ở cùng một chỗ
 * trên màn; hai con số khác nhau giữa chúng sẽ đọc ra là lỗi dựng hình. Và nền
 * là `m.actionSurface` chứ KHÔNG phải `c.primary`: ở bản tối `primary` là
 * `#a8afbd`, đọc ra như một nút đang bị tắt — lý do đầy đủ nằm ở chú thích của
 * `actionSurface` trong `palette.ts`.
 *
 * ── thanh tiến độ mỏng 2px, và vì sao không phải các chấm ──
 *
 * Luồng cũ bảy màn vẽ bảy CHẤM. Mười ba chấm trên một hàng thì mỗi chấm còn
 * chưa tới 12px kể cả khoảng hở, tức dưới sàn nhìn thấy được, và hàng ấy đọc ra
 * là một hoa văn chứ không phải một thước đo. Một thanh liền nói đúng thứ cần
 * nói — *đi được bao xa rồi* — ở mọi số màn.
 *
 * `step` là số thứ tự NGƯỜI ĐỌC thấy (1…total). `0` thì thanh vắng mặt: màn
 * chào chưa bắt đầu hành trình nào để mà đo.
 */
type Props = {
  /** Vị trí người dùng đang đứng, đếm từ 1. `0` ẩn thanh tiến độ. */
  step: number;
  total: number;
  /** Vắng mặt thì không có nút quay lại — màn đầu và màn cuối. */
  onBack?: () => void;
  backLabel?: string;
  children: ReactNode;
  cta: string;
  onCta: () => void;
  /*
    Tên là `disabled` chứ không phải `ctaDisabled`, và đó KHÔNG phải một sở
    thích: Luật D của `tools/profile-onboarding.mjs` đọc các prop `disabled=`
    trong luồng onboarding để kiểm rằng cái chốt số đo cơ thể thật sự khoá cả
    nút đi tiếp lẫn nút ghi. Đặt tên khác đi thì tính chất vẫn đúng nhưng luật
    không đọc thấy — và một luật không đọc được một bản đúng là một luật sắp bị
    đi vòng.
  */
  disabled?: boolean;
  /** Lối ra thứ hai, chữ thật chứ không phải một chỗ bị giấu. Màn 12 dùng. */
  secondary?: { label: string; onPress: () => void };
  /** Dòng pháp lý dưới nút. Màn 12 và 13 dùng. */
  legal?: string;
  /*
    Dòng pháp lý MỞ ĐƯỢC tài liệu.

    Có `onLegal` thì dòng ấy thành một nút thật — vùng chạm cao 44, có vai trò
    và nhãn cho trình đọc màn hình. Không có thì nó là chữ thường, đúng như màn
    12 cần: câu *"Số liệu sức khoẻ không rời khỏi máy này"* là một lời khai, nó
    không dẫn đi đâu cả.
  */
  onLegal?: () => void;
};

export function OnboardingScreen({
  step,
  total,
  onBack,
  backLabel,
  children,
  cta,
  onCta,
  disabled,
  secondary,
  legal,
  onLegal,
}: Props) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const insets = useSafeAreaInsets();

  /*
    Kẹp trong [0, 1] chứ không tin vào chỗ gọi: `step` đi qua đây từ mười ba
    màn, và một thanh tràn ra ngoài khung là thứ chỉ thấy trên máy thật.
  */
  const progress = total > 0 ? Math.min(1, Math.max(0, step / total)) : 0;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {/*
        `ProgressBar` của app, không phải bốn dòng width phần trăm dựng tay.

        Bản đầu của tệp này dựng tay, và `tools/progress-bar.mjs` bắt ngay —
        luật ấy có vì SÁU bản chép tay từng sống cạnh `progress-bar.tsx` mà
        không bản nào biết tệp kia tồn tại, rồi bản thứ bảy dùng `scaleX` bị bác
        bằng một lượt dựng ở 6×. Một hình chữ nhật, tám cách vẽ.

        Đi qua nó còn được thêm thứ bản chép tay không có: thanh TRƯỢT sang nấc
        mới thay vì nhảy cóc, và nó trượt bằng `duration.move` chứ không phải
        một nghìn mili giây mặc định — một thước đo tiến trình đi chậm hơn cú
        chuyển màn thì nó đang kể về màn trước.
      */}
      <ProgressBar
        pct={progress * 100}
        height={2}
        radius={0}
        color={alpha(c.foreground, 0.26)}
        trackColor="transparent"
        delay={0}
        duration={duration.move}
      />

      <View style={styles.navRow}>
        {onBack ? (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            style={styles.back}
            onPress={onBack}>
            <Icon icon={ChevronLeft} size={22} color={c.mutedForeground} />
          </PressScale>
        ) : null}
      </View>

      <View style={styles.pad}>{children}</View>

      <View style={[styles.foot, { paddingBottom: Math.max(insets.bottom, spacing.lg) + 10 }]}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={cta}
          accessibilityState={{ disabled: !!disabled }}
          disabled={disabled}
          style={[styles.cta, { backgroundColor: m.actionSurface }, disabled && styles.ctaOff]}
          onPress={onCta}>
          <Text style={styles.ctaText}>{cta}</Text>
        </PressScale>

        {secondary ? (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={secondary.label}
            hitSlop={2}
            style={styles.cta2}
            onPress={secondary.onPress}>
            <Text style={styles.cta2Text}>{secondary.label}</Text>
          </PressScale>
        ) : null}

        {legal && onLegal ? (
          <PressScale
            accessibilityRole="link"
            accessibilityLabel={legal}
            style={styles.legalTap}
            onPress={onLegal}>
            <Text style={[styles.legal, styles.legalLink]}>{legal}</Text>
          </PressScale>
        ) : legal ? (
          <Text style={styles.legal}>{legal}</Text>
        ) : null}
      </View>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  page: { flex: 1, backgroundColor: c.background },
  /* Hàng này giữ chỗ kể cả khi không có nút quay lại, nên câu hỏi của mọi màn
     bắt đầu ở cùng một độ cao — đi từ màn này sang màn kia chữ không nhảy. */
  navRow: {
    height: 44,
    marginTop: 4,
    justifyContent: 'center',
    paddingHorizontal: spacing.md + 2,
  },
  back: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  pad: { flex: 1, paddingHorizontal: spacing.lg },
  /*
    `paddingTop` không phải trang trí. Dựng thật rồi nhìn: Koa của màn 01 đè
    lên nút, hàng viên của màn 13 dính vào nút, và dòng "Kéo để chỉnh" của màn
    08 nằm ngay trên mép nút. Ruột mỗi màn kết thúc ở một độ cao khác nhau, nên
    khoảng hở này phải do KHUNG giữ chứ không phải mười ba màn tự nhớ.
  */
  foot: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  cta: {
    height: 58,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  ctaOff: { opacity: 0.4 },
  ctaText: { ...type.headline, color: c.primaryForeground },
  /*
    Lối ra thứ hai: nhẹ hơn nút chính một bậc rõ rệt, nhưng vẫn là CHỮ THẬT ở
    màu `mutedForeground` — không phải một dòng mờ nhạt tới mức phải đi tìm.
    Cao 40 nên nó không đứng ngang hàng 58 của nút chính.
  */
  /*
    Vẽ 40, CHẠM 44.

    Board đặt 40 để lối ra thứ hai không đứng ngang hàng 58 của nút chính, và
    đó là một quyết định về sức nặng thị giác — đúng. Nhưng 40 dưới sàn vùng
    chạm 44 của HIG, và `tools/touch-target.mjs` bắt đúng chỗ ấy. `hitSlop` 2
    điểm mỗi chiều trả lại 44 mà không đụng một pixel nào của phần vẽ ra: hai
    câu hỏi khác nhau, hai câu trả lời khác nhau.
  */
  cta2: { height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  cta2Text: { ...type.body, fontWeight: '500', color: c.mutedForeground },
  legalTap: { minHeight: 44, justifyContent: 'center' },
  /* Gạch chân, không phải màu: ở bản tối một dòng 11pt tô `primary` (#a8afbd)
     đọc ra là chữ mờ chứ không phải chữ bấm được, và `foreground` thì nó thôi
     là một dòng phụ. Gạch chân nói "mở được" mà không đụng vào thang màu. */
  legalLink: { textDecorationLine: 'underline' },
  legal: {
    ...type.caption,
    color: c.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.sm + 2,
    lineHeight: 15,
  },
}));
