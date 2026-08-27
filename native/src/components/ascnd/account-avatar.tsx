import { User } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius } from '@/constants/ascnd';
import { initialsFor } from '@/lib/initials';

/**
 * Bạn, ở góc trên — thay cho một bánh răng.
 *
 * ── vì sao một vòng tròn chứ không phải một ô bo góc ──
 *
 * Mọi nút khác ở hàng này là `squareBtn`: vuông, bo 16. Avatar tròn, và đó
 * không phải để cho khác — hình tròn là cách iOS nói "đây là một NGƯỜI". Danh
 * bạ, Mail, Tin nhắn, Apple ID đều tròn, còn mọi thứ là công cụ thì vuông bo
 * góc. Bo cùng bán kính với các nút kia sẽ biến nó thành "một nút nữa có chữ
 * bên trong".
 *
 * ── vì sao KHÔNG có màu ──
 *
 * Avatar của Apple thường có nền màu. Ở app này thì không, và lý do đã được ghi
 * lại ở `index.tsx` khi các viên chip bỏ màu: *màu dành cho GIÁ TRỊ, không dành
 * cho LỐI ĐI*. Vòng tròn, điểm số, macro — thứ mà màu NÓI RA một điều gì đó —
 * giữ màu; còn chip, nút và lối vào thì đơn sắc. Avatar là một lối vào.
 *
 * Một luật đã đo thì thắng một mặc định của nền tảng, và cái thắng ở đây còn
 * mua thêm một thứ: hàng nút góc trên giữ được đúng một tông, nên khi nó mờ đi
 * lúc cuộn thì cả hàng đi như một khối.
 *
 * ── vì sao có nhánh hình người ──
 *
 * `profiles.name` mặc định là chuỗi RỖNG, nên tài khoản mới không có chữ nào để
 * vẽ — xem `lib/initials.ts`. Không có nhánh này thì màn hình đầu tiên của
 * người dùng mới là một vòng tròn trống ở góc.
 */
export function AccountAvatar({ name, email }: { name?: string | null; email?: string | null }) {
  const text = initialsFor(name, email);
  return (
    <View style={styles.ring}>
      {text ? (
        /* `maxFontSizeMultiplier` vì đây là chữ nằm TRONG một hình có kích
           thước cứng — cùng ngoại lệ mà `tools/dynamic-type.mjs` ghi cho con số
           giữa vòng sẵn sàng. Ở cỡ trợ năng lớn nhất, 15 điểm vượt khỏi đường
           kính 44 và hai chữ cái tràn ra ngoài vòng tròn. */
        <Text style={styles.initials} maxFontSizeMultiplier={1.3} allowFontScaling>
          {text}
        </Text>
      ) : (
        <Icon icon={User} size={20} color={colors.mutedForeground} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    /* Bề rộng/cao KHÔNG đặt ở đây: chỗ gọi bọc nó trong `avatarBtn`, một ô
       `TOP_BAR_H × TOP_BAR_H` không viền không nền, để vùng chạm và chiều cao
       hàng vẫn do đúng MỘT hằng số quyết định. Đây chỉ là cái mặt tròn nằm
       trong ô ấy — nên nó phủ kín ô bằng bốn cạnh tuyệt đối thay vì tự khai
       một kích thước thứ hai sẽ lệch. */
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168,175,189,0.28)',
    backgroundColor: 'rgba(168,175,189,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: colors.foreground,
  },
});
