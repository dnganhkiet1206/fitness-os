# Sổ ý tưởng

Sổ này khác ba sổ kia. `FORENSIC-AUDIT.md` ghi lỗi **đã chứng minh**;
`SO-GHI-LOI.md` ghi thứ **chưa** chứng minh được và vì thế cấm đụng;
`PRE_RELEASE.md` ghi việc phải làm **trước ngày phát hành**. Sổ này ghi thứ
người dùng muốn làm nhưng **chưa tới lúc**.

**Luật của sổ:** mỗi mục phải nói được ba điều — ý tưởng là gì, **cái gì đã có
sẵn trong repo**, và cái gì chưa có. Một ý tưởng không kèm phần thứ hai sẽ được
ước lượng lại từ đầu mỗi lần ai đó đọc nó, và mỗi lần ra một con số khác.

---

## 1. Bán khoá học — lịch tập + lịch ăn soạn sẵn, $0.99, chạm một cái là vào lịch

*Ghi 2026-09-04, theo lời người dùng. Chưa làm.*

> "Bán khoá học với lịch tập và ăn uống được thiết kế chi tiết đầy đủ, và khi ấn
> vào sẽ thêm vào lịch tập và lịch ăn của người dùng, với giá $0.99 ngay trong
> app."

### Cái ĐÃ có sẵn — nhiều hơn tưởng

| Mảnh | Nơi | Trạng thái |
|---|---|---|
| Xác thực giao dịch phía server | `supabase/functions/verify-purchase` | Viết xong. Hỏi thẳng Apple, và kiểm giao dịch có thuộc về đúng người gọi không |
| Thông báo server-to-server của Apple | `supabase/functions/store-webhook` | Viết xong, đọc `signedPayload` |
| Bảng quyền lợi chỉ server ghi được | `entitlements` + `current_tier()` trong `20260810120000_economy_server_authority.sql` | Đã migrate |
| Mô hình mối đe doạ | `tools/entitlements.mjs` | Đã viết, kèm bốn cách một app trả phí thành app miễn phí |
| Khung mẫu buổi tập | bảng `workout_templates`, `routine_days` | Đã có |
| Kế hoạch ăn và từng ô của nó | `meal_plans`, `meal_plan_items` | Đã có, và màn Dinh dưỡng đã đọc/ghi chúng |
| Đường gọi từ client | `backend.ts` → `verifyPurchase: 'verify-purchase'` | Đã khai, **chưa ai gọi** |

### Cái CHƯA có

1. **Không có thư viện mua hàng nào trên máy.** Không `expo-in-app-purchases`,
   không `react-native-iap`, không RevenueCat. Tức hiện tại không có gì trên
   thiết bị *mở được* bảng mua hàng. Đây là phụ thuộc native → một bản dựng
   dev-client mới, không cài được bằng OTA.

2. **`store-webhook` chưa có bảng ánh xạ product id.** Dòng 160–165 trả về
   `"product mapping not configured"` và **cố ý** không ghi `free` vào đó —
   nhưng nghĩa là chưa product nào tồn tại.

3. **Mô hình quyền lợi đang là HẠNG, không phải MÓN.** `entitlements.tier` là
   `free | plus | max`. Một khoá học $0.99 là món mua đứt: người ta có thể sở
   hữu khoá A mà không có khoá B. Cần một bảng khác (`owned_products` hoặc
   tương đương) — đây không phải sửa một cột, nó là một khái niệm thứ hai bên
   cạnh hạng.

4. **Chưa có nội dung, và chưa có chỗ chứa nội dung.** Một "khoá học" là một
   khung mẫu gồm cả lịch tập lẫn thực đơn nhiều tuần. `workout_templates` và
   `meal_plans` đều là bảng **của người dùng**; khoá học là dữ liệu **của app**,
   nên nó cần bảng riêng có `user_id IS NULL` hoặc một bảng catalogue tách hẳn.

5. **Cú "thêm vào lịch của tôi" là phần khó nhất, và nó không phải phần kỹ
   thuật.** Người mua đã có kế hoạch ăn và lịch tập của họ. Chép khoá học vào
   thì:
   - Ghi đè? Mất thứ họ đã soạn.
   - Thêm song song? Hai kế hoạch cùng chạy một tuần, và màn Dinh dưỡng hiện
     đang giả định người ta đọc **một** kế hoạch tại một thời điểm.
   - Trộn vào? Không có phép trộn nào không phải là một quyết định thay họ.

   Đây là câu hỏi sản phẩm, không phải câu hỏi mã. Nó phải được trả lời **trước**
   khi viết dòng đầu tiên, vì cả ba đáp án cho ra ba lược đồ khác nhau.

### Ràng buộc đã ghi ở chỗ khác

`PRE_RELEASE.md` §3: *"kinh tế mascot tin client hoàn toàn […] trước bất kỳ
tầng trả phí nào. Là việc thiết kế, không phải một bản vá."* Bán hàng thật đi
qua đúng chỗ ấy — không mở bán trước khi §3 xong.

### Thứ tự nếu bắt tay làm

1. Trả lời câu hỏi ở mục 5 (ghi đè / song song / trộn). Không có nó thì mọi thứ
   sau đều phải làm lại.
2. Lược đồ catalogue + `owned_products`, RLS chỉ server ghi.
3. Ánh xạ product id trong `store-webhook`, và một nhánh cho món mua đứt bên
   cạnh nhánh hạng.
4. Thêm thư viện IAP → bản dựng native mới.
5. Màn cửa hàng khoá học, và cú chép-vào-lịch.
6. Nội dung: soạn khoá học thật. Đây là công việc **người**, không phải mã, và
   nó thường là phần lâu nhất.
