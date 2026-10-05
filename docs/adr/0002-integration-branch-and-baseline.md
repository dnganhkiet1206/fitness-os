# ADR-0002: Nhánh tích hợp `native/ios-rewrite` và baseline đóng băng

- **Trạng thái:** Accepted (05/10/2026)
- **Owner:** A

## Quyết định

- `native/ios-rewrite` được tạo từ `claude/ios-fitness-rebuild-omgulr` @ **`fac9ac2`**. SHA này là **baseline**: mọi forensic cũ↔mới đều so với nó.
- `claude/ios-fitness-rebuild-omgulr` đóng băng. Không agent nào push lên nhánh này nữa.
- Mọi thay đổi, kể cả app RN, `supabase/`, tools, đều vào `native/ios-rewrite` qua PR từ `agent/<x>/<slug>`. Quy trình: [WORKFLOW.md](../WORKFLOW.md).
- Chỉ merge `native/ios-rewrite` → `main` sau GO/NO-GO (Technical / Product / Development) do Kiệt quyết.

## Phản biện: rủi ro drift của nhánh tích hợp sống lâu

- **Evidence:** trước 05/10, cả bốn agent push thẳng lên `omgulr`. Tuần trước có 5 migration và hơn 20 commit (#6, 245+ comment). Backend và spec vẫn đang đổi nhanh.
- **Problem:** nếu `omgulr` vẫn nhận commit song song với `native/ios-rewrite`, hai nhánh sẽ lệch nhau ở `supabase/migrations`. Thứ tự migration lệch là loại conflict không giải được bằng merge text, vì timestamp cùng vùng và DB thật đã apply theo một thứ tự.
- **Alternative:** trunk-based, tức là làm thẳng trên một nhánh dài hạn duy nhất (`omgulr`) có bảo vệ, kèm feature flag cho iOS.
- **Trade-off:**
  - Trunk-based không có drift. Nhưng phải đổi tên/vai trò `omgulr` và mất một "điểm cũ" sạch để forensic.
  - Nhánh tích hợp riêng giữ được baseline sạch, nhưng chỉ an toàn khi baseline thật sự đóng băng.
- **Recommendation (đã áp dụng):** giữ lựa chọn của Kiệt (nhánh tích hợp riêng), kèm hai điều kiện:
  1. `omgulr` đóng băng hoàn toàn. Nên bật **Lock branch** trong GitHub branch protection, vì integration của agent không có quyền tự bật (403) và proxy không cho push tag.
  2. Mọi thay đổi `supabase/` chỉ đi qua `native/ios-rewrite` và cần A review. Nhờ vậy migration chỉ có **một** dòng thời gian.

## Việc Kiệt cần bật trên GitHub (agent không có quyền)

Đường dẫn: Settings → Branches → Add branch ruleset (hoặc classic rule).

1. **`native/ios-rewrite`**
   - Require a pull request before merging. Đặt **Required approvals = 0**, vì mọi agent dùng chung một tài khoản nên không tự approve được; review bằng comment `REVIEW: APPROVE`.
   - Require status checks: `gate` (Cổng chất lượng). Không bắt buộc `iOS`/`SQL` vì hai workflow này lọc theo path; nếu bắt buộc, PR không chạm path đó sẽ treo ở trạng thái chờ.
   - Block force pushes. Block deletions.
2. **`claude/ios-fitness-rebuild-omgulr`:** Lock branch (read-only).
3. **`main`:** Require a pull request. Block force pushes.
