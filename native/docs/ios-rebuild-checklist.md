# Checklist rebuild iOS chuẩn (cho Kiệt)

Mỗi lần test thay đổi native (Dynamic Island / Live Activity / widget), làm
đúng thứ tự này. **Swift không compile được trên Linux**, nên bản build trên
máy của Kiệt là nguồn sự thật duy nhất.

## 6 bước

1. `git pull --rebase` (nhánh `claude/ios-fitness-rebuild-omgulr`)
2. `git log --oneline -3` — **xác nhận commit mới nhất là commit cần test**
   (ví dụ pull `76819f2` thì phải thấy `76819f2` ở dòng đầu)
3. `EXPO_FREE_TEST=1 npx expo prebuild --platform ios --clean`
4. `npx expo run:ios --device`
5. Trên iPhone: Settings → ASCND → **Live Activities ON**
6. Test trên máy

## Stale-build check (bắt buộc nếu "không thấy thay đổi")

Nếu thay đổi không hiện trên máy, **đừng báo bug vội** — làm lại bước 2
trước: `git log --oneline -3` có đúng commit mới nhất không? Nếu không:

- `git pull --rebase` lại
- kiểm lại `git log --oneline -3`
- rebuild từ bước 3 (phải `--clean`, build cũ cache native code)

## Hai lần test nhầm build cũ (ghi để nhớ)

1. **~03:45 CDT 02/10:** báo "timer vẫn wrap" — là bản build cũ, **thiếu
   #217** (fix wrap). Build có #217 thì hết.
2. **~04:43 CDT 02/10:** báo "sao không thấy thay đổi gì hết vậy" — báo
   trước khi xác nhận commit mới nhất trong `git log`. Pull + rebuild lại
   đúng commit thì thay đổi hiện.

**Quy tắc:** một bug DI chỉ được coi là thật khi `git log --oneline -3` đã
hiện đúng commit mới nhất VÀ rebuild `--clean` từ đúng commit đó.

## Ghi chú

- `prebuild --clean` là bắt buộc khi đổi Swift/config plugin — build
  incremental giữ native code cũ.
- Live Activities cần iOS 16.1+; Dynamic Island cần iPhone 14 Pro trở lên.
- iOS 18 có nút Live Activities riêng cho từng app — tắt là không thấy gì,
  không phải lỗi code.
