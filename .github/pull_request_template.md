<!--
PR vào native/ios-rewrite. Quy trình: docs/WORKFLOW.md.
Tác giả KHÔNG tự merge. Reviewer merge sau khi CI xanh và không còn BLOCK.
-->

**Agent:** A / B / C / D · **Issue:** #
**Reviewer:** A↔B · C↔D · (cross-domain: A hoặc B review kiến trúc)
**Độ khó:** extreme / hard / medium / easy

### DONE
<!-- Đã làm gì, gói trong 1–5 dòng. -->

### CHANGED
<!-- File/module chạm tới. Có đụng supabase/, spec/, vectors/ không? -->

### TESTED
<!-- Lệnh đã chạy + kết quả thật (dán output rút gọn). Không ghi "đã test" chung chung. -->

### NOT TESTED
<!-- Cái gì CHƯA kiểm, và vì sao (vd: cần iPhone thật, cần Xcode, cần Supabase thật). -->

### RISKS
<!-- Rủi ro regression, hành vi chưa xác định, giả định đang dùng. -->

### NEXT
<!-- Việc tiếp theo / follow-up issue. -->

---
- [ ] Hành vi khớp `spec/` + golden vectors (hoặc đã mở `needs-clarification`)
- [ ] Không copy mù app cũ — requirement tách khỏi implementation artifact
- [ ] Không secret/API key mới trong repo
- [ ] Không sửa `claude/ios-fitness-rebuild-omgulr`, không sửa migration đã có
- [ ] UI: Dynamic Type, VoiceOver, dark mode đã xem (hoặc ghi ở NOT TESTED)
