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
- **Không có phân tích khối lượng theo nhóm cơ.** `exercises.muscle_group` là
  free text, ba nơi ghi ba kiểu — `lib/muscle-group.ts` ghi nhận đây là một
  defect thật của data model, và nó là **gốc** của mục trên.
- **Không có "điểm thể lực tổng"**, và sẽ không có. Gộp các chiều không cùng đơn
  vị vào một con số làm mất chính thông tin khiến từng chiều có ích.

---

# Trí tuệ bài tập (Exercise Intelligence V1)

Trả lời câu "tôi đang tiến bộ thế nào ở từng bài tập". Ba tệp, đều là hàm
thuần: `lib/exercise-kind.ts`, `lib/exercise-performance.ts`,
`lib/exercise-trend.ts`. Chúng không đọc và không ghi cơ sở dữ liệu, không kéo
React, và **không thay đổi buổi tập của ai** — V1 chỉ cung cấp thông tin.

## Danh tính và nguồn

Bài tập được khớp bằng **tên**, qua `exerciseKey`, chứ không bằng `exerciseId`:
`day-plan.tsx` ghi `exerciseId: ''` cho mọi set nó lưu, và `log-workout.tsx`
chỉ điền id khi người dùng chọn từ thư viện. Đây là cùng lý do
`personal-record.ts` đã chọn khớp theo tên.

Ngày của một buổi là **ngày địa phương**, qua `localDateStr`. Cắt 10 ký tự đầu
của `date_time` sẽ đẩy mọi buổi tập sáng sớm ở UTC+7 về hôm trước.

## Bốn loại động tác

| loại | chỉ số xu hướng | e1RM |
|---|---|---|
| `compound` | e1RM của set tốt nhất | có |
| `isolation` | tấn của set tốt nhất (tạ × rep) | **không** |
| `bodyweight` | (cân nặng + tạ ngoài) × rep | có |
| `timed` | thời gian giữ lâu nhất | không |

Nguồn: `exercises.exercise_kind` nếu có ai khai; nếu không thì **suy** từ dữ
liệu. Suy luận nhận ra `timed` (có thời lượng, không rep) và `bodyweight`
(**từ một nửa số set trở lên không có tạ ngoài**), và **không bao giờ** tự nhận
`isolation` — không có gì trong một cột số phân biệt cuốn tay với chèo, và đoán
sai ở đây quyết định một con số e1RM có được hiện ra hay không.

Với bài `bodyweight`, `weight` trong set là **tạ ngoài**, không phải cân nặng —
đúng quy ước màn ghi buổi tập đã dùng: *"Leave the weight empty for a bodyweight
set"*.

## e1RM

Epley, `weight × (1 + reps / 30)`, và **chỉ tới 10 rep**. Trên 10 rep hàm trả
`null` chứ không trả số.

`personal-record.ts` từng từ chối có hàm này, với lý do vẫn còn nguyên giá trị:
quá 10–12 rep thì công thức thổi phồng, và app không được bịa một con số rồi
chúc mừng người ta vì nó. Hàng rào rep chính là lý do đó, viết thành code. Và
**không estimate nào đi vào bảng kỷ lục** — `findRecords` không đổi một dòng.

Nó là *ước lượng*, không phải mức tối đa đã nâng, và màn hình nói đúng như vậy.

## Xu hướng

So **tốt nhất của nửa gần** với **tốt nhất của nửa xa**, trên cửa sổ 6 buổi
gần nhất (`TREND_WINDOW`). Số buổi lẻ thì bỏ buổi ở giữa.

Không dùng đường hồi quy. Trên ví dụ plateau kinh điển (`60×6, 6, 6, 5, 6`) hai
cách cho cùng kết quả — best-of-half đọc 0,0%, hồi quy đọc −1,4%, cả hai đều ra
PLATEAU. Chúng chỉ khác nhau khi có **một ngày tệ sau một đợt tiến bộ thật**:
`55 × 8, 9, 10, 5` cho best-of-half **+2,6%** và hồi quy **−8,4%**, tức PLATEAU
so với DECLINING. Đường trung bình bị điểm cuối kéo tụt; "tốt nhất của một nửa"
thì không, vì một buổi tệ đơn giản không phải cái tốt nhất của gì cả.

| ngưỡng | giá trị | vì sao |
|---|---|---|
| `MIN_SESSIONS` | 3 | lấy thẳng từ `load-progression.ts`, không khai lại |
| `PLATEAU_SESSIONS` | 4 | nói "bạn đang chững" là một lời về CON NGƯỜI, phải cần nhiều bằng chứng hơn lời khen |
| `MEANINGFUL_CHANGE` | 3% | dưới bước tiến nhỏ nhất có thật trên một bài nặng (100×5 → 100×6 là 2,8%), trên nhiễu duy nhất của phép đo (vòng lặp kg↔lb, dưới 0,03 kg) |
| `TREND_WINDOW` | 6 buổi | đủ chỗ cho một ngày tệ ở mỗi nửa; xu hướng trên cả lịch sử không phải xu hướng, nó là tiểu sử |

Trạng thái: `IMPROVING` · `STABLE` · `PLATEAU` · `DECLINING` ·
`INSUFFICIENT_DATA`. Dưới `MIN_SESSIONS` buổi **luôn** là
`INSUFFICIENT_DATA` — thiếu dữ liệu là một câu trả lời hợp lệ, không phải chỗ
để đoán.

## Sẵn sàng tăng tải

`READY_TO_PROGRESS` cần **cả ba**: xu hướng đi lên, đủ bằng chứng để tin, và
buổi gần nhất là buổi tốt nhất trong cửa sổ — điều kiện thứ ba chặn việc khen
sau một đỉnh đã trôi qua.

`NOT_READY` cho bài đang đi xuống hoặc chưa đủ dữ liệu. Mọi thứ còn lại là
`MAINTAIN`.

**Đây không phải là giấy phép.** Cổng an toàn toàn thân — không bảo tăng tải
cho người đang trong đợt tăng tải đột ngột — thuộc về `load-progression.ts` và
**cố ý không được chép lại ở đây**. Adaptive Training Engine sẽ là chỗ ghép hai
câu đó lại.

## Độ tin cậy

Dùng đúng thang của `user-state.ts` (`none` / `low` / `medium` / `high`), không
dựng thang thứ hai. `low` khi dưới 3 buổi; `medium` khi là bài bodyweight mà
chưa có lần cân nào (chỉ số tụt xuống thành số rep trần, thấy được sự tiến bộ
kém đi); `high` từ 4 buổi trở lên.

## Bằng chứng

Engine trả **structured facts**, không trả câu chữ: `series`, `change`,
`no-upward-trend`, `too-few-sessions`, `bodyweight-unknown`, `best-set`,
`e1rm`. Màn hình chọn từ ngữ, ngôn ngữ và đơn vị. App này nói hai thứ tiếng và
hiện hai đơn vị, nên một câu tiếng Anh nằm trong một phép tính là một lỗi.

## Giới hạn đã biết của V1

- **Không lọc khởi động cho dữ liệu cũ.** Cờ `warmup` mới có; mọi dòng đã ghi
  trước đó không có cờ và **được tính là set làm việc** — nếu không, cả kho dữ
  liệu cũ sẽ biến mất.
- **Suy luận không phân biệt được `isolation`.** Bài do người dùng tự tạo mà
  không khai loại sẽ được coi là `compound`, tức có e1RM.
- **Không phân tích khối lượng theo nhóm cơ.** `exercises.muscle_group` vẫn là
  free text ba kiểu — xem `lib/muscle-group.ts`.
