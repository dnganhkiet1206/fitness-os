import { motion } from 'framer-motion';
import { ChevronLeft, Shield, FileText, Scale, Heart, AlertTriangle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };
const EFFECTIVE_DATE = '2026-02-12';
const APP_NAME = 'Fitness OS';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-6">
    <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
    <div className="text-xs leading-relaxed text-muted-foreground space-y-2">{children}</div>
  </div>
);

export default function Legal() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const defaultTab = params.get('tab') || 'terms';

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 py-3">
          <motion.button onClick={() => navigate(-1)} whileTap={{ scale: 0.9 }} transition={spring}>
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </motion.button>
          <h1 className="text-base font-semibold text-foreground">Chính sách & Pháp lý</h1>
        </div>
      </div>

      <div className="px-4 pt-4">
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="terms" className="text-[10px] px-1">Điều khoản</TabsTrigger>
            <TabsTrigger value="privacy" className="text-[10px] px-1">Quyền riêng tư</TabsTrigger>
            <TabsTrigger value="health" className="text-[10px] px-1">Sức khoẻ</TabsTrigger>
            <TabsTrigger value="data" className="text-[10px] px-1">Dữ liệu</TabsTrigger>
          </TabsList>

          {/* ===== ĐIỀU KHOẢN SỬ DỤNG ===== */}
          <TabsContent value="terms">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="metric-card space-y-0">
              <div className="flex items-center gap-2 mb-4">
                <Scale className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Điều khoản Sử dụng</h2>
              </div>
              <p className="text-[10px] text-muted-foreground mb-4">Có hiệu lực từ: {EFFECTIVE_DATE}</p>

              <Section title="1. Chấp nhận Điều khoản">
                <p>Bằng việc tạo tài khoản và sử dụng {APP_NAME}, bạn đồng ý tuân thủ toàn bộ các điều khoản được nêu trong tài liệu này. Nếu bạn không đồng ý, vui lòng ngừng sử dụng ứng dụng.</p>
              </Section>

              <Section title="2. Mô tả Dịch vụ">
                <p>{APP_NAME} là ứng dụng hỗ trợ theo dõi sức khoẻ cá nhân bao gồm: dinh dưỡng, tập luyện, giấc ngủ, biometric và các chỉ số thể chất. Ứng dụng sử dụng trí tuệ nhân tạo (AI) để cung cấp gợi ý cá nhân hoá.</p>
              </Section>

              <Section title="3. Tài khoản Người dùng">
                <p>• Bạn phải cung cấp thông tin chính xác khi đăng ký.</p>
                <p>• Bạn chịu trách nhiệm bảo mật thông tin đăng nhập.</p>
                <p>• Bạn phải đủ 16 tuổi trở lên để sử dụng dịch vụ.</p>
                <p>• Mỗi cá nhân chỉ được sở hữu một tài khoản.</p>
              </Section>

              <Section title="4. Quyền Sở hữu Trí tuệ">
                <p>Tất cả nội dung, thiết kế, mã nguồn và thuật toán AI thuộc sở hữu của {APP_NAME}. Bạn được cấp quyền sử dụng cá nhân, không độc quyền, không chuyển nhượng.</p>
              </Section>

              <Section title="5. Hành vi bị Cấm">
                <p>• Sử dụng ứng dụng cho mục đích bất hợp pháp.</p>
                <p>• Cố gắng truy cập trái phép vào hệ thống.</p>
                <p>• Chia sẻ tài khoản hoặc thông tin đăng nhập.</p>
                <p>• Sao chép, phân phối hoặc sửa đổi nội dung ứng dụng.</p>
                <p>• Lạm dụng tính năng AI để tạo nội dung y tế sai lệch.</p>
              </Section>

              <Section title="6. Chấm dứt Dịch vụ">
                <p>Chúng tôi có quyền tạm ngưng hoặc chấm dứt tài khoản nếu phát hiện vi phạm điều khoản. Bạn có thể xoá tài khoản bất kỳ lúc nào trong phần Cài đặt.</p>
              </Section>

              <Section title="7. Giới hạn Trách nhiệm (Limitation of Liability)">
                <p>• TRONG MỌI TRƯỜNG HỢP, trách nhiệm tối đa của {APP_NAME} đối với bạn <strong>không vượt quá số tiền bạn đã thanh toán cho dịch vụ trong 12 tháng gần nhất</strong>, hoặc 500.000 VNĐ (tuỳ giá trị nào lớn hơn).</p>
                <p>• Chúng tôi <strong>KHÔNG CHỊU TRÁCH NHIỆM</strong> đối với bất kỳ thiệt hại gián tiếp, ngẫu nhiên, đặc biệt, mang tính trừng phạt hoặc hệ quả nào, bao gồm nhưng không giới hạn: mất dữ liệu, mất lợi nhuận, tổn thương thể chất hoặc tinh thần.</p>
                <p>• Ứng dụng được cung cấp theo nguyên tắc <strong>"NGUYÊN TRẠNG" (AS IS)</strong> và <strong>"NHƯ SẴN CÓ" (AS AVAILABLE)</strong>, không có bất kỳ bảo đảm nào, dù rõ ràng hay ngụ ý.</p>
              </Section>

              <Section title="8. Bồi thường (Indemnification)">
                <p>Bạn đồng ý bồi thường, bảo vệ và giữ cho {APP_NAME}, các giám đốc, nhân viên và đối tác không bị tổn hại bởi bất kỳ khiếu nại, thiệt hại, chi phí (bao gồm phí luật sư) phát sinh từ:</p>
                <p>• Việc bạn vi phạm các điều khoản này.</p>
                <p>• Việc bạn sử dụng hoặc lạm dụng ứng dụng.</p>
                <p>• Quyết định sức khoẻ dựa trên thông tin từ ứng dụng mà không tham khảo chuyên gia y tế.</p>
                <p>• Nội dung hoặc dữ liệu bạn cung cấp cho ứng dụng.</p>
              </Section>

              <Section title="9. Bất khả kháng (Force Majeure)">
                <p>Chúng tôi không chịu trách nhiệm cho bất kỳ sự chậm trễ hoặc gián đoạn dịch vụ nào do các sự kiện ngoài tầm kiểm soát hợp lý, bao gồm nhưng không giới hạn: thiên tai, chiến tranh, dịch bệnh, sự cố hạ tầng internet, tấn công mạng, thay đổi pháp luật hoặc quyết định của cơ quan có thẩm quyền.</p>
              </Section>

              <Section title="10. Luật Áp dụng & Giải quyết Tranh chấp">
                <p>• Các điều khoản này được điều chỉnh bởi <strong>pháp luật nước Cộng hoà Xã hội Chủ nghĩa Việt Nam</strong>.</p>
                <p>• Mọi tranh chấp phát sinh sẽ được giải quyết thông qua thương lượng thiện chí trong vòng <strong>30 ngày</strong>.</p>
                <p>• Nếu không giải quyết được, tranh chấp sẽ được đưa ra <strong>Trung tâm Trọng tài Quốc tế Việt Nam (VIAC)</strong> theo quy tắc tố tụng trọng tài hiện hành.</p>
                <p>• Ngôn ngữ trọng tài: Tiếng Việt. Địa điểm: TP. Hồ Chí Minh.</p>
              </Section>

              <Section title="11. Điều khoản Tách rời (Severability)">
                <p>Nếu bất kỳ điều khoản nào trong thoả thuận này bị tuyên bố vô hiệu hoặc không thể thi hành bởi toà án hoặc cơ quan có thẩm quyền, các điều khoản còn lại vẫn có hiệu lực đầy đủ.</p>
              </Section>

              <Section title="12. Toàn bộ Thoả thuận">
                <p>Các điều khoản này, cùng với Chính sách Quyền riêng tư, Tuyên bố Sức khoẻ và Chính sách Dữ liệu & AI, tạo thành <strong>toàn bộ thoả thuận</strong> giữa bạn và {APP_NAME}, thay thế mọi thoả thuận trước đó.</p>
              </Section>

              <Section title="13. Thay đổi Điều khoản">
                <p>Chúng tôi có thể cập nhật điều khoản. Các thay đổi quan trọng sẽ được thông báo qua ứng dụng ít nhất 14 ngày trước khi có hiệu lực. Việc tiếp tục sử dụng sau ngày có hiệu lực đồng nghĩa với việc bạn chấp nhận các thay đổi.</p>
              </Section>
            </motion.div>
          </TabsContent>

          {/* ===== CHÍNH SÁCH QUYỀN RIÊNG TƯ ===== */}
          <TabsContent value="privacy">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="metric-card space-y-0">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Chính sách Quyền riêng tư</h2>
              </div>
              <p className="text-[10px] text-muted-foreground mb-4">Có hiệu lực từ: {EFFECTIVE_DATE}</p>

              <Section title="1. Dữ liệu chúng tôi Thu thập">
                <p><strong>Thông tin cá nhân:</strong> Tên, email, ngày sinh, giới tính, chiều cao, cân nặng.</p>
                <p><strong>Dữ liệu sức khoẻ:</strong> Bữa ăn, bài tập, giấc ngủ, nhịp tim, SpO2, HRV, cân nặng, ảnh tiến trình, lượng nước uống.</p>
                <p><strong>Dữ liệu thiết bị:</strong> Thông tin từ wearables được kết nối (nếu có).</p>
                <p><strong>Dữ liệu sử dụng:</strong> Tương tác với ứng dụng, tần suất sử dụng tính năng.</p>
              </Section>

              <Section title="2. Mục đích Sử dụng Dữ liệu">
                <p>• Cá nhân hoá trải nghiệm và gợi ý AI.</p>
                <p>• Theo dõi tiến trình và tạo báo cáo sức khoẻ.</p>
                <p>• Cải thiện chất lượng dịch vụ và thuật toán.</p>
                <p>• Đảm bảo an toàn tài khoản.</p>
                <p>Chúng tôi <strong>KHÔNG BAO GIỜ</strong> bán dữ liệu cá nhân cho bên thứ ba.</p>
              </Section>

              <Section title="3. Bảo mật Dữ liệu">
                <p>• Mã hoá dữ liệu trong quá trình truyền tải (TLS/SSL).</p>
                <p>• Mã hoá dữ liệu lưu trữ (AES-256).</p>
                <p>• Row-Level Security (RLS) trên toàn bộ cơ sở dữ liệu.</p>
                <p>• Xác thực JWT cho mọi API endpoint.</p>
                <p>• Ảnh tiến trình lưu trữ private với signed URLs (hết hạn sau 1 giờ).</p>
                <p>• Mã PIN thiết bị được hash SHA-256 (không lưu plaintext).</p>
              </Section>

              <Section title="4. Quyền của Bạn">
                <p>• <strong>Truy cập:</strong> Xem toàn bộ dữ liệu cá nhân trong ứng dụng.</p>
                <p>• <strong>Xuất:</strong> Tải dữ liệu ở định dạng JSON hoặc CSV (Cài đặt → Bảo mật & Dữ liệu).</p>
                <p>• <strong>Chỉnh sửa:</strong> Cập nhật hoặc xoá dữ liệu bất kỳ lúc nào.</p>
                <p>• <strong>Xoá tài khoản:</strong> Xoá hoàn toàn tài khoản và toàn bộ dữ liệu liên quan.</p>
                <p>• <strong>Rút lại đồng ý:</strong> Ngừng chia sẻ dữ liệu wearable bất kỳ lúc nào.</p>
              </Section>

              <Section title="5. Lưu trữ Dữ liệu">
                <p>Dữ liệu được lưu trữ trên hạ tầng đám mây bảo mật. Khi bạn xoá tài khoản, toàn bộ dữ liệu sẽ bị xoá vĩnh viễn trong vòng 30 ngày.</p>
              </Section>

              <Section title="6. Cookie & Theo dõi">
                <p>Chúng tôi chỉ sử dụng cookie kỹ thuật cần thiết cho xác thực và phiên đăng nhập. Không sử dụng cookie quảng cáo hoặc theo dõi của bên thứ ba.</p>
              </Section>
            </motion.div>
          </TabsContent>

          {/* ===== TUYÊN BỐ VỀ SỨC KHOẺ ===== */}
          <TabsContent value="health">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="metric-card space-y-0">
              <div className="flex items-center gap-2 mb-4">
                <Heart className="w-5 h-5 text-destructive" />
                <h2 className="text-sm font-bold text-foreground">Tuyên bố về Sức khoẻ</h2>
              </div>

              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive font-medium">
                    {APP_NAME} KHÔNG PHẢI là thiết bị y tế, không thay thế tư vấn y khoa chuyên nghiệp, và không được sử dụng để chẩn đoán, điều trị hoặc phòng ngừa bất kỳ bệnh lý nào.
                  </p>
                </div>
              </div>

              <Section title="1. Giới hạn Trách nhiệm">
                <p>• Mọi thông tin và gợi ý trong ứng dụng chỉ mang tính chất <strong>tham khảo</strong>, không phải lời khuyên y tế.</p>
                <p>• Gợi ý từ AI được tạo bởi thuật toán máy học, <strong>không phải bởi bác sĩ hoặc chuyên gia y tế</strong>.</p>
                <p>• Dữ liệu biometric (nhịp tim, SpO2, HRV) chỉ mang tính ước tính và <strong>không có độ chính xác y khoa</strong>.</p>
                <p>• Chỉ số Readiness Score là chỉ báo tổng hợp, <strong>không phải chẩn đoán sức khoẻ</strong>.</p>
              </Section>

              <Section title="2. Từ chối Miễn trừ Trách nhiệm Y tế">
                <p><strong>CHÚNG TÔI KHÔNG CHỊU TRÁCH NHIỆM</strong> đối với bất kỳ tổn thương, thiệt hại sức khoẻ hoặc hậu quả nào phát sinh từ:</p>
                <p>• Việc tuân theo gợi ý dinh dưỡng hoặc tập luyện từ ứng dụng.</p>
                <p>• Quyết định sức khoẻ dựa trên dữ liệu biometric của ứng dụng.</p>
                <p>• Sử dụng gợi ý thực phẩm bổ sung (supplements) mà không tham khảo ý kiến bác sĩ.</p>
                <p>• Bỏ qua triệu chứng bệnh lý vì chỉ số ứng dụng cho thấy "bình thường".</p>
              </Section>

              <Section title="3. Khuyến cáo Quan trọng">
                <p>• <strong>Luôn tham khảo bác sĩ</strong> trước khi bắt đầu chế độ tập luyện hoặc ăn kiêng mới.</p>
                <p>• <strong>Ngừng tập ngay lập tức</strong> nếu cảm thấy đau, chóng mặt hoặc khó thở.</p>
                <p>• <strong>Không tự ý dùng</strong> thực phẩm bổ sung dựa trên gợi ý AI mà chưa hỏi ý kiến chuyên gia.</p>
                <p>• Người có tiền sử bệnh tim mạch, tiểu đường, rối loạn ăn uống hoặc đang mang thai <strong>bắt buộc phải tham khảo bác sĩ</strong> trước khi sử dụng.</p>
                <p>• Trẻ em dưới 16 tuổi không được sử dụng ứng dụng.</p>
              </Section>

              <Section title="4. Trường hợp Khẩn cấp">
                <p>Nếu bạn gặp tình trạng sức khoẻ khẩn cấp, <strong>hãy gọi 115 hoặc đến cơ sở y tế gần nhất ngay lập tức</strong>. KHÔNG sử dụng ứng dụng để đánh giá tình trạng khẩn cấp.</p>
              </Section>
            </motion.div>
          </TabsContent>

          {/* ===== CHÍNH SÁCH DỮ LIỆU ===== */}
          <TabsContent value="data">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="metric-card space-y-0">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Chính sách Dữ liệu & AI</h2>
              </div>

              <Section title="1. Dữ liệu AI">
                <p>• Gợi ý AI được tạo dựa trên dữ liệu bạn cung cấp (dinh dưỡng, tập luyện, giấc ngủ, biometric).</p>
                <p>• Dữ liệu gửi đến AI được xử lý theo thời gian thực và <strong>không được lưu trữ</strong> bởi nhà cung cấp AI.</p>
                <p>• Lịch sử hội thoại AI Coach được lưu trong tài khoản của bạn và bạn có thể xoá bất kỳ lúc nào.</p>
              </Section>

              <Section title="2. Chia sẻ Dữ liệu">
                <p>Dữ liệu của bạn <strong>KHÔNG BAO GIỜ</strong> được chia sẻ với:</p>
                <p>• Công ty bảo hiểm.</p>
                <p>• Nhà tuyển dụng.</p>
                <p>• Bên thứ ba vì mục đích quảng cáo.</p>
                <p>• Bất kỳ tổ chức nào không được nêu rõ trong chính sách này.</p>
              </Section>

              <Section title="3. Quyền Kiểm soát Dữ liệu">
                <p>Bạn có toàn quyền kiểm soát dữ liệu của mình:</p>
                <p>• <strong>Xem:</strong> Truy cập mọi dữ liệu đã lưu trong ứng dụng.</p>
                <p>• <strong>Xuất:</strong> Tải toàn bộ dữ liệu ở định dạng JSON/CSV.</p>
                <p>• <strong>Xoá:</strong> Xoá từng mục hoặc toàn bộ lịch sử.</p>
                <p>• <strong>Ngắt kết nối:</strong> Huỷ liên kết wearables bất kỳ lúc nào.</p>
              </Section>

              <Section title="4. Bảo vệ Dữ liệu Nhạy cảm">
                <p>Ảnh tiến trình (progress photos) được bảo vệ đặc biệt:</p>
                <p>• Lưu trữ trong bucket private (không truy cập công khai).</p>
                <p>• Chỉ hiển thị qua signed URLs với thời hạn 1 giờ.</p>
                <p>• Chỉ bạn mới có thể xem ảnh của mình (Row-Level Security).</p>
              </Section>

              <Section title="5. Liên hệ">
                <p>Nếu có thắc mắc về chính sách này, vui lòng liên hệ qua phần Hỗ trợ trong ứng dụng hoặc gửi email đến địa chỉ hỗ trợ được cung cấp trong phần Cài đặt.</p>
              </Section>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
