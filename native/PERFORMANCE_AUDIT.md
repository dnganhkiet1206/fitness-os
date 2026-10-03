# ASCND Performance Audit Report
**Ngày:** 03/10/2026  
**Người audit:** D (Muse)  
**Phạm vi:** native/ (Expo + React Native)  
**Nguyên tắc:** Không sửa code cho đến khi xác định được bottleneck thực tế bằng bằng chứng.

---

## Tóm tắt

| Lĩnh vực | Trạng thái | Bottleneck thực tế |
|----------|-------------|-------------------|
| ① Render/re-render | ⚠️ Có vấn đề | Today screen 3052 dòng, không memo |
| ② List & image | 🔴 Bottleneck | Community feed dùng .map(), không virtualization |
| ③ Animation/UI thread | ✅ Tốt | Đã dùng Reanimated, 0 JS-driven animation |
| ④ Startup + memory | ✅ Tốt | Architecture đã đúng, cần đo thực tế |

---

## ① Render/Re-render

### Đã tốt
- **`usePalette()`**: Trả về tham chiếu ổn định (`palettes` là hằng số module), một lần đọc context. Không gây re-render thừa. *(src/hooks/use-palette.ts)*
- **Theme system**: `AppSettingsProvider` hỏi `Appearance` đúng 1 lần cho cả app, thay vì 230 listener riêng lẻ. Đã được tối ưu trước đây.
- **Context granularity**: Chỉ 7 context, phân tách hợp lý (auth, settings, lock, coach-chat, wash, pick-row, swipe-row).

### Bottleneck: Today screen quá lớn
- **File:** `src/app/(tabs)/index.tsx`
- **Kích thước:** 3052 dòng, 1 component duy nhất (`TodayScreen`)
- **Vấn đề:** Không dùng `React.memo`. Bất kỳ state change nào trong 13 `useState`/`useEffect` đều re-render toàn bộ 3052 dòng.
- **Bằng chứng:** `grep -n "export default" src/app/(tabs)/index.tsx` → `export default function TodayScreen()` (không memo)
- **Tác động:** Medium-High. Today là màn chính, user mở nhiều nhất.

### Memoization thấp
- Chỉ 7/166 components dùng `React.memo` (4%).
- **Lưu ý:** Không phải component nào cũng cần memo. Cần profile để xác định component nào re-render thừa thực sự.

---

## ② List & Image

### Bottleneck: Community feed không virtualization
- **File:** `src/app/(tabs)/community.tsx:208`
- **Code:**
  ```tsx
  {hold.posts.map((p) => (
    <View key={p.id} ref={win.item(p.id)} collapsable={false}>
      <PostCard post={p} />
    </View>
  ))}
  ```
- **Vấn đề:** Render TẤT CẢ posts cùng lúc. Feed có 20-50 posts với ảnh → tất cả ảnh load cùng lúc, tất cả PostCard mount cùng lúc.
- **Bằng chứng:** Không có `FlatList`/`FlashList` trong file. Chỉ 5 files trong toàn app dùng virtualized list, 22 files dùng ScrollView.
- **Tác động:** High. Đây đúng là trường hợp spec nêu: "Không để một feed có 20–50 large images load cùng lúc."

### Image
- Chưa audit chi tiết caching strategy. Cần kiểm tra `expo-image` vs `Image` usage.

---

## ③ Animation/UI Thread

### Đã tốt
- **0** file dùng `Animated.timing`/`Animated.spring` (JS-driven).
- **60** files dùng Reanimated (`useAnimatedStyle`, `withTiming`, `withSpring`).
- Architecture animation đã đúng: chạy trên UI thread.

### Không cần tối ưu
Theo nguyên tắc "Optimize the implementation, not the feature" — animation đã chạy đúng chỗ, không cần đụng vào.

---

## ④ Startup + Memory

### Đã tốt
- **AppSettingsProvider** block render cho đến khi theme load xong (`if (!booted) return null`). Ngăn flash trắng khi mở app.
- **_layout.tsx** effects không cần cleanup (chỉ set color scheme, không subscription).

### Cần đo thực tế
- Không thể kết luận startup time mà không profile trên thiết bị thật.
- **Limitation:** Môi trường hiện tại không có iOS device/simulator để đo.

---

## Bottleneck ưu tiên (theo thứ tự của Kiệt)

### ① Render/re-render
1. **Today screen 3052 dòng** — Tách thành sub-components + memo cho phần expensive.

### ② List & image  
2. **Community feed .map()** — Chuyển sang FlashList/FlatList với virtualization.

### ③ Animation/UI thread
3. **Không có bottleneck** — Đã tối ưu.

### ④ Startup + memory
4. **Cần profiling** — Không tối ưu theo cảm tính.

---

## Không làm gì

Theo nguyên tắc của Kiệt:
- ❌ Không tắt blur/animation để "nhẹ hơn"
- ❌ Không xóa feature
- ❌ Không tối ưu những chỗ đã tốt (Reanimated, usePalette, theme system)
- ❌ Không bịa số liệu before/after nếu chưa đo thực tế

---

## Bước tiếp theo (cần Kiệt quyết định)

1. **Profile Today screen** để xác định sub-component nào re-render nhiều nhất → mới tách/memo.
2. **Chuyển community feed sang FlashList** — đây là bottleneck rõ ràng nhất, có bằng chứng code.
3. **Đo startup time** trên thiết bị thật (cần iPhone/simulator).

**Khuyến nghị:** Bắt đầu với #2 (community feed) vì bằng chứng rõ ràng, tác động cao, rủi ro thấp.
