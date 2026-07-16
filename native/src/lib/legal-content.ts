import type { AppLang } from './i18n';

/**
 * Legal content ported verbatim from the web app's Legal page (HTML
 * emphasis stripped for plain RN Text). Kept as structured data so the
 * Legal screen can render Terms / Privacy / Health / Data tabs. If the
 * canonical policy text changes on the web, mirror it here.
 */

const APP = 'ASCND';

export interface LegalBlock {
  title: string;
  intro?: string;
  body?: string;
  bullets?: string[];
}
export interface LegalDoc {
  title: string;
  blocks: LegalBlock[];
}
export interface LegalContent {
  pageTitle: string;
  tabTerms: string;
  tabPrivacy: string;
  tabHealth: string;
  tabData: string;
  terms: LegalDoc;
  privacy: LegalDoc;
  health: LegalDoc;
  data: LegalDoc;
}

const vi: LegalContent = {
  pageTitle: 'Chính sách & Pháp lý',
  tabTerms: 'Điều khoản',
  tabPrivacy: 'Riêng tư',
  tabHealth: 'Sức khoẻ',
  tabData: 'Dữ liệu',
  terms: {
    title: 'Điều khoản Sử dụng',
    blocks: [
      { title: '1. Chấp nhận Điều khoản', body: `Bằng việc tạo tài khoản, truy cập hoặc sử dụng ${APP} ("Dịch vụ"), bạn xác nhận rằng bạn đã đọc, hiểu và đồng ý bị ràng buộc bởi các Điều khoản Sử dụng này. Nếu bạn không đồng ý, vui lòng không sử dụng Dịch vụ.` },
      { title: '2. Mô tả Dịch vụ', body: `${APP} là ứng dụng hỗ trợ theo dõi sức khoẻ cá nhân: dinh dưỡng, tập luyện, giấc ngủ, biometric và các chỉ số thể chất, sử dụng AI để cung cấp gợi ý cá nhân hoá. Dịch vụ được lưu trữ trên máy chủ tại Hoa Kỳ.` },
      { title: '3. Tài khoản Người dùng', bullets: ['Bạn phải cung cấp thông tin chính xác khi đăng ký.', 'Bạn chịu trách nhiệm bảo mật thông tin đăng nhập.', 'Bạn phải đủ 16 tuổi trở lên để sử dụng dịch vụ.', 'Mỗi cá nhân chỉ được sở hữu một tài khoản.'] },
      { title: '4. Quyền Sở hữu Trí tuệ', body: `Tất cả nội dung, thiết kế, mã nguồn, thuật toán, mô hình AI và thương hiệu liên quan đến ${APP} là tài sản độc quyền của ${APP}. Bạn được cấp quyền sử dụng cá nhân, không độc quyền, không chuyển nhượng, có thể thu hồi.` },
      { title: '5. Hành vi bị Cấm', bullets: ['Sử dụng ứng dụng cho mục đích bất hợp pháp.', 'Cố gắng truy cập trái phép vào hệ thống.', 'Chia sẻ tài khoản hoặc thông tin đăng nhập.', 'Sao chép, phân phối hoặc sửa đổi nội dung ứng dụng.', 'Lạm dụng tính năng AI để tạo nội dung y tế sai lệch.'] },
      { title: '6. Chấm dứt Dịch vụ', body: 'Chúng tôi có quyền tạm ngưng hoặc chấm dứt tài khoản nếu phát hiện vi phạm điều khoản. Bạn có thể xoá tài khoản bất kỳ lúc nào trong phần Cài đặt.' },
      { title: '7. Giới hạn Trách nhiệm', bullets: [`Trong phạm vi tối đa được pháp luật cho phép, ${APP} không chịu trách nhiệm đối với bất kỳ thiệt hại gián tiếp, ngẫu nhiên, đặc biệt hoặc mang tính hệ quả nào, bao gồm mất lợi nhuận, mất dữ liệu, tổn thương thể chất hoặc tinh thần.`, `Trách nhiệm tối đa của ${APP} không vượt quá số tiền bạn đã thanh toán trong 12 tháng gần nhất hoặc 100 Đô-la Mỹ, tuỳ giá trị nào lớn hơn.`, 'Ứng dụng được cung cấp theo nguyên tắc "NGUYÊN TRẠNG" và "NHƯ SẴN CÓ", không có bất kỳ bảo đảm nào.'] },
      { title: '8. Luật Áp dụng', body: 'Các điều khoản này được điều chỉnh theo luật pháp Bang Delaware, Hoa Kỳ. Cư dân EU/EEA, Anh, Úc và Canada giữ nguyên các quyền bảo vệ người tiêu dùng bắt buộc theo pháp luật nước sở tại.' },
      { title: '9. Thay đổi Điều khoản', body: 'Chúng tôi có quyền sửa đổi các Điều khoản này. Thay đổi quan trọng sẽ được thông báo ít nhất 30 ngày trước khi có hiệu lực. Tiếp tục sử dụng đồng nghĩa với chấp nhận thay đổi.' },
    ],
  },
  privacy: {
    title: 'Chính sách Quyền riêng tư',
    blocks: [
      { title: '1. Dữ liệu chúng tôi Thu thập', bullets: ['Thông tin cá nhân: Tên, email, ngày sinh, giới tính, chiều cao, cân nặng.', 'Dữ liệu sức khoẻ: Bữa ăn, bài tập, giấc ngủ, nhịp tim, SpO2, HRV, cân nặng, ảnh tiến trình, lượng nước.', 'Dữ liệu thiết bị: Thông tin từ wearables được kết nối (nếu có).', 'Dữ liệu sử dụng: Tương tác với ứng dụng, tần suất sử dụng.'] },
      { title: '2. Mục đích Sử dụng', intro: 'Chúng tôi KHÔNG BAO GIỜ bán dữ liệu cá nhân cho bên thứ ba.', bullets: ['Cá nhân hoá trải nghiệm và gợi ý AI.', 'Theo dõi tiến trình và tạo báo cáo sức khoẻ.', 'Cải thiện chất lượng dịch vụ và thuật toán.', 'Đảm bảo an toàn tài khoản.'] },
      { title: '3. Bảo mật Dữ liệu', bullets: ['Mã hoá dữ liệu truyền tải (TLS/SSL).', 'Mã hoá dữ liệu lưu trữ (AES-256).', 'Row-Level Security (RLS) trên toàn bộ cơ sở dữ liệu.', 'Xác thực JWT cho mọi API.', 'Ảnh tiến trình lưu private với signed URLs (hết hạn sau 1 giờ).', 'Mã PIN thiết bị được hash SHA-256.'] },
      { title: '4. Quyền của Bạn', bullets: ['Truy cập: Xem toàn bộ dữ liệu cá nhân trong ứng dụng.', 'Xuất: Tải dữ liệu ở định dạng JSON hoặc CSV.', 'Chỉnh sửa: Cập nhật hoặc xoá dữ liệu bất kỳ lúc nào.', 'Xoá tài khoản: Xoá hoàn toàn tài khoản và toàn bộ dữ liệu.', 'Rút lại đồng ý: Ngừng chia sẻ dữ liệu wearable bất kỳ lúc nào.'] },
      { title: '5. Lưu trữ Dữ liệu', body: 'Khi bạn xoá tài khoản, toàn bộ dữ liệu sẽ bị xoá vĩnh viễn trong vòng 30 ngày.' },
      { title: '6. Tuân thủ Quốc tế', body: 'Chúng tôi tuân thủ GDPR (EU), CCPA (California), và các luật bảo vệ dữ liệu quốc tế tương ứng.' },
    ],
  },
  health: {
    title: 'Tuyên bố về Sức khoẻ',
    blocks: [
      { title: '⚠️ Cảnh báo', body: `${APP} KHÔNG PHẢI là thiết bị y tế, không thay thế tư vấn y khoa chuyên nghiệp, và không được sử dụng để chẩn đoán, điều trị hoặc phòng ngừa bất kỳ bệnh lý nào.` },
      { title: '1. Giới hạn Trách nhiệm', bullets: ['Mọi thông tin và gợi ý chỉ mang tính tham khảo, không phải lời khuyên y tế.', 'Gợi ý từ AI được tạo bởi thuật toán máy học, không phải bởi bác sĩ hoặc chuyên gia y tế.', 'Dữ liệu biometric (nhịp tim, SpO2, HRV) chỉ mang tính ước tính và không có độ chính xác y khoa.', 'Chỉ số Readiness Score là chỉ báo tổng hợp, không phải chẩn đoán sức khoẻ.'] },
      { title: '2. Từ chối Miễn trừ Trách nhiệm Y tế', intro: 'CHÚNG TÔI KHÔNG CHỊU TRÁCH NHIỆM đối với bất kỳ tổn thương hoặc hậu quả nào phát sinh từ:', bullets: ['Việc tuân theo gợi ý dinh dưỡng hoặc tập luyện từ ứng dụng.', 'Quyết định sức khoẻ dựa trên dữ liệu biometric của ứng dụng.', 'Sử dụng gợi ý thực phẩm bổ sung mà không tham khảo bác sĩ.', 'Bỏ qua triệu chứng bệnh lý vì chỉ số ứng dụng cho thấy "bình thường".'] },
      { title: '3. Khuyến cáo Quan trọng', bullets: ['Luôn tham khảo bác sĩ trước khi bắt đầu chế độ tập luyện hoặc ăn kiêng mới.', 'Ngừng tập ngay lập tức nếu cảm thấy đau, chóng mặt hoặc khó thở.', 'Không tự ý dùng thực phẩm bổ sung dựa trên gợi ý AI mà chưa hỏi chuyên gia.', 'Người có tiền sử bệnh tim mạch, tiểu đường, rối loạn ăn uống hoặc đang mang thai bắt buộc phải tham khảo bác sĩ.', 'Trẻ em dưới 16 tuổi không được sử dụng ứng dụng.'] },
      { title: '4. Trường hợp Khẩn cấp', body: 'Nếu bạn gặp tình trạng sức khoẻ khẩn cấp, hãy gọi số cấp cứu ngay lập tức: 911 (Hoa Kỳ & Canada), 999 (Anh), 112 (EU), 000 (Úc), 115 (Việt Nam). KHÔNG sử dụng ứng dụng để đánh giá tình trạng khẩn cấp.' },
      { title: '5. Tuân thủ FDA & Quy định', bullets: [`${APP} không được đánh giá hoặc phê duyệt bởi FDA hoặc bất kỳ cơ quan y tế nào.`, 'Ứng dụng không được phân loại là thiết bị y tế theo FDA, EU MDR, hoặc TGA.', 'Các gợi ý về thực phẩm bổ sung không được đánh giá bởi bất kỳ cơ quan quản lý nào.'] },
    ],
  },
  data: {
    title: 'Chính sách Dữ liệu & AI',
    blocks: [
      { title: '1. Dữ liệu AI', bullets: ['Gợi ý AI được tạo dựa trên dữ liệu bạn cung cấp.', 'Dữ liệu gửi đến AI được xử lý theo thời gian thực và không được lưu trữ bởi nhà cung cấp AI.', 'Lịch sử hội thoại AI Coach được lưu trong tài khoản của bạn và bạn có thể xoá bất kỳ lúc nào.'] },
      { title: '2. Chia sẻ Dữ liệu', intro: 'Dữ liệu của bạn KHÔNG BAO GIỜ được chia sẻ với:', bullets: ['Công ty bảo hiểm.', 'Nhà tuyển dụng.', 'Bên thứ ba vì mục đích quảng cáo.', 'Bất kỳ tổ chức nào không được nêu rõ trong chính sách này.'] },
      { title: '3. Quyền Kiểm soát Dữ liệu', bullets: ['Xem: Truy cập mọi dữ liệu đã lưu trong ứng dụng.', 'Xuất: Tải toàn bộ dữ liệu ở định dạng JSON/CSV.', 'Xoá: Xoá từng mục hoặc toàn bộ lịch sử.', 'Ngắt kết nối: Huỷ liên kết wearables bất kỳ lúc nào.'] },
      { title: '4. Bảo vệ Dữ liệu Nhạy cảm', intro: 'Ảnh tiến trình được bảo vệ đặc biệt:', bullets: ['Lưu trữ trong bucket private (không truy cập công khai).', 'Chỉ hiển thị qua signed URLs với thời hạn 1 giờ.', 'Chỉ bạn mới có thể xem ảnh của mình (Row-Level Security).'] },
      { title: '5. Liên hệ', body: 'Nếu có thắc mắc về chính sách này, vui lòng liên hệ qua phần Hỗ trợ trong ứng dụng.' },
    ],
  },
};

const en: LegalContent = {
  pageTitle: 'Policies & Legal',
  tabTerms: 'Terms',
  tabPrivacy: 'Privacy',
  tabHealth: 'Health',
  tabData: 'Data',
  terms: {
    title: 'Terms of Service',
    blocks: [
      { title: '1. Acceptance of Terms', body: `By creating an account, accessing, or using ${APP} (the "Service"), you acknowledge that you have read, understood, and agree to be bound by these Terms. If you do not agree to all of these Terms, do not use the Service.` },
      { title: '2. Description of Service', body: `${APP} is a personal health and fitness tracking application covering nutrition, exercise, sleep, biometrics, and physical metrics, using AI to provide personalized suggestions. The Service is hosted on servers located in the United States.` },
      { title: '3. Eligibility & Account', bullets: ['You must be at least 16 years of age to use the Service.', 'All information you provide during registration must be truthful and accurate.', 'You are responsible for the confidentiality and security of your login credentials.', 'Each individual may only maintain one account.'] },
      { title: '4. Intellectual Property', body: `All content, design, source code, algorithms, AI models, and trademarks associated with ${APP} are its exclusive property. You are granted a limited, personal, non-exclusive, non-transferable, revocable license for personal, non-commercial use.` },
      { title: '5. Prohibited Conduct', bullets: ['Using the Service for any unlawful or malicious purpose.', 'Attempting to gain unauthorized access to the Service or other accounts.', 'Reverse-engineering or deriving the source code of the Service.', 'Sharing, selling, or transferring your account or credentials.', 'Misusing AI features to generate misleading or harmful medical content.'] },
      { title: '6. Termination', body: 'We may suspend, restrict, or terminate your account for any breach of these Terms. You may delete your account at any time in Settings.' },
      { title: '7. Limitation of Liability', bullets: [`To the maximum extent permitted by law, ${APP} shall not be liable for any indirect, incidental, special, or consequential damages, including loss of profits, data, or physical or mental injury.`, `Total aggregate liability shall not exceed the amounts paid by you in the preceding 12 months, or USD $100.00, whichever is greater.`, 'The Service is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind.'] },
      { title: '8. Governing Law', body: 'These Terms are governed by the laws of the State of Delaware, USA. Consumers in the EU/EEA, UK, Australia, and Canada retain all mandatory consumer protection rights under their local law.' },
      { title: '9. Changes to Terms', body: 'We may modify these Terms at any time. Material changes will be notified at least 30 days before taking effect. Continued use constitutes acceptance.' },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    blocks: [
      { title: '1. Data We Collect', bullets: ['Personal information: name, email, date of birth, sex, height, weight.', 'Health & fitness data: meals, workouts, sleep, heart rate, SpO2, HRV, weight, progress photos, water, supplements.', 'Device & sensor data from connected wearables and health platforms.', 'Usage data: app interactions, feature usage, device type, anonymized IP, crash reports.'] },
      { title: '2. How We Use Your Data', intro: 'We will NEVER sell, rent, or trade your personal data for marketing or advertising.', bullets: ['Personalize your experience and generate AI suggestions.', 'Track progress and generate reports.', 'Improve Service quality and algorithms.', 'Ensure account security and prevent fraud.'] },
      { title: '3. Data Security', bullets: ['All data encrypted in transit (TLS 1.2+ / SSL).', 'Data encrypted at rest (AES-256).', 'Row-Level Security across the entire database.', 'JWT-based authentication for all API endpoints.', 'Progress photos in private buckets with signed URLs (1-hour expiry).', 'Device PIN hashed with SHA-256.'] },
      { title: '4. Your Rights', bullets: ['Access: view and obtain a copy of all your personal data.', 'Portability: export your data in JSON/CSV.', 'Rectification: update or correct data at any time.', 'Erasure: request permanent deletion of your account and data.', 'Withdraw consent: stop sharing wearable data at any time.'] },
      { title: '5. Data Retention', body: 'When you delete your account, all personal data is permanently deleted from our systems within 30 days.' },
      { title: '6. International Compliance', body: 'We comply with GDPR (EU/EEA), UK GDPR, CCPA/CPRA (California), PIPEDA (Canada), the Australian Privacy Act, and COPPA.' },
    ],
  },
  health: {
    title: 'Health Disclaimer',
    blocks: [
      { title: '⚠️ Warning', body: `${APP} is NOT a medical device. It does NOT provide medical advice, diagnosis, or treatment, and is NOT a substitute for professional medical advice. NEVER disregard professional medical advice because of information provided by the Service.` },
      { title: '1. No Medical Advice', bullets: ['All information and suggestions are for general informational and educational purposes only.', 'AI-generated suggestions are created by machine learning algorithms and are NOT reviewed by licensed physicians or dietitians.', 'Biometric data (heart rate, SpO2, HRV) are estimates only and DO NOT have clinical accuracy.', 'The Readiness Score is a wellness indicator only, NOT a clinical assessment or diagnosis.'] },
      { title: '2. Assumption of Risk', intro: 'By using the Service, you use it at your own risk and assume all risks, including:', bullets: ['Physical injury or illness from following exercise or nutrition suggestions.', 'Adverse outcomes from dietary changes, supplements, or exercise programs.', 'Misinterpretation of biometric data or AI recommendations.', 'Delayed or missed medical treatment due to reliance on the Service.'] },
      { title: '3. Critical Health Warnings', bullets: ['ALWAYS consult a qualified healthcare professional before starting any new exercise, diet, or supplement regimen.', 'STOP exercising immediately and seek care if you experience chest pain, dizziness, fainting, or shortness of breath.', 'DO NOT self-administer supplements based solely on AI recommendations.', 'Anyone with a pre-existing condition (cardiovascular disease, diabetes, eating disorders) or who is pregnant MUST consult a physician first.', 'The Service is not for individuals under 16 years of age.'] },
      { title: '4. Emergency Situations', body: 'In a medical emergency, CALL YOUR LOCAL EMERGENCY NUMBER IMMEDIATELY: 911 (US & Canada), 999 (UK), 112 (EU), 000 (Australia), 111 (NZ). DO NOT use the Service to manage a medical emergency.' },
      { title: '5. Regulatory Compliance', bullets: [`${APP} has not been evaluated, cleared, or approved by the FDA or any health authority.`, 'The Service is not classified as a medical device under FDA, EU MDR, UK MHRA, or TGA rules.', 'Supplement-related content has not been evaluated by any regulatory agency.'] },
    ],
  },
  data: {
    title: 'Data & AI Policy',
    blocks: [
      { title: '1. AI Data Usage', bullets: ['AI suggestions are generated from data you voluntarily provide.', 'Data sent to AI models is processed in real-time and is NOT persistently stored by the AI provider.', 'AI Coach conversation history is stored in your account and can be permanently deleted at any time.'] },
      { title: '2. Data Sharing', intro: 'Your personal data is NEVER sold, rented, traded, or shared with:', bullets: ['Insurance companies or underwriters.', 'Employers or recruiters.', 'Data brokers or advertising networks.', 'Third parties for marketing or commercial purposes.'] },
      { title: '3. Data Control', bullets: ['View: access all stored data in the app.', 'Export: download a complete copy in JSON/CSV.', 'Delete: remove individual entries or your complete history.', 'Disconnect: unlink connected wearables at any time.'] },
      { title: '4. Sensitive Data Protection', intro: 'Progress photos and biometric data receive enhanced protection:', bullets: ['Stored in private, access-controlled buckets.', 'Displayed only via signed URLs with 1-hour expiration.', 'Row-Level Security ensures only you can access your data.'] },
      { title: '5. Contact', body: 'For questions about this policy or to exercise your data rights, contact us through the Support section in the app.' },
    ],
  },
};

export function getLegal(lang: AppLang): LegalContent {
  return lang === 'vi' ? vi : en;
}
