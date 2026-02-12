import { motion } from 'framer-motion';
import { ChevronLeft, Shield, FileText, Scale, Heart, AlertTriangle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppSettings } from '@/hooks/useAppSettings';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };
const EFFECTIVE_DATE = '2026-02-12';
const APP_NAME = 'Fitness OS';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-6">
    <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
    <div className="text-xs leading-relaxed text-muted-foreground space-y-2">{children}</div>
  </div>
);

const i = {
  vi: {
    pageTitle: 'Chính sách & Pháp lý',
    tabTerms: 'Điều khoản',
    tabPrivacy: 'Quyền riêng tư',
    tabHealth: 'Sức khoẻ',
    tabData: 'Dữ liệu',
    effectiveDate: 'Có hiệu lực từ',
    // Terms
    termsTitle: 'Điều khoản Sử dụng',
    t1Title: '1. Chấp nhận Điều khoản',
    t1: `Bằng việc tạo tài khoản và sử dụng ${APP_NAME}, bạn đồng ý tuân thủ toàn bộ các điều khoản được nêu trong tài liệu này. Nếu bạn không đồng ý, vui lòng ngừng sử dụng ứng dụng.`,
    t2Title: '2. Mô tả Dịch vụ',
    t2: `${APP_NAME} là ứng dụng hỗ trợ theo dõi sức khoẻ cá nhân bao gồm: dinh dưỡng, tập luyện, giấc ngủ, biometric và các chỉ số thể chất. Ứng dụng sử dụng trí tuệ nhân tạo (AI) để cung cấp gợi ý cá nhân hoá.`,
    t3Title: '3. Tài khoản Người dùng',
    t3: [
      'Bạn phải cung cấp thông tin chính xác khi đăng ký.',
      'Bạn chịu trách nhiệm bảo mật thông tin đăng nhập.',
      'Bạn phải đủ 16 tuổi trở lên để sử dụng dịch vụ.',
      'Mỗi cá nhân chỉ được sở hữu một tài khoản.',
    ],
    t4Title: '4. Quyền Sở hữu Trí tuệ',
    t4: `Tất cả nội dung, thiết kế, mã nguồn và thuật toán AI thuộc sở hữu của ${APP_NAME}. Bạn được cấp quyền sử dụng cá nhân, không độc quyền, không chuyển nhượng.`,
    t5Title: '5. Hành vi bị Cấm',
    t5: [
      'Sử dụng ứng dụng cho mục đích bất hợp pháp.',
      'Cố gắng truy cập trái phép vào hệ thống.',
      'Chia sẻ tài khoản hoặc thông tin đăng nhập.',
      'Sao chép, phân phối hoặc sửa đổi nội dung ứng dụng.',
      'Lạm dụng tính năng AI để tạo nội dung y tế sai lệch.',
    ],
    t6Title: '6. Chấm dứt Dịch vụ',
    t6: 'Chúng tôi có quyền tạm ngưng hoặc chấm dứt tài khoản nếu phát hiện vi phạm điều khoản. Bạn có thể xoá tài khoản bất kỳ lúc nào trong phần Cài đặt.',
    t7Title: '7. Giới hạn Trách nhiệm (Limitation of Liability)',
    t7: [
      `TRONG MỌI TRƯỜNG HỢP, trách nhiệm tối đa của ${APP_NAME} đối với bạn <strong>không vượt quá số tiền bạn đã thanh toán cho dịch vụ trong 12 tháng gần nhất</strong>, hoặc 500.000 VNĐ (tuỳ giá trị nào lớn hơn).`,
      'Chúng tôi <strong>KHÔNG CHỊU TRÁCH NHIỆM</strong> đối với bất kỳ thiệt hại gián tiếp, ngẫu nhiên, đặc biệt, mang tính trừng phạt hoặc hệ quả nào, bao gồm nhưng không giới hạn: mất dữ liệu, mất lợi nhuận, tổn thương thể chất hoặc tinh thần.',
      'Ứng dụng được cung cấp theo nguyên tắc <strong>"NGUYÊN TRẠNG" (AS IS)</strong> và <strong>"NHƯ SẴN CÓ" (AS AVAILABLE)</strong>, không có bất kỳ bảo đảm nào, dù rõ ràng hay ngụ ý.',
    ],
    t8Title: '8. Bồi thường (Indemnification)',
    t8Intro: `Bạn đồng ý bồi thường, bảo vệ và giữ cho ${APP_NAME}, các giám đốc, nhân viên và đối tác không bị tổn hại bởi bất kỳ khiếu nại, thiệt hại, chi phí (bao gồm phí luật sư) phát sinh từ:`,
    t8: [
      'Việc bạn vi phạm các điều khoản này.',
      'Việc bạn sử dụng hoặc lạm dụng ứng dụng.',
      'Quyết định sức khoẻ dựa trên thông tin từ ứng dụng mà không tham khảo chuyên gia y tế.',
      'Nội dung hoặc dữ liệu bạn cung cấp cho ứng dụng.',
    ],
    t9Title: '9. Bất khả kháng (Force Majeure)',
    t9: 'Chúng tôi không chịu trách nhiệm cho bất kỳ sự chậm trễ hoặc gián đoạn dịch vụ nào do các sự kiện ngoài tầm kiểm soát hợp lý, bao gồm nhưng không giới hạn: thiên tai, chiến tranh, dịch bệnh, sự cố hạ tầng internet, tấn công mạng, thay đổi pháp luật hoặc quyết định của cơ quan có thẩm quyền.',
    t10Title: '10. Luật Áp dụng & Giải quyết Tranh chấp',
    t10: [
      'Các điều khoản này được điều chỉnh bởi <strong>pháp luật nước Cộng hoà Xã hội Chủ nghĩa Việt Nam</strong>.',
      'Mọi tranh chấp phát sinh sẽ được giải quyết thông qua thương lượng thiện chí trong vòng <strong>30 ngày</strong>.',
      'Nếu không giải quyết được, tranh chấp sẽ được đưa ra <strong>Trung tâm Trọng tài Quốc tế Việt Nam (VIAC)</strong> theo quy tắc tố tụng trọng tài hiện hành.',
      'Ngôn ngữ trọng tài: Tiếng Việt. Địa điểm: TP. Hồ Chí Minh.',
    ],
    t11Title: '11. Điều khoản Tách rời (Severability)',
    t11: 'Nếu bất kỳ điều khoản nào trong thoả thuận này bị tuyên bố vô hiệu hoặc không thể thi hành bởi toà án hoặc cơ quan có thẩm quyền, các điều khoản còn lại vẫn có hiệu lực đầy đủ.',
    t12Title: '12. Toàn bộ Thoả thuận',
    t12: `Các điều khoản này, cùng với Chính sách Quyền riêng tư, Tuyên bố Sức khoẻ và Chính sách Dữ liệu & AI, tạo thành <strong>toàn bộ thoả thuận</strong> giữa bạn và ${APP_NAME}, thay thế mọi thoả thuận trước đó.`,
    t13Title: '13. Thay đổi Điều khoản',
    t13: 'Chúng tôi có thể cập nhật điều khoản. Các thay đổi quan trọng sẽ được thông báo qua ứng dụng ít nhất 14 ngày trước khi có hiệu lực. Việc tiếp tục sử dụng sau ngày có hiệu lực đồng nghĩa với việc bạn chấp nhận các thay đổi.',
    // Privacy
    privacyTitle: 'Chính sách Quyền riêng tư',
    p1Title: '1. Dữ liệu chúng tôi Thu thập',
    p1: [
      '<strong>Thông tin cá nhân:</strong> Tên, email, ngày sinh, giới tính, chiều cao, cân nặng.',
      '<strong>Dữ liệu sức khoẻ:</strong> Bữa ăn, bài tập, giấc ngủ, nhịp tim, SpO2, HRV, cân nặng, ảnh tiến trình, lượng nước uống.',
      '<strong>Dữ liệu thiết bị:</strong> Thông tin từ wearables được kết nối (nếu có).',
      '<strong>Dữ liệu sử dụng:</strong> Tương tác với ứng dụng, tần suất sử dụng tính năng.',
    ],
    p2Title: '2. Mục đích Sử dụng Dữ liệu',
    p2: [
      'Cá nhân hoá trải nghiệm và gợi ý AI.',
      'Theo dõi tiến trình và tạo báo cáo sức khoẻ.',
      'Cải thiện chất lượng dịch vụ và thuật toán.',
      'Đảm bảo an toàn tài khoản.',
    ],
    p2Note: 'Chúng tôi <strong>KHÔNG BAO GIỜ</strong> bán dữ liệu cá nhân cho bên thứ ba.',
    p3Title: '3. Bảo mật Dữ liệu',
    p3: [
      'Mã hoá dữ liệu trong quá trình truyền tải (TLS/SSL).',
      'Mã hoá dữ liệu lưu trữ (AES-256).',
      'Row-Level Security (RLS) trên toàn bộ cơ sở dữ liệu.',
      'Xác thực JWT cho mọi API endpoint.',
      'Ảnh tiến trình lưu trữ private với signed URLs (hết hạn sau 1 giờ).',
      'Mã PIN thiết bị được hash SHA-256 (không lưu plaintext).',
    ],
    p4Title: '4. Quyền của Bạn',
    p4: [
      '<strong>Truy cập:</strong> Xem toàn bộ dữ liệu cá nhân trong ứng dụng.',
      '<strong>Xuất:</strong> Tải dữ liệu ở định dạng JSON hoặc CSV (Cài đặt → Bảo mật & Dữ liệu).',
      '<strong>Chỉnh sửa:</strong> Cập nhật hoặc xoá dữ liệu bất kỳ lúc nào.',
      '<strong>Xoá tài khoản:</strong> Xoá hoàn toàn tài khoản và toàn bộ dữ liệu liên quan.',
      '<strong>Rút lại đồng ý:</strong> Ngừng chia sẻ dữ liệu wearable bất kỳ lúc nào.',
    ],
    p5Title: '5. Lưu trữ Dữ liệu',
    p5: 'Dữ liệu được lưu trữ trên hạ tầng đám mây bảo mật. Khi bạn xoá tài khoản, toàn bộ dữ liệu sẽ bị xoá vĩnh viễn trong vòng 30 ngày.',
    p6Title: '6. Cookie & Theo dõi',
    p6: 'Chúng tôi chỉ sử dụng cookie kỹ thuật cần thiết cho xác thực và phiên đăng nhập. Không sử dụng cookie quảng cáo hoặc theo dõi của bên thứ ba.',
    p7Title: '7. Tuân thủ GDPR & Quyền riêng tư Quốc tế',
    p7: [
      'Chúng tôi tuân thủ Quy định Bảo vệ Dữ liệu Chung (GDPR) của EU.',
      'Người dùng tại Mỹ được bảo vệ theo CCPA (California Consumer Privacy Act).',
      'Chúng tôi không chuyển dữ liệu cá nhân ra ngoài khu vực lưu trữ mà không có biện pháp bảo vệ thích hợp.',
    ],
    // Health
    healthTitle: 'Tuyên bố về Sức khoẻ',
    healthWarning: `${APP_NAME} KHÔNG PHẢI là thiết bị y tế, không thay thế tư vấn y khoa chuyên nghiệp, và không được sử dụng để chẩn đoán, điều trị hoặc phòng ngừa bất kỳ bệnh lý nào.`,
    h1Title: '1. Giới hạn Trách nhiệm',
    h1: [
      'Mọi thông tin và gợi ý trong ứng dụng chỉ mang tính chất <strong>tham khảo</strong>, không phải lời khuyên y tế.',
      'Gợi ý từ AI được tạo bởi thuật toán máy học, <strong>không phải bởi bác sĩ hoặc chuyên gia y tế</strong>.',
      'Dữ liệu biometric (nhịp tim, SpO2, HRV) chỉ mang tính ước tính và <strong>không có độ chính xác y khoa</strong>.',
      'Chỉ số Readiness Score là chỉ báo tổng hợp, <strong>không phải chẩn đoán sức khoẻ</strong>.',
    ],
    h2Title: '2. Từ chối Miễn trừ Trách nhiệm Y tế',
    h2Intro: '<strong>CHÚNG TÔI KHÔNG CHỊU TRÁCH NHIỆM</strong> đối với bất kỳ tổn thương, thiệt hại sức khoẻ hoặc hậu quả nào phát sinh từ:',
    h2: [
      'Việc tuân theo gợi ý dinh dưỡng hoặc tập luyện từ ứng dụng.',
      'Quyết định sức khoẻ dựa trên dữ liệu biometric của ứng dụng.',
      'Sử dụng gợi ý thực phẩm bổ sung (supplements) mà không tham khảo ý kiến bác sĩ.',
      'Bỏ qua triệu chứng bệnh lý vì chỉ số ứng dụng cho thấy "bình thường".',
    ],
    h3Title: '3. Khuyến cáo Quan trọng',
    h3: [
      '<strong>Luôn tham khảo bác sĩ</strong> trước khi bắt đầu chế độ tập luyện hoặc ăn kiêng mới.',
      '<strong>Ngừng tập ngay lập tức</strong> nếu cảm thấy đau, chóng mặt hoặc khó thở.',
      '<strong>Không tự ý dùng</strong> thực phẩm bổ sung dựa trên gợi ý AI mà chưa hỏi ý kiến chuyên gia.',
      'Người có tiền sử bệnh tim mạch, tiểu đường, rối loạn ăn uống hoặc đang mang thai <strong>bắt buộc phải tham khảo bác sĩ</strong> trước khi sử dụng.',
      'Trẻ em dưới 16 tuổi không được sử dụng ứng dụng.',
    ],
    h4Title: '4. Trường hợp Khẩn cấp',
    h4: 'Nếu bạn gặp tình trạng sức khoẻ khẩn cấp, <strong>hãy gọi 115 hoặc đến cơ sở y tế gần nhất ngay lập tức</strong>. KHÔNG sử dụng ứng dụng để đánh giá tình trạng khẩn cấp.',
    h5Title: '5. Tuân thủ FDA & Quy định Quốc tế',
    h5: [
      `${APP_NAME} không được đánh giá hoặc phê duyệt bởi FDA (Cục Quản lý Thực phẩm và Dược phẩm Hoa Kỳ) hoặc bất kỳ cơ quan y tế nào.`,
      'Ứng dụng không được phân loại là thiết bị y tế theo quy định của FDA, EU MDR, hoặc TGA.',
      'Các gợi ý về thực phẩm bổ sung không được đánh giá bởi bất kỳ cơ quan quản lý nào.',
    ],
    // Data
    dataTitle: 'Chính sách Dữ liệu & AI',
    d1Title: '1. Dữ liệu AI',
    d1: [
      'Gợi ý AI được tạo dựa trên dữ liệu bạn cung cấp (dinh dưỡng, tập luyện, giấc ngủ, biometric).',
      'Dữ liệu gửi đến AI được xử lý theo thời gian thực và <strong>không được lưu trữ</strong> bởi nhà cung cấp AI.',
      'Lịch sử hội thoại AI Coach được lưu trong tài khoản của bạn và bạn có thể xoá bất kỳ lúc nào.',
    ],
    d2Title: '2. Chia sẻ Dữ liệu',
    d2Intro: 'Dữ liệu của bạn <strong>KHÔNG BAO GIỜ</strong> được chia sẻ với:',
    d2: ['Công ty bảo hiểm.', 'Nhà tuyển dụng.', 'Bên thứ ba vì mục đích quảng cáo.', 'Bất kỳ tổ chức nào không được nêu rõ trong chính sách này.'],
    d3Title: '3. Quyền Kiểm soát Dữ liệu',
    d3Intro: 'Bạn có toàn quyền kiểm soát dữ liệu của mình:',
    d3: [
      '<strong>Xem:</strong> Truy cập mọi dữ liệu đã lưu trong ứng dụng.',
      '<strong>Xuất:</strong> Tải toàn bộ dữ liệu ở định dạng JSON/CSV.',
      '<strong>Xoá:</strong> Xoá từng mục hoặc toàn bộ lịch sử.',
      '<strong>Ngắt kết nối:</strong> Huỷ liên kết wearables bất kỳ lúc nào.',
    ],
    d4Title: '4. Bảo vệ Dữ liệu Nhạy cảm',
    d4Intro: 'Ảnh tiến trình (progress photos) được bảo vệ đặc biệt:',
    d4: [
      'Lưu trữ trong bucket private (không truy cập công khai).',
      'Chỉ hiển thị qua signed URLs với thời hạn 1 giờ.',
      'Chỉ bạn mới có thể xem ảnh của mình (Row-Level Security).',
    ],
    d5Title: '5. Liên hệ',
    d5: 'Nếu có thắc mắc về chính sách này, vui lòng liên hệ qua phần Hỗ trợ trong ứng dụng hoặc gửi email đến địa chỉ hỗ trợ được cung cấp trong phần Cài đặt.',
  },
  en: {
    pageTitle: 'Policies & Legal',
    tabTerms: 'Terms',
    tabPrivacy: 'Privacy',
    tabHealth: 'Health',
    tabData: 'Data',
    effectiveDate: 'Effective date',
    // Terms
    termsTitle: 'Terms of Service',
    t1Title: '1. Acceptance of Terms',
    t1: `By creating an account and using ${APP_NAME}, you agree to comply with all terms outlined in this document. If you do not agree, please discontinue use of the application.`,
    t2Title: '2. Description of Service',
    t2: `${APP_NAME} is a personal health tracking application covering nutrition, exercise, sleep, biometrics, and physical metrics. The application uses artificial intelligence (AI) to provide personalized suggestions.`,
    t3Title: '3. User Account',
    t3: [
      'You must provide accurate information when registering.',
      'You are responsible for maintaining the security of your login credentials.',
      'You must be at least 16 years old to use the service.',
      'Each individual may only own one account.',
    ],
    t4Title: '4. Intellectual Property',
    t4: `All content, design, source code, and AI algorithms are the property of ${APP_NAME}. You are granted a personal, non-exclusive, non-transferable license to use the service.`,
    t5Title: '5. Prohibited Conduct',
    t5: [
      'Using the application for unlawful purposes.',
      'Attempting unauthorized access to the system.',
      'Sharing accounts or login credentials.',
      'Copying, distributing, or modifying application content.',
      'Misusing AI features to generate misleading medical content.',
    ],
    t6Title: '6. Termination',
    t6: 'We reserve the right to suspend or terminate your account if a violation of these terms is detected. You may delete your account at any time in Settings.',
    t7Title: '7. Limitation of Liability',
    t7: [
      `IN NO EVENT shall ${APP_NAME}'s total liability exceed <strong>the amount you paid for the service in the preceding 12 months</strong>, or USD $20 (whichever is greater).`,
      'We shall <strong>NOT BE LIABLE</strong> for any indirect, incidental, special, punitive, or consequential damages, including but not limited to: loss of data, loss of profits, physical or emotional harm.',
      'The application is provided on an <strong>"AS IS"</strong> and <strong>"AS AVAILABLE"</strong> basis, without any warranties, express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.',
    ],
    t8Title: '8. Indemnification',
    t8Intro: `You agree to indemnify, defend, and hold harmless ${APP_NAME}, its directors, employees, and partners from any claims, damages, costs (including attorney fees) arising from:`,
    t8: [
      'Your violation of these terms.',
      'Your use or misuse of the application.',
      'Health decisions based on information from the application without consulting a healthcare professional.',
      'Content or data you provide to the application.',
    ],
    t9Title: '9. Force Majeure',
    t9: 'We shall not be liable for any delay or disruption of service caused by events beyond reasonable control, including but not limited to: natural disasters, war, pandemics, internet infrastructure failures, cyberattacks, changes in law, or government orders.',
    t10Title: '10. Governing Law & Dispute Resolution',
    t10: [
      'These terms shall be governed by the <strong>laws of the Socialist Republic of Vietnam</strong>.',
      'Any disputes shall first be resolved through good-faith negotiation within <strong>30 days</strong>.',
      'If unresolved, disputes shall be submitted to the <strong>Vietnam International Arbitration Centre (VIAC)</strong> under its current arbitration rules.',
      'For users outside Vietnam, you agree that any dispute shall be resolved under VIAC rules, with arbitration conducted in English upon request. Nothing in these terms limits your statutory consumer rights under your local jurisdiction.',
    ],
    t11Title: '11. Severability',
    t11: 'If any provision of this agreement is held to be invalid or unenforceable by a court or competent authority, the remaining provisions shall remain in full force and effect.',
    t12Title: '12. Entire Agreement',
    t12: `These terms, together with the Privacy Policy, Health Disclaimer, and Data & AI Policy, constitute the <strong>entire agreement</strong> between you and ${APP_NAME}, superseding all prior agreements.`,
    t13Title: '13. Changes to Terms',
    t13: 'We may update these terms. Significant changes will be notified via the application at least 14 days before taking effect. Continued use after the effective date constitutes acceptance of the changes.',
    // Privacy
    privacyTitle: 'Privacy Policy',
    p1Title: '1. Data We Collect',
    p1: [
      '<strong>Personal information:</strong> Name, email, date of birth, sex, height, weight.',
      '<strong>Health data:</strong> Meals, workouts, sleep, heart rate, SpO2, HRV, weight, progress photos, water intake.',
      '<strong>Device data:</strong> Information from connected wearables (if applicable).',
      '<strong>Usage data:</strong> App interactions, feature usage frequency.',
    ],
    p2Title: '2. How We Use Your Data',
    p2: [
      'Personalize experience and AI suggestions.',
      'Track progress and generate health reports.',
      'Improve service quality and algorithms.',
      'Ensure account security.',
    ],
    p2Note: 'We will <strong>NEVER</strong> sell your personal data to third parties.',
    p3Title: '3. Data Security',
    p3: [
      'Data encrypted in transit (TLS/SSL).',
      'Data encrypted at rest (AES-256).',
      'Row-Level Security (RLS) across the entire database.',
      'JWT authentication for all API endpoints.',
      'Progress photos stored privately with signed URLs (expire after 1 hour).',
      'Device PIN hashed with SHA-256 (no plaintext storage).',
    ],
    p4Title: '4. Your Rights',
    p4: [
      '<strong>Access:</strong> View all your personal data within the app.',
      '<strong>Export:</strong> Download data in JSON or CSV format (Settings → Security & Data).',
      '<strong>Edit:</strong> Update or delete your data at any time.',
      '<strong>Delete account:</strong> Permanently delete your account and all associated data.',
      '<strong>Withdraw consent:</strong> Stop sharing wearable data at any time.',
    ],
    p5Title: '5. Data Retention',
    p5: 'Data is stored on secure cloud infrastructure. When you delete your account, all data will be permanently deleted within 30 days.',
    p6Title: '6. Cookies & Tracking',
    p6: 'We only use essential technical cookies for authentication and session management. No advertising or third-party tracking cookies are used.',
    p7Title: '7. GDPR, CCPA & International Privacy Compliance',
    p7: [
      'We comply with the EU General Data Protection Regulation (GDPR). EU residents have the right to access, rectify, erase, restrict processing, and port their data.',
      'California residents are protected under the California Consumer Privacy Act (CCPA). You have the right to know what data is collected, request deletion, and opt out of data sales (we never sell data).',
      'We do not transfer personal data outside the storage region without appropriate safeguards (e.g., Standard Contractual Clauses).',
      'For UK users, we comply with the UK GDPR and Data Protection Act 2018.',
    ],
    // Health
    healthTitle: 'Health Disclaimer',
    healthWarning: `${APP_NAME} is NOT a medical device, does NOT replace professional medical advice, and must NOT be used to diagnose, treat, or prevent any medical condition.`,
    h1Title: '1. Limitation of Liability',
    h1: [
      'All information and suggestions in the app are for <strong>informational purposes only</strong>, not medical advice.',
      'AI suggestions are generated by machine learning algorithms, <strong>not by doctors or healthcare professionals</strong>.',
      'Biometric data (heart rate, SpO2, HRV) are estimates and <strong>do not have medical-grade accuracy</strong>.',
      'The Readiness Score is a composite indicator, <strong>not a health diagnosis</strong>.',
    ],
    h2Title: '2. Medical Disclaimer',
    h2Intro: '<strong>WE DISCLAIM ALL LIABILITY</strong> for any injury, health damage, or consequences arising from:',
    h2: [
      'Following nutrition or exercise suggestions from the app.',
      'Health decisions based on biometric data from the app.',
      'Using supplement suggestions without consulting a physician.',
      'Ignoring medical symptoms because app metrics appear "normal".',
    ],
    h3Title: '3. Important Warnings',
    h3: [
      '<strong>Always consult a physician</strong> before starting a new exercise or diet regimen.',
      '<strong>Stop exercising immediately</strong> if you experience pain, dizziness, or difficulty breathing.',
      '<strong>Do not self-administer</strong> supplements based on AI suggestions without consulting a professional.',
      'Individuals with a history of cardiovascular disease, diabetes, eating disorders, or who are pregnant <strong>must consult a physician</strong> before use.',
      'Children under 16 are not permitted to use the application.',
    ],
    h4Title: '4. Emergency Situations',
    h4: 'If you experience a medical emergency, <strong>call 911 (US), 999 (UK), 112 (EU), 115 (Vietnam), or your local emergency number immediately</strong>. DO NOT use the app to assess emergency situations.',
    h5Title: '5. FDA & International Regulatory Compliance',
    h5: [
      `${APP_NAME} has not been evaluated or approved by the FDA (U.S. Food and Drug Administration) or any health authority.`,
      'The app is not classified as a medical device under FDA regulations, EU MDR (Medical Device Regulation), UK MHRA, or TGA (Australia).',
      'Supplement suggestions have not been evaluated by any regulatory agency. These statements have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease.',
    ],
    // Data
    dataTitle: 'Data & AI Policy',
    d1Title: '1. AI Data Usage',
    d1: [
      'AI suggestions are generated based on data you provide (nutrition, workouts, sleep, biometrics).',
      'Data sent to AI is processed in real-time and is <strong>not stored</strong> by the AI provider.',
      'AI Coach conversation history is stored in your account and you can delete it at any time.',
    ],
    d2Title: '2. Data Sharing',
    d2Intro: 'Your data is <strong>NEVER</strong> shared with:',
    d2: ['Insurance companies.', 'Employers.', 'Third parties for advertising purposes.', 'Any organization not explicitly stated in this policy.'],
    d3Title: '3. Data Control',
    d3Intro: 'You have full control over your data:',
    d3: [
      '<strong>View:</strong> Access all stored data within the app.',
      '<strong>Export:</strong> Download all data in JSON/CSV format.',
      '<strong>Delete:</strong> Remove individual items or entire history.',
      '<strong>Disconnect:</strong> Unlink wearables at any time.',
    ],
    d4Title: '4. Sensitive Data Protection',
    d4Intro: 'Progress photos receive special protection:',
    d4: [
      'Stored in a private bucket (no public access).',
      'Displayed only via signed URLs with a 1-hour expiration.',
      'Only you can view your own photos (Row-Level Security).',
    ],
    d5Title: '5. Contact',
    d5: 'If you have questions about this policy, please contact us through the Support section in the app or email the support address provided in Settings.',
  },
};

// Helper to render HTML strings safely in a controlled context
const H = ({ html }: { html: string }) => (
  <p dangerouslySetInnerHTML={{ __html: `• ${html}` }} />
);
const P = ({ html }: { html: string }) => (
  <p dangerouslySetInnerHTML={{ __html: html }} />
);

export default function Legal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useAppSettings();
  const params = new URLSearchParams(location.search);
  const defaultTab = params.get('tab') || 'terms';
  const l = lang === 'en' ? i.en : i.vi;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 py-3">
          <motion.button onClick={() => navigate(-1)} whileTap={{ scale: 0.9 }} transition={spring}>
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </motion.button>
          <h1 className="text-base font-semibold text-foreground">{l.pageTitle}</h1>
        </div>
      </div>

      <div className="px-4 pt-4">
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="terms" className="text-[10px] px-1">{l.tabTerms}</TabsTrigger>
            <TabsTrigger value="privacy" className="text-[10px] px-1">{l.tabPrivacy}</TabsTrigger>
            <TabsTrigger value="health" className="text-[10px] px-1">{l.tabHealth}</TabsTrigger>
            <TabsTrigger value="data" className="text-[10px] px-1">{l.tabData}</TabsTrigger>
          </TabsList>

          {/* ===== TERMS ===== */}
          <TabsContent value="terms">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="metric-card space-y-0">
              <div className="flex items-center gap-2 mb-4">
                <Scale className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-bold text-foreground">{l.termsTitle}</h2>
              </div>
              <p className="text-[10px] text-muted-foreground mb-4">{l.effectiveDate}: {EFFECTIVE_DATE}</p>

              <Section title={l.t1Title}><p>{l.t1}</p></Section>
              <Section title={l.t2Title}><p>{l.t2}</p></Section>
              <Section title={l.t3Title}>{l.t3.map((t, i) => <p key={i}>• {t}</p>)}</Section>
              <Section title={l.t4Title}><p>{l.t4}</p></Section>
              <Section title={l.t5Title}>{l.t5.map((t, i) => <p key={i}>• {t}</p>)}</Section>
              <Section title={l.t6Title}><p>{l.t6}</p></Section>
              <Section title={l.t7Title}>{l.t7.map((t, i) => <H key={i} html={t} />)}</Section>
              <Section title={l.t8Title}>
                <P html={l.t8Intro} />
                {l.t8.map((t, i) => <p key={i}>• {t}</p>)}
              </Section>
              <Section title={l.t9Title}><p>{l.t9}</p></Section>
              <Section title={l.t10Title}>{l.t10.map((t, i) => <H key={i} html={t} />)}</Section>
              <Section title={l.t11Title}><p>{l.t11}</p></Section>
              <Section title={l.t12Title}><P html={l.t12} /></Section>
              <Section title={l.t13Title}><p>{l.t13}</p></Section>
            </motion.div>
          </TabsContent>

          {/* ===== PRIVACY ===== */}
          <TabsContent value="privacy">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="metric-card space-y-0">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-bold text-foreground">{l.privacyTitle}</h2>
              </div>
              <p className="text-[10px] text-muted-foreground mb-4">{l.effectiveDate}: {EFFECTIVE_DATE}</p>

              <Section title={l.p1Title}>{l.p1.map((t, i) => <P key={i} html={t} />)}</Section>
              <Section title={l.p2Title}>
                {l.p2.map((t, i) => <p key={i}>• {t}</p>)}
                <P html={l.p2Note} />
              </Section>
              <Section title={l.p3Title}>{l.p3.map((t, i) => <p key={i}>• {t}</p>)}</Section>
              <Section title={l.p4Title}>{l.p4.map((t, i) => <H key={i} html={t} />)}</Section>
              <Section title={l.p5Title}><p>{l.p5}</p></Section>
              <Section title={l.p6Title}><p>{l.p6}</p></Section>
              <Section title={l.p7Title}>{l.p7.map((t, i) => <p key={i}>• {t}</p>)}</Section>
            </motion.div>
          </TabsContent>

          {/* ===== HEALTH ===== */}
          <TabsContent value="health">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="metric-card space-y-0">
              <div className="flex items-center gap-2 mb-4">
                <Heart className="w-5 h-5 text-destructive" />
                <h2 className="text-sm font-bold text-foreground">{l.healthTitle}</h2>
              </div>

              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive font-medium">{l.healthWarning}</p>
                </div>
              </div>

              <Section title={l.h1Title}>{l.h1.map((t, i) => <H key={i} html={t} />)}</Section>
              <Section title={l.h2Title}>
                <P html={l.h2Intro} />
                {l.h2.map((t, i) => <p key={i}>• {t}</p>)}
              </Section>
              <Section title={l.h3Title}>{l.h3.map((t, i) => <H key={i} html={t} />)}</Section>
              <Section title={l.h4Title}><P html={l.h4} /></Section>
              <Section title={l.h5Title}>{l.h5.map((t, i) => <p key={i}>• {t}</p>)}</Section>
            </motion.div>
          </TabsContent>

          {/* ===== DATA ===== */}
          <TabsContent value="data">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="metric-card space-y-0">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-bold text-foreground">{l.dataTitle}</h2>
              </div>

              <Section title={l.d1Title}>{l.d1.map((t, i) => <H key={i} html={t} />)}</Section>
              <Section title={l.d2Title}>
                <P html={l.d2Intro} />
                {l.d2.map((t, i) => <p key={i}>• {t}</p>)}
              </Section>
              <Section title={l.d3Title}>
                <P html={l.d3Intro} />
                {l.d3.map((t, i) => <H key={i} html={t} />)}
              </Section>
              <Section title={l.d4Title}>
                <p>{l.d4Intro}</p>
                {l.d4.map((t, i) => <p key={i}>• {t}</p>)}
              </Section>
              <Section title={l.d5Title}><p>{l.d5}</p></Section>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
