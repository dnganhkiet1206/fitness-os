import { motion } from 'framer-motion';
import { ChevronLeft, Shield, FileText, Scale, Heart, AlertTriangle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppSettings } from '@/hooks/useAppSettings';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };
const EFFECTIVE_DATE = '2026-02-12';
const APP_NAME = 'ASCND';

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
    t1: `Bằng việc tạo tài khoản, truy cập hoặc sử dụng ${APP_NAME} ("Dịch vụ"), bạn xác nhận rằng bạn đã đọc, hiểu và đồng ý bị ràng buộc bởi các Điều khoản Sử dụng này. Các Điều khoản này tạo thành thoả thuận pháp lý ràng buộc giữa bạn và ${APP_NAME}. NẾU BẠN KHÔNG ĐỒNG Ý, VUI LÒNG KHÔNG SỬ DỤNG DỊCH VỤ.`,
    t2Title: '2. Mô tả Dịch vụ',
    t2: `${APP_NAME} là ứng dụng hỗ trợ theo dõi sức khoẻ cá nhân bao gồm: dinh dưỡng, tập luyện, giấc ngủ, biometric và các chỉ số thể chất. Ứng dụng sử dụng trí tuệ nhân tạo (AI) để cung cấp gợi ý cá nhân hoá. Dịch vụ được lưu trữ trên máy chủ tại <strong>Hoa Kỳ</strong>.`,
    t3Title: '3. Tài khoản Người dùng',
    t3: [
      'Bạn phải cung cấp thông tin chính xác khi đăng ký.',
      'Bạn chịu trách nhiệm bảo mật thông tin đăng nhập.',
      'Bạn phải đủ 16 tuổi trở lên để sử dụng dịch vụ.',
      'Mỗi cá nhân chỉ được sở hữu một tài khoản.',
    ],
    t4Title: '4. Quyền Sở hữu Trí tuệ',
    t4: `Tất cả nội dung, thiết kế, mã nguồn, thuật toán, mô hình AI, thương hiệu và bí mật thương mại liên quan đến ${APP_NAME} là tài sản độc quyền của ${APP_NAME}, được bảo vệ theo luật sở hữu trí tuệ Hoa Kỳ và quốc tế. Bạn được cấp quyền sử dụng cá nhân, không độc quyền, không chuyển nhượng, có thể thu hồi.`,
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
      `TRONG PHẠM VI TỐI ĐA ĐƯỢC PHÁP LUẬT CHO PHÉP, TRONG MỌI TRƯỜNG HỢP, ${APP_NAME}, công ty mẹ, công ty con, chi nhánh, giám đốc, nhân viên, đại lý hoặc bên cấp phép (gọi chung là "Các Bên Được Miễn Trừ") <strong>KHÔNG CHỊU TRÁCH NHIỆM</strong> đối với bất kỳ thiệt hại gián tiếp, ngẫu nhiên, đặc biệt, mang tính hệ quả, mang tính trừng phạt hoặc mang tính răn đe nào, bao gồm nhưng không giới hạn: mất lợi nhuận, mất dữ liệu, mất uy tín, tổn thương thể chất hoặc tinh thần.`,
      `Trách nhiệm tối đa của ${APP_NAME} đối với bạn <strong>không vượt quá</strong>: (A) số tiền bạn đã thanh toán cho dịch vụ trong <strong>12 tháng</strong> gần nhất; hoặc (B) <strong>100 Đô-la Mỹ (USD $100.00)</strong>, tuỳ giá trị nào lớn hơn.`,
      'Ứng dụng được cung cấp theo nguyên tắc <strong>"NGUYÊN TRẠNG" (AS IS)</strong> và <strong>"NHƯ SẴN CÓ" (AS AVAILABLE)</strong>, không có bất kỳ bảo đảm nào, dù rõ ràng hay ngụ ý, bao gồm bảo đảm về tính thương mại, phù hợp cho mục đích cụ thể, quyền sở hữu và không vi phạm.',
      'Một số khu vực pháp lý không cho phép loại trừ hoặc giới hạn một số thiệt hại nhất định. Tại các khu vực đó, các giới hạn trên sẽ được áp dụng ở mức tối đa mà pháp luật cho phép.',
    ],
    t8Title: '8. Bồi thường (Indemnification)',
    t8Intro: `Trong phạm vi tối đa được pháp luật cho phép, bạn đồng ý bồi thường, bảo vệ và giữ cho ${APP_NAME} và Các Bên Được Miễn Trừ không bị tổn hại bởi bất kỳ khiếu nại, yêu cầu, kiện tụng, trách nhiệm, thiệt hại, tổn thất, chi phí và phí tổn (bao gồm phí luật sư hợp lý) phát sinh từ:`,
    t8: [
      'Việc bạn vi phạm hoặc bị cáo buộc vi phạm bất kỳ điều khoản nào trong Thoả thuận này.',
      'Việc bạn truy cập hoặc sử dụng Dịch vụ, bao gồm mọi dữ liệu hoặc nội dung bạn truyền tải hoặc nhận.',
      'Bất kỳ quyết định về sức khoẻ, thể chất hoặc dinh dưỡng nào bạn đưa ra dựa trên thông tin từ Dịch vụ.',
      'Việc bạn vi phạm quyền của bên thứ ba, bao gồm quyền sở hữu trí tuệ, quyền riêng tư.',
      'Bất kỳ nội dung, thông tin hoặc dữ liệu bạn gửi, đăng tải hoặc truyền qua Dịch vụ.',
      'Việc bạn vi phạm bất kỳ luật, quy định hoặc lệnh nào có hiệu lực.',
    ],
    t9Title: '9. Bất khả kháng (Force Majeure)',
    t9: 'Không bên nào chịu trách nhiệm cho bất kỳ sự thất bại hoặc chậm trễ trong việc thực hiện nghĩa vụ do các nguyên nhân ngoài tầm kiểm soát hợp lý, bao gồm nhưng không giới hạn: thiên tai, chiến tranh, khủng bố, cấm vận, hành động của chính quyền dân sự hoặc quân sự, hoả hoạn, lũ lụt, dịch bệnh hoặc đại dịch, sự cố hạ tầng internet hoặc viễn thông, tấn công mạng, mất điện, thay đổi luật pháp, hoặc lệnh của cơ quan nhà nước.',
    t10Title: '10. Luật Áp dụng & Giải quyết Tranh chấp',
    t10: [
      'Các điều khoản này được điều chỉnh và giải thích theo <strong>luật pháp của Bang Delaware, Hoa Kỳ</strong>, không áp dụng các nguyên tắc xung đột pháp luật.',
      `<strong>TRỌNG TÀI RÀNG BUỘC:</strong> Mọi tranh chấp, khiếu nại hoặc bất đồng phát sinh từ hoặc liên quan đến các Điều khoản này hoặc Dịch vụ sẽ được giải quyết bằng <strong>trọng tài cá nhân ràng buộc</strong> do <strong>Hiệp hội Trọng tài Hoa Kỳ ("AAA")</strong> quản lý theo Quy tắc Trọng tài Tiêu dùng hiện hành. Trọng tài sẽ được tiến hành bằng <strong>tiếng Anh</strong> tại <strong>Wilmington, Delaware, Hoa Kỳ</strong>. Quyết định của trọng tài viên là chung thẩm và có giá trị ràng buộc.`,
      `<strong>TỪ BỎ QUYỀN KIỆN TẬP THỂ:</strong> BẠN VÀ ${APP_NAME} ĐỒNG Ý RẰNG MỖI BÊN CHỈ CÓ THỂ ĐƯA RA KHIẾU NẠI ĐỐI VỚI BÊN KIA VỚI TƯ CÁCH CÁ NHÂN, KHÔNG PHẢI VỚI TƯ CÁCH NGUYÊN ĐƠN HOẶC THÀNH VIÊN TRONG BẤT KỲ VỤ KIỆN TẬP THỂ, HỢP NHẤT HOẶC ĐẠI DIỆN NÀO.`,
      `<strong>TỪ BỎ QUYỀN XÉT XỬ BỒI THẨM ĐOÀN:</strong> TRONG PHẠM VI ĐƯỢC PHÁP LUẬT CHO PHÉP, BẠN VÀ ${APP_NAME} TỪ BỎ QUYỀN ĐƯỢC XÉT XỬ BỞI BỒI THẨM ĐOÀN ĐỐI VỚI BẤT KỲ TRANH CHẤP NÀO PHÁT SINH TỪ CÁC ĐIỀU KHOẢN NÀY HOẶC DỊCH VỤ.`,
      '<strong>Ngoại lệ:</strong> Mỗi bên có thể yêu cầu biện pháp khẩn cấp tạm thời hoặc lệnh cấm tại bất kỳ toà án có thẩm quyền nào để ngăn chặn việc vi phạm quyền sở hữu trí tuệ.',
      '<strong>Cư dân EU/EEA:</strong> Nếu bạn là người tiêu dùng tại EU/EEA, bạn cũng có thể khởi kiện tại toà án nước cư trú. Bạn có quyền nộp đơn khiếu nại lên cơ quan bảo vệ dữ liệu địa phương hoặc sử dụng nền tảng Giải quyết Tranh chấp Trực tuyến EU.',
      '<strong>Cư dân Anh Quốc:</strong> Nếu bạn là người tiêu dùng tại Vương quốc Anh, bạn giữ nguyên mọi quyền bắt buộc theo luật bảo vệ người tiêu dùng Anh Quốc.',
      '<strong>Cư dân Úc:</strong> Không điều khoản nào trong Thoả thuận này loại trừ, hạn chế hoặc sửa đổi bất kỳ quyền bảo vệ người tiêu dùng nào theo Luật Tiêu dùng Úc mà không thể loại trừ theo thoả thuận.',
      '<strong>Cư dân Canada:</strong> Nếu bạn cư trú tại Canada, tranh chấp có thể tuân theo luật pháp của tỉnh bạn cư trú, và bạn giữ nguyên mọi quyền theo luật bảo vệ người tiêu dùng liên bang và cấp tỉnh.',
    ],
    t11Title: '11. Điều khoản Tách rời (Severability)',
    t11: 'Nếu bất kỳ điều khoản nào trong Thoả thuận này bị tuyên bố vô hiệu, bất hợp pháp hoặc không thể thi hành bởi toà án hoặc trọng tài viên có thẩm quyền, điều khoản đó sẽ được sửa đổi ở mức tối thiểu cần thiết để có hiệu lực, hoặc nếu không thể sửa đổi, sẽ bị tách rời. Sự vô hiệu của bất kỳ điều khoản nào không ảnh hưởng đến hiệu lực của các điều khoản còn lại.',
    t12Title: '12. Toàn bộ Thoả thuận',
    t12: `Các điều khoản này, cùng với Chính sách Quyền riêng tư, Tuyên bố Sức khoẻ và Chính sách Dữ liệu & AI, tạo thành <strong>toàn bộ thoả thuận</strong> giữa bạn và ${APP_NAME} liên quan đến Dịch vụ và thay thế mọi thoả thuận trước đó, dù bằng lời nói hay văn bản.`,
    t13Title: '13. Thay đổi Điều khoản',
    t13: 'Chúng tôi có quyền sửa đổi các Điều khoản này bất kỳ lúc nào. Các thay đổi quan trọng sẽ được thông báo qua ứng dụng hoặc email ít nhất <strong>30 ngày</strong> trước khi có hiệu lực. Việc tiếp tục sử dụng Dịch vụ sau ngày có hiệu lực đồng nghĩa với việc bạn chấp nhận các thay đổi. Nếu không đồng ý, bạn phải ngừng sử dụng và xoá tài khoản.',
    t14Title: '14. Chính sách DMCA & Bản quyền',
    t14: `${APP_NAME} tôn trọng quyền sở hữu trí tuệ và tuân thủ Đạo luật Bản quyền Kỹ thuật số Thiên niên kỷ ("DMCA"). Nếu bạn tin rằng bất kỳ nội dung nào trên Dịch vụ vi phạm bản quyền của bạn, vui lòng gửi thông báo bằng văn bản cho đại diện DMCA của chúng tôi.`,
    t15Title: '15. Tuân thủ Xuất khẩu',
    t15: 'Bạn đồng ý tuân thủ tất cả các luật và quy định kiểm soát xuất khẩu và trừng phạt của Hoa Kỳ và quốc tế. Bạn không được truy cập hoặc sử dụng Dịch vụ nếu bạn ở quốc gia bị cấm vận bởi Chính phủ Hoa Kỳ hoặc nằm trong danh sách bị cấm hoặc hạn chế.',
    t16Title: '16. Chuyển nhượng',
    t16: `Bạn không được chuyển nhượng hoặc chuyển giao các Điều khoản này mà không có sự đồng ý bằng văn bản của ${APP_NAME}. ${APP_NAME} có thể tự do chuyển nhượng mà không bị hạn chế.`,
    t17Title: '17. Từ bỏ Quyền',
    t17: `Việc ${APP_NAME} không thực thi bất kỳ quyền hoặc điều khoản nào không cấu thành việc từ bỏ quyền hoặc điều khoản đó. Mọi sự từ bỏ phải bằng văn bản và được ký bởi đại diện có thẩm quyền.`,
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
    h4: 'Nếu bạn gặp tình trạng sức khoẻ khẩn cấp, <strong>hãy gọi số cấp cứu ngay lập tức</strong>: <strong>911</strong> (Hoa Kỳ & Canada), <strong>999</strong> (Anh), <strong>112</strong> (EU), <strong>000</strong> (Úc), <strong>115</strong> (Việt Nam). <strong>KHÔNG</strong> sử dụng ứng dụng để đánh giá tình trạng khẩn cấp.',
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
    t1: `By creating an account, accessing, or using ${APP_NAME} (the "Service"), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service ("Terms"). These Terms constitute a legally binding agreement between you and ${APP_NAME}. IF YOU DO NOT AGREE TO ALL OF THESE TERMS, DO NOT USE THE SERVICE.`,
    t2Title: '2. Description of Service',
    t2: `${APP_NAME} is a personal health and fitness tracking application covering nutrition, exercise, sleep, biometrics, and physical metrics. The application uses artificial intelligence (AI) to provide personalized suggestions. The Service is hosted on servers located in the <strong>United States of America</strong>.`,
    t3Title: '3. Eligibility & User Account',
    t3: [
      'You must be at least <strong>16 years of age</strong> (or <strong>13 with verifiable parental consent</strong> where required by COPPA) to use the Service.',
      'You represent and warrant that all information you provide during registration is truthful, accurate, and complete.',
      'You are solely responsible for maintaining the confidentiality and security of your login credentials.',
      'You agree to immediately notify us of any unauthorized use of your account.',
      'Each individual may only maintain one account. Duplicate accounts may be terminated without notice.',
    ],
    t4Title: '4. Intellectual Property',
    t4: `All content, design, source code, algorithms, AI models, trademarks, trade names, and trade secrets associated with ${APP_NAME} are the exclusive property of ${APP_NAME} and its licensors, protected under U.S. and international copyright, trademark, and intellectual property laws. You are granted a limited, personal, non-exclusive, non-transferable, revocable license to use the Service solely for your personal, non-commercial use. Any unauthorized reproduction, modification, distribution, or commercial exploitation is strictly prohibited and may result in civil and criminal penalties.`,
    t5Title: '5. Prohibited Conduct',
    t5: [
      'Using the Service for any unlawful, fraudulent, or malicious purpose.',
      'Attempting to gain unauthorized access to the Service, other user accounts, or related systems.',
      'Reverse-engineering, decompiling, disassembling, or attempting to derive the source code of the Service.',
      'Sharing, selling, or transferring your account or login credentials to any third party.',
      'Copying, distributing, sublicensing, or creating derivative works from any part of the Service.',
      'Misusing AI features to generate misleading, harmful, or false medical content.',
      'Using automated scripts, bots, crawlers, or scrapers to access the Service.',
      'Transmitting any viruses, worms, malware, or other harmful code.',
      'Interfering with or disrupting the integrity or performance of the Service.',
    ],
    t6Title: '6. Termination',
    t6: 'We reserve the right, in our sole discretion, to suspend, restrict, or terminate your account and access to the Service, with or without notice, for any reason, including but not limited to a breach of these Terms. Upon termination, your right to use the Service ceases immediately. You may delete your account at any time in Settings. Sections that by their nature should survive termination (including Limitation of Liability, Indemnification, Governing Law, and Dispute Resolution) shall survive.',
    t7Title: '7. LIMITATION OF LIABILITY',
    t7: [
      `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ${APP_NAME}, ITS PARENT COMPANIES, SUBSIDIARIES, AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS (COLLECTIVELY, THE "RELEASED PARTIES") BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, GOODWILL, DATA, USE, OR OTHER INTANGIBLE LOSSES, WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY, OR ANY OTHER LEGAL THEORY, EVEN IF THE RELEASED PARTIES HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.`,
      `THE RELEASED PARTIES' TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THE SERVICE SHALL NOT EXCEED THE GREATER OF: (A) THE AMOUNTS ACTUALLY PAID BY YOU TO ${APP_NAME} FOR THE SERVICE DURING THE <strong>TWELVE (12) MONTHS</strong> IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM; OR (B) <strong>ONE HUNDRED U.S. DOLLARS (USD $100.00)</strong>.`,
      'THE SERVICE IS PROVIDED ON AN <strong>"AS IS"</strong> AND <strong>"AS AVAILABLE"</strong> BASIS. THE RELEASED PARTIES EXPRESSLY DISCLAIM ALL WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.',
      'THE RELEASED PARTIES DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.',
      'SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES. IN SUCH JURISDICTIONS, THE ABOVE LIMITATIONS SHALL APPLY TO THE MAXIMUM EXTENT PERMITTED BY LAW. FOR CONSUMERS IN THE EU/EEA, UK, AND AUSTRALIA, NOTHING IN THESE TERMS LIMITS OR EXCLUDES LIABILITY THAT CANNOT BE LIMITED OR EXCLUDED UNDER APPLICABLE MANDATORY CONSUMER PROTECTION LAWS.',
    ],
    t8Title: '8. Indemnification',
    t8Intro: `To the fullest extent permitted by applicable law, you agree to indemnify, defend, and hold harmless ${APP_NAME} and the Released Parties from and against any and all claims, demands, actions, suits, liabilities, damages, losses, costs, and expenses (including reasonable attorneys' fees and court costs) arising out of or relating to:`,
    t8: [
      'Your breach or alleged breach of any provision of these Terms.',
      'Your access to or use of the Service, including any data or content transmitted or received by you.',
      'Any health, fitness, or dietary decisions you make based on information provided by the Service.',
      'Your violation of any third-party rights, including intellectual property, privacy, or publicity rights.',
      'Any content, information, or data you submit, post, or transmit through the Service.',
      'Your violation of any applicable law, regulation, or order.',
    ],
    t9Title: '9. Force Majeure',
    t9: 'Neither party shall be liable for any failure or delay in performance resulting from causes beyond its reasonable control, including but not limited to: acts of God, natural disasters, war, terrorism, riots, embargoes, acts of civil or military authorities, fire, floods, epidemics or pandemics, internet or telecommunications infrastructure failures, cyberattacks, power outages, changes in applicable law, or government orders or restrictions.',
    t10Title: '10. Governing Law & Dispute Resolution',
    t10: [
      'These Terms shall be governed by and construed in accordance with the <strong>laws of the State of Delaware, United States of America</strong>, without regard to its conflict of law provisions.',
      '<strong>BINDING ARBITRATION:</strong> Any dispute, claim, or controversy arising out of or relating to these Terms or the Service shall be resolved by <strong>binding individual arbitration</strong> administered by the <strong>American Arbitration Association ("AAA")</strong> under its Consumer Arbitration Rules then in effect. The arbitration shall be conducted in <strong>English</strong> and held in <strong>Wilmington, Delaware, USA</strong>, or at another mutually agreed location. The arbitrator\'s decision shall be final and binding and may be entered as a judgment in any court of competent jurisdiction.',
      '<strong>CLASS ACTION WAIVER:</strong> YOU AND ${APP_NAME} AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION OR PROCEEDING. THE ARBITRATOR MAY NOT CONSOLIDATE MORE THAN ONE PERSON\'S CLAIMS AND MAY NOT OTHERWISE PRESIDE OVER ANY FORM OF A CLASS OR REPRESENTATIVE PROCEEDING.',
      '<strong>JURY TRIAL WAIVER:</strong> TO THE EXTENT PERMITTED BY APPLICABLE LAW, YOU AND ${APP_NAME} EACH WAIVE THE RIGHT TO A JURY TRIAL FOR ANY DISPUTE ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE.',
      '<strong>Exceptions:</strong> Either party may seek injunctive or equitable relief in any court of competent jurisdiction to prevent the actual or threatened infringement or misappropriation of intellectual property rights.',
      '<strong>EU/EEA Residents:</strong> If you are a consumer in the EU/EEA, you may also bring proceedings in the courts of your country of residence. Nothing in this clause limits your right to file a complaint with your local data protection authority or use the EU Online Dispute Resolution platform (https://ec.europa.eu/consumers/odr).',
      '<strong>UK Residents:</strong> If you are a consumer in the United Kingdom, you retain any mandatory legal rights under UK consumer law. Disputes may also be resolved through UK courts.',
      '<strong>Australian Residents:</strong> Nothing in these Terms excludes, restricts, or modifies any consumer guarantee, right, or remedy conferred by the Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010) that cannot be excluded, restricted, or modified by agreement.',
      '<strong>Canadian Residents:</strong> If you reside in Canada, disputes may be subject to the laws of the province in which you reside, and you retain all rights under applicable federal and provincial consumer protection legislation.',
    ],
    t11Title: '11. Severability',
    t11: 'If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court or arbitrator of competent jurisdiction, such provision shall be modified to the minimum extent necessary to make it valid and enforceable, or if modification is not possible, shall be severed. The invalidity of any provision shall not affect the validity or enforceability of the remaining provisions, which shall continue in full force and effect.',
    t12Title: '12. Entire Agreement',
    t12: `These Terms, together with the Privacy Policy, Health Disclaimer, and Data & AI Policy, constitute the <strong>entire agreement</strong> between you and ${APP_NAME} with respect to the Service and supersede all prior or contemporaneous communications, representations, or agreements, whether oral or written.`,
    t13Title: '13. Changes to Terms',
    t13: 'We reserve the right to modify these Terms at any time. Material changes will be notified via the application or by email at least <strong>30 days</strong> before taking effect. Your continued use of the Service after the effective date of any modifications constitutes your acceptance of the revised Terms. If you do not agree with the modifications, you must stop using the Service and delete your account.',
    t14Title: '14. DMCA & Copyright Policy',
    t14: `${APP_NAME} respects the intellectual property rights of others and complies with the Digital Millennium Copyright Act ("DMCA"). If you believe that any content on the Service infringes your copyright, please submit a written notice to our designated DMCA agent containing: (1) identification of the copyrighted work claimed to have been infringed; (2) identification of the allegedly infringing material; (3) your contact information; (4) a statement of good faith belief; (5) a statement of accuracy under penalty of perjury; and (6) your physical or electronic signature.`,
    t15Title: '15. Export Compliance',
    t15: 'You agree to comply with all applicable U.S. and international export control and sanctions laws and regulations. You may not access or use the Service if you are located in, or are a national or resident of, any country subject to U.S. government embargo, or if you are on any U.S. government list of prohibited or restricted parties.',
    t16Title: '16. Assignment',
    t16: `You may not assign or transfer these Terms, or any rights or obligations hereunder, without the prior written consent of ${APP_NAME}. ${APP_NAME} may freely assign these Terms without restriction. Any attempted assignment in violation of this section shall be null and void.`,
    t17Title: '17. Waiver',
    t17: `The failure of ${APP_NAME} to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision. Any waiver must be in writing and signed by an authorized representative of ${APP_NAME}.`,
    // Privacy
    privacyTitle: 'Privacy Policy',
    p1Title: '1. Data We Collect',
    p1: [
      '<strong>Personal information:</strong> Name, email address, date of birth, sex, height, weight.',
      '<strong>Health & fitness data:</strong> Meals, workouts, sleep patterns, heart rate, SpO2, HRV, body weight, progress photos, water intake, supplement logs.',
      '<strong>Device & sensor data:</strong> Information from connected wearables and health platforms (e.g., Apple Health, Google Health Connect).',
      '<strong>Usage data:</strong> App interactions, feature usage frequency, device type, operating system, IP address (anonymized), crash reports.',
    ],
    p2Title: '2. How We Use Your Data',
    p2: [
      'Personalize your experience and generate AI-powered suggestions.',
      'Track progress and generate health and fitness reports.',
      'Improve Service quality, algorithms, and user experience.',
      'Ensure account security and prevent fraud.',
      'Comply with legal obligations and enforce our Terms.',
    ],
    p2Note: 'We will <strong>NEVER</strong> sell, rent, or trade your personal data to any third party for marketing or advertising purposes.',
    p3Title: '3. Data Security',
    p3: [
      'All data encrypted in transit using TLS 1.2+ / SSL.',
      'Data encrypted at rest using AES-256 encryption.',
      'Row-Level Security (RLS) enforced across the entire database.',
      'JWT-based authentication for all API endpoints.',
      'Progress photos stored in private storage buckets with signed URLs (expire after 1 hour).',
      'Device PIN hashed with SHA-256 (no plaintext storage).',
      'Regular security audits and vulnerability assessments.',
      'Data hosted on secure cloud infrastructure in the <strong>United States</strong>.',
    ],
    p4Title: '4. Your Rights',
    p4: [
      '<strong>Right to Access:</strong> View and obtain a copy of all personal data we hold about you.',
      '<strong>Right to Portability:</strong> Export your data in machine-readable format (JSON/CSV) via Settings → Security & Data.',
      '<strong>Right to Rectification:</strong> Update or correct inaccurate personal data at any time.',
      '<strong>Right to Erasure ("Right to be Forgotten"):</strong> Request permanent deletion of your account and all associated data.',
      '<strong>Right to Restrict Processing:</strong> Limit how we process your data in certain circumstances.',
      '<strong>Right to Object:</strong> Object to data processing based on legitimate interests.',
      '<strong>Right to Withdraw Consent:</strong> Withdraw consent for data processing at any time without affecting the lawfulness of prior processing.',
      '<strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising any of your privacy rights.',
    ],
    p5Title: '5. Data Retention & Deletion',
    p5: 'Personal data is retained only for as long as necessary to provide the Service or as required by applicable law. When you delete your account, all personal data will be permanently and irreversibly deleted from our systems within <strong>30 days</strong>. Anonymized, aggregated data that cannot be used to identify you may be retained for analytical purposes.',
    p6Title: '6. Cookies & Tracking',
    p6: 'We use only essential, strictly necessary cookies for authentication and session management. We do <strong>NOT</strong> use advertising cookies, tracking pixels, or third-party analytics trackers. We do not engage in cross-site tracking or behavioral advertising.',
    p7Title: '7. International Privacy Compliance',
    p7: [
      '<strong>GDPR (EU/EEA):</strong> We comply with the EU General Data Protection Regulation. EU/EEA residents have the right to access, rectify, erase, restrict processing, data portability, and object to processing. Our legal basis for processing is consent and legitimate interest. For cross-border data transfers from the EU/EEA to the US, we rely on Standard Contractual Clauses (SCCs) approved by the European Commission.',
      '<strong>UK GDPR:</strong> We comply with the UK General Data Protection Regulation and the Data Protection Act 2018. UK residents retain all rights afforded under UK data protection law. For transfers from the UK, we use the UK International Data Transfer Agreement (IDTA).',
      '<strong>CCPA / CPRA (California, USA):</strong> California residents have the right to know what personal information is collected, to request deletion, to opt out of the sale or sharing of personal information, and to non-discrimination. We do not sell or share (as defined by CCPA/CPRA) your personal information. To exercise your rights, contact us via the app or email.',
      '<strong>PIPEDA (Canada):</strong> We comply with Canada\'s Personal Information Protection and Electronic Documents Act. Canadian residents have the right to access, correct, and challenge the accuracy of their personal information. We obtain meaningful consent before collecting, using, or disclosing personal information.',
      '<strong>Australian Privacy Act:</strong> We comply with the Australian Privacy Principles (APPs) under the Privacy Act 1988. Australian residents can access and correct their personal information. We will not disclose personal information to overseas recipients without ensuring compliance with the APPs.',
      '<strong>Children\'s Privacy (COPPA):</strong> We do not knowingly collect personal information from children under 13 in the United States without verifiable parental consent. If we learn that we have collected data from a child under 13, we will promptly delete it. Users aged 13-15 may require parental consent depending on jurisdiction.',
    ],
    p8Title: '8. Data Breach Notification',
    p8: 'In the event of a data breach that may compromise your personal information, we will notify affected users and relevant authorities as required by applicable law (including GDPR within 72 hours, and applicable US state breach notification laws) via email and/or in-app notification.',
    p9Title: '9. Third-Party Services',
    p9: 'The Service may integrate with third-party services (e.g., health platforms, AI providers). Data shared with third-party services is governed by their respective privacy policies. We select providers that meet our security and privacy standards, and we require contractual data protection obligations through Data Processing Agreements (DPAs).',
    p10Title: '10. Contact & Data Protection Officer',
    p10: 'If you have questions about this Privacy Policy or wish to exercise your privacy rights, contact us through the Support section in the app or email the support address provided in Settings. For EU/EEA and UK users, you have the right to lodge a complaint with your local supervisory data protection authority.',
    // Health
    healthTitle: 'Health Disclaimer',
    healthWarning: `${APP_NAME} is NOT a medical device. It does NOT provide medical advice, diagnosis, or treatment. It is NOT a substitute for professional medical advice, diagnosis, or treatment. NEVER disregard professional medical advice or delay seeking it because of information provided by the Service.`,
    h1Title: '1. No Medical Advice',
    h1: [
      'All information, content, and suggestions provided by the Service are for <strong>general informational and educational purposes only</strong> and do not constitute medical advice.',
      'AI-generated suggestions are created by machine learning algorithms and <strong>are NOT reviewed, verified, or endorsed by licensed physicians, registered dietitians, or certified healthcare professionals</strong>.',
      'Biometric data (heart rate, SpO2, HRV, respiratory rate) are <strong>estimates only</strong> and <strong>DO NOT have clinical or medical-grade accuracy</strong>. They should not be relied upon for medical decisions.',
      'The Readiness Score and all composite metrics are wellness indicators only and <strong>are NOT clinical health assessments or diagnoses</strong>.',
    ],
    h2Title: '2. ASSUMPTION OF RISK & WAIVER',
    h2Intro: '<strong>BY USING THE SERVICE, YOU EXPRESSLY ACKNOWLEDGE AND AGREE THAT YOU USE THE SERVICE AT YOUR OWN RISK. YOU VOLUNTARILY ASSUME ALL RISKS ASSOCIATED WITH YOUR USE OF THE SERVICE, INCLUDING BUT NOT LIMITED TO RISKS OF:</strong>',
    h2: [
      'Physical injury, illness, disability, or death resulting from following exercise, nutrition, or fitness suggestions provided by the Service.',
      'Adverse health outcomes from dietary changes, supplement use, or exercise programs suggested by the Service.',
      'Misinterpretation of biometric data, readiness scores, or AI-generated recommendations.',
      'Delayed or missed medical treatment due to reliance on information from the Service.',
      'Allergic reactions, nutritional deficiencies, or other adverse effects from following meal plans or food suggestions.',
    ],
    h3Title: '3. Critical Health Warnings',
    h3: [
      '<strong>ALWAYS consult a qualified healthcare professional</strong> before beginning any new exercise program, diet, or supplement regimen.',
      '<strong>STOP exercising IMMEDIATELY</strong> and seek medical attention if you experience chest pain, dizziness, fainting, severe shortness of breath, or any other concerning symptoms.',
      '<strong>DO NOT self-administer</strong> any supplements, vitamins, or nutritional products based solely on AI recommendations without first consulting a licensed healthcare provider.',
      'Individuals with <strong>any pre-existing medical condition</strong> — including but not limited to cardiovascular disease, diabetes, hypertension, eating disorders, musculoskeletal injuries, metabolic disorders, or who are pregnant, nursing, or planning to become pregnant — <strong>MUST consult a physician before using the Service</strong>.',
      'The Service is <strong>NOT designed for and should NOT be used by</strong> individuals under 16 years of age.',
      'If you are taking any prescription medications, consult your physician or pharmacist before using any supplement recommendations from the Service, as interactions may occur.',
    ],
    h4Title: '4. Emergency Situations',
    h4: 'If you experience a medical emergency, <strong>CALL YOUR LOCAL EMERGENCY NUMBER IMMEDIATELY</strong>: <strong>911</strong> (United States & Canada), <strong>999</strong> (United Kingdom), <strong>112</strong> (European Union), <strong>000</strong> (Australia), <strong>111</strong> (New Zealand), or your local emergency services. <strong>DO NOT</strong> use the Service to assess, evaluate, or manage any medical emergency.',
    h5Title: '5. Regulatory Compliance & Disclaimers',
    h5: [
      `<strong>FDA (United States):</strong> ${APP_NAME} has not been evaluated, cleared, or approved by the U.S. Food and Drug Administration (FDA). The Service is not intended to diagnose, treat, cure, or prevent any disease. Supplement-related content in the app has not been evaluated by the FDA. These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.`,
      `<strong>FTC (United States):</strong> All health and fitness claims made within the Service are general in nature and do not guarantee specific results. Individual results may vary significantly based on factors including genetics, adherence, medical history, and other variables.`,
      '<strong>EU MDR (European Union):</strong> The Service is not classified as a medical device under EU Medical Device Regulation (EU) 2017/745. It is a general wellness application.',
      '<strong>UK MHRA:</strong> The Service is not registered as a medical device with the Medicines and Healthcare products Regulatory Agency (MHRA) in the United Kingdom.',
      '<strong>TGA (Australia):</strong> The Service is not listed or registered as a medical device or therapeutic good with the Therapeutic Goods Administration (TGA) of Australia.',
      '<strong>Health Canada:</strong> The Service is not authorized as a medical device by Health Canada. Supplement information provided does not constitute a Natural Health Product (NHP) recommendation.',
    ],
    h6Title: '6. Professional Relationship Disclaimer',
    h6: 'Use of the Service does not create a physician-patient, dietitian-client, trainer-client, or any other professional healthcare relationship between you and ${APP_NAME} or any of its employees, agents, or affiliates.',
    // Data
    dataTitle: 'Data & AI Policy',
    d1Title: '1. AI Data Usage',
    d1: [
      'AI suggestions are generated based on data you voluntarily provide (nutrition, workouts, sleep, biometrics).',
      'Data sent to AI models is processed in real-time and is <strong>NOT persistently stored</strong> by the AI provider beyond the duration of the request.',
      'AI Coach conversation history is stored securely in your account. You may review and permanently delete conversation history at any time.',
      'AI outputs are probabilistic in nature and may contain errors, inaccuracies, or biases. They should be used as supplementary information, not as definitive guidance.',
    ],
    d2Title: '2. Data Sharing',
    d2Intro: 'Your personal data is <strong>NEVER</strong> sold, rented, traded, or shared with:',
    d2: [
      'Insurance companies or underwriters.',
      'Employers, recruiters, or human resources departments.',
      'Data brokers or advertising networks.',
      'Third parties for marketing, advertising, or commercial purposes.',
      'Government agencies (except when required by valid legal process such as court orders or subpoenas).',
      'Any organization or individual not explicitly identified in this policy.',
    ],
    d3Title: '3. Data Control & Portability',
    d3Intro: 'You maintain full ownership and control over your personal data:',
    d3: [
      '<strong>View:</strong> Access all stored data within the app at any time.',
      '<strong>Export:</strong> Download a complete copy of your data in machine-readable format (JSON/CSV).',
      '<strong>Delete:</strong> Remove individual data entries, entire categories, or your complete history.',
      '<strong>Disconnect:</strong> Unlink any connected wearables or health platforms at any time.',
      '<strong>Correct:</strong> Update or amend any inaccurate data entries.',
    ],
    d4Title: '4. Sensitive Data Protection',
    d4Intro: 'Progress photos and biometric data receive enhanced security protections:',
    d4: [
      'Stored in private, access-controlled storage buckets with no public access.',
      'Displayed only via cryptographically signed URLs with automatic 1-hour expiration.',
      'Strict Row-Level Security ensures only you can access your own data.',
      'All sensitive data is encrypted at rest and in transit.',
    ],
    d5Title: '5. Automated Decision-Making',
    d5: 'The Service uses automated processing (including AI) to generate personalized suggestions. These automated decisions do not produce legal effects concerning you or similarly significantly affect you. You have the right to request human review of any automated decision and to contest decisions based solely on automated processing, in accordance with GDPR Article 22.',
    d6Title: '6. Data Sub-processors',
    d6: 'We use a limited number of vetted sub-processors to operate the Service (e.g., cloud infrastructure, AI model providers). All sub-processors are bound by Data Processing Agreements (DPAs) that require them to protect your data in accordance with applicable privacy laws. A list of current sub-processors is available upon request.',
    d7Title: '7. Contact',
    d7: 'If you have questions about this policy, wish to exercise your data rights, or need to report a data concern, please contact us through the Support section in the app or email the support address provided in Settings. For EU/EEA/UK users, you may also contact your local data protection authority.',
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
    <div className="bg-background pb-24">
      <div
        className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/30"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
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

              <Section title={l.t1Title}><P html={l.t1} /></Section>
              <Section title={l.t2Title}><P html={l.t2} /></Section>
              <Section title={l.t3Title}>{l.t3.map((t, idx) => <H key={idx} html={t} />)}</Section>
              <Section title={l.t4Title}><p>{l.t4}</p></Section>
              <Section title={l.t5Title}>{l.t5.map((t, idx) => <p key={idx}>• {t}</p>)}</Section>
              <Section title={l.t6Title}><p>{l.t6}</p></Section>
              <Section title={l.t7Title}>{l.t7.map((t, idx) => <H key={idx} html={t} />)}</Section>
              <Section title={l.t8Title}>
                <P html={l.t8Intro} />
                {l.t8.map((t, idx) => <p key={idx}>• {t}</p>)}
              </Section>
              <Section title={l.t9Title}><p>{l.t9}</p></Section>
              <Section title={l.t10Title}>{l.t10.map((t, idx) => <H key={idx} html={t} />)}</Section>
              <Section title={l.t11Title}><p>{l.t11}</p></Section>
              <Section title={l.t12Title}><P html={l.t12} /></Section>
              <Section title={l.t13Title}><P html={l.t13} /></Section>
              {'t14Title' in l && <Section title={(l as any).t14Title}><p>{(l as any).t14}</p></Section>}
              {'t15Title' in l && <Section title={(l as any).t15Title}><p>{(l as any).t15}</p></Section>}
              {'t16Title' in l && <Section title={(l as any).t16Title}><p>{(l as any).t16}</p></Section>}
              {'t17Title' in l && <Section title={(l as any).t17Title}><p>{(l as any).t17}</p></Section>}
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

              <Section title={l.p1Title}>{l.p1.map((t, idx) => <P key={idx} html={t} />)}</Section>
              <Section title={l.p2Title}>
                {l.p2.map((t, idx) => <p key={idx}>• {t}</p>)}
                <P html={l.p2Note} />
              </Section>
              <Section title={l.p3Title}>{l.p3.map((t, idx) => <p key={idx}>• {t}</p>)}</Section>
              <Section title={l.p4Title}>{l.p4.map((t, idx) => <H key={idx} html={t} />)}</Section>
              <Section title={l.p5Title}><P html={l.p5} /></Section>
              <Section title={l.p6Title}><p>{l.p6}</p></Section>
              <Section title={l.p7Title}>{l.p7.map((t, idx) => <H key={idx} html={t} />)}</Section>
              {'p8Title' in l && <Section title={(l as any).p8Title}><p>{(l as any).p8}</p></Section>}
              {'p9Title' in l && <Section title={(l as any).p9Title}><p>{(l as any).p9}</p></Section>}
              {'p10Title' in l && <Section title={(l as any).p10Title}><p>{(l as any).p10}</p></Section>}
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

              <Section title={l.h1Title}>{l.h1.map((t, idx) => <H key={idx} html={t} />)}</Section>
              <Section title={l.h2Title}>
                <P html={l.h2Intro} />
                {l.h2.map((t, idx) => <p key={idx}>• {t}</p>)}
              </Section>
              <Section title={l.h3Title}>{l.h3.map((t, idx) => <H key={idx} html={t} />)}</Section>
              <Section title={l.h4Title}><P html={l.h4} /></Section>
              <Section title={l.h5Title}>{l.h5.map((t, idx) => <H key={idx} html={t} />)}</Section>
              {'h6Title' in l && <Section title={(l as any).h6Title}><p>{(l as any).h6}</p></Section>}
            </motion.div>
          </TabsContent>

          {/* ===== DATA ===== */}
          <TabsContent value="data">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="metric-card space-y-0">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-bold text-foreground">{l.dataTitle}</h2>
              </div>

              <Section title={l.d1Title}>{l.d1.map((t, idx) => <H key={idx} html={t} />)}</Section>
              <Section title={l.d2Title}>
                <P html={l.d2Intro} />
                {l.d2.map((t, idx) => <p key={idx}>• {t}</p>)}
              </Section>
              <Section title={l.d3Title}>
                <P html={l.d3Intro} />
                {l.d3.map((t, idx) => <H key={idx} html={t} />)}
              </Section>
              <Section title={l.d4Title}>
                <p>{l.d4Intro}</p>
                {l.d4.map((t, idx) => <p key={idx}>• {t}</p>)}
              </Section>
              <Section title={l.d5Title}><p>{l.d5}</p></Section>
              {'d6Title' in l && <Section title={(l as any).d6Title}><p>{(l as any).d6}</p></Section>}
              {'d7Title' in l && <Section title={(l as any).d7Title}><p>{(l as any).d7}</p></Section>}
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
