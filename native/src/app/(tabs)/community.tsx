import { Users } from 'lucide-react-native';

import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { PAGE_TINT } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';

/**
 * Cộng đồng — một VỎ, và cố ý chưa có gì bên trong.
 *
 * ── đặt hàng ──
 *
 * Chủ dự án (24/09): tab Tiến trình gộp vào Tập luyện, và ô tab của nó nhường
 * cho một mục chưa từng tồn tại. Khi được hỏi mục ấy làm gì, câu trả lời là
 * "dựng vỏ trước, chưa backend".
 *
 * ── vì sao chưa có gì, và vì sao đó là quyết định chứ không phải việc bỏ dở ──
 *
 * Cả 39 bảng trong schema đều khoá theo `user_id` với RLS một người: không có
 * bảng bạn bè, theo dõi, bài đăng hay bảng xếp hạng nào. Một mục cộng đồng
 * THẬT cần đọc chéo người dùng, và trong một app đang giữ cân nặng, số đo vòng
 * và ảnh cơ thể, "ai thấy được gì" là quyết định của chủ dự án — không phải
 * thứ một màn hình được phép đoán trước.
 *
 * Nên trang này không có dữ liệu mẫu nào: không người dùng bịa, không bảng xếp
 * hạng giả, không "bạn bè gợi ý". Một cái vỏ trống nói thật "sắp ra mắt"; một
 * cái vỏ đầy dữ liệu giả nói dối về một tính năng chưa có, và người ta sẽ chạm
 * vào nó.
 *
 * Không `refreshable`: không có gì để tải lại.
 */
export default function CommunityScreen() {
  const i18n = useI18n();
  return (
    <Screen title={i18n.nCommunityTitle} aura={PAGE_TINT.community}>
      <GlassCard>
        <EmptyState icon={Users} title={i18n.nCommunitySoon} hint={i18n.nCommunitySoonHint} />
      </GlassCard>
    </Screen>
  );
}
