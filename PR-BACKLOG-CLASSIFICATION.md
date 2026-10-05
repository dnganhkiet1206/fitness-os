# Phân loại PR tồn đọng (D-31, #489)

Ngày: 05/10/2026. Phạm vi: PR mở trước A19 (#415) / C32 (#389).
Tổng: 100 PR mở. Dưới đây là phân loại nhóm cũ (#268–#383).

## 1. MERGE-READY (độc lập, vào thẳng native/ios-rewrite)

PR của D — mỗi PR một branch riêng, target `native/ios-rewrite`, không phụ thuộc nhau:

| PR | Nội dung | Trạng thái |
|----|----------|-----------|
| #286 | D-3: vectors Workout Session | MERGEABLE |
| #289 | D-6: source-trace registry | MERGEABLE |
| #339 | D: sửa readiness test (#233) | MERGEABLE |
| #344 | D-9: vectors Personal Records | MERGEABLE |
| #347 | D-10: vectors append-after-finish | MERGEABLE |
| #357 | D-13: property tests append idempotency | MERGEABLE |
| #359 | D-16: CI guard vector runner | MERGEABLE |
| #362 | D-17: checklist A8 | MERGEABLE |
| #366 | D-18: parity drift scanner | MERGEABLE |
| #380 | D-19: vectors TodayPlan/Controller | MERGEABLE |
| #381 | D-20: session lifecycle tests | MERGEABLE |
| #382 | D-21: differential runner | MERGEABLE |
| #390 | D-22: account isolation tests | MERGEABLE |
| #409 | D-26: vectors template write | MERGEABLE |
| #412 | D-23: vectors remove-set + undo | MERGEABLE |
| #413 | D-24: vectors AdHoc lifecycle | MERGEABLE |
| #414 | D-25: vectors workout history | MERGEABLE |
| #475 | D-12: trace registry A6-A12 | MERGEABLE |

Thứ tự merge: bất kỳ (độc lập). Ưu tiên spec/vectors trước để các PR khác dùng.

## 2. REQUIRES REBASE

| PR | Nội dung | Vấn đề |
|----|----------|--------|
| #291 | C-7: Accessibility + Dynamic Type | CONFLICTING/DIRTY — cần rebase lên base mới |

## 3. TIỀM ẨN DUPLICATE (cần reviewer xác nhận)

| PR | Nội dung | Ghi chú |
|----|----------|---------|
| #357 vs #363 | D-13 vs C idempotency tests | #363 ghi "Transferred D→C — Issue #325". Cả hai đều test idempotency cho #325. Cần A xác nhận: giữ một, đóng một. |

## 4. STACKED CHAINS (merge từ dưới lên)

### Nhánh A (core):
#268 (A5) → #285 (A6) → #290 (A7) → #293 (A9) → #298 (A11) → #307 (A12) → #349 (A13) → #364 (A8a) → #378 (A10) → #383 (A16) → #395 (A14) → #396 (A15) → #397 (A17) → #402 (A18)

### Nhánh C (UI):
- ds-components: #284 → #337 → #340 → #341 → #343 → #352 → #353 → #355 → #356
- workout-screen: #287 → #288 → #318 → #346 → #348 → #354
- Các PR độc lập: #269, #292, #297, #309, #338, #342, #350, #351, #375, #376, #377, #379, #391, #392, #393, #394

Thứ tự: merge chain A trước (core), sau đó chain C (UI phụ thuộc core).

## 5. KHÔNG CÓ PR NÀO SUPERSEDED/BLOCKED rõ ràng

Không tìm thấy bằng chứng PR nào bị PR mới hơn thay thế hoàn toàn. #363/#357 là trường hợp duy nhất cần xem xét duplicate.

---
*D-31 (#489). Kiểm bằng GitHub metadata/branch/diff. Không tạo implementation mới.*
