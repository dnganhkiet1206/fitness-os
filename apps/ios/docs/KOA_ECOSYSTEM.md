# Koa Ecosystem V2: kiến trúc tiến trình, Koa và đo lường

Kiệt duyệt hướng ngày 02/11/2026 (#527) và mở lại các giới hạn V1 để đánh giá. Tài liệu này ghi các quyết định đã chốt khi triển khai, kèm lý do. Nghiên cứu nền: [`research/ENGAGEMENT_RESEARCH.md`](research/ENGAGEMENT_RESEARCH.md).

## 1. Một hành trình, một nguồn sự thật

Mọi thứ người dùng thấy về tiến bộ đều **tính lại từ dữ liệu đã lưu**: buổi tập, kỷ lục, lịch tuần và ngày đổi lịch. Không có bảng điểm riêng có thể lệch hay cộng trùng.

```
buổi tập / kỷ lục / lịch tuần   (Supabase: workout_sessions, plan_day_overrides…)
        │  KoaGainsSync.load
        ▼
KoaGains.ledger ──► Gains, hạng      (thang tiến bộ)
        │
        ├─► KoaJourney.moments       (cột mốc, khoá cố định)
        │        └─► KoaMomentFeed   (Koa nhắc mốc nào, ở đâu, một lần)
        ├─► KoaRhythm                (Nhịp 30 ngày, thay chuỗi ngày)
        └─► KoaWeek                  (Tuần của Koa)
                 │
   Hôm nay · Tiến bộ · phòng Koa · tổng kết buổi · thông báo · analytics
```

Vì sao không dùng event sourcing: dữ liệu gốc (buổi tập) đã là nhật ký sự kiện. Tính lại từ đó cho cùng kết quả trên mọi máy, khi gửi lại hay khi mất mạng. Đó là thứ event sourcing hứa, mà không cần thêm bảng hay đồng bộ.

## 2. Đánh giá lại các giới hạn V1

| Giới hạn V1 | Kết luận | Lý do |
|---|---|---|
| Gains là thang duy nhất | **Giữ, mở rộng vai trò** | Gains đủ làm nền: hạng mở đồ, mốc hành trình đọc từ chính phép tính Gains, Koa lớn theo hạng. Thêm XP chỉ là thang thứ hai cùng đo một thứ: người dùng phải hiểu hai số. Nghiên cứu: phần thưởng hữu hình báo trước làm giảm động lực tự thân ([Deci 1999](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf)). |
| Không thêm XP | **Giữ.** XP nội bộ vẫn tồn tại trong sổ xu, không hiện | Như trên. Gỡ hẳn XP nội bộ sẽ làm sau khi kiểm hết chỗ phụ thuộc (widget, `stage level`). |
| Không thêm hệ thưởng | **Đổi**: thêm *mở khoá theo mốc*, không thêm tiền tệ | Mốc hành trình mở đồ trang trí kỷ niệm (ví dụ cúp kỷ lục trên kệ phòng). Không có gì để mua thêm. Xu vẫn chỉ để trang trí. |
| Không chuỗi mới | **Giữ, và gỡ chuỗi cũ** | Thay chuỗi ngày bằng Nhịp 30 ngày ([JCR 2023](https://doi.org/10.1093/jcr/ucac029): gãy chuỗi làm nản). |
| Không bảng xếp hạng, cộng đồng | **Giữ** | Cần người dùng thật (sổ hạn chế §2). Yếu tố mạnh nhất trong STEP UP là cạnh tranh xã hội; ASCND chưa thể có nên dồn vào chất lượng kế hoạch và Koa. |

### Vai trò từng lớp

| Lớp | Đo gì | Nguồn | Người dùng thấy ở đâu |
|---|---|---|---|
| **Gains, hạng** | Tích luỹ việc tập thật | `KoaGains` | Hồ sơ, phòng Koa, tổng kết buổi |
| **Bậc trong hạng** (10/11) | Mốc gần giữa hai hạng: cùng số Gains, chia nhỏ hơn. Không phải thang hay loại điểm mới | `KoaGains.tier`, `KoaJourney.steps` | Hàng Koa ở Hôm nay, tổng kết buổi lúc lên bậc, Hành trình (mốc nhỏ), dòng "còn N Gains" trong phòng Koa |
| **Mốc hành trình** | Khoảnh khắc đáng nhớ | `KoaJourney` | Tiến bộ › Hành trình; Koa nói ở Hôm nay và phòng |
| **Nhịp 30 ngày** | Sự đều đặn, không có gì để gãy | `KoaRhythm` | Tiến bộ, thẻ Koa ở Hôm nay |
| **Tuần của Koa** | Mục tiêu tuần theo lịch riêng | `KoaWeek` | Dải tuần, phòng Koa |
| **Nhiệm vụ ngày** | Việc nhỏ hôm nay | `MascotRules` | Thẻ Koa ở Hôm nay |
| **Xu** | Chỉ để trang trí | sổ xu server | Cửa hàng |
| **Huy chương** | Cột mốc đếm được (giữ cho người đã có) | `Awards` | Huy chương |

Huy chương và mốc hành trình trùng nhau một phần (buổi đầu, số buổi). Hướng: Hành trình là nơi kể chuyện, huy chương là bộ sưu tập. Không thêm huy chương mới cho mốc đã có trong hành trình.

## 3. Koa là trung tâm

### Bộ điều phối

`KoaMomentFeed` là nguồn duy nhất quyết định Koa nhắc mốc nào. Quy tắc:
- Mốc lớn (buổi đầu, tuần đủ buổi đầu tiên, lên hạng, số buổi) được nhắc trong 3 ngày.
- Mốc nhỏ (kỷ lục, quay lại, tuần đủ buổi, lên bậc trong hạng) được nhắc trong 1 ngày.
- Đã nhắc ở đâu thì không nhắc lại ở chỗ khác.
- Trong một lần mở app, Hôm nay và phòng Koa nói cùng một mốc. Màn khác không tự quyết.

### Tiến trình của Koa (không phải thú ảo)

- **Vóc dáng theo hạng**: đã có, `KoaGains.rank` → `build`.
- **Bậc trong hạng** (10/11, Kiệt duyệt mock `design/mocks/koa-rank-tiers.html`): mốc 6 hạng giữ nguyên, mỗi hạng chia đều thành bậc (Gym Rat 2, Lifter 3, Swole 5, Beast 8; Mass Monster cứ 150 Gains một bậc, không có trần). Ghi bằng số La Mã kèm vạch ("Lifter II"); Mass Monster ghi "bậc N". Tính lại từ Gains nên không có bảng mới, chỉ đi lên. Lên bậc không thưởng xu. Lịch 3 buổi: mốc kế cách không quá 3 tuần; lịch 2 buổi chậm hơn khoảng 1,4 lần (Kiệt chấp nhận). **Trong phòng Koa chưa có gì đổi theo bậc**: một thanh đòn bánh tạ treo tường đã được dựng thử trên simulator ngày 10/11, Kiệt bỏ ("không phù hợp với tổng thể căn phòng, sau này vẽ phòng mới rồi tính sau").
- **Phòng lớn theo hành trình** (#792, 04/11, `KoaShelf`): kệ có tối đa 3 cúp cho các ngày kỷ lục mới nhất (hai chỗ trống ở tầng trên, một ở tầng dưới; giá olympic thì đứng trên xà ngang). Tường có ba khung mốc nhỏ: buổi đầu, tuần đủ buổi đầu tiên, lần lên hạng cao nhất. Chạm cúp hay khung thì Koa kể, có ngày và số thật (`ShelfItem`); VoiceOver dùng hành động có tên. Dữ liệu tính từ hành trình và từ set đã lưu, không mua được. Người dùng nghỉ thì không mất gì: phòng chỉ có thể thêm đồ. Kỷ lục rời kệ vẫn ở màn Hành trình.
- **Không có nhu cầu sống còn**: Koa không đói, không ốm, không buồn vì người dùng vắng. Bụi phòng chỉ là lớp phủ, tự sạch khi tập lại, và không bám khi đang tạm nghỉ.

### Tính cách và trạng thái

Đã có: `KoaMood` (nét mặt ngày từ dữ liệu thật), `KoaDirector` (hành vi trong phòng), `KoaTalk` (lời theo chủ đề, nhịp nói). Thêm chủ đề `milestone` có ưu tiên ngay sau lời chào. Nguyên tắc lời thoại: ghi nhận việc đã làm (thông tin năng lực), không thúc ép, không tội lỗi.

## 4. Công cụ: đánh giá kỹ thuật

| Lựa chọn | Đánh giá | Quyết định |
|---|---|---|
| **Rive** (runtime MIT, 6.29.0) | Có state machine, mesh deform và blend sẵn. Cái giá: Koa phải vẽ lại trong Rive editor; 36 bộ đồ hiện sinh tự động bằng `tools/koa-wardrobe/build.py` sẽ phải làm tay; thêm ~4,66 MB; API cũ vừa deprecate. Koa hiện có rig từng bộ phận, dáng chạy và đi theo thủ tục, mặt ghép từ cờ, và Kiệt đã duyệt hướng này. | **Chưa dùng.** Xét lại khi cần hoạt ảnh tay do họa sĩ ngoài làm (nhiều cảnh diễn dài), hoặc khi đo thấy khung hình vượt ngân sách trên máy thật. |
| **Lottie** (Apache-2.0) | Phát lại theo timeline, không phản ứng theo dữ liệu. | Không dùng cho Koa. Có thể dùng cho hiệu ứng ăn mừng một lần nếu cần. |
| **State machine / rule engine** | Daily Plan, `KoaDirector`, `KoaMomentFeed` là hàm Swift thuần có test. TCA quá nặng; json-logic-swift ngừng từ 05/2024. | Swift thuần trong ASCNDKit. |
| **swift-snapshot-testing** (MIT) | Hợp với quy trình chụp màn trước khi gỡ. | Thêm khi dựng bộ snapshot cho Koa (việc sau). |
| **PostHog** (đã cài, MIT) | Có feature flag và experiment cùng SDK. | Dùng cho A/B khi có khoá và người dùng TestFlight. |

## 5. Đo lường

Không đặt mục tiêu bằng số khi chưa có baseline (sổ hạn chế §0). Định nghĩa trước để có số ngay từ người dùng đầu.

| Chỉ số | Định nghĩa | Sự kiện |
|---|---|---|
| Kích hoạt | Có lịch tuần và xong buổi đầu trong 7 ngày từ khi đăng ký | `schedule_created`, `first_session_completed` |
| Buổi tập đầu | Như trên | `first_session_started`, `first_session_completed` |
| Tương tác Koa có ý nghĩa | Thấy một mốc hành trình, mở hành trình, hoặc ở phòng Koa ≥ 20 giây | `koa_moment_shown`, `journey_opened`, `koa_room_left` (thời lượng) |
| Gắn kết tuần | Số tuần đạt Tuần của Koa / số tuần có lịch | `gains_earned` (+ tuần đủ buổi) |
| Nhiệm vụ | Tỉ lệ ngày xong ≥ 1 nhiệm vụ | `quest_claimed` |
| Quay lại | Có buổi sau ≥ 7 ngày nghỉ, trong 14 ngày | `comeback_shown`, `comeback_session` |
| Giữ chân D1/D7/D30 | Có hành động có giá trị (buổi, bữa, nhật ký), không tính mở app suông | các sự kiện ghi |

Không tối ưu số lần mở app. Không gửi số đo sức khoẻ (cân, calo, giấc ngủ) lên analytics.

**Thử nghiệm:** khi có khoá PostHog và người dùng TestFlight, dùng feature flag của PostHog, chia nhóm theo id người dùng. Trước đó không A/B, vì không có người để chia.

## 6. Việc tiếp theo

1. Gỡ chuỗi ngày ở widget, hồ sơ cộng đồng, nhắc "sắp mất chuỗi", 15 xu chuỗi (chụp ảnh trước khi gỡ).
2. Tạm nghỉ: bảng `koa_pauses` + RLS (migration viết sẵn, deploy khi Kiệt duyệt); trong lúc chờ lưu trên máy.
3. Luật nhắc mới: tối đa 1 nhắc tập mỗi ngày, im lặng ngày nghỉ và lúc tạm nghỉ, xoay vòng câu, giãn ra khi bị bỏ qua.
4. ~~Phòng lớn theo hành trình: kệ cúp kỷ lục, khung mốc lớn.~~ 04/11: kệ cúp và khung mốc (#792, mock A); xem mục 3.
5. Sự kiện `koa_moment_shown`, `journey_opened`; "đã thấy" lưu trên server.
6. Bộ snapshot cho Koa, Hành trình và Nhịp (sáng/tối, Dynamic Type).
