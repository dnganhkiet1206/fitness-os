# Trước ra mắt — bản đồ nền, và kết quả một lượt rà soát không tìm ra gì

**Lượt này:** 2026-09-09 · commit `03ba419` · **0 khiếm khuyết khách quan · 0 thay đổi mã.**

Đây là kết quả của một lượt rà soát sản phẩm/chuyển động/hiệu năng/hệ thống. Nó
kết thúc bằng việc **không sửa gì**, và trang này tồn tại để lần sau không ai
phải rà lại từ đầu để tới cùng kết luận ấy.

---

## Vì sao lượt này không sửa gì

Bộ kiểm có **211 bước có tên**, và chúng đã phủ gần hết những gì một lượt "đánh
bóng sản phẩm" thường đi tìm. Không phải một vài; gần hết.

| Brief hỏi về | Đã có bước kiểm |
|---|---|
| hệ chuyển động, lò xo | `mô hình lò xo` · `luật chuyển động` · `tranh chấp hiệu ứng` · `worklet` · `thứ tự worklet` · `worklet đo được` |
| thang chữ, màu, token | `thang chữ` · `bảng màu` · `khoá bảng màu` · `màu chữ` · `màu của trang` · `chữ trùng màu nền` · `sắc độ màu tín hiệu` · `diện tích màu tín hiệu` |
| theme sáng/tối | `hình dạng cây theo theme` · `bản tối đóng băng` · `bề mặt đóng băng` · `chất liệu kính` · `đọc trên kính` |
| trợ năng | `Dynamic Type` · `vùng chạm` · `nút lồng trong nút` · `bàn phím` |
| hiệu năng | `ngân sách vẽ` · `ngân sách ảnh` · `ngân sách xuất hiện` · `chi phí aura` · `cửa sổ lớp aura` · `khởi động lạnh` · `bóng khi tải` |
| kiến trúc | `tầng import` · `phạm vi hook` · `một khái niệm một tên` · `bảng chết` · `đã nối chưa` |
| dữ liệu / cache | `khoá invalidate` · `dữ liệu truy vấn` · `hàng đợi ngoại tuyến` · `lệnh ghi xác nhận` · `lệnh ghi có người nghe` |
| trạng thái rỗng/hỏng | `rỗng ≠ hỏng` · `copy lỗi` · `sửa sai được` |
| chữ hiển thị | `dịch thuật` · `chữ ngoài Text` · `một khái niệm một tên` |

**Hệ chuyển động đã tồn tại** (`src/constants/motion.ts`), và nó tốt hơn thứ một
lượt làm mới sẽ tạo ra: bốn `duration` được đặt tên vì app **đã** nói bằng bốn
con số ấy ở bảy chỗ; lò xo viết bằng `spring(duration, bounce)` của Apple; và nó
ghi rõ **hai thứ cố ý KHÔNG token hoá** — rig nhân vật và dải xuất hiện — vì
chúng là *choreography*, không phải một thang. Bước kiểm `mô hình lò xo` còn bắt
được rằng **công thức damping trên slide WWDC23 của Apple là SAI** và đã được
chính Apple đính chính; một bản chép từ slide sẽ đỏ ở đó.

Không dựng lại một hệ thống như thế. Đó sẽ là làm ra việc.

---

## Đã kiểm trong lượt này — và kết quả

### 1. Reduce Motion — ĐỦ

`grep` chỉ ra **4** chỗ dùng `useFrameCallback` mà không đọc `reduceMotionSV`.
Đọc từng chỗ: **0**.

| Chỗ | Sự thật |
|---|---|
| `koa/figure-clock.ts` | đồng hồ phụ; cổng nằm ở chỗ tiêu thụ (`koa-figure.tsx`), nơi CÓ đọc |
| `mascot.tsx` | chỉ là chú thích nhắc tới đồng hồ của `KoaFigure`; bản thân nó dùng `useAnimatedReaction` |
| `(tabs)/index.tsx` | như trên — chú thích |
| `drag-reorder.tsx` | **từ chối có chủ ý, có ghi lý do**: đóng băng cú tự-cuộn khi đang kéo là gỡ mất tính năng. Khớp với ý định của Apple — Reduce Motion nhắm vào hoạt hoạ tự chạy, không nhắm vào thao tác trực tiếp |

Và `use-reduced-motion.ts` đã ghi sẵn phần dễ sai nhất: `withTiming`/`withSpring`
/`withRepeat`/`withDelay`/`withSequence` **mặc định `ReduceMotion.System`**, nên
chúng đã tôn trọng cài đặt mà không cần ai bảo. Chỉ `useFrameCallback` là không
— và đúng hai đồng hồ ấy đã được nối.

Chú thích của chính tệp đó nói một lượt rà soát trước đã kết luận sai *"vì nó đo
bằng cách grep một từ thay vì đọc thư viện hứa gì"*. Lượt này suýt lặp lại.

### 2. Hành động phá huỷ — ĐỦ, nhưng KHÔNG có bước kiểm

**13/13** hook xoá đều có bước xác nhận ở chỗ gọi. `grep` chỉ ra một ứng viên
(`useDeleteWorkoutSession` trong `log-workout.tsx`); đọc ra đó là một **chú
thích** giải thích vì sao một buổi tập ghi hai lần lại nặng, không phải lời gọi.

Không có bước kiểm nào canh tính chất này. `write-confirmed` canh chuyện khác —
rằng server đã thật sự đụng vào một hàng. **Ghi lại như một khoảng trống đã
biết, không thêm bước kiểm trong lượt này**: tính chất đang đúng 13/13, chưa có
khiếm khuyết nào, và thêm luật cho một thứ đang đúng là làm ra việc. Nếu app
thêm hook xoá thứ 14, đây là chỗ để nhớ.

### 3. Haptics — nhất quán

`selectionAsync` 188 · `Light` 66 · `Success` 45 · `Medium` 16 · `Warning` 7 ·
`Error` 2 · `Heavy` 1. Đó đúng là mô hình ngữ nghĩa của Apple: chọn lựa, va
chạm nhẹ, và ba loại thông báo kết quả. Không có chỗ nào dùng lẫn.

---

## Ba mức bằng chứng của lượt này

| | |
|---|---|
| **TĨNH** | 211 bước có tên; đọc `motion.ts`, `use-reduced-motion.ts`, 13 chỗ gọi xoá, thống kê haptics |
| **RUNTIME (web)** | không chạy lại trong lượt này — **không đổi một dòng mã nào** |
| **MÁY THẬT** | ❌ không có máy. Cảm giác cuộn, độ trễ chuyển màn, jank, bộ nhớ, VoiceOver — không mục nào kiểm được ở đây. Xem `docs/QA-MAY-THAT.md` |

**Không có phát hiện nào về chuyển động hay hiệu năng trong trang này được xác
nhận trên máy thật.** Một lượt rà soát tĩnh không đo được jank.

---

## Nghiên cứu

**Không có.** Lượt này không đổi hành vi hoạt hoạ, không đụng API nào của
Apple/Expo/React Native, nên không có câu hỏi nào cần tra cứu. Ghi ra chứ không
dựng một mục "nghiên cứu" cho có.

(Nghiên cứu của các lượt trước — Hermes/Expo/RN, Sentry RN, Playwright — nằm ở
`docs/AUDIT_STATE.md` và `docs/HA-TANG.md`.)

---

## Quyết định thiết kế đang chờ — KHÔNG cài đặt

| ID | Cần quyết định gì |
|---|---|
| **ERRBOUND-2** | Biên bắt lỗi thứ hai ngoài các provider. Fallback ấy không đọc được theme hay ngôn ngữ → phải chọn **một màu** và **một ngôn ngữ**. Ba lựa chọn A/B/C và ba câu hỏi ở `AUDIT_STATE.md` |
| **SHOP-HDR** | Chữ màu gì cho đầu trang trong suốt trên nền sáng (`/shop`, `/mascot-room`). Mã đã ghi đây là quyết định mở; ảnh `empty/shop.png` là bằng chứng |
| **SENTRY-UI** | Cài đặt có nói app gửi báo cáo sự cố đi không, và có công tắc không. Chỉ thành vấn đề khi bật DSN |

---

## Bài học của lượt này

**Ba lần liên tiếp `grep` chỉ ra một khoảng trống và việc ĐỌC cho ra không có
khoảng trống nào** — Reduce Motion (4→0), xoá không xác nhận (1→0), và ở lượt
trước là "11/14 bước PostgreSQL" (thật ra 8).

Repo này chống lại phép đo bằng chuỗi, vì lý do của mỗi quyết định được viết
ngay cạnh nó — và một chú thích giải thích *vì sao không làm X* trông y hệt mã
*quên làm X* với một biểu thức chính quy.

Nên: ở đây, một phép đếm chưa phải một phát hiện. Chỉ khi đã đọc dòng ấy.
