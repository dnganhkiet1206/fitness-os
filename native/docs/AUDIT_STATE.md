# Trạng thái rà soát

Một trang, một câu trả lời: **hôm nay app đang đứng ở đâu.**

`SO-GHI-LOI.md` là sổ ghi từng lỗi và luật không được đụng vào chúng. Trang này
là thứ khác: nó nói vòng rà soát gần nhất chạy khi nào, trên commit nào, đo bằng
gì, và cái gì còn lại. Ai mở repo lần đầu đọc trang này trước.

**Vòng gần nhất:** 2026-09-18 · màn ghi cân nặng mới (`/log-weight`), và một cái
thước tôi viết lại dù repo đã có một bản tốt hơn — cổng bắt được · nhánh
`claude/ios-fitness-rebuild-omgulr`
(vòng rà pháp y đầy đủ gần nhất: 2026-09-14, commit `cf687a2`)

> **AI BACKEND: HOÃN THEO YÊU CẦU CỦA CHỦ DỰ ÁN — KHÔNG LÀM LÚC NÀY.**
> Trạng thái ở `docs/AI-TRIEN-KHAI.md` giữ nguyên, không đụng vào.

> **Trang này đã từng lỗi thời 90 commit, và đó là lỗi đắt nhất một trang như
> thế mắc phải.** Tới 2026-09-14 nó vẫn ghi vòng gần nhất là `efb851d` (09/09,
> *"0 thay đổi mã"*) trong khi giữa hai mốc ấy có **90 commit, 127 tệp `src`
> đổi và 26 luật mới** (27 tệp thêm vào `tools/`, một trong đó là thư viện dùng
> chung `lib/stack.mjs`). Cả trang tồn tại để trả lời "hôm nay app đứng ở đâu",
> nên lỗi thời ở đây không phải một chi tiết cũ — nó là toàn bộ câu trả lời sai,
> đưa cho đúng người đọc nó đầu tiên. Xem mục **RÀ PHÁP Y 09/14** bên dưới.

---

## Cổng chất lượng

| Cổng | Kết quả | Ghi chú |
|---|---|---|
| TypeScript | **XANH** | `npx tsc --noEmit -p tsconfig.json` từ `native/` — **đo lại vòng này**, exit 0, đầu ra rỗng |
| `node tools/check.mjs` | **XANH** | exit 0, **269** bước, tất cả xanh — **đo lại vòng này**. Và nó KHÔNG xanh lúc vòng này bắt đầu: ở `aae4484` (đã đẩy lên remote) `plan-week.mjs` đỏ, vì lượt sửa dải lịch được nghiệm thu bằng ảnh chụp mà không chạy lại cổng. Xem mục **15/09** bên dưới. Chạy từ `native/`; chạy từ gốc repo là exit 2 và nó cố ý từ chối. Con số này được `tools/gate-count.mjs` giữ khớp với `STEPS.length`, vì nó đã sai hai lần: `quality-gate.yml` ghi 211 khi cổng đã 215 (sửa 09/09), rồi chính bảng này ghi 215 khi cổng đã 241 |
| Quét runtime 45 route | **KHÔNG CHẠY LẠI VÒNG NÀY** | vòng này ĐỘNG vào `native/src` (biên bắt lỗi ở `_layout.tsx`). Bộ chạy web đầy đủ mất nhiều phút và không nằm trong cổng; thay vào đó biên được chứng minh bằng `tools/error-boundary.mjs` — React 19 + ReactDOM thật trong một trình duyệt thật. Số gần nhất của bộ chạy đầy đủ (vòng A11Y-2): không route nào trắng, 1 cảnh báo web-only trên `settings` |
| Đổi theme, 9 màn | **KHÔNG CHẠY LẠI VÒNG NÀY** | biên đọc bảng màu qua `usePalette` như mọi màn khác và không thêm nhánh `m.lit` nào — `tools/theme-shape.mjs` **5 tệp, 6 nhánh** (từ 09/09; trước đó 6 tệp, 8 nhánh), và nó nằm trong 269 bước. Số gần nhất (A11Y-2): lỗi JS 5 → 1 |
| Nút lồng trong nút, 6 tab chính | **KHÔNG CHẠY LẠI VÒNG NÀY** | `tools/a11y-swallow.mjs` và `tools/tap-targets.mjs` nằm trong 269 bước và vẫn xanh — nút thử lại của biên là một `Pressable` có nhãn, cao 44. Số gần nhất: 0/6 |
| ESLint | **KHÔNG CHẠY ĐƯỢC** | `eslint` không có trong `node_modules`; `npx expo lint` báo `Cannot find module 'eslint'` **và vẫn thoát 0** — nên đừng đọc mã thoát của nó là "sạch". Cổng thật là 269 bước ở trên |
| Bản dựng native | **CHƯA CHẠY Ở ĐÂY** | môi trường này là Linux; iOS phải dựng ở máy bạn |

---

## 18/09 (d) — chiếc cân "thức dậy", và một cái sàn không có chỗ để nhường

Đặt hàng: kéo thước thì chiếc cân sáng lên như một cân điện tử thật vừa có
người bước lên. Display là điểm sáng chính, tấm cảm biến phụ, thân và viền chỉ
nhích. Không glow, không LED, không particle. Và: **xem ảnh ACTIVE trước, rồi
mới nối animation.**

### Màn hình là một ĐÈN NỀN — nên công thức chỉ có một

Bản đầu tôi định pha mặt màn hình bằng `alpha(c.foreground, …)` như mọi lớp
khác. Nó **sai hướng** ở bản sáng: mực bản sáng là màu TỐI, nên "sáng lên" lại
ra tối đi. Một cái đèn nền thì **trắng ở mọi diện mạo** — nó là nguồn sáng,
không phải một token theme. Nên mặt màn hình là trắng ở một độ mờ, và độ mờ ấy
chính là công tắc:

| | nghỉ → hoạt động |
|---|---|
| sáng | 0,75 → 1,00 |
| tối | 0,06 → 0,80 |

Ở bản tối 0,06 là tấm **tối** và 0,80 là tấm **sáng**, nên chữ số **đảo màu
theo tấm** — đúng một LCD có đèn nền vừa bật trong phòng tối. Không phải hiệu
ứng thêm vào; là hệ quả của việc tấm nền thật sự sáng.

### Bản SÁNG không có chỗ để sáng thêm — và luật bắt được điều đó

Ở bản sáng, mặt màn hình vốn đã `#ffffff` và số vốn đã `foreground`. Nên trạng
thái *hoạt động* giữ đúng mức hiện tại, và *nghỉ* mới là cái được hạ. Chủ dự án
nói đúng khi gọi cân hiện tại là standby — hoá ra ở bản sáng nó đang ở ACTIVE,
và standby là thứ chưa tồn tại.

Luật đầu tôi viết đòi *mặt màn hình* đổi ≥1,05. Bản tối đạt 8,2; **bản sáng chỉ
1,045 và đỏ.** Không phải lỗi giá trị: hạ tấm đèn bản sáng xuống nữa thì bậc so
với thân cân tụt dưới 1,134, tức chiếc cân mất màn hình. Cửa sổ hợp lệ đóng.

Nên cú thức dậy ở bản sáng đi qua **chữ số**: 7,41 → 17,57 (**2,37×**). Ở bản
tối qua **tấm nền** (**8,2×**). Luật đòi *ít nhất một kênh* rõ rệt, chứ không
đòi kênh nào cụ thể — và vế "tấm nền dẫn trước thân cân" vẫn giữ cho hiệu ứng
không thành cả chiếc cân phát sáng.

**Và luật còn bắt được một chỗ tôi tự lệch:** bảng thiết kế ghi *"bản sáng lúc
nghỉ, số dịu về `secondaryForeground`"*, nhưng mã tôi viết đặt `foreground` cho
cả hai trạng thái sáng — cú thức dậy bản sáng khi ấy chỉ 1,045. Sửa bằng cách
đưa **tên token của chữ vào chính bảng `TONE`**, nên mã và luật đọc một nguồn.

### Một cửa sổ rộng 0,04

Tấm đèn bản tối lúc nghỉ bị **hai sàn kẹp**: ≥1,134 so với thân cân, và chữ đơn
vị ≥4,5 trên tấm. Ở 0,09 đơn vị tụt 4,37; ở 0,04 bậc chỉ 1,120. Hợp lệ chỉ
0,05–0,08 — chốt **0,06** (bậc 1,183 · đơn vị 4,83).

### Luật — `tools/body-scale.mjs`, 10 → **31 ca**

Bốn trạng thái × (bậc bề mặt · số · đơn vị · thứ bậc số>đơn vị), cộng: mọi lớp
khi sáng **không được nhạt hơn** khi nghỉ, tấm đèn phải **là** `#ffffff`, tấm
nền phải dẫn trước thân cân, và ít nhất một kênh thức dậy ≥1,5×.

Năm phép thử phá, mỗi cái đỏ đúng câu: đèn nền thôi trắng · tấm cảm biến lúc
sáng nhạt hơn lúc nghỉ · tấm đèn bản tối thôi sáng lên · số và đơn vị cùng
token (nghỉ) · đơn vị bằng số (hoạt động).

### Và `theme-shape` bắt chính con số của nó

Bản đầu có **3** cờ `m.lit`; gộp màu chữ vào `TONE` còn **1**, và luật đỏ vì
CO_MAU vẫn ghi 3 — *"một cờ đã bỏ; sửa con số trong danh sách để nó thôi nói
dối"*. Đúng loại luật đáng có.

### Nối cử chỉ

`onIndex` của thước là thứ đánh thức cân — không phải một sự kiện riêng. Vào
240ms (`duration.move`), giữ **3 giây** sau cú cuối, ra 320ms (`duration.swap`);
mỗi lần chạm lại là hẹn giờ đặt lại. Chuyển tiếp là **hai hình xếp lớp đổi
`opacity`**, không nội suy từng thuộc tính: `react-native-svg` raster lại cả
hình khi một prop con đổi — bài học đã ghi ở `weight-goal-ruler.tsx`.

**Chưa đúng ý thì sửa một số:** độ mờ tấm cảm biến lúc sáng (0,12) và độ sáng
tấm đèn bản tối (0,80).

---

## 18/09 (c) — hệ màu tối của màn cân, và một tấm ảnh tôi đã có mà không mở

Chủ dự án gửi ảnh MÁY THẬT của cả hai diện mạo và tám điểm: nền quá gần đen,
thân cân hoà vào nền, màn hình thành khối xám nặng, nút Lưu *"nhìn giống
disabled button"*.

### Điều phải nói trước: tôi đã có bằng chứng và không mở nó

Ảnh bản tối của màn này được render **ba lượt** (`weigh2`, `weigh3`, `weigh4`) và
tôi chỉ mở ảnh bản SÁNG mỗi lượt. Lớp trắng phủ mờ ghi ở 17/09 (c) là của màn
**dashboard** — nơi có aura/blur — chứ không phải của mọi màn tối; sheet này
render bình thường suốt. Câu "điểm ảnh bản tối không dùng được" là một khái quát
quá rộng, và nó thành cái cớ để không nhìn.

Tệ hơn: phép đo của tôi ĐÃ nói ra vấn đề — thân cân/trang 1,084 (tối) so với
1,104 (sáng) — và tôi lý giải nó đi, gọi là *"minh hoạ, có viền riêng, chấp nhận
được"*. Chủ dự án phải gửi ảnh máy để nói lại điều con số đã nói.

Bài học hẹp: **một sàn bị bác phải bác bằng một phép đo khác, không bằng một
câu.** Nếu 1,134 không áp cho minh hoạ thì phải có con số nào đó áp — và tôi
không đưa ra con số nào, chỉ đưa ra một lý lẽ.

### Nút Lưu: `primary` KHÔNG sửa được, và cổng là thứ nói ra

Chủ dự án cho phép dỡ `primary`. Tôi sửa #a8afbd → #ededed, và cổng đỏ **ba
bước**: `tab-tint`, `glyph-theme`, `resting-aura`.

`c.primary` đang làm **ba việc**: mặt nút đặc, tint tab đang chọn, và màu bốn
glyph. Ở bản sáng (#1a1917) cả ba đều ổn. Ở bản tối chúng kéo nhau **ngược
chiều**:

| dùng làm | #a8afbd | #ededed |
|---|---|---|
| mặt nút đặc / trang | 9,14 | **17,20** |
| tint tab / viên TRẮNG iOS 26 vẽ | ~1,9 | **1,17** ← dưới sàn 1,5 |

Tức làm nút mạnh lên bằng `primary` thì thanh tab thôi nói được bạn đang ở tab
nào. Lý do gốc: một **mảng màu lớn** và một **dấu nhỏ** không đọc giống nhau —
cùng một xám lỡ cỡ, mảng lớn đọc ra "vô hiệu", dấu nhỏ đọc ra "đang chọn".

Nên `primary` được **trả về** #a8afbd, mốc đóng băng trả về nguyên trạng, và mặt
nút có token RIÊNG: `Material.actionSurface` — sáng `#1a1917` (đúng
`lightPalette.primary`, không đổi một byte), tối `#ededed` (= `foreground`, trả
lại phép đối xứng `primary === foreground` mà bản sáng vẫn có).

| nút Lưu | /trang | chữ trên nút | disabled (.4) |
|---|---|---|---|
| sáng | 16,01 | 17,57 | 2,49 |
| tối | **17,20** | 17,20 | 3,36 |

Cái CŨ 9,14 nằm **giữa** enabled và disabled — đúng lý do nó đọc ra là disabled.

**Chỗ mù, ghi ra:** `backgroundColor: c.primary` còn ở **41 tệp** và CHƯA chuyển
sang token mới, nên hôm nay chỉ nút của `/log-weight` mạnh lên. Chuyển hết là
một lượt riêng, và phải soi từng chỗ — trong 41 chỗ ấy không phải chỗ nào cũng là
một nút hành động đặc.

### Một token KHÔNG dỡ

Được hỏi rõ phạm vi, chủ dự án chọn dỡ hai token. Kết quả: **không token nào
được dỡ.** `primary` bị cổng bác (ở trên), và `background` thì phép đo bác.

**`background` KHÔNG dỡ, dù được cho phép** — vì phép đo nói nó phản tác dụng.
`card` (#0e0e11) bị đóng băng và phải nổi TRÊN trang:

| nền | card/nền |
|---|---|
| #070708 (đang chạy) | 1,045 |
| #0a0a0c | 1,026 |
| #0c0c0f | 1,013 ← thẻ chìm |

Mục tiêu chủ dự án nêu là *separation*; nâng nền làm **mọi thẻ trong app** mất
separation để một màn có thêm chút tách lớp. Cái phải sửa là chiếc cân.

### Độ mờ của chiếc cân TÁCH theo diện mạo

Một `alpha(c.foreground, …)` cho cả hai diện mạo là lập luận gọn mà sai: ở vùng
gần đen, tỉ số 1,08 là một chênh lệch độ sáng tuyệt đối rất nhỏ và OLED nén nốt
phần còn lại — tỉ số tương phản **nói quá** về độ nhìn thấy ở đầu tối của thang.

Mỗi số bản tối chọn để khớp **thứ bậc** bản sáng, không khớp con số của nó:

| lớp | sáng α → tỉ số | tối α → tỉ số |
|---|---|---|
| thân cân / trang | 0,05 → 1,104 | **0,11 → 1,237** |
| viền ngoài / trang | 0,13 → 1,298 | **0,17 → 1,484** |
| viền trong / thân | 0,07 → 1,150 | **0,06 → 1,167** |
| tấm cảm biến / thân | 0,08 → 1,173 | **0,06 → 1,167** |
| màn hình / thân | (card) → 1,211 | **0,07 → 1,200** |
| ASCND / thân | 0,28 → 1,808 | **0,20 → 1,810** |

Ba lớp có α bản tối **thấp hơn** bản sáng: chúng nằm trên một thân cân đã sáng
hơn, nên ít mực hơn vẫn ra đúng bậc. Phép composite tự lo.

Và màn hình bản tối nay **nhẹ hơn** bản trước (0,07 thay vì 0,13). *"Khối xám quá
nặng"* không phải lỗi của màn hình: thân cân quá tối nên màn hình đọc ra như một
tấm bê tông rời. Sửa thân cân thì màn hình về đúng sức nặng tương đối.

### Thước: KHÔNG sửa, và đây là lý do

Chủ dự án xin *"major rõ hơn, minor nhẹ hơn, marker nổi bật nhất"*. Nó đã thế:
`c.foreground` ở **1,0** (kim) · **0,7** (vạch lớn) · **0,3** (vạch nhỏ). Không có
khiếm khuyết nào đo được, và nó là component DÙNG CHUNG với màn mục tiêu cân
nặng — sửa nó là đổi một màn không ai yêu cầu.

### Bản sáng không đổi một byte

DOM xác nhận: thân 0,05/0,13 · viền trong 0,07 · tấm 0,08 · màn `#ffffff` ·
ASCND 0,28 — y nguyên.

---

## 18/09 (b) — bản TỐI của màn cân: một vế rớt sàn, và ảnh không nói ra được

Chủ dự án: *"check darkmode"*.

Không kiểm được bằng ảnh. Bản dựng web ở diện mạo tối bị một lớp trắng phủ mờ cả
trang, và lượt quét 17/09 (c) xác nhận **không phần tử DOM nào** giải thích nó —
nên điểm ảnh bản tối vô dụng ở đây. Cách còn lại là cách chính các luật trong
`tools/` dùng: dựng lại đúng chồng mặt từ bảng màu đang ship rồi tính, và hỏi
DOM xem bản dựng thật có ra đúng những màu ấy không.

### Một vế RỚT, và nó rớt ở đúng chỗ mã "gọn" nhất

Hình chiếc cân cố ý dùng `alpha(c.foreground, …)` cho gần hết các lớp: mực bản
sáng là màu tối, bản tối là màu sáng, nên MỘT dòng cho ra "đậm hơn mặt dưới" ở
sáng và "sáng hơn mặt dưới" ở tối. Đúng — cho các lớp **nền**.

Chữ thì không đi theo được. Mặt màn hình phải là thứ **sáng nhất** của hình; ở
bản tối điều đó là `alpha(ink, 0.13)` = `#2f2f2f`. Trên nó:

| | tối | sáng |
|---|---|---|
| số cân nặng (`foreground`) | 11,44 | 17,57 |
| **"kg" (`mutedForeground`)** | **3,48** ✗ | 5,78 ✓ |

3,48 dưới sàn 4,5 của WCAG 1.4.3. Một diện mạo đúng, một diện mạo rớt, **cùng
một dòng mã** — và bản sáng không hé ra gì cả.

Không hạ độ đậm mặt màn xuống để chữa được: ở α 0,07 nó mới lên 4,14 mà bậc so
với thân cân đã tụt còn 1,168. `secondaryForeground` đo **4,70** (tối) · **7,75**
(sáng) — qua cả hai, vẫn nhạt hơn hẳn con số nên thứ bậc không đảo.

### Luật mới — `tools/body-scale.mjs` (cổng 254 → **255**)

Đọc độ mờ mặt màn và **tên token** của hai dòng chữ ra khỏi chính tệp, dựng lại
chồng mặt, đòi cả hai qua 4,5 ở cả hai diện mạo. Cộng hai vế: mặt màn phải còn
là một **bậc** thật so với thân cân (1,134 — thiếu nó thì cách "sửa" rẻ nhất là
hạ độ đậm mặt màn và chiếc cân mất màn hình), và chữ đơn vị phải **nhạt hơn** con
số.

Bốn phép thử phá, mỗi cái đỏ đúng câu: đơn vị quay lại `mutedForeground` · mặt
màn α 0,02 (mất bậc) · số và đơn vị cùng token (thứ bậc đảo) · thân cân α 0,30
(mặt màn thôi là bậc). Cộng một phần tự kiểm chạy lại vế chữ với token đã rớt và
đòi nó đỏ.

Vì sao chưa cổng nào thấy: `tsc` thấy hai string hợp lệ · `palette-key` canh
**tham số** của `alpha()` chứ không canh kết quả · `glass-legibility` đo chữ trên
mặt **kính**, không trên mặt do một component tự pha · và ảnh chụp thì không phải
một cửa ở diện mạo này.

### Hai vế tôi KHÔNG bắt, và lý do

`thân cân / trang` đo 1,084 (tối) · 1,104 (sáng) — dưới 1,134. Nhưng 1,134 là bậc
cho một **dấu duy nhất** (viên lịch tuần, rãnh thanh tiến độ); thân cân là một
**minh hoạ** và nó còn có viền riêng. Vay một sàn từ ngữ cảnh khác để tự tạo ra
một lỗi là làm hỏng chính cái sàn ấy. Hai con số vẫn được in ra trong phép đo.

### Ba lượt neo sai nữa, cả ba đều của tôi

Phép đo của tôi gõ tay `mutedForeground` nên báo rớt một lỗi **đã sửa xong**; rồi
nó bắt phải `<title>` trong SVG (nhãn trợ năng, không có màu) và đọc ra
`rgb(0,0,0)`; rồi bắt phải `<head><title>` — cũng là "ASCND", tên app, đứng trước
trong thứ tự tài liệu. Chữ ASCND thật đo đúng `rgba(237,237,237,0.28)`. **Không
có lỗi nào ở đó cả**, và cả ba lần con số đều ổn định và sai.

---

## 18/09 — màn ghi cân nặng, và một cái thước tôi viết lại dù nó đã có

Chủ dự án đưa ảnh dựng và đặt hàng: bấm "Ghi" ở dòng Cân nặng phải mở một trải
nghiệm cân riêng — chiếc cân lớn ở giữa, thước bên dưới, nút Lưu to ở đáy.

### Flow

`Today` → dòng Cân nặng → `/log-weight` (sheet `presentation: 'modal'`, đúng
kiến trúc sheet sẵn có) → kéo thước → Lưu → về Today. Đo trên bản dựng:

    trước khi bấm  /
    sau khi bấm    /log-weight   tiêu đề "Cập nhật chỉ số cơ thể"
    kéo thước      71,5 → 70,0 → 73,0 → 72,3   (nhãn hai đầu đi theo)
    sau khi lưu    POST /rest/v1/weight_logs {"weight_kg":72.3}  ·  về /

### Cái thước: tôi viết bản thứ hai, và chính cổng bắt được

Tôi dựng một `weight-ruler.tsx` mới trước khi đi tìm. Cổng đỏ ở bước **`thước
cân nặng`** — một luật viết riêng cho cái thước **đang có**,
`weight-goal-ruler.tsx`, dùng ở màn mục tiêu cân nặng.

Bản ấy biết những thứ bản của tôi không biết, và mỗi thứ là một lỗi đã trả giá:

- vạch dài rơi đúng số nguyên **của thang đo**, ở cả kg lẫn **pound** — bản cũ
  đánh theo `index % 10`, đúng ở kg do tình cờ và **sai mọi vạch lb**;
- số học chạy bằng **phần mười nguyên**, vì `30 / 0.1` đã là 299,999…;
- một `<Pattern>` thay cho `FlatList` 2.701 phần tử, nên không có ô trắng khi
  kéo nhanh;
- `<Svg>` đứng yên, không đọc `.value` nào (react-native-svg raster lại cả hình
  khi một prop con đổi);
- hai đầu thước có **nắp che**, kiểm ở mười vị trí cuộn.

Bản của tôi bị xoá. Đây là lần thứ ba trong lịch sử repo này một bản thứ hai bị
bắt, và lần này nguyên nhân đơn giản: **tôi không tìm trước khi viết.**

### Cái KHÔNG được viết lại: đường ghi

`weight-entry.tsx` bị gỡ, nhưng đường GHI chuyển **nguyên vẹn** sang
`src/hooks/use-weight-write.ts`, kèm cả biên bản của nó: quy đổi kg/lb, ngưỡng
hợp lý áp lên giá trị **sẽ được lưu** (không phải số hiển thị — đo số hiển thị
bằng thang kg sẽ từ chối một lần cân thật của bất kỳ ai dùng lb), và nhánh
offline có `mutationKey` bền.

### Một chỗ ảnh mẫu tự mâu thuẫn

Ảnh ghi "40 kg" và "100 kg" hai đầu với kim ở **chính giữa**, giá trị 54,7 —
nhưng giữa của 40–100 là 70. Nó là một bức tranh, không phải một control. Và
chốt cứng 40–100 còn cắt mất người nặng 110 kg.

Nên: thước chạy hết `BOUNDS.weight_kg` (20–400), hai nhãn đọc hai đầu **cửa sổ
nhìn thấy**, suy từ chính `TICK_W` của thước. Ở 71,5 chúng hiện 66,5 và 76,5.

Bản đầu tôi cho hai nhãn đọc `BOUNDS` — hiện "20 kg" và "400 kg" — tức nói về
một thứ mắt không thấy. Sửa sau khi nhìn ảnh render.

### Luật

- `plausible.mjs` trỏ vào `use-weight-write.ts`, và `/log-weight` vào danh sách
  miễn **kèm ba vế CHẠY được**: màn không có `<TextInput>`, thước dựng dải từ
  `BOUNDS.weight_kg`, và nút Lưu đọc `boundError()`. Phá từng vế → đỏ từng câu.
- `weight-card.mjs` + `todo-card.mjs`: vế "TodoCard phải dựng `<WeightEntry>`"
  thành "dòng cân nặng phải trỏ `/log-weight`, màn ấy phải gọi `useWeightWrite`".
  Điều được canh không đổi: **đúng một** chỗ gọi `useLogWeight()`.
- `sheet-header.mjs` 10 → 11 route modal.
- Tagline thương hiệu ra khỏi bảng dịch: nó không được dịch, nên nó là hằng chứ
  không phải khoá i18n — luật "tiếng Anh trong bảng tiếng Việt" đúng, và chữ
  nhường luật.

### Chưa chứng minh được ở đây

`syncProfileWeight` không chạy trong bộ chạy web: fixture **cố ý bỏ qua** bộ lọc
ngày (`live-world.mjs:128`), nên nó thấy "đã có lần cân mới hơn" và đúng mực
không đụng vào hồ sơ. Đường ấy không đổi một dòng nào so với bản đã ship, nhưng
tôi **không** đo được nó ở đây.

---

## 17/09 (d) — app chết trên máy thật, và cái luật viết ra để chặn nó chỉ thấy 30%

Chủ dự án dựng bản vừa đẩy lên máy và nhận ngay:

    [Worklets] Tried to synchronously call a Remote Function.
    Called "alpha" on the UI Runtime.      swipe-row.tsx (837:19)

Lỗi của tôi, và là lỗi ở đúng dòng tôi vừa viết: `alpha()` là hàm JS thường,
tôi gọi nó **bên trong** thân `useAnimatedStyle`. Thân ấy chạy trên UI runtime,
nên đó là một Remote Function và Worklets ném thẳng — app chết ở khung hình
đầu tiên.

**Bộ chạy web không thể thấy được.** RN Web không có UI runtime riêng: worklet
chạy cùng luồng JS, nên `alpha()` gọi được và mọi thứ xanh. Cổng 255 bước xanh,
`tsc` exit 0, ảnh chụp đúng — và app không mở nổi trên iPhone.

Sửa: tính hai đầu nội suy **trên luồng JS** rồi để worklet chỉ *bắt* hai chuỗi.

### Nhưng phần đáng giá là vì sao luật không bắt

`tools/worklet-callable.mjs` tồn tại **chính xác** để chặn lỗi này. Nó được viết
sau hai `.ips` ngày 14/09 (`spring()` gọi trong một worklet của toast), và
chú thích của nó đã nói ra cả cái điểm mù: *"Reanimated bản web không có luồng
UI riêng, nên lời gọi ấy chạy bình thường"*.

Nó vẫn để lỗi này đi qua, vì phạm vi của nó là **thân hàm có chỉ thị
`'worklet';` viết tay**. Callback truyền cho `useAnimatedStyle` và họ hàng
**không có chữ `'worklet'` nào** — plugin babel của Reanimated tự worklet-hoá
chúng lúc dựng. Với luật cũ, chúng vô hình.

Đo ra con số thì mới thấy lỗ to cỡ nào:

| | thân worklet |
|---|---|
| viết tay (`'worklet';`) — luật cũ thấy | **49** |
| tự worklet-hoá — luật cũ **không** thấy | **114** |
| tổng, sau khi mở rộng | **163** |

Tức cái luật viết ra để chặn crash trên UI thread đang soi **30%** mã UI-thread
của app. Nay nó cắt cả callback của `useAnimatedStyle`, `useAnimatedProps`,
`useDerivedValue`, `useAnimatedReaction`, `useAnimatedScrollHandler`,
`useFrameCallback`, `runOnUI`.

Phép thử phá là chính cú crash: đặt lại `alpha(m.liftedRow, 0)` vào trong thân
worklet → **đỏ**, gọi đúng tên `alpha`, đúng tệp, đúng lý do. Khôi phục → xanh.

`HOOKS` là một **danh sách chốt**, không phải một phép suy: một hook mới của
Reanimated sẽ không tự có mặt. Chỗ mù còn lại được ghi ngay cạnh danh sách.

### Bài học, và nó không phải "cẩn thận hơn"

Cổng này có 255 bước và **không bước nào chạy được trên iPhone**. Lỗi vừa rồi
không phải một lỗi khó thấy — nó là lỗi mà một lần mở app bắt được trong một
giây. Thứ duy nhất thay cho lần mở app ấy là một luật đọc mã, và luật ấy chỉ
đáng tin tới đúng cái phạm vi nó tự đặt cho mình. Phạm vi ấy phải được ĐO, chứ
không được suy: nếu 14/09 có ai đếm "49 trên 163" thì lỗ này đã lộ ngay hôm ấy.

---

## 17/09 (c) — dải ngang ở bản tối: một cái TÊN có hai nghĩa

Chủ dự án chụp bản tối: thẻ "Cần làm hôm nay" bị chia thành nhiều dải ngang,
mỗi hàng một vùng nền riêng, *"Dark Mode phải tạo thành một surface liền mạch"*.
Và họ tự chỉ ra gốc: **không phải lỗi swipe** — là cái highlight-on-swipe đã
đặt hàng trước đó. Đúng.

### Cơ chế, đo từ DOM chứ không suy từ trí nhớ

`SwipeRow` nhận một cặp `{ rest, lifted }`, và chỗ gọi khai `rest: m.bg` —
"màu mặt thẻ". Cái tên ấy có **hai nghĩa**:

| | mặt thẻ | hàng tự sơn thêm | kết quả |
|---|---|---|---|
| sáng | `rgb(255,255,255)` đặc | `rgb(255,255,255)` đặc | trùng khít, **1,000:1**, vô hình |
| tối | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.06)` | cộng dồn → `#242425` trên `#161617`, **1,166:1** |

1,166 nằm **trên** bậc bề mặt nhỏ nhất của iOS (1,134) — nên nó không phải một
sắc thái mờ nhạt, nó là một dải nhìn thấy rõ, trên mọi hàng, suốt thời gian.

**Nửa thứ hai của cùng một lỗi, im lặng hơn:** ở bản tối `lifted`
(`m.inset.bg`) **bằng đúng** `rest` — cùng một chuỗi. Nên cú "nhấc hàng lên khi
vuốt" chưa từng chạy một lần nào ở bản tối. Tính năng được đặt hàng thì không
hoạt động, còn cái giá của nó thì hiện suốt.

Gốc rễ một câu: `rest` được viết bằng **tên token** ("mặt thẻ") chứ không bằng
**ý định** ("đừng sơn gì cả").

### Sửa: bỏ hẳn `rest` khỏi API

`surface` nay là **một** màu — màu lúc NHẤC. Mặt lúc nghỉ là chính nó ở alpha 0,
tức không sơn gì; mặt thẻ hiện thẳng qua, kể cả quầng sáng sau nó. Đo lại trên
bản dựng, cả hai diện mạo, mọi hàng: `rgba(36,36,37,0)` và `rgba(247,244,239,0)`
— **alpha 0**. Không còn lớp thứ hai để cộng dồn.

Chỉ **độ mờ** chạy, không phải màu: hai đầu cùng một RGB. Nội suy giữa hai RGB
khác nhau sẽ đi qua một dải tông không ai chọn.

### Cái giá, và nó được đo chứ không bỏ qua

Hàng phải ĐỤC lúc bị kéo: `ReanimatedSwipeable` dựng tấm nút là
`StyleSheet.absoluteFill` **ngay sau** hàng (`ReanimatedSwipeable.tsx:612` —
đọc trong `node_modules`, không đoán), nên hàng mờ là hàng để viên nút hiện
xuyên qua chính nó. Đó đúng là lỗi `blend()` đã phải chữa trên màn *Buổi tập*.

Nên mặt hàng đục hẳn trong `LIFT_AT` = 0,12 đầu cú kéo. Mô hình nói rò lớn nhất
`LIFT_AT/(2·HANDOVER_AT)` = 10,9%. **Đo được 5,3%**, bằng nửa — vì mặt hàng chạy
theo `openness`, vốn lùi sau ngón tay đúng 10 điểm nhận diện, nên lúc viên nút
bắt đầu hiện thì hàng đã đục sẵn một phần:

| hàng dịch | đục mặt hàng | nút hiện | rò |
|---|---|---|---|
| 1đ | 0,12 | 0,03 | 2,2% |
| 3đ | 0,35 | 0,08 | 4,9% |
| 5đ | 0,58 | 0,13 | **5,3%** |
| 7đ | 0,81 | 0,18 | 3,4% |
| 9đ | 1 | 0,23 | 0% |

### Màu lúc nhấc: `Material.liftedRow`, dẫn chứ không gõ

- sáng `#f7f4ef` — **đúng byte** `m.inset.bg` vẫn trả về, bản sáng không đổi.
- tối `#242425` — `blend` của `onPage` chồng lên chính nó. **Không phải màu
  mới**: đúng cái màu hôm nay đang hiện sai chỗ, dời từ trạng thái NGHỈ sang
  trạng thái NHẤC.

`dark-frozen.mjs` vẫn xanh: mốc cấm **đổi** giá trị token, không cấm **thêm**.

### Một phát hiện phải báo, không được lặng lẽ sửa

Luật mới bắt ngay: **bản sáng chỉ 1,097:1** so với mặt thẻ — **dưới** bậc 1,134.
Tức highlight ở bản sáng yếu hơn chính cái dải bản tối. Nhưng chủ dự án ra lệnh
thẳng trong cùng lượt này: *"Light Mode phải giữ nguyên behavior hiện tại"*.

Nên nó **không** bị sửa. Bản sáng thành một **CÁI CHỐT** (đổi là đỏ, dù lên hay
xuống), bản tối chịu **SÀN** thật. Con số được báo lại kèm hai đề nghị —
`c.muted` 1,156 hoặc `c.secondary` 1,198 — và câu trả lời là của chủ dự án.

### Luật mới — `tools/row-surface.mjs` (cổng 253 → **255** bước)

Chín phép thử phá, mỗi cái đỏ đúng câu nó hứa: `surface` quay lại thành object ·
mặt nghỉ có alpha 0,06 · hai đầu là hai màu · độ đục trải ra cả cú kéo ·
`LIFT_AT` 0,6 · `liftedRow` tối thành `rgba()` · `liftedRow` tối = mặt thẻ (đúng
lỗi cũ) · `liftedRow` sáng bị đổi · chỗ gọi tự chế màu. Cộng một phần tự kiểm
chạy lại vế bậc bề mặt trên thế giới giả "lifted = mặt thẻ" và đòi nó đỏ, nên
xoá vế ấy đi không thể xanh.

Vì sao chưa cổng nào thấy: `tsc` thấy hai `string` hợp lệ · `dark-frozen` canh
GIÁ TRỊ token, không canh việc một component chồng hai token · `theme-shape`
canh nhánh `m.lit` · `on-page-fill` canh lớp tô trên TRANG, không trên MẶT THẺ ·
và ảnh chụp bản sáng thì **đúng**.

### Ba lượt đo hỏng nữa, cùng một họ

Cùng cái NEO sai, lần thứ ba tới thứ năm trong hai ngày: quét điểm ảnh → bắt
phải **chữ của chính hàng** (`#57524a` ≈ 81) chứ không phải rò; nhắm phần tử
rộng 50–70 → đó là viên nang, mà độ hiện sống trên **cái bọc rộng 72**; lấy
`min` opacity cả hàng → bắt phải tấm nút **bên trái** ("Bỏ qua"), thứ không bao
giờ hiện trong cú vuốt này nên luôn đọc ra 0. Cả ba đều cho số ổn định, lặp
lại được, và nói về chuyện khác.

### Một thứ nhìn thấy mà không sửa

Bản dựng **web** ở diện mạo tối bị một lớp trắng phủ mờ cả trang, và lượt quét
xác nhận **không phần tử DOM nào** giải thích được nó (không phần tử nào ≥380×700
có nền sáng). Nên điểm ảnh bản tối của bộ chạy web **không dùng được**, và mọi
số bản tối ở trên đến từ style đã tính + bảng màu đang ship, không từ ảnh. Nó có
trước lượt này.

---

## 17/09 (b) — viên "Đã ghi", và một bản dựng đẹp mà rớt sàn

Chủ dự án đưa một ảnh dựng — viên xanh nhạt, dấu tích xanh, **chữ xanh** — và
nói *"nút đã ghi thì nên làm như này"*.

### Bước đầu: ảnh ấy KHÔNG phải bản đang chạy

Bốn dòng phụ đề trong ảnh (*"Ghi lại các bữa ăn trong ngày"*, *"Theo dõi thời
gian ngủ"*…) không tồn tại một chữ nào trong `src`. Nên đó là ảnh dựng, là
ĐÍCH, không phải ảnh chụp lỗi. Bản đang chạy được chụp lại để đối chiếu: nút
dòng đã ghi là `backgroundColor: 'transparent'`, chữ xám, không viên, không
tích — một dòng chữ đậm trôi ở mép hàng.

Và chỗ đó đúng là hỏng, do chính lượt trước (`e0e1d82`) tạo ra: nút ấy vẫn
**bấm được** — nó là lối sửa một lượt ghi sai — nhưng đã thôi trông như nút.
HIG nói thẳng: control còn thao tác được thì phải còn trông như control.

### Nhưng bản dựng ấy rớt sàn ở bản SÁNG, và đây là số

`readinessGreen` bản sáng là `#078055`, mới **4,97:1** trên giấy trắng. Viên
xanh nhạt làm nền tối đi, nên chữ xanh trên viên xanh rớt dưới 4,5:1 của WCAG
1.4.3 ở **mọi** độ đậm:

| α | nền viên | viên/thẻ | chữ xanh/viên |
|---|---|---|---|
| 0,08 | `#ebf5f1` | 1,113 | **4,46** rớt |
| 0,12 | `#e1f0eb` | 1,175 | **4,23** rớt |
| 0,20 | `#cde6dd` | 1,316 | **3,77** rớt |
| 0,30 | `#b5d9cc` | 1,526 | **3,26** rớt |

Không phải ý thích — số học: màu ấy không có chỗ để nhạt. Ba đường vòng cũng
đo rồi: viên bằng bề mặt sẵn có (`secondary`/`muted`/`accent`) + chữ xanh ra
4,15 · 4,30 · 3,89, vẫn rớt, vì vấn đề nằm ở màu CHỮ; còn làm xanh đậm hơn cho
bản sáng thì đạt từ `#0a6f4a`, nhưng phải thêm token và `readinessGreen` còn tô
icon món ăn, vòng sẵn sàng, dải xu hướng — đổi nó là đổi cả một miền nghĩa cho
một cái viên.

### Nên màu xanh đi vào chỗ nó đủ sức đứng: DẤU TÍCH

Icon chịu sàn **3:1** của WCAG 1.4.11 chứ không phải 4,5:1, và trên viên nó đo
được 4,23 (sáng) · 9,75 (tối). Dư.

Kết quả: **viên xanh α 0,12 · tích xanh · chữ `secondaryForeground`** —
6,59:1 sáng · 4,88:1 tối, một token cho cả hai diện mạo. (`mutedForeground`,
màu chữ hiện nay, đạt 4,92 ở sáng nhưng chỉ **3,62** ở tối, nên nó không đi
được cả hai — và đó là một trong các phép thử phá.)

Đặt hàng cũ *"đã ghi thì mờ đi so với các thẻ còn lại"* không bị phá: viên đen
của dòng chưa ghi tách khỏi mặt thẻ **17,57:1**, viên xanh này **1,175** (sáng)
và **1,301** (tối). Nó vẫn là thứ yên nhất trong cột, chỉ là không còn tàng
hình. Sàn dưới 1,134 là bậc bề mặt nhỏ nhất iOS tự tạo — cùng con số
`bar-track.mjs` và `plan-week.mjs` dùng.

### Dấu tích này không phải dấu tích đã bị bỏ

Cái bị bỏ ở `e0e1d82` **thay thế ô icon của dòng**, nên ghi xong là dòng đổi cả
bố cục và mất lối sửa. Cái này nằm **bên trong viên**; ô icon giữ nguyên. Nó
cộng thêm một dấu hiệu không-phải-màu chứ không lấy đi cái nào — chữ "Đã ghi"
vẫn ở đó, WCAG 1.4.1 vẫn được giữ bằng chữ.

### BỎ QUA không được nhận viên này — và đó là một luật, không phải một câu

`quiet` gộp `done` và `skipped` cho ô icon và nhãn. Viên thì tách: xanh + tích
là lời khen, còn "Bỏ qua" là việc người dùng **chủ động** bỏ. Khen một việc bị
bỏ là app nói sai về chính họ. Hai vế trong `todo-card.mjs` canh cả hai chiều:
viên phải gắn vào `done`, và phải **không** gắn vào `quiet`.

### Luật mới, và nó đọc TÊN TOKEN chứ không gõ lại

`tools/todo-card.mjs` 1.076 → **1.083 ca**. Nó lấy `DONE_PILL_ALPHA` và tên
token của nền/chữ/tích ra khỏi chính hai style ấy, dựng lại mặt thẻ của từng
diện mạo theo đúng chồng mặt, rồi đo ba sàn. Đổi `actionTextDone` sang một
token rớt sàn là **đỏ**, chứ không phải xanh vì luật vẫn đang đo token cũ.

Sáu phép thử phá, mỗi cái đỏ đúng câu nó hứa: chữ → `readinessGreen` (4,23
sáng) · chữ → `mutedForeground` (3,62 tối) · α → 0,02 (viên tàng hình, đỏ cả
hai diện mạo) · bỏ dấu tích · viên gắn vào `quiet` (đỏ **hai** câu) · xoá tên
hằng. Cộng một phép chống kêu oan: chữ → `foreground` (14,95 · 11,87) phải
**vẫn xanh**, và nó vẫn xanh.

### Một thứ nhìn thấy mà không sửa

Bản dựng web chụp ở diện mạo TỐI bị một lớp trắng phủ mờ cả trang. Nó có
**trước** thay đổi này — ảnh chụp trước khi sửa cũng vậy — nên không phải của
lượt này. Giá trị màu đọc thẳng từ DOM vẫn đúng (`rgba(43,245,168,0.12)`, chữ
`#999999`), nên phép đo không dựa vào cái ảnh ấy.

---

## 17/09 — "chậm nữa đi, 0.40", và lần này phép đo chạy trên bản dựng thật

Vòng trước tôi dừng ở `spring(0.34)` và nêu lý do (vọt lố tăng nhanh hơn phần
chậm rãi thu được). Chủ dự án thử rồi trả lời: *"chậm nữa đi, 0.40"*. Đó là
quyết định của chủ dự án trên cảm giác thật, và nó thắng lập luận của tôi trên
bảng số. `SWIPE_SNAP` → `spring(0.40, BOUNCE.snappy)`.

Cái giá được ghi ra chứ không giấu: **2,4 điểm** vọt lố ở cú bắn 1.200 px/s
trong mô phỏng — cận TRÊN của một ca cố ý khắc nghiệt.

### Rồi đo lại trên bản dựng thật, vì mô phỏng không phải bằng chứng

Thả tay ở −60 (đã qua ngưỡng cam kết 47,5, chưa tới hết mở 72), hàng nghỉ đúng
**−72** — mở hết, không hụt:

| | đo trên bản dựng | bảng mô phỏng |
|---|---|---|
| 90% quãng | **~176ms** | 217ms |
| đứng yên | **~528ms** | 717ms |
| vọt lố phía đối diện | **0,3đ** | 2,4đ |

Hai cột **không** được gộp. Mô phỏng tích phân cả quãng 72 điểm ở vận tốc bắn
1.200 px/s; cú thả tay thật đi 12 điểm ở vận tốc thấp hơn nhiều. Reanimated dừng
lò xo theo **năng lượng** (ngưỡng `6e-9`), nên biên độ nhỏ chạm ngưỡng sớm hơn —
chênh lệch ấy là tính chất của bộ giải, không phải sai số.

0,3 điểm vọt lố là dưới một pixel: nó không vẽ ra vệt màu của cái nút phía đối
diện, tức thứ tôi đã lấy làm lý do để dừng ở 0,34 thực tế không xảy ra ở 0,40.

### Ba lượt đo đầu đều hỏng — lượt thứ năm cái NEO sai trong hai buổi

1. Kéo **9 nấc** (−90): đã quá mở, lò xo chỉ còn 2 điểm để đi. Con số 90% khi ấy
   nói về 2 điểm chứ không về cú mở.
2. Kéo **6 nấc** (−60 ở ngón, hàng mới ≈ −35): **chưa** tới ngưỡng cam kết nên
   hàng bật NGƯỢC về 0. Đó là một cú **đóng**, và nó xanh mượt như một cú mở.
3. Mốc đo lấy theo **hộp của cái nhãn** → chỗ nghỉ đọc ra −67,1 trong khi hình
   học nói −72. Chênh 4,9 điểm ấy lặp lại y hệt qua nhiều lượt, nên nó không
   phải nhiễu: nhãn nằm **bên trong** phần tử đang co 0,82 (`HANDOVER_SCALE`),
   nên hộp của nó trộn cú trượt với cú nhường chỗ. Mốc đúng là `translateX` của
   chính tấm thẻ, đọc thẳng từ `transform` đã tính.

Lần leo chuỗi cha ấy cũng trả lời luôn một câu chưa ai hỏi: viên nút lộ ra
`x=319 w=60`, hàng mở tới mép phải 313, khe 72 điểm từ 313 tới 385 — viên 60
điểm nằm **giữa đúng 6 điểm mỗi bên**, không bị cắt.

Cùng một bài học ba vòng liền, viết lại cho gọn: **một phép đo sai neo nguy hơn
không đo.** Cả ba lượt trên đều cho ra con số đẹp, ổn định, lặp lại được — và
đều nói về một chuyện khác.

---

## 16/09 (b) — "trượt từ từ hơn", và một `transform` bị nuốt im lặng

Chủ dự án, hai việc: *"thanh trượt thẻ của todo còn hơi nhanh… làm nó trượt từ
từ nên mượt hơn"* và *"cho mấy cái nút action đằng sau thẻ có hiệu ứng hiện ra
như nút ghi"*.

### 1. Trượt chậm lại — `spring(0.24)` → `spring(0.34)`

`duration` của `spring()` tỉ lệ nghịch với ω₀ (`stiffness = (2π/duration)²`),
nên kéo dài nó là **hạ tần số riêng, giữ nguyên tỉ số giảm chấn** — hàng hạ cánh
y hệt, chỉ đi quãng ấy chậm hơn. Đó đúng là "trượt từ từ" chứ không phải "nảy
nhiều hơn". Đo bằng lò xo thật của Reanimated, quãng 72 điểm:

| duration | ω₀ | 90% | settle | vọt lố khi bắn mạnh |
|---|---|---|---|---|
| 0,24 (cũ) | 26,2 | 133ms | 433ms | 0,7đ |
| **0,34** | **18,5** | **183ms** | **600ms** | **1,4đ** |
| 0,40 | 15,7 | 217ms | 717ms | 2,4đ |
| 0,50 | 12,6 | 267ms | 883ms | 5,4đ |

Dừng ở 0,34 vì vọt lố là thứ trả giá: vọt qua 0 là hàng trượt sang phía **đối
diện**, và tấm nút bên ấy nằm ngay dưới. Từ 0,40 con số ấy tăng nhanh hơn hẳn
phần "chậm rãi" thu được. `SWIPE_SNAP` dùng ở hai chỗ nên `today-meals.tsx` chậm
theo — đúng điều chú thích của chính hằng ấy đã lập luận: một cử chỉ, một nhịp.

### 2. Một `transform` bị nuốt im lặng — và nó giải thích luôn lời phàn nàn cũ

`<Animated.View style={[styles.actionWrap, grow, bounce]}>`, với `grow` viết
`transform: [{ translateX }]` và `bounce` viết `transform: [{ scale }]`. **React
Native gộp style theo THUỘC TÍNH**, không gộp bên trong mảng `transform`: cái sau
thay thế trọn vẹn cái trước. Đo trên bản dựng, nút mép phải:

    matrix(0.9, 0, 0, 0.9, 0, 0)   ở CẢ BỐN vị trí kéo và cả sau khi mở hẳn

Tức parallax **đứng yên ở 0**, và `scale` kẹt ở **0,9 vĩnh viễn** — vì `pop`
khởi tạo 0 và `interpolate(pop, [0,1], [0.9,1])` trả về đáy 0,9 ở mọi lúc trừ
đúng khoảnh khắc vượt ngưỡng. Một "cái nhún" mà trạng thái nghỉ là 0,9 thì không
phải cái nhún, nó là một phép thu nhỏ thường trực.

Không cửa nào có thẩm quyền: `tsc` thấy hai style hợp lệ; `motion.mjs` canh nhịp
chứ không canh phép gộp; ảnh chụp trạng thái MỞ thấy nút đúng chỗ, vì nó tới nơi
bằng đường khác. Đây là lý do thật đằng sau *"hiệu ứng khi nút mở ra chưa rõ"*.

Nay một `useAnimatedStyle` duy nhất trả một mảng `transform` duy nhất, `pop` là
hệ số nhân nghỉ ở 1, và cú nhún là một cái **hích** (`POP_KICK` 1,06 rồi lò xo
về 1). `tools/transform-merge.mjs` quét toàn `src` cho đúng lớp lỗi ấy — 43 tệp,
68 mảng `style={[…]}` — và có một phép thử chống kêu oan (opacity + transform
phải vẫn xanh).

### 3. "Hiện ra như nút ghi" — một cặp số dùng chung, không phải hai bản chép

Nút "Ghi" nhường chỗ bằng `opacity 1→0` và `scale 1→0,82` trong `[0, 0,55]` của
độ mở. Nút vuốt nay làm **đúng phép ấy đảo chiều, trong đúng khoảng ấy**, và hai
bên đọc chung `HANDOVER_AT` / `HANDOVER_SCALE` xuất từ `swipe-row.tsx` — lệch
nhau thì có một quãng hai nút cùng hiện, hoặc một quãng không nút nào.

Đây **không** phải cái "fade-in độc lập" đã bị bác trước đó: bản bị bác chạy
opacity tới tận `progress` 1 nên nút nhạt suốt cú kéo (*"trong quá trình di
chuyển nút bị mờ"*); bản này xong ở 55% và lái bằng cùng một giá trị với chuyển
động của hàng.

Đo trên bản dựng, hàng đã-ghi, kéo mở nút phải:

| kéo | opacity | scale | translateX |
|---|---|---|---|
| 15% | 0,30 | 0,87 | 36,0 |
| 40% | 0,76 | 0,96 | 25,2 |
| 70% | **1** | **1** | 14,4 |
| 100% | 1 | **1,017** ← cú hích | 0 |
| sau khi thả | 1 | **1** | 0 |

### Bốn lần cái NEO của phép đo sai trong một buổi, và cả bốn đều do tôi

1. Quét transform lớn nhất cả trang → bắt phải deck hero.
2. Hàm đóng hàng chỉ kéo một chiều → đọc phải trạng thái sót lại.
3. Hệ số bám tính cả mẫu đã kẹp → ra 0,689 và **trông như lỗi của phiên kia**.
4. Lần này: quét cả trang rồi lấy ba kết quả đầu → bắt phải viên nút của một
   hàng **khác**, hàng có `progress` đứng yên ở 0. Hai lượt liền đọc ra "giá trị
   không đổi ở mọi vị trí kéo", và cả hai lần con số ấy **đúng** — nó chỉ không
   nói về hàng tôi đang kéo.

Cộng hai lần phép đo không kéo nổi hàng và tôi suýt kết luận là mình vừa làm
hỏng cử chỉ: một lần vì kéo bằng **một bước nhảy** thay vì nhiều bước nhỏ (RNGH
trên web cần một chuỗi pointermove), một lần vì hàng ấy **không có nút bên phải**
(chưa ghi thì `rightActions` rỗng). Bài học hẹp: một phép đo sai neo nguy hơn
không đo, vì nó nói ra một câu nghe rất chắc chắn.

---

## 16/09 — cú vuốt: hai phiên cùng sửa một tệp, và tôi tới sau

Chủ dự án đặt hàng cú vuốt "giống Apple Reminders": bám ngón tay, nút là lớp
NỀN được lộ ra chứ không phải một hoạt ảnh riêng, lò xo lúc thả nhanh và mềm.
Yêu cầu: sửa thẻ **Cần làm hôm nay** trước rồi áp cho các thẻ cùng cơ chế.

**Người cộng tác đã làm gần hết trước khi tôi đẩy được gì.** Ba commit
(`6577fd4`, `3354312`, `689419f`) đi từ phản hồi trực tiếp của chủ dự án và đã
độc lập tới cùng một kết luận với tôi ở chỗ quan trọng nhất — `friction: 1` —
cộng một phát hiện tôi bỏ sót: `overshootFriction` 8 nhân thêm vào, nên ngón tay
từng phải đi **1.592 điểm** để kích hoạt cú kéo dài.

Tôi đã viết một bản sửa song song và **bỏ nó**, vì luật đi kèm nó sẽ cấm đúng
thứ chủ dự án vừa yêu cầu họ làm (*"animation của mấy cái nút bị mất rồi làm
lại"*). Ghi lại như một chế độ hỏng của việc hai phiên thay nhau: trên một tệp
đang được lặp theo phản hồi, luật viết quanh phần TRÌNH BÀY sẽ đỏ ở lượt sau.

### Cái còn thiếu, và đã sửa

Ngưỡng cam kết vẫn là một **hằng số đơn** (`OPEN_W × 0,66`) trong khi quãng mở
là `OPEN_W × số nút`. Nên câu chú thích ngay trên nó — "two thirds of the open
width" — chỉ đúng ở hàng một nút:

| số nút | ngưỡng | tỉ lệ |
|---|---|---|
| 1 | 47,5 / 72 | **66%** ← đúng câu chú thích |
| 2 | 47,5 / 144 | 33% |
| 3 | 47,5 / 216 | 22% |

Hàng càng nhiều nút càng dễ mở nhầm, mà nó lại mở ra xa nhất — và thẻ Cần làm có
cả hai loại trên cùng một màn. Nay `commitAt(count)`, nên 66% đúng ở mọi số nút.
`tools/swipe-commit.mjs` canh đúng hai con số ấy và **cố ý không** có ý kiến về
parallax, cái nảy, nút nở hay màu.

### Đo trên bản dựng thật, không bằng cảm giác

Playwright kéo chuột từng bước trên thẻ Cần làm, đọc `getBoundingClientRect` của
chính nhãn trong hàng sau mỗi bước:

| | |
|---|---|
| hệ số bám | **1,000** trên mọi bước chưa kẹp ở mép mở |
| thả dưới ngưỡng | về **0** sau 356ms |
| vuốt nhanh quãng ngắn (36đ) | mở đúng **−72**, không bay quá |
| mở/đóng ×3 | `−72 → 0 → −72 → 0 → −72 → 0` |
| cuộn dọc thuần | dịch ngang **0** |
| vuốt xéo (dọc 14 : ngang 1,5) | **−4,5** (ngưỡng kích hoạt 10) |
| giữa chừng | nút `opacity: 1`, `transform: none` — lộ ra, không mờ dần |
| đóng nhanh | vọt qua 0 khoảng **0,3 điểm** |

### Lò xo: hai đường độc lập ra gần như cùng một chỗ

`SWIPE_SNAP = spring(0.24, 0.15)` của họ giải ra **zeta 0,85 · ω₀ 26,2**. Tôi
suy ra độc lập **zeta 0,88 · ω₀ 26,0** trước khi thấy commit của họ. Đo bằng ba
hàm lò xo trích nguyên văn khỏi bản Reanimated đang cài, tích phân theo đúng
vòng lặp `spring.ts` ở 60fps, trên quãng 84 điểm:

    mặc định thư viện   90% ở 217ms · settle 667ms
    SWIPE_SNAP          90% ở 133ms · settle 433ms

**Và một phát hiện làm một con số của thư viện thành vô nghĩa:** mặc định của
`ReanimatedSwipeable` là `damping: 1000` trên `mass: 2` — zeta 13,36. Nhưng
Reanimated **không có nhánh overdamped**: `zeta ≥ 1` đều chạy
`criticallyDampedSpringCalculations`, và công thức ấy *không đọc zeta*. Chạy thật
thì `damping: 1000` và `damping: 74,8` cho **đúng cùng một chuyển động**. Con số
1000 không mua được gì; thứ quyết định là ω₀.

### Ba lần cái NEO của phép đo sai, và cả ba đều do tôi

1. Bản đầu lấy `translateX` lớn nhất trong mọi `div` → trả về `−328` ở *mọi*
   phép thử kể cả lúc chưa chạm gì: đó là deck hero ở trang thứ hai.
2. Hàm đóng hàng chỉ kéo sang phải → đóng được hàng mở bên phải, **giữ nguyên**
   hàng mở bên trái, nên hai phép thử cuối đọc phải trạng thái sót lại.
3. Hệ số bám tính cả mẫu đã **kẹp ở mép mở** → ra 0,689 và trông như một lỗi
   của họ. Đúng là 1,000.

Cả ba đều "chạy" và đều in ra một con số nghe hợp lý. Một phép đo sai neo thì
nguy hơn không đo, vì nó nói ra một câu có vẻ chắc chắn.

### Nút lộ xuyên qua hàng ở `sessions.tsx` — ĐÃ SỬA

`ReanimatedSwipeable` dựng tấm nút là `absoluteFill` nằm SAU hàng, nên nút được
lộ ra bằng **hình học** — và phép ấy chỉ đúng khi lớp trước ĐỤC. `SessionRow`
không có nền riêng; nó ngồi trên lớp tint 6% trong suốt của `group`, nên suốt cú
kéo viên nút đỏ hiện **xuyên qua chính hàng**: ảnh giữa chừng cho ra hai cái icon
thùng rác chồng lên nhau.

`todo-card.tsx` đã gặp và đã ghi đúng điều này (*"hàng vuốt được phải có NỀN
ĐẶC"*). `sessions.tsx` mắc lại y hệt, vì bài học nằm trong chú thích của một tệp
khác chứ không nằm trong một luật.

**Màu phải bằng đúng cái mắt đang thấy, và không token nào mang sẵn nó** — cái
mắt thấy là `alpha(m.ink, 0.06)` chồng lên nền trang. Nên thêm `blend()` cạnh
`alpha()` trong `palette.ts`: cùng hình dạng, cùng lý do tồn tại (RN không tính
màu trong style), cùng hợp đồng chặt — **ném** chứ không đoán. `rowFace` là
`blend(m.ink, c.background, GROUP_TINT)`, dùng chung hằng số với `group` nên hai
bên không trôi khỏi nhau.

Đo trên bản dựng:

| | trước | sau |
|---|---|---|
| trong hàng, lúc đóng (sáng) | `rgb(234,230,225)` | `rgb(234,231,226)` |
| mép nhóm, lúc đóng (sáng) | — | `rgb(234,231,226)` — **bằng hàng, không có đường nối** |
| ba điểm trong lòng hàng, giữa cú kéo | đỏ lọt qua | `rgb(234,231,226)` — **không đỏ** |
| bản tối, giữa cú kéo | — | `rgb(22,22,23)` — không đỏ |

Lệch **1 mức** trên 256 so với trước, và đó là phần `AmbientLight` mà một màu
đặc không với tới — đã ghi thành số ngay cạnh `rowFace`.

`tools/swipe-opaque.mjs` canh cả ba chỗ dựng `<SwipeRow>` và **đỏ khi một chỗ
thứ tư xuất hiện**, vì đó đúng là khoảnh khắc lỗi này sinh ra. Năm phép thử
ngược. Đây là một DANH SÁCH CHỐT chứ không phải phép suy: con của `<SwipeRow>`
là JSX bất kỳ, và một luật đoán sai ở đây sẽ kêu oan rồi bị tắt.

**Sửa lại một con số tôi nói sai ở lượt trước:** `useSessionListStyles` dùng ở
**hai** màn (`sessions.tsx`, `workouts/library.tsx`), không phải bốn — tôi lấy
con số ấy từ một chú thích đã cũ thay vì đếm. Nó là lý do tôi hoãn bản sửa, và
lý do ấy sai.

### Một lần `node_modules` biến mất giữa chừng, và nó suýt thành kết luận sai

Sau lượt chạy cổng xanh cuối, `npx tsc --noEmit` bỗng đổ ra một trang lỗi kiểu
`Cannot use JSX unless the '--jsx' flag is provided` và `Cannot find module
'react'` — đọc y như app vừa hỏng vì bản sửa vừa rồi. Nó không hỏng: **toàn bộ
`node_modules` đã biến mất** (cùng lượt ấy mọi script trong scratchpad cũng bị
xoá), nên `npx` tải tạm TypeScript **6.0.2** từ registry — khác bản repo ghim
(`~6.0.3`) — và bản tạm ấy không thấy tsconfig lẫn types.

Chính là chế độ hỏng `check.mjs` viết ở đầu tệp để cảnh báo, ở một biến thể
khác: *một phép kiểm đỏ vì lý do không liên quan gì tới thứ nó kiểm*. `npm ci`
khôi phục 443 gói và tsc về exit 0 mà không đổi một dòng mã nào.

Ghi lại vì nó suýt thành hai kết luận sai. Kết luận thứ hai tôi đã thật sự rút
ra rồi mới bắt được: phép kiểm JSON tay của tôi báo `tsconfig.json` **sai cú
pháp**, và điều đó cũng sai — regex tách chú thích của tôi cắt nhầm `"@/*"`.

`ReanimatedSwipeable` **không** phơi ra `failOffsetY`, nên "chỉ kích hoạt khi ý
định ngang đủ rõ" hiện dựa vào `activeOffsetX` 10 điểm cộng việc `ScrollView`
giành responder trước. Phép thử "vuốt xéo" **không** dựng lại được cuộc tranh
chấp ấy: `ScrollView` của RN Web không tranh cử chỉ với một cú kéo **chuột**.

---

## 15/09 — thẻ cân nặng, và một cổng ĐỎ đã đẩy đi mà không ai thấy

### Cái đáng ghi trước tiên: cổng đã đỏ ở `aae4484`

Lượt sửa dải lịch màn Plan (ba commit, `8bcf922` → `aae4484`) được báo cáo là
xong và được đẩy lên **mà không chạy lại `tools/check.mjs`**. Chạy lại ở lượt
này thì `plan-week.mjs` **đỏ**, và đã đỏ từ `8bcf922`. Không có gì che nó —
`tsc` xanh, ảnh chụp đẹp, và chính tôi đã nhìn ảnh chụp rồi kết luận là đạt.
Bài học không phải "chạy cổng đi", mà hẹp hơn: **một lượt sửa được nghiệm thu
bằng ảnh chụp vẫn phải qua cổng**, vì ảnh chụp chỉ trả lời câu hỏi mình đang
hỏi, còn cổng trả lời những câu mình đã quên.

Nội dung lỗi: mục 5 của `plan-week.mjs` canh giao ước CŨ của `week-strip` —
viền là hôm nay, lớp tô là ngày đang mở, trùng ô thì thụt vào. Lượt sửa lịch
đảo vai hai dấu **có lý do và có ghi lý do** (cạnh `weekChipToday`), nhưng để
lại hai thứ nói điều đã hết hiệu lực: cái luật, và một đoạn chú thích JSX ngay
trên chỗ vẽ mâu thuẫn với đoạn chú thích cách nó bốn mươi dòng. Cả hai đã viết
lại theo giao ước đang chạy, và vế thứ ba của luật mới là một **phép đo** —
dựng lại hai viên trên mặt trang của từng diện mạo và đòi viên đặc mạnh gấp ba
viên nhạt — nên nó không lách được bằng cách đổi tên style. Năm phép thử ngược.

### Thẻ cân nặng: bỏ ô nhập — và một tiền đề tôi đo SAI vì đo trên cây cũ

Chủ dự án yêu cầu thẻ `GHI CÂN NẶNG` thành thẻ chỉ hiện thông tin, thay nút ghi
bằng lịch sử thay đổi sau mỗi lần log, **"vì phía trên đã có ghi cân nặng rồi"**.

Tôi đo tiền đề ấy và kết luận nó **sai** — `useLogWeight` chỉ được gọi ở một chỗ,
`/biometrics` không nhận cân nặng, `/log-measurement` không nhắc tới nó, bốn pill
thao tác nhanh đi chỗ khác — rồi viết kết luận ấy vào chú thích, vào luật, vào
thông điệp commit.

**Kết luận ấy sai, và sai vì tôi đo trên một cây đã cũ.** Người cộng tác đã đẩy
mười commit trong lúc đó, một trong số đó tách `weight-entry.tsx` ra để thẻ *Cần
làm hôm nay* ghi cân nặng **ngay tại chỗ** — và thẻ ấy nằm trước cả dãy nhóm
widget trong `(tabs)/index.tsx`. Tức "phía trên" là có thật, đúng nghĩa đen, và
chủ dự án mô tả đúng màn hình của họ. Chú thích của chính `TodoCard` đã đếm ra
điều đó trước tôi: *"năm chỗ cho một câu hỏi, trên một trang phải cuộn"*, và ô
nhập trong thẻ Cân nặng là một trong năm.

Bài học hẹp, và không phải "hãy fetch trước": **một tiền đề của người dùng về
màn hình của chính họ được kiểm bằng cây ĐANG CHẠY, không bằng cây mình đang
cầm** — nhất là trên một nhánh hai người thay nhau đẩy. Cây tôi cầm cũ hơn màn
hình họ nhìn, nên phép đo trả lời đúng một câu hỏi khác.

Việc làm ra thì không đổi (thẻ thành thẻ thông tin, lịch sử thay cho nút), nhưng
lý do đổi hẳn, nên `tools/weight-card.mjs` cũng đổi vế: nó thôi canh "đây là lối
ghi duy nhất" và quay sang canh **chữ "vì"** — `TodoCard` phải còn dựng
`WeightEntry`, vì đó là thứ làm câu của chủ dự án đúng và làm quyết định này có
cơ sở. Vế đếm chỗ gọi `useLogWeight` giữ nguyên bài học riêng của nó: bản đầu
(`grep -rl useLogWeight src`) xanh với ba tệp, mà hai trong ba chỉ **nhắc tên**
nó trong chú thích — luật nay bỏ chú thích rồi mới tìm, và tìm một cú **gọi**.

### Lượt hai, cùng ngày: tắt hẳn, không chỉ giấu đi

Chủ dự án, ngay sau đó: **"tắt cái nút ghi đi không cho ghi nữa vì đã nằm ở todo
rồi"**. Lượt đầu ô nhập mới chỉ lùi lại sau một cú chạm lên mặt thẻ; lượt này gỡ
hẳn — thẻ không còn `onPress`, không còn state `editing`, không dựng
`WeightEntry`, không gọi `useLogWeight`. `PressScale` đổi thành `View`, và chuỗi
`nWeightTapToLog` bị xoá khỏi cả hai ngôn ngữ vì không còn ai đọc nó.

Viên chênh lệch thôi gác sau "hôm nay đã cân chưa". Cái gác ấy tồn tại vì ô bên
phải phải chia chỗ với lời mời chạm; không còn lời mời thì nó chỉ còn là một cách
giấu thông tin đúng — chênh lệch của lần cân gần nhất là thật dù lần ấy là thứ Ba
tuần trước, và `staleOn` ngay bên trái đã nói lần ấy là khi nào.

**Một cái giá tôi cảnh báo, rồi phải rút lại.** `useLogWeight` upsert theo
`(user_id, date)`, nên **sửa** số của hôm nay chính là ghi lại lần nữa — thứ một
thẻ chỉ-đọc không làm được. Lúc tôi bắt đầu, dòng To-do "cân nặng" sau khi ghi là
một dòng **tĩnh, không bấm được**, nên đường sửa là ba bước trên hai màn (Tiến
trình → xoá trong `WeightLogList` → dòng To-do hiện lại). Tôi nói điều đó ra
trước khi làm, và nói đúng **vào lúc ấy**.

Nó hết đúng trước khi tôi đẩy xong. `e0e1d82` của người cộng tác — độc lập, cùng
ngày — cho dòng To-do **giữ nguyên hình** khi đã ghi: nút vẫn ở đó mang nhãn "Đã
ghi", vẫn `onPress={press}`, tức vẫn mở `WeightEntry`; cộng một thao tác *Sửa*
khi vuốt. Chú thích của chính họ nói ra lý do: *"hai thứ đáng làm được trên dòng
ấy — sửa lại lượt ghi sai, đổi giờ nhắc — không còn chỗ nào để làm"*.

Nên **không có cái giá nào**: sửa lần cân của hôm nay là một cú chạm, trên chính
dòng ngay phía trên thẻ. Ghi lại cả hai nửa vì bài học không phải "cảnh báo thừa"
mà là: trên một nhánh hai người thay nhau đẩy, một phép đo về màn hình có hạn sử
dụng tính bằng commit — đây là **lần thứ hai trong cùng một ngày** tôi kết luận
đúng trên cây mình cầm và sai trên cây đang chạy.

`tools/weight-card.mjs` đổi chiều theo: nó nay **cấm** thẻ Cân nặng có `onPress`,
dựng `<WeightEntry>` hoặc gọi `useLogWeight`, đồng thời vẫn đòi `TodoCard` giữ
`WeightEntry` và đòi thẻ vẫn còn `olderRows` — hai chiều hỏng ngược nhau, vì một
thẻ cân nặng không bấm được trông như thiếu sót, và đó là chỗ dễ bị "sửa" lại
nhất. Cấm cả `onPress` chứ không chỉ lệnh ghi: một `PressScale` không làm gì vẫn
co lại dưới ngón tay, tức vẫn hứa một hành động rồi nuốt lời, và
`accessibilityRole="button"` sẽ đọc cho VoiceOver một cái nút không tồn tại. Mười
phép thử ngược.

Và một chú thích trôi được bắt trong lúc kiểm: `weight-entry.tsx` mang theo đoạn
giải thích cũ nói rằng caller để biểu mẫu mở vì `showLogger = editing ||
todayWeight == null`. Không caller nào còn làm thế — `TodoCard` gate bằng
`editing` trần, và thẻ Cân nặng thì không dựng nó nữa. Đã viết lại thành thì quá
khứ. (Phần sửa `disabled` của **BUG-05 (a)** thì đi theo mã sang tệp ấy và vẫn
còn nguyên — đã kiểm bằng mắt, không phải suy ra.)

### Và cái bị thay không phải một thứ đang chạy

Viên chênh lệch cũ tính `todayWeight − profileWeight`. `useLogWeight` gọi
`syncProfileWeight` rồi `invalidate(['profile'])`, nên ghi xong thì
`profiles.weight_kg` chính là số vừa ghi, hiệu bằng 0, và viên **tự ẩn**. Thứ
đáng lẽ nói "hôm nay thay đổi bao nhiêu" gần như không bao giờ nói được gì. Lịch
sử mới lấy hiệu giữa hai **lần cân** liền nhau nên không phụ thuộc vào một cột
mà chính lần ghi ấy vừa sửa. `BUG-05` trong `FORENSIC-AUDIT.md` cũng đóng nốt
nửa còn lại nhờ `showLogger` nay là `editing` và chỉ `editing`.

### Một vùng mù của bộ chạy web, ghi lại để lần sau không đọc nhầm

Ảnh chụp đầu tiên cho thấy thẻ vẽ trạng thái *chưa cân hôm nay* trong khi bộ cố
định **có** một lần cân hôm nay. Không phải lỗi app: `applyQuery` trong
`tools/live-world.mjs` chỉ làm `order` và `limit`, **không lọc**. Nên
`.eq('date', hôm nay).maybeSingle()` nhận cả ba dòng, postgrest-js thấy
`length > 1` và trả `PGRST116`, và hook ra `undefined`. Script chụp tự lọc lấy;
`live-world.mjs` **không** sửa ở lượt này, vì đổi hành vi lọc của bộ chạy dùng
chung là đổi dữ liệu mà mọi bước khác của cổng đang nhìn thấy, và đó là một thay
đổi phải đo riêng.

---

## RÀ PHÁP Y 09/14 — và một lượt rà chính TÀI LIỆU

Từ `efb851d` (09/09) tới `cf687a2` (09/14): **90 commit**, 127 tệp `src`, 26
luật mới. Gần hết bắt nguồn từ một câu của chủ dự án về thứ họ nhìn thấy trên
iPhone thật — và đó là nguồn phát hiện mạnh nhất repo này có, vì nó ở phía bên
kia của mọi thứ cổng đo được.

Danh sách đầy đủ nằm trong `git log`; trang này **không** chép lại 90 commit,
vì một bản tóm tắt không đo lại được thì cũng chỉ là một lời hứa nữa.

### Cái vòng này đo lại, trên đúng cây đã đẩy

| | |
|---|---|
| `node tools/check.mjs` | **269/269 xanh**, exit 0 |
| `npx tsc --noEmit` | exit 0, đầu ra rỗng |
| Máy thật | ❌ **không**. Ba thứ còn treo: vòng đếm ngược của thanh Hoàn tác ở đáy, thẻ bài tập lúc thu lại có giật không, dấu tích xanh ở tiêu đề bài tập có lệch baseline không |

### Cái vòng này TÌM RA — bảy lời giải thích sai, và không lời nào do mã sai

Lượt rà 09/14 hỏi một câu hẹp: **90 commit ấy làm những trang hướng dẫn nào
thành sai?** Kết quả là bảy chỗ, và đáng ghi lại vì cả bảy đều *đọc như đúng*:

1. **Chính bảng cổng phía trên** ghi `215` bước khi cổng đã `241` (số lúc phát
   hiện; ba luật của chính vòng này nâng nó lên `244`). Repo từng
   mắc đúng lỗi này ở `quality-gate.yml` (211 khi đã 215, sửa 09/09) — tức lần
   thứ hai, cùng một hình dạng. Nay có `tools/gate-count.mjs`.
2. **`docs/QA-MAY-THAT.md`** mở đầu bằng cùng con số cũ, trong chính câu định
   nghĩa lý do trang ấy tồn tại.
3. **`docs/fitness-scores.md`** liệt kê *"cờ ốm, cờ đau, mức đau nhức"* trong
   đầu vào của điểm sẵn sàng. Cả ba được gõ cứng thành hằng số ở
   `daily-log-service.ts` và không bao giờ tới được engine. Nay có
   `tools/readiness-inputs.mjs`.
4. **`docs/SO-GHI-LOI.md` mục C1** cấm sửa `useToggleSupplement`, dựa trên
   *"0 nơi đọc"* hai cột supplement. `streak.ts` đã đọc một trong hai từ
   `a63b566`. Chính C1 viết sẵn điều kiện hết hiệu lực ấy; không ai quay lại
   chạy lệnh nó dặn. Đã chuyển sang nhóm A.
5. **`docs/PRE-LAUNCH-POLISH.md`** kết luận haptics *"không có chỗ nào dùng
   lẫn"*. Nó đếm LOẠI máy rung, không đo THỜI ĐIỂM; `8262eee` tìm ra 5 chỗ bắn
   phản hồi-chạm trong `onSuccess`/`onSettled`.
6. **`GLOBAL-LAUNCH.md` mục 4** — chữ để viết vào **ghi chú duyệt HealthKit** —
   ghi *"HR/HRV/sleep/**steps** feed the daily readiness score"*. Bước chân
   không nằm trong `ReadinessInput`, và sheet trong app nói thẳng điều ngược
   lại. Đây là chỗ đắt nhất trong bảy chỗ: người đọc nó là người duyệt của
   Apple. Nay `readiness-inputs.mjs` canh cả dòng ấy.
7. **Prompt của `ai-coach`** dặn mô hình *"If there are pain flags, only advise
   reducing load and resting"*, và cả hai hàm edge còn gửi `pain_flags` sang nhà
   cung cấp. Cột ấy chưa bao giờ được ghi bằng gì khác một mảng rỗng gõ cứng,
   nên đó là một mệnh lệnh không bao giờ có điều kiện để kích hoạt. Đã bỏ khỏi
   câu chọn, payload và prompt ở cả hai ngôn ngữ — xem PS-3 trong
   `FORENSIC-AUDIT.md`. **Chưa deploy.**

Sáu trong bảy chỗ **không** phải do 90 commit làm sai — chúng sai từ trước và
90 commit chỉ làm khoảng cách đủ lớn để nhìn thấy. Đó là lý do lượt rà này
không dừng ở việc sửa chữ: ba luật mới đo lại đúng những câu đã trôi.

---

## A9 — ĐÓNG (2026-09-08)

App thoát khi chạm vùng vòng tròn sẵn sàng sau khi đổi tab rồi quay lại.

**Nguyên nhân gốc:** đường dựng khác nhau giữa hai theme — bản tối dựng lớp
kính/lớp phủ, bản sáng bỏ lớp ấy đi.

**~~Đã sửa:~~** ~~hai theme dùng chung một đường dựng.~~ — **SAI, đính chính
2026-09-09: chưa từng có commit nào làm việc đó.** `12362b9` (commit đóng A9)
chỉ chạm docs + `check.mjs` + `theme-shape.mjs`, không một tệp `.tsx`; và
`git log -S"m.lit" --all -- 'native/src/**'` cho thấy commit cuối cùng đổi một
dòng `m.lit` là `b9037ab`, **06/09**. Thay đổi mã duy nhất trên màn Hôm nay
trước lần kiểm máy thật là `f7a3341` + `ddfbcd7` (nút-trong-nút, có chạm
`today-meals.tsx` và `dashboard-cards.tsx`). Chi tiết ở `SO-GHI-LOI.md` A9.

**Kiểm chứng:** chủ dự án xác nhận trên máy thật, 2026-09-08. Bằng chứng này
vẫn đúng — thứ sai là phép gán nguyên nhân cho nó.

**ĐÍNH CHÍNH THỨ HAI, 2026-09-09 — nguyên nhân THẬT đã có.** Báo cáo sự cố từ
máy thật (`089fbd5`) cho `SIGABRT` trên luồng JS: `jsi::Value::getObject` →
`JSIWorkletsModuleProxy::toOptimizedObject` → `JSScheduler::scheduleOnJS` —
dùng-sau-khi-giải-phóng một JSI Value trong `runOnJS`, khớp thượng nguồn
#9786/#9751, vá ở #9789 (worklets 0.10.1). Nó bác bỏ **cả hai** giả thuyết:
không phải `MaskedView` (chữ ký là SIGABRT, không phải EXC_BAD_ACCESS), và
không phải lệch theme (bản dựng đã có `7587f57`, chỗ lệch ở `ReadinessGauge`
đã bỏ, mà **vẫn thoát**).

Nên phần "Kiến trúc dựng theo theme" bên dưới **không còn là hồ sơ nguyên nhân
A9**. Công việc bỏ 8 chỗ lệch (`7587f57`, `9f5fb2f`, `553b6f9`) đứng bằng lý do
riêng của nó — cây ổn định giữa hai diện mạo, và một lần đổi theme thật thôi
tháo/dựng lại sáu cây con — chứ không phải vì nó sửa A9. A9 **chưa đóng lại**:
bản sửa là thay đổi native, phải dựng lại máy thật mới biết.

**`MaskedView` không phải nguyên nhân gốc** và không được gỡ hay thay chỉ vì sự
cố này. Chi tiết đầy đủ ở `SO-GHI-LOI.md` mục A9.

---

## Kiến trúc dựng theo theme — ~~điều kiện đã sinh ra A9~~ (bác bỏ 09/09, xem trên)

A9 khép lại rồi, nhưng ĐIỀU KIỆN của nó thì đo được, và ở commit `f7a3341` nó
vẫn còn. Ghi ra đây vì đó là thứ phải giữ cho "nhất quán và có chủ ý".

> **Cảnh báo 2026-09-09 — bảng dưới đây KHÔNG phải một phép đo.** Đếm node cả
> trang không lặp lại được: cùng một bản dựng, không đổi một dòng nào, ba lần
> chạy ra `931 / 931 / 942` node ở bản sáng và `1084 / 1084 / 1073` ở bản tối.
> Biên độ ±11 lớn hơn chính con số `−6` mà bảng này dùng làm kết luận. Giữ bảng
> lại vì nó chỉ ĐÚNG NGUỒN — năm nhánh `m.lit` liệt kê bên dưới là có thật và
> đọc được trong mã — nhưng đừng trích các con số này như một số đo, và đừng
> dùng thước ấy để so trước/sau. Thước đúng là đếm ĐÚNG node đang xét; xem mục
> A9 ở `SO-GHI-LOI.md`.

Đo trên bộ chạy web, đổi `prefers-color-scheme` ngay trên màn đang mở:

| Màn | node tối | node sáng | cây con bị GỠ khi đổi |
|---|---|---|---|
| Hôm nay | 1.073 | 1.031 | −6 |
| Dinh dưỡng | 611 | 545 | −7 |
| Trợ lý | 1.066 | 1.024 | −6 |
| Nước | 206 | 178 | −4 |
| Tiến trình | 633 | 619 | −2 |
| Huy chương | 822 | 798 | −1 |
| Tập luyện · Cài đặt · Cửa hàng | bằng nhau | bằng nhau | 0 |

Chiều đi một phía: bản sáng **gỡ** cây con và không thêm cái nào. Nguồn là các
nhánh `m.lit` dựng-hoặc-không:

- `ambient-light.tsx:140` — `if (!m.lit) return null` (cả component)
- `glass-card.tsx:154` — mặt gradient
- ~~`readiness-gauge.tsx:580, 625`~~ — **ĐÃ BỎ 2026-09-09.** Hai nhánh này nằm
  đúng dưới thao tác lặp lại được của A9 (đổi tab → về Hôm nay → chạm vùng vòng
  tròn). Nay cả hai node dựng ở cả hai theme, bản sáng tô rỗng. Giá: một `<View>`
  trong suốt và một `<circle>` `opacity` 0 — không phải một lớp `<Svg>` phủ kín
  màn hình, nên lập luận hiệu năng của bốn chỗ còn lại không áp dụng ở đây.
- `assistant-aura.tsx:608`
- `liquid-glass.tsx:174` — lớp wash

Cả năm đều là quyết định hiệu năng **có chủ ý và có ghi lý do** — trên giấy
chúng là những lớp `<Svg>` phủ kín màn hình không nhìn thấy được. Nên luật
không phải "cấm lệch", mà là: **tập hợp các chỗ được phép lệch là một danh sách
đóng.** Một nhánh `m.lit` mới xuất hiện mà không ai quyết định là chỗ điều kiện
của A9 mọc lại.

`tools/theme-shape.mjs` giữ danh sách ấy: **5 tệp, 6 nhánh** kể từ 09/09, mỗi tệp
một lý do. (`readiness-gauge.tsx` đã rời danh sách — xem gạch ngang ở trên.)
Nó phân biệt HÌNH DẠNG với MÀU — `color={m.lit ? a : b}` không dựng thêm hay
bớt một node nào và không tính. Bản đầu của luật gộp cả hai và báo nhầm
`awards.tsx` ba lần; đó là lý do phép phân biệt được viết ra chứ không ngầm
hiểu.

---

## A11Y-2 — XONG (2026-09-08)

Nút trong nút. Trên iOS, `Pressable.js:252` đặt `accessible: accessible !== false`
cho MỌI `Pressable`, và [tài liệu trợ năng của React
Native](https://reactnative.dev/docs/accessibility) nói phần tử ấy *"groups its
children into a single selectable component"* — UIKit không đi vào bên trong.
Nút bên trong không tồn tại với VoiceOver, trong khi ngón tay vẫn bấm được. Đó
là lý do lớp lỗi này sống lâu: nó không hỏng ở nơi ai cũng nhìn.

Bảy chỗ, mỗi chỗ đo riêng trước và sau:

| Chỗ | Đã làm gì | Đo được |
|---|---|---|
| `food-cards.tsx` | ngôi sao thành anh em; phần đệm xuống hai con để vùng chạm không tụt | **0 điểm ảnh lệch**; 3 → 0 nút lồng; vùng chạm sao 17×17 → **38×54** |
| `template-list.tsx` | nút xoá thành anh em; mũi tên giữ cú chạm với `accessible={false}` | **0 điểm ảnh lệch**; 1 → 0 |
| `grocery.tsx` | ô tick thành `checkbox` có nhãn, nút xoá thành anh em | **0 điểm ảnh lệch** |
| `assistant.tsx` | vùng bấm bọc phần đầu thẻ, các chip hỏi nhanh ra ngoài | lệch **111** điểm, dưới sàn nhiễu **186** của chính màn ấy |
| `ai-coach.tsx` | chọn/xoá hội thoại thành anh em, hàng chọn có nhãn | lệch **3** điểm; 3 hàng từ `div` → **3 nút có tên** |
| `week-plan.tsx` | **thêm nút đóng có nhãn** vào hàng tiêu đề, rồi mới `accessible={false}` cho tấm nền và tấm nuốt chạm | vùng danh sách: **0 điểm ảnh lệch**; thay đổi gói trong dải tiêu đề |
| `dashboard-cards.tsx` | nút `?` của thẻ dinh dưỡng thành anh em | nút `?` dịch **1 điểm ảnh** (nét viền của thẻ); 1 → 0 |

`week-plan` là chỗ duy nhất được thêm giao diện, và chỉ đúng phần tối thiểu:
một chữ X 14 điểm trong hàng tiêu đề **đã có sẵn**, cùng mẫu với sheet bộ sưu
tập ở `shop.tsx`. Sáu phép kiểm chức năng chạy ở **cả hai theme**, đều xanh: mở
sheet · 5 điều khiển chọn buổi tập còn đủ · nút đóng có nhãn tồn tại · bấm nó
thì sheet đóng · chạm nền vẫn đóng · chọn một buổi tập vẫn đóng.

### Hai bài học của vòng này

**Bước kiểm tĩnh có một điểm mù, và phép đo lúc chạy tìm ra nó.** Chỗ thứ bảy
(`dashboard-cards.tsx`) lồng nhau qua HAI lớp gián tiếp: một biến (`{card}`) rồi
một component (`HelpButton` trả về `PressScale`). `tools/a11y-swallow.mjs` báo
xanh trên đúng tệp hỏng; bộ chạy web bắt được. Bản sửa đầu chỉ đi theo biến và
VẪN xanh — phép thử ngược bắt được điều đó trước khi tôi tin nó. Bước kiểm nay
quét ra danh sách component-nào-là-nút từ chính mã nguồn.

**Bước kiểm bắt được một hồi quy tôi vừa gây ra.** Mũi tên mới ở
`template-list.tsx` là nút chỉ có icon và không có nhãn → `tools/tap-targets.mjs`
đỏ. Ngoại lệ được thêm là một câu trả lời chứ không phải một lối thoát: một node
đã khai `accessible={false}` không nằm trong cây trợ năng, nên một cái nhãn ở đó
là cái tên không ai nghe được. Ngoại lệ đã được thử ngược: bỏ `accessible={false}`
ra thì nó đỏ lại ngay.

---

## Đường AI — XONG phần LÀM ĐƯỢC Ở ĐÂY (2026-09-08)

Sổ tay triển khai đầy đủ: **`docs/AI-TRIEN-KHAI.md`**. Trang này chỉ ghi vòng
rà soát đã đo được gì.

### Đã sửa

| # | Lỗi | Nó im lặng ở chỗ nào |
|---|---|---|
| E1 | `if (!res)` của `ai-coach-memory` nằm SAU `res.ok`/`res.text()`/`res.json()` | mã chết: `res` null thì `TypeError` nổ trước câu kiểm |
| E2 | `fetch` không hạn giờ | một bên TREO thì vòng dự phòng đứng lại ở đó và bên thứ hai không bao giờ được thử |
| P3 | `recordTokens` chỉ ghi khi `total > 0` | bên không trả `usage` ⇒ AI phục vụ miễn phí, sổ về 0, không gì trông như hỏng |
| P4 | bốn function trả 200 kèm kết quả rỗng khi model không gọi tool | người dùng đọc ra "không có gì cho bạn"; token đã bị tính |
| **A** | `await res.json()` đứng TRƯỚC `recordTokens` ở cả năm function không-stream | 200 kèm thân không phải JSON (trang HTML của proxy, thân rỗng) ⇒ ném qua dòng ghi sổ ⇒ lượt gọi đã tiêu tiền không để lại **cả một dòng `UNMETERED`** |
| **B** | `Number(Deno.env.get("ASCND_AI_TIMEOUT_MS") ?? 20_000)` | `Number("")`=0 và `Number("20s")`=NaN, `setTimeout` quy cả hai về 0 (**đo được: fires sau 0ms**) ⇒ một secret gõ sai huỷ MỌI request ở cả sáu function, và nó trông như mạng hỏng |
| **C** | `response.body!.tee()` trong `ai-coach` | một 204 có `ok===true` và `body===null` ⇒ `TypeError` ⇒ 500, và `meterStream` không bao giờ chạy |
| **D** | `aiUrl`/`aiKey`/`aiModel` import vào cả sáu function, **không dùng ở đâu** | vô hại hôm nay, nhưng là cái móc sẵn cho một bản sửa vội — và `aiUrl()` mặc định vẫn trỏ Lovable |

A, B, C, D là vòng này. `aiPayload` (A) gộp cặp `res.json()` + `recordTokens`
thành **một** lời gọi, nên không còn cách nào đọc được thân mà bỏ qua sổ.

### Bước kiểm

`tools/ai-provider.mjs` — **14 nhóm luật** (mới), chạy MÃ THẬT (`callAI`,
`meterStream`, `recordTokens`, `toolArgs`, `aiPayload`) trên `fetch` và
`Deno.env` giả. Mỗi luật mới đã thử ngược và cả bốn phép đều bắt được:

| Thử ngược | Nó nói gì |
|---|---|
| `aiPayload` → `res.json()` trần | 6 lỗi: ba thân hỏng đều NÉM và đều IM LẶNG |
| `TIMEOUT_MS` → `Number(... ?? 20_000)` | 10 lỗi trên `""`, `"20s"`, `"0"`, `"-5"`, `"null"` |
| trả lại `aiUrl` vào `scan-food` | `scan-food/index.ts (aiUrl)` |
| trả lại `response.body!` | `ai-coach/index.ts:342` — và **342 đúng là dòng thật** |

**Một bước kiểm CŨ khẳng định cách chữa, không phải tính chất.**
`tools/ai-boundary.mjs` luật 4 đòi thấy chữ `recordTokens(` trong mỗi tệp — đúng
chừng nào phép ghi sổ còn được gõ tay ở từng chỗ gọi. `aiPayload` gộp nó vào,
năm function được đếm chặt hơn trước, và **cổng đỏ 2/211** (bước ấy đăng ký hai
lần). Cùng lỗi với luật D của `scan-food-boundary` vòng trước. Đã viết lại theo
tính chất: *không có đường nào đọc được thân của nhà cung cấp mà không đi qua
sổ* — ba lối hợp lệ (`meterStream`, `aiPayload`, `recordTokens` trần), và
**cấm** `res.json()`/`response.json()` trần (`req.json()` là thân của người gọi,
không dính). Thử ngược hai chiều: bỏ hẳn ghi sổ ⇒ 2 lỗi; **giữ** ghi sổ nhưng
đọc thân bằng tay ⇒ 1 lỗi — và vế thứ hai chính là mã đã ship, thứ luật cũ xanh.

**Hai lần dụng cụ tự sai, và cả hai đều là bài học cũ lặp lại:**

- Bản đầu của luật 10 **sập** thay vì báo — cú ném nổi lên tới đỉnh, node in
  stack trace và thoát 1: đúng mã thoát, nhưng không nói được luật nào hỏng.
  Cùng lớp với vụ treo ở `never`. Nay có `settle()`: một cú ném là một kết quả.
- Luật 13 báo `ai-coach/index.ts:239` khi dòng thật là **342** — bóc comment
  bằng `.replace(/\/\*…\*\//g, '')` xoá hẳn dòng. Nay thay bằng khoảng trắng
  giữ nguyên số dòng.

### Sẵn sàng triển khai — kiểm được không cần khoá

Chín function khai đủ trong `config.toml`; `ai_gate`, `spend_ai_tokens`,
`claim_ai_call` đều có migration. Nghĩa là **đặt secret rồi deploy, không sửa mã**.

### Chưa làm được ở đây, và vì sao

Môi trường này **không có `supabase` CLI, không đăng nhập, không quyền deploy**.
Nên Phase 5 (đặt secret), 6 (deploy + khói) và 7 (cắt Lovable) là việc của chủ
dự án. `docs/AI-TRIEN-KHAI.md` mục 3–5 là đúng những lệnh và bảy phép khói ấy.

Và bằng chứng runtime đã đổi tiền đề của Phase 7: **không có function nào đang
chạy ở bất kỳ đâu** (cả chín trả `NOT_FOUND` giống hệt một tên vô nghĩa làm đối
chứng), còn ref Lovable cũ thì **không phân giải**. Nên hôm nay không có phụ
thuộc Lovable sống nào để cắt, và không có bản triển khai cũ để quay lui.
`LOVABLE_API_KEY` **chưa thu hồi** và chưa nên thu hồi cho tới khi bảy phép khói
xanh trên bản deploy thật.

---

## Hạ tầng — vòng 1 (2026-09-08)

Kế hoạch đầy đủ, kèm lý do từng dịch vụ: **`docs/HA-TANG.md`**. Luật của trang
ấy: một dịch vụ mới phải chỉ ra được **giới hạn đo được** của thứ đang có.

### Sentry — bộ lọc XONG, SDK dừng ở ranh giới khoá

**Nhu cầu, từ sổ lỗi của chính repo này.** A9 là app thoát hẳn, và cách duy nhất
để xác nhận nó (ghi ở `SO-GHI-LOI.md` A9) là chủ dự án **cầm máy, vào Cài đặt
của iOS, đọc bằng mắt**.

**Giới hạn của `crash-log.ts`**, cả bốn đều là chỗ A9 rơi qua: nó gắn vào
`ErrorUtils` nên **chỉ bắt lỗi JS** — A9 là `EXC_BAD_ACCESS`, tiến trình chết
trước khi JS biết; nó nằm **trên máy người dùng**; giữ **5 mục**; **không gộp**
được nên không biết một người hay ba trăm người dính. Không cái nào sửa được
bằng cách viết thêm mã trong app.

**Đã làm:** `src/lib/telemetry-scrub.ts` — bộ lọc riêng tư thuần, **không import
Sentry**, kiểu khớp cấu trúc với `beforeSend`. Viết TRƯỚC vì SDK tự thêm
breadcrumb cho mọi lời gọi mạng, và mạng của app này là PostgREST:
`?user_id=eq.<uuid>&date=…` là *ai*, *bảng sức khoẻ nào*, *ngày nào* — còn
`scan-food` gửi `image_base64`, tức **ảnh bữa ăn**. Bật rồi mới lọc là đã gửi đi
một lần.

`tools/telemetry-scrub.mjs` chạy thật cả ba hàm trên hình dạng dữ liệu app này
sinh ra. **Năm phép thử ngược**, tất cả đỏ đúng chỗ — và phép thứ năm hạ ngưỡng
base64 xuống 8 để chứng minh chiều **ẩn quá tay** cũng bị bắt: một bộ lọc biến
mọi báo cáo thành `[đã ẩn]` cũng là một bộ lọc hỏng. Thứ tự luật có lý do: JWT
phải bắt **trước** base64 chung, nếu không một khoá và một bức ảnh ẩn thành cùng
một khối.

**Ranh giới:** không cài SDK từ đây — nó là native module, môi trường này là
Linux. Ba khoá còn thiếu, không cái nào vào git: `EXPO_PUBLIC_SENTRY_DSN`,
`SENTRY_AUTH_TOKEN` (thiếu nó thì sự cố native **không có tên hàm**, tức mất
đúng phần cần đọc cho lớp lỗi như A9), org + project slug.

**`tools/linked.mjs` bắt được nó**, và điều đó đúng: "viết ra mà chưa nối" là
một chế độ hỏng thật. Đã thêm vào danh sách miễn **kèm lý do**, và luật 7 của
`telemetry-scrub.mjs` sẽ đỏ ngay khi `@sentry/*` xuất hiện mà `scrubEvent` chưa
được truyền làm `beforeSend`.

### GitHub Actions — workflow XONG, chưa chạy lần nào

**Đo trước khi viết**, và hai số đo đổi hình dạng workflow:

| Câu hỏi | Kết quả |
|---|---|
| Bộ kiểm cần gì | **14** bước cần PostgreSQL, **6** cần Playwright |
| Thiếu PostgreSQL | **5** bước in "BỎ QUA" rồi **vẫn thoát 0** |
| Chạy không phải root | `su nobody -c 'node tools/acwr-consistency.mjs'` → **exit 1**, `su: Authentication failure` |
| Bao nhiêu bước thế | **11/14** gọi `su postgres` không có đường lui; 3 bước kia có `\|\| pg_ctl` |
| `playwright` | **không phải phụ thuộc gì cả** — phải cài riêng trên CI |

Nên: job chạy dưới **root**, và **một job xanh không đủ để tin** —
`tools/ci-preflight.mjs` biến "bỏ qua trong im lặng" thành một lần hỏng to và
sớm (kiểm cả `su postgres` **bằng cách thử thật**, và cả **bản Chromium** chứ
không chỉ thư viện). `tools/ci-workflow.mjs` nằm trong cổng, **phân tích** YAML
chứ không dò chữ, canh chỗ dễ mục nhất: cổng vẫn chạy mà thôi chặn. Sáu phép thử
ngược, tất cả đỏ đúng chỗ.

**Workflow chưa từng chạy** — không có runner ở nơi nó được viết. Nó được viết
để hỏng to và sớm nếu một giả định sai. **Không cần khoá nào.**

### Không thêm

Stripe · Clerk · Upstash/Redis · Pinecone · backend/auth/CSDL thứ hai. Chưa có
phép đo nào nói stack hiện tại không làm được việc của chúng. Ngày có, nó được
ghi vào `docs/HA-TANG.md` **trước khi** gói được cài.

---

## A4 — ĐÓNG (2026-09-08)

`.env` trong git. Đã đo lại: `git ls-files .env` **rỗng**, `git check-ignore -v
.env` khớp `.gitignore:38`, tệp không còn trên đĩa (sửa ở `ce8c73f`). Phần lịch
sử — thứ mục này để mở — nay cũng đã đo: mọi bản `.env` từng commit chỉ chứa
`VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_URL`, đều công khai theo thiết kế và đều thuộc project Lovable cũ
vốn **không còn phân giải được**. Viết lại lịch sử đụng vào mọi clone và mọi PR
đang mở; cái giá ấy chỉ đáng cho một secret THẬT. Không có secret nào → đóng.

---

## ERRBOUND — XONG (2026-09-08)

### Chỗ trống là chỗ trống gì

`src/` chưa từng có error boundary; `crash-log.ts` đã ghi điều đó trong chú
thích của chính nó. Hệ quả không phải "khó chẩn đoán" mà là một hành vi: React
**tháo toàn bộ cây** khi một component ném lúc render và không ai bắt. Bản dev
hiện hộp đỏ; bản phát hành **trắng màn, vĩnh viễn**, và mở lại app thì lặp lại.

### Biên nằm ở đâu, và vì sao đúng chỗ ấy

```
GestureHandlerRootView → PersistQueryClientProvider → AppSettingsProvider
  → AuthProvider → NavTheme → LockedApp → AppLockProvider → CoachChatProvider
    → [AppErrorBoundary] → Gate → AuthScreen | OnboardingFlow | <Stack> (mọi route)
    ConnectionBanner · NeonToastHost · AppLockGate   ← anh em, NGOÀI biên
```

Hẹp nhất còn đúng: **mọi màn nằm dưới `Gate`**, và biên nằm *trong*
`AppSettingsProvider` + `AuthProvider` nên fallback đọc được bảng màu và ngôn
ngữ. Đặt cao hơn thì fallback không có theme, không có tiếng Việt, và phải là
một màn viết cứng bằng màu gõ tay. Ba anh em ở ngoài là chủ ý: dải báo mất mạng,
toast và cổng khoá vẫn sống khi màn chính đã hỏng.

### Ngoài biên — ghi ra chứ không giấu

| Không bắt | Vì sao |
|---|---|
| Lỗi ném từ chính các provider ở trên nó | Cần một biên **thứ hai** ở ngoài cùng, và fallback của nó không đọc được theme hay ngôn ngữ — đó là một **quyết định thiết kế** (viết cứng màu và chọn một ngôn ngữ), không phải một dòng code. Chưa tự quyết. |
| Lỗi trong handler sự kiện, promise, `setTimeout` | React không bắt loại nào trong đó, ở đâu cũng vậy. Chúng vẫn đi tới `ErrorUtils` và vẫn vào nhật ký. |
| Sự cố **native** — lớp lỗi của A9 | Không mã JS nào bắt được. Đó là mục Sentry. |

### Fallback: cố ý KHÔNG dùng `LoadFailed`

`LoadFailed` là card lỗi sẵn có và về ngôn ngữ thiết kế thì đúng — nhưng nó dựng
trên `GlassCard` + `MascotFigure`, tức **lớp kính** và **rig nhân vật**. Lớp
kính là đúng chỗ A9 nổ, và `glass-card.tsx:154` còn nằm trong danh sách nhánh
theo theme mà `theme-shape.mjs` đóng băng.

Một màn hình dựng ra *vì* có thứ vừa hỏng không được chia phụ thuộc với chỗ hay
hỏng nhất — nếu fallback cũng ném, React tháo luôn cả biên và ta quay lại đúng
màn trắng. Nên nó dựng bằng **token** (`usePalette`, `spacing`, `type`,
`radius`): cùng ngôn ngữ thiết kế, cùng theme, không kính, không SVG, không
Reanimated. `Pressable` trần thay `PressScale` vì cùng lý do.

**Và nó không nói lỗi là gì** — không thông điệp, không stack, không mã.

### Hồi phục: vòng lặp đo bằng THỜI GIAN

Nút "Thử lại" đặt lại state. Hỏng **ngay** sau hai lần thử → ngừng mời và đổi
sang "đóng app rồi mở lại". Nhưng một sự cố khác **một phút sau** thì lại được
mời: một bộ đếm trần thì sai cả hai chiều — coi hai sự cố cách nhau nửa tiếng là
một vòng lặp, và không bao giờ mời thử lại nữa sau đó.

### Một hệ quả phải bù lại

`ErrorUtils` **không thấy** lỗi đã bị boundary bắt. Nên thêm boundary vào một app
đang ghi nhật ký sự cố là lặng lẽ làm nhật ký ấy **thôi ghi** đúng loại lỗi nó
sinh ra để bắt — đổi khả năng *nhìn thấy* lấy khả năng *hồi phục*. Không đổi:
`componentDidCatch` gọi `recordCrash` kèm `componentStack` (thứ duy nhất nói
được **màn nào** hỏng khi stack của bundle đã minify thì không).

Và `recordCrash` **lọc qua `telemetry-scrub`** trước khi ghi: `settings.tsx:126`
có nút "chạm để gửi đi" gọi `Share.share` với toàn bộ nhật ký, nên đây là một
đường telemetry thật. Thử ngược: bỏ `scrubText` ra → 2 lỗi (UUID, token).

### Kiểm chứng — chạy thật, không đọc mã

`tools/error-boundary.mjs` nạp **React 19 + ReactDOM thật vào một trình duyệt
thật**, nạp component đã biên dịch, và cho một con **ném lúc render**. Bảy nhóm
khẳng định, **năm phép thử ngược, tất cả bắt được**:

| Thử ngược | Nó nói gì |
|---|---|
| gõ sai `getDerivedStateFromError` | fallback không hiện — tức **màn trắng**, đúng lỗi mà biên sinh ra để chặn |
| nút thử lại không đặt lại state | con không dựng lại |
| boundary không ghi vào nhật ký | 3 lỗi: 0 mục, sai `fatal`, thiếu `componentStack` |
| đếm vòng lặp bằng **số lần** | sự cố sau một phút vẫn bị coi là vòng lặp |
| fallback mượn `GlassCard` | luật tĩnh đỏ |

Và nó chứng minh fallback **không in** token, UUID, tên bảng hay chữ "Error".

**Không chứng minh:** nó chạy trong DOM, không phải iOS. Bố cục,
`UIVisualEffectView` và lớp interop cần một bản dựng thật.

**Một bước kiểm cũ bắt được tôi:** `crash-log.mjs` đỏ vì tôi thêm một phụ thuộc
mà nó chưa biết. Đã dạy nó, và thêm luật cho tính chất mới (mục ghi phải sạch).

---

## CI-PG — XONG (2026-09-08)

Chi tiết đầy đủ ở `docs/HA-TANG.md`. Ở đây là phần đáng nhớ.

**Con số vòng trước SAI.** "11/14 không có đường lui" được đếm bằng
`grep -c "su postgres"` trừ số dòng có `||`, và ba tệp trong danh sách đã có
nhánh quyền đúng từ trước. Thật ra là **8**. Một phép đếm chữ không phải một
phép đo hành vi — cùng bài học với `theme-shape` và `scan-food-boundary`.

**`|| pg_ctl` là câu trả lời sai.** `initdb` **từ chối chạy dưới root**, nên
thử-rồi-lui sẽ chạy nó bằng root ở lần thử thứ hai và nhận `cannot be run as
root` — đổi một lỗi rõ ràng lấy một lỗi khó đọc hơn. Điều kiện là QUYỀN, nên
phép rẽ phải là quyền. `chown` cũng phải nằm trong nhánh ấy.

**Tám tệp, sửa và kiểm từng cái**, mỗi cái hai lần, và mỗi lần phải thấy
`PostgreSQL 16.13` thật chứ không phải một lần bỏ qua: `acwr-consistency` ·
`error-copy` · `nutrition-averages` · `readiness-anchor` ·
`readiness-confidence` · `readiness-integrity` · `workload-volume` ·
`workout-sync-integrity`. **8/8 exit 0 dưới root và 8/8 exit 0 dưới người dùng
thường** (trước đó `acwr-consistency` là exit 1).

**Một lỗi CI thứ hai, tìm ra khi đang kiểm.** `nutrition-averages` gọi `npx tsc`
với `cwd` là thư mục tạm, nên npx đi ra registry tìm một gói **tên là `tsc`** —
một stub đã ngừng bảo trì, không phải TypeScript. Đo được dưới một người dùng
mới: `npm error request to https://registry.npmjs.org/tsc failed`. Đã gọi thẳng
`node_modules/typescript/bin/tsc`.

**Dụng cụ đo của tôi sai một lần nữa.** Phép thử đầu chạy dưới `nobody`, vốn có
HOME `/nonexistent`, nên `npx` hỏng vì lý do đó chứ không vì quyền. Đã đổi sang
một người dùng có HOME ghi được, giống runner thật.

**`tools/pg-harness.mjs`** (mới, trong cổng) giữ tính chất bằng luật tĩnh, và nó
tìm ra **hai tệp nữa** mà phép phân loại của tôi bỏ sót. Nó phân biệt đúng chỗ
cần: `su … || pg_ctl` vẫn được phép cho lệnh **dừng** (an toàn hai chiều) nhưng
không cho `initdb`/`start`. Nó cũng phải **trừ chính mình** — chuỗi luật của nó
khớp mọi mẫu nó đi tìm.

**Hệ quả: workflow bỏ `sudo`** cho bước chạy bộ kiểm; nó chỉ còn ở hai bước cài
gói hệ thống. `ci-preflight` bỏ luật `su postgres` — một luật canh một điều kiện
đã hết chỉ còn chặn nhầm.

**Chưa đo được:** chạy TOÀN BỘ bộ kiểm dưới người dùng thường ở máy này ra **17
bước đỏ**, nhưng cả 17 là `EACCES` ghi vào cây nguồn — cây ở đây thuộc `root`.
Trên runner thật, `actions/checkout` tạo cây thuộc chính người chạy. Phép đo dứt
điểm cần đổi chủ cả cây và thao tác ấy bị chặn ở môi trường này, nên điều này
được **suy ra**, không được chứng minh. `ci-preflight` nay thử ghi vào `native/`
và nói thẳng nếu không được — một dòng thay cho mười bảy stack trace.

**Ba lần dụng cụ đo sai trong vòng này**, mỗi lần tạo một lỗi giả: HOME
`/nonexistent` của `nobody` (npx đi tải gói) · PATH trỏ node 20 thay vì 22 · git
từ chối repo thuộc người khác. Không lần nào là lỗi của mã đang kiểm.

---

## GitHub Actions — ĐÃ KIỂM CHỨNG TRÊN RUNNER THẬT (2026-09-08)

Không còn là "chuẩn bị xong". Workflow đã chạy hai lượt trên runner thật của
GitHub, và **cả hai đỏ**. Ghi ra vì một trang trạng thái nói "đã chuẩn bị" trong
khi runner đang đỏ là trang nói dối.

| Lượt | Commit | Kết quả | Dài |
|---|---|---|---|
| #1 | `be8aea7` | failure | ~56s |
| #2 | `4ad659b` | failure | ~74s |
| **#3** | **`af46909`** | **success** | **9 phút 13 giây** |

Lượt #3: run `34274088152`, runner `ubuntu-24.04`, job `gate`, **cả 9 bước
success**. Bộ kiểm kết thúc bằng `tất cả đều xanh`.

| Bước | Thời gian |
|---|---|
| `npm ci` (kèm `patch-package`) | 20s |
| cài PostgreSQL 16 | 6s |
| Playwright + Chromium | 16s |
| **tiền kiểm** | **<1s** |
| TypeScript | 12s |
| **bộ kiểm đầy đủ** | **8 phút 10 giây** |

**Và các bước cơ sở dữ liệu THẬT SỰ chạy, không bỏ qua.** Log của runner có
`trên PostgreSQL 16.13 dựng từ toàn bộ migration` ở `độ tin cậy điểm sẵn sàng`
và `neo cửa sổ điểm sẵn sàng`. Đó là điều cả `ci-preflight` lẫn `pg-harness`
tồn tại để bảo đảm, và nó nay là một phép đo trên runner chứ không phải một suy
luận.

### Lỗi thật đầu tiên, và nó hỏng ĐÚNG CHỖ nó phải hỏng

```
✗ không nạp được playwright (đã tìm:
  /home/runner/work/fitness-os/fitness-os/native/node_modules,
  /opt/hostedtoolcache/node/22.23.2/x64/lib/node_modules).
  6 bước chạy trình duyệt sẽ hỏng
```

`ci-preflight` dừng job ở **giây thứ 30** với câu nói đúng cái đang thiếu — thay
vì 6 bước đỏ ở phút thứ mười với sáu stack trace về trình duyệt. Đó là toàn bộ
lý do bước ấy tồn tại, và đây là lần đầu nó được kiểm chứng ở nơi nó dùng để
chạy.

### Nguyên nhân gốc — của tôi, không phải của runner

`sudo npm install -g playwright` cài vào prefix npm của **root**, còn
`npm root -g` của người chạy job trỏ vào toolcache của chính nó. Hai chỗ khác
nhau, nên thư viện có mặt mà không ai tìm thấy. Và `sudo npx playwright install`
tải trình duyệt về `/root/.cache/ms-playwright` — thư mục 0700 mà người chạy job
không đọc được.

`--with-deps` **không** cần `sudo` ở ngoài: Playwright tự leo quyền cho phần apt
của nó. Đọc từ chính gói đang cài —
`playwright-core/lib/server/registry/dependencies.js:356-358` dựng
`{ command: "sudo", args: ["--", "sh", "-c", …] }` khi nó không phải root — chứ
không đọc từ tài liệu.

**Sửa: bỏ `sudo` khỏi đúng hai dòng ấy.** Không nới lỏng bước kiểm nào, không
đổi lỗi thành bỏ qua.

### Đã được runner thật xác nhận (đo, không suy ra)

Bốn điều kiện còn lại của `ci-preflight` **đều xanh** trên runner:

- **PostgreSQL 16** cài được và tìm thấy đúng chỗ các bước kiểm đi tìm
- `node_modules/pg` có mặt sau `npm ci` (tức không bị `--omit=dev`)
- `node_modules/typescript` + `tsconfig.json` có mặt
- **cây làm việc ghi được** — điều mà ở container này chỉ *suy ra* được, vì
  thao tác đổi chủ cây bị chặn. Nay nó là một phép đo.

Và `npm ci` (kèm `patch-package` qua `postinstall`) chạy xong không lỗi.

### Điều này đổi một chữ trong tài liệu

Trước: "chuẩn bị xong, chưa chạy lần nào". Nay: **ĐÃ KIỂM CHỨNG** — một lượt
kết thúc `success` trên runner thật của GitHub, với các bước PostgreSQL và
Playwright chạy thật.

Và nó đóng luôn một chỗ trước đây chỉ *suy ra* được: chạy toàn bộ bộ kiểm dưới
một người dùng **không phải root** là được — điều mà container này không chứng
minh nổi vì cây thuộc `root` và thao tác đổi chủ bị chặn. Runner chạy dưới
`runner`, và 215 bước xanh.

---

## SENTRY — ĐÃ NỐI (2026-09-08), native CHƯA kiểm

Chi tiết ở `docs/HA-TANG.md` mục 1. Ở đây là ba điều đáng nhớ.

### Ranh giới cũ của tôi SAI, và cả hai vế đều đo được

Vòng trước tôi ghi "không cài SDK từ máy này — cài mà không dựng lại thì import
ném lúc chạy". Sai:

- **Repo dùng CNG** (không có `ios/`, `android/`) → thêm native module là thay
  đổi **cấu hình**, native sinh lúc dựng.
- **Import không ném**: `wrapper.js:35` dùng `TurboModuleRegistry?.get()`.
  `getEnforcing` chỉ ở `NativeRNSentry.js` và chú thích của Sentry nói nó ở đó
  *"to pass codegen even if not used"*.

Và **bài học A9 đã áp dụng trước khi cài**: gói khai `codegenConfig`
`"type": "all"` — có kiến trúc mới. MaskedView 0.3.2 của A9 **không có dòng
nào**. Đó là phép kiểm bắt buộc trước mọi native module trong app này.

Bản: **`~7.11.0`** — danh sách tương thích của chính Expo cho SDK 57, không phải
npm `latest` (8.25.0). `sentry-expo` không dùng (bản cuối 2024-02-15).

### Hai móc, và cái thứ hai là cái quan trọng

`beforeSend` chỉ chạy khi **JS còn sống**. Một sự cố native giết tiến trình: lớp
native dựng báo cáo rồi gửi ở lần mở sau, và `beforeSend` **không bao giờ chạy
cho nó**. Thứ duy nhất của JS còn vào được báo cáo ấy là breadcrumb, vì SDK
chuyển tiếp từng cái sang native lúc chúng xảy ra — nên `beforeBreadcrumb` là
chỗ chặn **duy nhất** cho đúng lớp lỗi Sentry được thêm vào để phục vụ.

Thiếu nó thì Sentry vẫn "chạy" và mỗi báo cáo native mang theo URL PostgREST có
`user_id=eq.<uuid>` cùng tên bảng sức khoẻ. Nó **trông như thành công**.

### Ba mức "đã kiểm" — KHÔNG gộp

| Mức | | Bằng chứng |
|---|---|---|
| Tĩnh | ✅ | luật 8 của `telemetry-scrub.mjs`; **4 phép thử ngược** đều bắt được: bỏ `beforeBreadcrumb`, bỏ `beforeSend`, bật `attachScreenshot`, DSN viết thẳng |
| JS / runtime | ✅ | `scrubBreadcrumb` chạy thật; **cổng 215/215 xanh với SDK đã cài**, gồm 6 bước dựng bundle web + mở trình duyệt |
| **Native (iOS)** | ❌ | Linux không dựng được iOS. **Chưa có gì** chứng minh sự cố native được bắt, được gửi, hay báo cáo ấy đã sạch |

`tools/linked.mjs` bắt được một miễn trừ đã cũ (`scrubEvent` nay đã nối) và tôi
gỡ luôn `observabilityEnabled` — một hàm viết cho một màn Cài đặt chưa tồn tại.
Không ship thứ chưa ai gọi.

---

## AUDIT SẢN PHẨM TRƯỚC RA MẮT — vòng 1 (2026-09-08)

Đi qua app như một người chưa từng thấy nó, dựa trên **ảnh chụp bản dựng thật**
(`tools/live.mjs --shots`), không dựa trên việc đọc mã rồi đoán. 32 màn × 3
trạng thái (đủ dữ liệu / **tài khoản trống** / mọi truy vấn hỏng).

**Luật lọc nhiễu, lấy từ chính `live.mjs`:** *"Anything that is layout, platform
or chrome seen here is noise."* Mọi phát hiện dưới đây đã được hỏi "nó có biến
mất trên điện thoại không?" trước khi được ghi.

### Câu hỏi trung tâm: 5 phút đầu

**Trả lời được.** Sau onboarding, màn Hôm nay có bốn nút hành động rõ ràng —
*Ghi bữa · Ghi buổi tập · Ghi giấc ngủ · Nhập chỉ số* — và mỗi màn chính có một
việc tiếp theo nói thành lời. Không màn nào trong 32 màn bị trắng, không màn nào
ném lỗi runtime, và không chuỗi `NaN`/`undefined` nào lọt ra.

### Cái đang làm ĐÚNG (ghi lại để không ai "sửa" mất)

| Màn | Vì sao nó tốt |
|---|---|
| **Tập luyện** (trống) | *"Chưa có buổi tập nào hôm nay — Chọn một buổi, hoặc cứ ghi lại thứ bạn làm."* Nói việc tiếp theo VÀ cho phép bỏ qua bước lập kế hoạch |
| **Tiến trình** (trống) | `CURRENT —` · `CHANGE —` · `RECORDS 0`; *"Cần cân nặng và chiều cao để tính BMI"*; *"Chưa đủ dữ liệu"* trên biểu đồ |
| **Huy chương** (trống) | `0/29`, và **mỗi** huy chương nói điều kiện của nó (*"Ghi 3 ngày liên tiếp"*) kèm tiến độ `0/3` |
| **Mọi truy vấn hỏng** | *"Không tải được dữ liệu / Dữ liệu của bạn vẫn an toàn, chỉ là app chưa lấy được"* + nút **Thử lại**. Người dùng hồi phục được mà không phải mở lại app |
| **Onboarding** | 7 bước, mỗi quyền xin kèm một dòng **vì sao**, và có "để sau". Nút Tiếp bị chặn ở bước 0 **có nói lý do** ngay tại ô nhập |
| **Cài đặt** | Mỗi công tắc có một dòng giải thích tác dụng |

### Phát hiện

#### P-01 — vòng Sẵn Sàng vẽ `0` khi chưa đo được gì · **P2** · ĐÃ SỬA

| | |
|---|---|
| **Màn** | Hôm nay → hero "Sẵn Sàng", trạng thái tài khoản trống |
| **Quan sát** | Vòng tròn hiện số **`0`**, dưới là một gạch. Lời giải thích nằm trong `<Expander open={detailOpen}>` nên **thu lại mặc định** — người mới không thấy nó |
| **Mong đợi** | Không vẽ một chữ số khi chưa có phép đo nào |
| **Bằng chứng** | Ảnh `empty/today.png`. Và app **tự mâu thuẫn với chính nó**: `/progress` dùng `CURRENT —`, `CHANGE —` cho "chưa đo" và `RECORDS 0` cho một phép đếm thật; huy chương dùng `Earned 0/29` — cũng là đếm thật. Vòng hero là chỗ **duy nhất** vẽ `0` cho "chưa đo" |
| **Nguyên nhân** | `EmptyHero` (`hero-pages.tsx`) truyền `value={0}` cho `HeroRing` |
| **Vì sao nó quan trọng** | Đây là app sức khoẻ. `0` là chữ số app dùng cho một điểm THẬT, nên nó đọc thành "điểm sẵn sàng của bạn là 0" — đáy thang — cho một người chưa làm gì sai. Engine đứng ngược lại: `computeReadiness` trả "không có điểm" chứ không trả điểm kém khi thiếu số đo, và bước kiểm `readiness-confidence` đã canh đúng điều đó |
| **Độ chắc** | Cao — quy ước có sẵn trong app, ở hai chỗ |
| **Đã sửa** | `HeroRing` nhận thêm `placeholder?: string`; `EmptyHero` truyền `—`. **Không** đổi `value: number` thành string — prop ấy có lý do ghi sẵn (dấu phân cách theo ngôn ngữ + cú đếm khớp nét quét vòng), và canary của `live.mjs` từng bắt một hồi quy ở đúng chỗ đó |
| **An toàn tự sửa** | Có — `EmptyHero` chỉ dùng ở **đúng một** chỗ |

#### P-02 — tiêu đề đầu trang trong suốt, ở bản SÁNG · **P2** · KHÔNG SỬA, cần quyết định

| | |
|---|---|
| **Màn** | `/shop` và `/mascot-room` |
| **Quan sát** | "Dressing Room" gần như không đọc được: chữ gần đen trên dải cảnh tối |
| **Nguyên nhân** | `pageTitleFloat` không đặt lại `color`, nên nó thừa `c.foreground` = `#1a1917`. Cùng hàng ấy, mũi quay lại bị ghim cứng `'#fff'` (`screen.tsx:390`) — **hai thứ trong một hàng đang nói hai chuyện khác nhau** |
| **Trạng thái** | Mã **đã ghi sẵn** đây là *"QUYẾT ĐỊNH THIẾT KẾ CÒN MỞ, không phải một phép đổi token"*, kèm câu *"Cả hai màn chưa từng được chụp ở bản sáng"* |
| **Đóng góp của vòng này** | **Nay đã chụp.** `empty/shop.png` là bằng chứng đầu tiên rằng vấn đề dự đoán ấy có thật và nhìn thấy được |
| **An toàn tự sửa** | **Không.** Chọn màu chữ cho một đầu trang trong suốt trên nền sáng là quyết định thiết kế; mã đã nói thế và tôi không đè lên |

#### P-03 — Cài đặt không nói app có gửi báo cáo sự cố đi không · **P3** · cần quyết định

| | |
|---|---|
| **Bối cảnh** | Vòng này vừa nối Sentry. Khi `EXPO_PUBLIC_SENTRY_DSN` được đặt, app **gửi dữ liệu ra bên thứ ba** — và màn Cài đặt không nói gì cả |
| **Hôm nay** | Chưa thành vấn đề: không có DSN thì không một byte nào rời máy |
| **Mong đợi** | Ngày bật DSN, Cài đặt phải nói ra — lý tưởng là kèm công tắc |
| **An toàn tự sửa** | **Không** — đây là chữ hiển thị cho người dùng và một lựa chọn sản phẩm. Tôi đã **gỡ** `observabilityEnabled` khỏi `observability.ts` chính vì không ship một hàm cho một màn chưa tồn tại |

#### P-04 — gợi ý nói về việc người dùng chưa làm · **P3** · quan sát, chưa kết luận

Ở `empty/nutrition.png`, thẻ gợi ý ghi *"Trained today and the calories did not
go up? Tap here."* cho một tài khoản chưa ghi buổi tập nào. Có thể là mẹo xoay
vòng chứ không phải một khẳng định về trạng thái — **chưa đủ bằng chứng để gọi
là lỗi**, và không sửa.

### Cái audit này KHÔNG kiểm được

Bộ chạy là web. VoiceOver, `UIVisualEffectView`, cảm giác cuộn, độ trễ chuyển
màn và mọi thứ thuộc về chạm — không thứ nào ở đây. Trợ năng, đổi theme, bàn
phím, i18n vẫn được canh bằng các bước kiểm tĩnh trong cổng
(`a11y-swallow`, `tap-targets`, `theme-shape`, `i18n`, `bàn phím`) và chúng xanh
— nhưng "xanh ở bước kiểm" không phải "đã dùng thử trên máy thật".

---

## LƯỢT ĐÁNH BÓNG SẢN PHẨM — 0 khiếm khuyết, 0 thay đổi mã (2026-09-09)

Đầy đủ ở **`docs/PRE-LAUNCH-POLISH.md`**. Tóm tắt:

Một lượt rà soát UX / chuyển động / hiệu năng / hệ thống kết thúc bằng **không
sửa gì**, và đó là kết quả chứ không phải một lần bỏ cuộc. Lý do: **211 bước
kiểm có tên** đã phủ gần hết những gì một lượt như thế đi tìm — thang chữ, bảng
màu, hình dạng cây theo theme, Dynamic Type, vùng chạm, ngân sách vẽ/ảnh/xuất
hiện, khởi động lạnh, tầng import, phạm vi hook, một-khái-niệm-một-tên.

**Hệ chuyển động đã tồn tại** (`src/constants/motion.ts`) và tốt hơn thứ một lượt
làm mới sẽ tạo ra: bốn `duration` đặt tên vì app ĐÃ nói bằng bốn con số ấy ở bảy
chỗ, lò xo viết bằng `spring(duration, bounce)` của Apple, và nó ghi rõ hai thứ
**cố ý không** token hoá (rig nhân vật, dải xuất hiện) vì chúng là choreography.
Bước kiểm `mô hình lò xo` còn bắt được rằng công thức damping trên slide WWDC23
của Apple **là sai** và đã được chính Apple đính chính.

Ba thứ được kiểm trong lượt này, cả ba đều **đủ**:

| | Kết quả |
|---|---|
| **Reduce Motion** | grep chỉ 4 khoảng trống · đọc ra **0**. `drag-reorder` từ chối có chủ ý và có ghi lý do (đóng băng cú tự-cuộn khi đang kéo là gỡ tính năng — khớp ý định của Apple). Reanimated mặc định `ReduceMotion.System`, chỉ `useFrameCallback` là không, và đúng hai đồng hồ ấy đã nối |
| **Hành động phá huỷ** | **13/13** hook xoá có xác nhận. grep chỉ 1 ứng viên · đọc ra đó là một **chú thích**. Không có bước kiểm canh tính chất này — ghi là khoảng trống đã biết, **không thêm luật cho một thứ đang đúng** |
| **Haptics** | nhất quán theo mô hình Apple: selection 188 · Light 66 · Success 45 · Medium 16 · Warning 7 · Error 2 |

**Bài học, và nó lặp lại lần thứ ba:** grep chỉ ra khoảng trống, đọc cho ra
không có. Reduce Motion 4→0 · xoá-không-xác-nhận 1→0 · và lượt trước
"11/14 bước PostgreSQL" thật ra là 8. Repo này chống lại phép đo bằng chuỗi, vì
lý do của mỗi quyết định nằm ngay cạnh nó — và một chú thích giải thích *vì sao
không làm X* trông y hệt mã *quên làm X* với một biểu thức chính quy.

**Không nghiên cứu web trong lượt này**, vì không đổi hành vi hoạt hoạ và không
đụng API nào — ghi ra chứ không dựng một mục "nghiên cứu" cho có.

---

## HERMES-MEM — ĐÃ NÂNG CÓ KIỂM SOÁT (2026-09-09)

Một bản nâng hẹp, cho đúng một lý do. **Không** nâng chung, **không** đụng gói
nào của app.

### TRƯỚC → SAU

| | TRƯỚC | SAU |
|---|---|---|
| `expo` (manifest) | `~57.0.6` | `~57.0.9` |
| `expo` (đã cài) | 57.0.6 | **57.0.9** |
| `react-native` | `0.86.0` | **`0.86.2`** |
| **`hermes-compiler`** | **250829098.0.14** | **250829098.0.16** |
| expo-doctor | 19/21 · **2 đỏ** | 20/21 · **1 đỏ** |
| gói trễ | 22 | **20** |
| TypeScript | xanh | xanh, đầu ra rỗng |
| Cổng | 215/215 | **215/215** |
| Bộ chạy web | 32×3 xanh | **32×3 xanh** (bundle Metro dựng lại trên chuỗi công cụ mới) |

Node v22.22.2 · npm 10.9.7, không đổi.

### Vì sao ĐÚNG hai phiên bản này

`expo-doctor` nói: *"Detected Hermes V1 250829098.0.14… **250829098.0.16** is
the first version that contains the fix"*, và khuyến nghị `expo@^57.0.9` /
React Native **≥ 0.86.2**.

Đọc `bundledNativeModules.json` của từng bản expo — không đoán:

| expo | ghim react-native |
|---|---|
| **57.0.9** | **0.86.2** ← ngưỡng tối thiểu |
| 57.0.21 (mới nhất) | 0.86.3 |

Nên **57.0.9 + 0.86.2** là tổ hợp NHỎ NHẤT gỡ được hồi quy, và đó là cái được
chọn. Không lên 57.0.21: nó không sửa thêm gì cho mục này và đổi nhiều hơn.

### `expo install --fix` bị BỎ, và đó là điểm quan trọng nhất của vòng này

Đó là "đường chính thức", nên tôi thử nó trước. Nó làm **đúng thứ bản nâng này
bị cấm làm**:

- đặt `expo` thành `~57.0.21`, **không** phải 57.0.9
- đổi 20 dòng trong `package.json`
- **hạ MAJOR** `@react-native-async-storage/async-storage` `^3.1.1` → `2.2.0`

Cái thứ ba là lớp lưu trữ của app — thứ giữ cache persist, hàng đợi ghi offline
và mọi khoá người dùng. Một bản hạ major ở đó không có chỗ trong một bản nâng
"sửa Hermes".

Đã hoàn nguyên `package.json` + `package-lock.json` về đúng bản commit, rồi cài
tay đúng hai gói. **Đường chính thức không phải lúc nào cũng là đường hẹp.**

### Lockfile: nhiễu là gì

77 gói đổi phiên bản, 9 thêm, 2 bỏ. Phân theo họ: **expo 26 · react-native 14 ·
khác 37** — và cả 37 "khác" đều là chuỗi công cụ đi kèm (metro 0.84.4→0.84.5,
babel-preset-expo, lightningcss, terser, postcss). Trong đó có đúng dòng đáng
đọc: `hermes-compiler 250829098.0.14 → 250829098.0.16`.

**Không gói nào của app đổi.** `async-storage`, `react-native-reanimated`
(4.5.0), `react-native-screens` (4.25.2), `@supabase/*`, `@sentry/react-native`
(~7.11.0) — nguyên vẹn.

Cây phụ thuộc: **một** `react-native` ở tầng chạy. Có vài `@react-native/*`
0.86.3 lồng dưới `expo/` và `babel-preset-expo/` — đó là công cụ dev/dựng
(debugger, codegen), không phải runtime thứ hai.

### Doctor còn một phép đỏ, và nó KHÔNG phải mục này

*"Check that packages match versions required by installed Expo SDK"* = **20 gói
trễ** = DEP-1, đã theo dõi, là quyết định của chủ dự án. Nó đỏ **trước** bản nâng
và vẫn đỏ. Điều đáng nói là bản nâng làm nó **tốt hơn**: 22 → 20, và **không gói
nào mới trễ** (`expo-constants`, `expo-font` hết trễ nhờ đi theo expo 57.0.9).

### BA MỨC BẰNG CHỨNG cho HERMES-MEM — không gộp

| Mức | | Bằng chứng |
|---|---|---|
| **A. Phiên bản / cấu hình** | ✅ | `hermes-compiler` trong lockfile là **250829098.0.16**, đúng bản Expo nêu tên. Phép kiểm Hermes của doctor biến mất khỏi danh sách đỏ |
| **B. Kiểm tĩnh / runtime** | ✅ | TypeScript exit 0 · cổng 215/215 · bộ chạy web 32 màn × 3 trạng thái xanh trên bundle Metro dựng lại |
| **C. Bộ nhớ trên iPhone thật** | ❌ **CHƯA** | Không có máy. **Không được nói hồi quy bộ nhớ "đã sửa" chỉ vì doctor xanh** — doctor đọc số phiên bản, không đo bộ nhớ |

Mục **E6** của `docs/QA-MAY-THAT.md` (mở app 20 phút, đi qua mọi tab) là phép đo
duy nhất kết luận được, và nay nó chạy được **không kèm dấu hỏi** — đó chính là
điều bản nâng này mua về.

---

## CHUẨN BỊ KIỂM TRÊN MÁY THẬT (2026-09-09)

Danh sách đi từng bước: **`docs/QA-MAY-THAT.md`**. Ở đây là những gì audit cấu
hình tìm ra.

### CHẶN — chưa liên kết dự án EAS

`app.json` không có `extra.eas.projectId`, và `eas.json` đặt
`"appVersionSource": "remote"` — thứ **đòi** một dự án đã liên kết. `eas build`
chưa chạy được ở chế độ không tương tác.

**Cần:** tài khoản Expo + `eas init` trong `native/`. **Không bịa được** — tôi
không tạo ra một UUID dự án của người khác.

### ~~RỦI RO CAO — Hermes V1 có hồi quy bộ nhớ đã biết~~ → ĐÃ NÂNG, xem mục HERMES-MEM ở trên

`npx expo-doctor` chạy hôm nay, **2/21 phép kiểm đỏ**. Phép quan trọng:

> This project uses Hermes V1 with expo@57.0.6, which is affected by a known
> memory regression. Detected Hermes V1 **250829098.0.14**. …**250829098.0.16**
> is the first version that contains the fix.

Khắc phục theo chính Expo: `expo@^57.0.9` / React Native **≥ 0.86.2**. Repo
đang ở `expo ~57.0.6`, `react-native 0.86.0`.

**Vì sao nó là mục quan trọng nhất của vòng này:** một hồi quy **bộ nhớ** hiện
ra trên máy thật đúng như *"app chậm dần"*, *"app bị hệ thống giết"*, *"app
thoát sau một lúc"* — tức lẫn hoàn toàn vào những triệu chứng mà QA máy thật đi
tìm, và vào chính lớp triệu chứng của A9. Chạy QA trên một bản dựng có hồi quy
đã biết là đo hai thứ cùng lúc mà không tách được chúng.

**KHÔNG tự nâng.** DEP-1 đã ghi là quyết định của chủ dự án, và nâng `expo` +
`react-native` đòi một bản dựng native để xác nhận. Nhưng khuyến nghị: **nâng
TRƯỚC khi chạy danh sách QA**, nếu không mọi phát hiện về hiệu năng đều mang một
dấu hỏi. Phép kiểm đỏ thứ hai chỉ là "22 gói trễ" = DEP-1, đã theo dõi.

### Chưa xác minh được ở đây

`eas.json` khai `channel: preview`/`production` nhưng **`expo-updates` không có
trong `package.json`**. Tài liệu Expo không nói build sẽ lỗi, cảnh báo hay bỏ
qua. **Không sửa `eas.json` theo phỏng đoán** — đọc log lần `eas build` đầu rồi
quyết.

### Bản dựng miễn phí kiểm được cái gì

`EXPO_FREE_TEST=1` gỡ HealthKit, Sign In with Apple và Push để dựng bằng Apple
ID miễn phí. Nên trên bản ấy, ba mục đó phải ghi **"không áp dụng"**, không được
ghi "đạt". Và Android push chưa dựng được: không có `google-services.json`.

### Đã sửa vòng này — một thứ, và nó là tài liệu

Phần đầu `.github/workflows/quality-gate.yml` còn ghi *"211 bước"* và *"Tệp này
CHƯA TỪNG CHẠY"*. Cả hai nay sai (215 bước; lượt #3 đã `success`). Đã sửa cho
khớp phép đo, kèm số của lượt xanh. Không đổi một dòng hành vi nào.

---

## BA MỨC BẰNG CHỨNG — bảng tổng, không được gộp

| Hạng mục | TĨNH | RUNTIME (web) | **MÁY THẬT** |
|---|---|---|---|
| Cổng 215 bước | ✅ | ✅ | — không áp dụng |
| CI trên runner GitHub | ✅ | ✅ | — không áp dụng |
| Biên bắt lỗi React | ✅ | ✅ | ❌ **chưa** |
| Bộ lọc riêng tư Sentry | ✅ | ✅ | ❌ **chưa** |
| **Sentry bắt sự cố NATIVE** | ✅ (nối đúng) | — không kiểm được | ❌ **chưa — đây là mục chính** |
| P-01 vòng sẵn sàng `—` | ✅ | ✅ (ảnh chụp) | ❌ **chưa** |
| A11Y-2 nút lồng nút | ✅ | ✅ | ❌ **chưa — VoiceOver chưa từng chạy** |
| A9 (chạm vùng vòng sau khi đổi tab) | — | — | ✅ chủ dự án xác nhận 2026-09-08 · **cần kiểm lại** sau khi thêm biên + Sentry |

---

## ERRBOUND-2 — MỞ, và nó là một QUYẾT ĐỊNH THIẾT KẾ

Không cài đặt gì ở đây. Trang này ghi đủ để người quyết định không phải đọc lại
mã, và cố ý dừng trước chỗ phải chọn.

### Nó bắt cái gì mà biên hiện tại không bắt

Biên hiện tại nằm quanh `<Gate />`. Bảy thứ ở **trên** nó ném ra thì không ai
bắt, và app trắng màn đúng như trước:

`GestureHandlerRootView` · `PersistQueryClientProvider` · `AppSettingsProvider` ·
`AuthProvider` · `NavTheme` · `LockedApp` · `AppLockProvider` ·
`CoachChatProvider`

Xác suất thấp hơn hẳn một màn hình — chúng không dựng lại theo dữ liệu — nhưng
hậu quả **nặng hơn**: một màn hỏng là một màn; một provider hỏng là cả app, mọi
lần mở, không có đường ra.

### Chỗ phải chọn, và vì sao không tự quyết được

Fallback của biên thứ hai **không đọc được** `usePalette` hay `useI18n`: cả hai
là context do đúng những provider vừa ném cung cấp. Nên nó buộc phải:

1. **Chọn một màu** mà không biết người dùng đang ở theme nào.
2. **Chọn một ngôn ngữ** mà không biết họ đang đọc tiếng gì.

Cả hai là câu hỏi thiết kế, không phải câu hỏi kỹ thuật, và đoán sai thì cái
người dùng thấy vào khoảnh khắc tệ nhất là một màn hình **sai theme, sai tiếng**.

### Ba lựa chọn nhỏ nhất, và cái giá của từng cái

| | Cách làm | Được | Mất |
|---|---|---|---|
| **A** | Một biên ngoài cùng, fallback **một màu trung tính** (không đen không trắng) + **một ngôn ngữ** | Rẻ nhất; ~20 dòng; không phụ thuộc gì | Sai theme với một nửa người dùng; sai tiếng với một nửa |
| **B** | Như A, nhưng đọc theme + ngôn ngữ **từ AsyncStorage** trước khi dựng | Đúng theme và đúng tiếng trong hầu hết trường hợp | Đọc bất đồng bộ ⇒ một nhịp trống trước khi vẽ; và nếu chính `AppSettingsProvider` hỏng vì kho hỏng thì phép đọc này hỏng cùng lý do |
| **C** | Không thêm biên; để `ErrorUtils` + nhật ký sự cố ghi lại, app vẫn trắng | Không thêm mã, không thêm chỗ hỏng | Người dùng vẫn không có đường ra; chỉ có người đọc log biết |

**B là cách duy nhất tránh được "sai theme, sai tiếng"**, và nó là cách duy nhất
có một chế độ hỏng chung với thứ nó đang cứu. Đó chính là chỗ cần một người
quyết định chứ không phải một phép đo.

### Câu hỏi cần trả lời để mở khoá mục này

1. **A, B hay C?**
2. Nếu A: **màu nào** và **tiếng nào**? (Gợi ý mặc định của app: `vi`.)
3. Fallback ấy có nút gì? "Thử lại" ở đây nghĩa là dựng lại **toàn bộ** cây,
   tức mất mọi state trong bộ nhớ — khác hẳn nút thử lại của biên hiện tại.

### Đã biết trước, để khỏi đo lại

- Biên hiện tại **không** cần đổi cho việc này; biên thứ hai là một lớp bọc
  thêm ở ngoài `GestureHandlerRootView`.
- `tools/error-boundary.mjs` dựng sẵn cho việc này: đổi thêm một kịch bản là đủ,
  không phải viết lại bộ khung.
- `recordCrash` đã lọc riêng tư, nên biên thứ hai ghi log được ngay mà không
  cần thêm gì.

---

## A12 — BẢN DỰNG iOS: annotation viết cho Xcode 27, gặp Xcode 26.2 (2026-09-09)

Bản dựng native thật lần đầu đi tới Xcode và chết ở **đúng hai lỗi**, dòng 53 và
61 của `RuntimeScheduler.h` trong `expo-modules-jsi`. Chi tiết đầy đủ ở
`SO-GHI-LOI.md` mục **A12**; đây là phần thuộc về trạng thái hạ tầng.

### Cảnh báo đứng gần nhất KHÔNG phải nguyên nhân

patch-package in *"created for 57.0.3, applied to 57.1.0"* ngay trước hai lỗi.
Loại trừ bằng `diff`, không bằng suy đoán: patch cũ đụng một tệp **Swift** khác,
và bản cài của cả hai tệp **giống hệt** bản gốc 57.1.0 — tức patch ấy đã là
**no-op** từ khi thượng nguồn nhận cùng bản sửa ở 57.0.5.

**Bài học đã được đóng thành luật.** `tools/patch-drift.mjs` (bước *trôi patch*)
bắt đúng trạng thái đã đánh lừa vòng này: tên tệp patch không khớp phiên bản
trên đĩa, và patch rỗng. Đã phá thử **bốn chiều**, cả bốn đỏ, khôi phục lại xanh.

### Đường phụ thuộc — chỗ tôi báo cáo thiếu ở HERMES-MEM

```
expo 57.0.6 → 57.0.9    đòi expo-modules-core ~57.0.8
  core 57.0.5 → 57.0.17
    core 57.0.16 → jsi ~57.0.8
    core 57.0.17 → jsi ~57.1.0     ← PATCH của core, MINOR của jsi
      jsi 57.0.3 → 57.1.0
```

Ở `fb53951` tôi viết *"không gói nào của app đổi"*. Đúng về `dependencies` trong
`package.json`, **sai về cây thật** — và một bản nâng "hẹp" vẫn dịch được hai
gói bắc cầu. Vòng sau: đọc `git diff package-lock.json` theo GÓI, không theo số
dòng.

### Vì sao không lùi phiên bản

Annotation có từ **57.0.5**, nên lùi tới 57.0.8 vẫn đỏ; lùi tới 57.0.4 phải kéo
`expo` về 57.0.6 và **trả lại hồi quy bộ nhớ Hermes**. Canary SDK 58 vẫn giữ
nguyên annotation, và PR gỡ nó ở thượng nguồn (expo/expo#49740) **đã bị bỏ**.
Không có bản nào để chạy tới — patch cục bộ là đường duy nhất.

### Toolchain

Đo được: **Xcode 26.2 · Swift 6.2.3 · iOS SDK 26.2**. Expo SDK 57 công bố cần
**Xcode 26.4**. Máy đang thấp hơn, nhưng đó **không** phải nguyên nhân: annotation
được viết cho **Xcode 27**, nên 26.4 nhiều khả năng cũng đỏ. Patch rẽ theo
`__apple_build_version__ >= 18000000` nên **tự đúng ở cả hai phía** khi máy nâng.

---

## Còn mở

| ID | Mức | Vấn đề | Việc tiếp theo |
|---|---|---|---|
| ERRBOUND-2 | P3 | Không có biên thứ hai ở ngoài các provider | **Quyết định thiết kế** — ba lựa chọn và ba câu hỏi đã viết sẵn ở mục ERRBOUND-2 bên trên. Không cài đặt suy đoán. |
| DEP-1 | P2 | 21 gói trễ, gồm `react-native-screens` 4.25.2→4.26.0 và `react-native` 0.86.0→0.86.3 | Cần dựng lại native để xác nhận — quyết định của chủ dự án |
| A3 | P1 | Ghi khi mất mạng không sống sót (xem `SO-GHI-LOI.md`) | Cần một bước kiểm chứng minh cả ~30 mutation đặt đúng key **trước khi** bắt đầu |
| A7 | P2 | Xoá buổi tập không dựng lại các ngày ở giữa | xem `SO-GHI-LOI.md` |
| A8 | P2 | Android không có blur thật sau status bar | Giới hạn có chủ ý |
| AI-DEPLOY | P1 | Không function nào được deploy; sáu tính năng AI không có backend | Chủ dự án: `docs/AI-TRIEN-KHAI.md` mục 3–5. Cần `supabase` CLI + quyền |
| SHOP-HDR | P2 | Tiêu đề đầu trang trong suốt gần như không đọc được ở bản SÁNG (`/shop`, `/mascot-room`) | **Quyết định thiết kế** — `screen.tsx` đã ghi rõ là quyết định chưa ai ra. Ảnh `empty/shop.png` là bằng chứng đầu tiên. Không tự sửa |
| SENTRY-UI | P3 | Cài đặt không nói app có gửi báo cáo sự cố đi không | Chỉ thành vấn đề khi `EXPO_PUBLIC_SENTRY_DSN` được đặt. Cần chữ hiển thị + có thể một công tắc — lựa chọn sản phẩm |
| P3-1 | P3 | `settings` / `mascot-room`: `transform-origin` là thuộc tính DOM sai trên web | Chuỗi CSS của Koa; bản native đọc đúng qua `koa-figure.tsx:461`. Chỉ là tiếng ồn trên web |

---

## Bàn giao — vòng sau bắt đầu từ đâu

**Việc đáng làm nhất mà KHÔNG cần máy thật: A3 (P1).** Và bắt đầu bằng bước kiểm,
không bằng bản sửa — `SO-GHI-LOI.md` A3 đã ghi vì sao: cách sửa thật là persist
mutation cache cộng `mutationKey` + `setMutationDefaults` cho khoảng ba mươi
mutation, và *"một call site đặt sai key thì mutation đó **âm thầm** ngừng
resume — không lỗi, không cảnh báo, chỉ là dữ liệu biến mất"*. Ba mươi chỗ để
sai và không chỗ nào tự kêu. Nên thứ tự bắt buộc là: dựng một bước kiểm chứng
minh được cả ba mươi chỗ đều đúng, **rồi mới** sửa.

**Hai việc đang chờ chủ dự án, không ai khác làm được:**

- **DEP-1** — 21 gói trễ. Cần một máy dựng native để đánh giá; đã được dặn
  KHÔNG tự nâng.
- Bản dựng iOS thật cho mọi thứ vòng này đã sửa. Bộ chạy web chứng minh được
  cây trợ năng và bố cục; nó **không** chạy VoiceOver, không chạy
  `UIVisualEffectView`, và không chạy lớp interop của kiến trúc mới.

**Phối hợp:** một phiên song song đang đẩy vào CÙNG nhánh
`claude/ios-fitness-rebuild-omgulr` (giai đoạn giao diện sáng, GĐ2C). Trước mỗi
lần commit: `git fetch` rồi rebase. Khi đụng đúng dòng họ vừa sửa mà thay đổi
của mình làm ĐỔI bản tối, nhường bản của họ — `tools/dark-frozen.mjs` đang giữ
lời hứa "bản tối không đổi một ký tự nào" của giai đoạn đó.

---

## Cách cập nhật trang này

Sau mỗi vòng rà soát: đổi commit và ngày ở đầu, chạy lại bảng cổng chất lượng,
và **chỉ ghi con số mình vừa đo**. Một ô "XANH" chép lại từ vòng trước là ô nói
dối ngay lần đầu có người tin nó.
