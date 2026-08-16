# Mọi con số app nói ra, và nó dựa trên gì

Mỗi mục dưới đây trả lời tám câu hỏi: **định nghĩa · đầu vào · công thức ·
khoảng giá trị · nghĩa · cập nhật khi nào · thiếu dữ liệu thì sao · độ tin cậy**.

Mục "thiếu dữ liệu thì sao" là mục quan trọng nhất và là lý do tài liệu này tồn
tại. Repo này đã sửa cùng một lỗi ở sáu chỗ khác nhau — `acwr ?? 0`,
`meals?.length ?? 0`, giấc ngủ 0 phút chấm như một đêm thức trắng, `volume_load`
0 cho người tập tay không, một ngày chưa đọc được chấm như một ngày trống, ACWR
0 cho tài khoản chưa từng tập. Hình dạng lúc nào cũng như nhau: **chỗ thiếu dữ
liệu được gán một con số, con số ấy được dùng tiếp, và không đâu báo lỗi.**

> Con số nào không có nguồn thì ghi rõ là không có. Chỗ nào app không đo được
> thì để trống — một thanh tiến độ sai tệ hơn không có thanh nào.

---

## 1. Điểm sẵn sàng — `lib/readiness-engine.ts`

| | |
|---|---|
| **Định nghĩa** | Hôm nay cơ thể đang ở đâu so với **nền của chính người đó** |
| **Đầu vào** | HRV, nhịp tim nghỉ, giấc ngủ đêm qua, tải tập 7d/28d (+ cờ ốm, cờ đau, mức đau nhức) |
| **Công thức** | Trung bình có trọng số của các chiều **đo được**, chuẩn hoá lại theo tổng trọng số hiện diện. HRV/nhịp nghỉ chấm bằng robust z-score (`1.4826 × MAD`, có sàn theo đơn vị của phép đo) |
| **Khoảng** | 0–100, hoặc `null` |
| **Nghĩa** | ≥ 75 xanh · 50–74 vàng · < 50 đỏ |
| **Cập nhật** | Mỗi lần `recomputeDailyLog` chạy (25 chỗ gọi: ghi bữa ăn, buổi tập, giấc ngủ, cân nặng, đồng bộ sức khoẻ…) |
| **Thiếu dữ liệu** | Từng chiều thiếu thì **bị loại** khỏi tổng và trọng số chia lại. Không đo được chiều nào → **`null`**, màn hình để trống chứ không vẽ điểm 0 đỏ |
| **Độ tin cậy** | `high` (≥3 chiều) · `medium` (2) · `low` (1) — **hiện trên đồng hồ đo** khi dưới `high` |

Nền HRV và nhịp nghỉ cần **≥ 5 lần đo**: một median và một MAD dựng từ bốn điểm
không phải một baseline, nó là bốn điểm.

## 2. ACWR — tỉ lệ tải cấp tính / mạn tính

| | |
|---|---|
| **Định nghĩa** | Tuần này nặng hơn hay nhẹ hơn thói quen bốn tuần của chính người đó |
| **Đầu vào** | Tải nội sinh 7 ngày, tải nội sinh 28 ngày, **số ngày lịch sử thật sự có** |
| **Công thức** | `(tải7d / 7) / (tải28d / max(số_ngày_có, 7))` |
| **Khoảng** | ≥ 0, hoặc `null` |
| **Nghĩa** | 0.8–1.3 hợp lý · < 0.65 đang giảm tải · > 1.6 tăng vọt |
| **Cập nhật** | Cùng nhịp với điểm sẵn sàng |
| **Thiếu dữ liệu** | **`null` khi chưa có nền** (`tải28d = 0`). `0` chỉ dùng cho trường hợp có thật: **đã có nền** và tuần này nghỉ hoàn toàn |
| **Độ tin cậy** | Mẫu số là số ngày CÓ THẬT, không phải 28 cứng |

Mẫu số từng là `tải28d / 28`, tức chia cho những ngày người ta còn chưa cài app:
người tập **đều tăm tắp** đọc ra ACWR 4.00 ở buổi đầu, 2.00 sau hai tuần, và
1.00 chỉ sau đủ bốn tuần — ba tuần bị báo là đang tăng tải nguy hiểm vì đã tập
đúng y như nhau.

`null ≠ 0` là phân biệt quan trọng nhất ở đây: tài khoản chưa từng ghi buổi nào
và người tập cả tháng rồi nghỉ trọn một tuần là **hai trạng thái ngược nhau**.

## 3. Tải nội sinh một buổi — `lib/session-load.ts`

| | |
|---|---|
| **Định nghĩa** | Buổi tập tốn gì với **cơ thể** người tập (internal load) |
| **Đầu vào** | `session_rpe`, tổng `sets[].reps` |
| **Công thức** | `RPE × tổng reps` — phương pháp session-RPE (Foster), biến thể cho tập tạ (Day et al.) |
| **Khoảng** | > 0, hoặc `null`. **Không có đơn vị** |
| **Nghĩa** | Chỉ có nghĩa khi so với **chính các buổi gần đây của người đó** — không có bảng phân loại chuẩn nào cho tập tạ |
| **Cập nhật** | Khi buổi tập được ghi |
| **Thiếu dữ liệu** | Không có RPE **hoặc** không có rep → **`null`**, và bị loại khỏi **cả hai vế** của ACWR chứ không kéo trung bình xuống như một buổi tốn 0 |
| **Độ tin cậy** | RPE là tự chấm; nằm ngoài 1–10 thì đọc là **thiếu** chứ không kẹp lại |

## 4. Tổng khối lượng (tấn tạ) — `volume_load`

| | |
|---|---|
| **Định nghĩa** | Tổng tạ đã di chuyển (external load) |
| **Công thức** | `Σ (tạ × reps)` |
| **Khoảng** | ≥ 0 |
| **Cập nhật** | Khi buổi tập được ghi (một công thức, hai chỗ tính, được công cụ ghim cho khớp) |
| **Thiếu dữ liệu** | Buổi tay không và buổi nhập từ đồng hồ ra **0 một cách đúng đắn** — họ thật sự không di chuyển tạ nào |
| **Độ tin cậy** | Chính xác với tập tạ, **vô nghĩa** với mọi thứ khác |

Đây là lý do nó **không** còn là đầu vào của ACWR: một chỉ số bằng 0 với cả một
nhóm người tập không thể làm mẫu số cho lời khuyên an toàn của họ. Nó ở lại như
một con số riêng, có nhãn riêng, cạnh tải nội sinh chứ không trộn vào.

## 5. Ngày tập cơ trong tuần — `lib/training-week.ts`

| | |
|---|---|
| **Định nghĩa** | Số **ngày** trong 7 ngày qua có tập cơ, so với mức mục tiêu nhắm tới |
| **Đầu vào** | Buổi tập 7 ngày (`date_time`, `sets`), `profiles.goal` |
| **Công thức** | Đếm **ngày lịch riêng biệt** (theo giờ người tập) có ≥ 1 rep, chặn trong 7 ngày gần nhất |
| **Khoảng** | 0–7 |
| **Nghĩa** | Sàn 2 ngày/tuần cho **mọi** người lớn (WHO 2020); mục tiêu `strength`/`bulk` nhắm 3 |
| **Cập nhật** | Mỗi lần mở Today |
| **Thiếu dữ liệu** | Truy vấn chưa về **hoặc** hồ sơ chưa về → **không vẽ dòng nào**. `0/2` sẽ là lời phán "chưa đạt mức tối thiểu" nói với người mà app còn chưa đọc xong dữ liệu |
| **Độ tin cậy** | Chỉ đếm buổi **được ghi lại**; tập mà không ghi thì không đếm được |

## 6. Trạng thái người dùng — `lib/user-state.ts`

| | |
|---|---|
| **Định nghĩa** | "Đợt này là đợt thế nào" — **hoàn cảnh**, không phân loại con người |
| **Đầu vào** | Ngày có ghi chép (7d gần đây vs nền 28d), `acwr`, buổi tập 56 ngày |
| **Khoảng** | `settling_in · steady · slipping · returning · overreaching · stalled` |
| **Cập nhật** | Đọc **cache**, không tốn truy vấn nào |
| **Thiếu dữ liệu** | < 14 ngày lịch sử → `confidence: 'none'` và **mọi** nhánh phía sau cư xử như với người lạ. `acwr` null → không kết luận `overreaching` |
| **Độ tin cậy** | `none · low · medium · high` theo độ dài lịch sử |

Không có **một ngưỡng tuyệt đối nào** trong file: mọi so sánh là với nền của
chính người đó. Lỡ một ngày (6/7) và lỡ hai ngày (5/7) đều phải im lặng —
`DROP_FRACTION = 0.4` được đặt từ chính hai ca đó.

## 7. Gợi ý điều chỉnh tải — `lib/load-progression.ts`

| | |
|---|---|
| **Định nghĩa** | Lần tới nên tăng, giữ hay giảm mức tạ |
| **Đầu vào** | RPE các buổi gần đây, mức đặt của mẫu tập (hoặc dải RPE của mục tiêu), trạng thái người dùng, điểm sẵn sàng |
| **Công thức** | So RPE trung bình với mức đặt; lệch > 1 điểm mới đổi, bước **tỉ lệ** 5%, trần 10% |
| **Khoảng** | `up · hold · down · unknown` |
| **Cập nhật** | Khi mở màn ghi buổi tập |
| **Thiếu dữ liệu** | < 3 buổi → **`unknown`**, `confidence: 'none'`. Buổi không ai chấm RPE bị **bỏ qua**, không gộp thành 0 |
| **Độ tin cậy** | Ba cổng chặn nhánh **tăng**: đang `overreaching`, vừa `returning`, hoặc điểm sẵn sàng đỏ. Nhánh **giảm** không bị cổng nào chặn |

Đây là lời khuyên duy nhất trong app có thể góp phần gây chấn thương, nên các
cổng được quét qua 120 tổ hợp chứ không chỉ vài ca mẫu.

## 8. Chuỗi ngày — `lib/streak.ts`

| | |
|---|---|
| **Định nghĩa** | Số ngày liên tiếp có ghi chép |
| **Công thức** | Đếm lùi từ hôm nay, ngày được "đóng băng" tính như ngày có ghi |
| **Khoảng** | 0–400 (cửa sổ truy vấn) |
| **Cập nhật** | Khi có ghi chép mới |
| **Thiếu dữ liệu** | Chưa ghi gì hôm nay **không** làm đứt chuỗi cho tới hết ngày |
| **Độ tin cậy** | Đo **sự hiện diện trong app**, không đo thể lực |

**Chuỗi ngày không phải tiến bộ thể lực**, và không được dùng làm tín hiệu tiến
bộ ở đâu cả. Cơ chế này hoạt động qua *introjected regulation* — áp lực tự đặt
bằng cảm giác tội lỗi — thứ dự báo **kém hơn** động lực tự chủ về duy trì lâu
dài. Vì thế nó không chấm sắc mặt nhân vật và không vào `user-state`.

## 9. XP · cấp · hạng

| | |
|---|---|
| **Định nghĩa** | Phần thưởng cho **hành vi dùng app** |
| **Thiếu dữ liệu** | Không áp dụng |
| **Độ tin cậy** | **KHÔNG phải chỉ số thể lực** |

Ghi ở đây để nói rõ một điều: XP tăng khi người ta *ghi chép*, không phải khi
người ta *khoẻ lên*. Không file tập luyện nào đọc XP, và không được đọc.

## 10. Mục tiêu calo và macro — `lib/fitness-calc.ts`, `lib/adaptive-tdee.ts`

| | |
|---|---|
| **Định nghĩa** | Ăn bao nhiêu để đi tới mục tiêu |
| **Đầu vào** | Cân nặng, chiều cao, tuổi, giới, mức vận động, mục tiêu — và với TDEE thích ứng: 14 ngày nhật ký ăn + các lần cân |
| **Công thức** | BMR → TDEE → điều chỉnh theo mục tiêu; bản thích ứng suy TDEE từ tương quan **lượng ăn thật ↔ thay đổi cân nặng thật** (`7700 kcal/kg`) |
| **Cập nhật** | Khi hồ sơ đổi; bản thích ứng khi có đủ dữ liệu mới |
| **Thiếu dữ liệu** | TDEE thích ứng trả về `{ ok: false, reason }` chứ không đoán: cần ≥ 10 ngày ăn, ≥ 6 lần cân, khoảng ≥ 10 ngày, ≥ 5 ngày khác biệt, chênh lệch ≥ 200 kcal |
| **Độ tin cậy** | Công thức chuẩn cho ước lượng đầu; bản thích ứng dựa trên dữ liệu thật của chính người đó |

## 11. Giấc ngủ và nợ ngủ — `lib/sleep-window.ts`

| | |
|---|---|
| **Định nghĩa** | Đêm qua ngủ bao lâu, và thiếu bao nhiêu so với mục tiêu |
| **Công thức** | Khoảng giờ ngủ → giờ dậy, vòng qua nửa đêm |
| **Khoảng** | 0 đến 1 ngày; đêm dài bất thường bị chặn ngay ở nút Lưu |
| **Thiếu dữ liệu** | **Không có dòng ngủ ≠ ngủ 0 phút.** Chiều giấc ngủ bị loại khỏi điểm sẵn sàng thay vì chấm 20/100 |
| **Độ tin cậy** | Tự nhập hoặc từ đồng hồ |

---

## Những gì app **không** tính, và vì sao

Ghi ra để không bị hiểu là bỏ sót:

- **Không có %mỡ ước lượng.** `body_fat_pct` là cột người dùng tự nhập. Ước
  lượng nó từ cân nặng và số đo là bịa ra một độ chính xác không có.
- **Không có vùng nhịp tim, pace, quãng đường cho cardio.** Không có dữ liệu
  nhịp tim theo buổi thì mọi "vùng" đều là suy diễn.
- **Không có phút aerobic so với sàn WHO** — xem giới hạn 3 trong
  `mascot-intelligence.md`.
- **Không có e1RM hay tiến bộ sức mạnh theo từng bài.** Kỷ lục cá nhân được phát
  hiện lúc ghi buổi (`lib/personal-record.ts`) và chỉ để ăn mừng; app **chưa**
  trả lời được "tôi có đang mạnh lên ở bài đẩy ngực không". Đây là lỗ hổng lớn
  nhất còn lại của phần thể lực.
- **Không có phân tích khối lượng theo nhóm cơ.** `exercises.muscle_group` là
  free text, ba nơi ghi ba kiểu — `lib/muscle-group.ts` ghi nhận đây là một
  defect thật của data model, và nó là **gốc** của mục trên.
- **Không có "điểm thể lực tổng"**, và sẽ không có. Gộp các chiều không cùng đơn
  vị vào một con số làm mất chính thông tin khiến từng chiều có ích.
