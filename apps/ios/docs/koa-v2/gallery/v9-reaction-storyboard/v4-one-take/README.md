# `v4-one-take/`: một cú quay liền, có tiếng (06/11/2026)

**Kiệt xem v3:**
- "vẫn chưa được, mọi chuyển động chưa có sự liên kết với nhau";
- "chưa có hiệu ứng âm thanh… tối giản, dễ chịu, sang trọng nhưng phải hợp với bối cảnh và storyboard".

## Vì sao v3 rời rạc

v3 vẫn ghép các dáng có sẵn của app (cầm tạ, ngồi, `cheer`, `taDa`) rồi đổi qua lại. Nén / nảy chỉ giấu được cú đổi, nên mỗi đoạn vẫn là một khối riêng.

Theo các nguyên tắc hoạt hình, chuyển động liên kết cần:
- **overlapping action:** các bộ phận lệch nhịp nhau;
- **follow-through / drag:** đầu, tai, tay trễ theo thân rồi mới lắng;
- **successive breaking of joints:** chuyển động truyền dần từ thân ra ngoài;
- tránh **"twinning"**, tức mọi bộ phận chuyển cùng lúc.

## Làm lại (`ASCNDCore/Koa/KoaPerformance.swift`)

- **Không đổi dáng.** Một rig liên tục chạy theo keyframe trên **một** dòng thời gian. Rig là `KoaWalk.Pose` có sẵn của app:
  - nhún, nghiêng, lắc thân;
  - hai tay quanh vai, hai bàn chân;
  - tai trễ, tai cụp;
  - hướng nhìn của đầu, mắt;
  - quay mặt 2.5D;
  - tay chữ V (`cheer`) qua `gestureAmount` chạy liên tục.
- **Lớp phụ tự tính** (lò xo):
  - đầu và tai trễ theo vận tốc thân;
  - tay bị kéo trễ khi thân nhún, giới hạn ±22°;
  - mắt nhìn trước đầu 70 ms, đầu trước thân 70 ms;
  - tay chữ V theo sau thân 60 ms;
  - nén / giãn theo vận tốc (giãn khi bay) và gia tốc (nén khi tiếp đất).
- **Mỗi cú vung có ba nhịp:** lấy đà, vung (dịu hai đầu), vượt đà rồi lắng. Đường cong "back" làm tay giật 17° trong một khung; test bắt được nên đã bỏ.
- **Máy quay là một đường liền,** chỉ còn một cú chớp trắng có chủ ý lúc kỷ lục.

**Cầm tạ là đồ cầm tay `dumbbell` của tủ đồ,** nên tạ đi theo cánh tay phải. Cảnh ghi set:
1. cận mặt gồng nâng tạ, tay run;
2. buông tạ, máy lùi ra;
3. thở phù;
4. gục xuống thở dốc, tai cụp;
5. thu vào vòng đồng hồ nghỉ.

## Tiếng (`tools/koa-sound/reaction.py` → `ASCND/Resources/Sounds/koa-rx-*.wav`)

- **Tự tổng hợp:** không bản ghi, không giấy phép.
- **Cùng một hợp âm** (Mi trưởng thêm chín), nên các tiếng chồng nhau vẫn hoà.
- **Gồm:** chuông thuỷ tinh nhỏ, chuông gỗ, hơi thở / hơi gió lọc mềm. Không trống, không kèn, không tiếng "game".
- **Mỗi cảnh ≤ 10 tiếng nhỏ,** khớp đúng nhịp diễn:

| Cảnh | Tiếng |
|---|---|
| Ghi set | Hơi căng lúc nâng · "phù" + hai nốt chuông đi lên lúc xong · hơi thở · gió nhẹ khi thu vào · tiếng gỗ trầm khi vào vòng |
| Kỷ lục | Hơi căng · ba nốt chuông trên nền trầm đúng lúc chớp · gió lúc bật nhảy · lấp lánh khẽ · hai nốt gỗ "+2,5 kg" · "bịch" êm lúc tiếp đất · nốt gỗ mỗi cú đấm tay |
| Xong buổi | Thở ra · hít sâu · tiếng gỗ khi số đếm lên · gió · hợp âm rải chậm "hoàn thành" · lấp lánh · tiếp đất |

- **Trong app:** `KoaSound.reaction` (`.ambient`: im theo công tắc im lặng, không ngắt nhạc đang nghe; tắt theo nút loa của Koa), độ to 0,32.
- **Video:** simulator không thu tiếng, nên tiếng trong mp4 được trộn ngoài máy từ đúng dòng thời gian tiếng của `KoaPerformance`.

| Tệp | Là gì |
|---|---|
| `koa-reaction-set.mp4`, `-record.mp4`, `-done.mp4` | Ba cảnh, quay từ simulator, **có tiếng** |
| `*-8fps.jpg` | 8 khung / giây |

## Còn (một người chấm: mình)

- **Tay là một mảnh của bản vẽ** (không có khuỷu): giơ hay đấm tay chỉ là xoay quanh vai.
- **Chưa có dáng ngồi liền:** dáng ngồi của app là lớp vẽ riêng nên không dùng, Koa gục đứng thay ngồi.
- **NOT VERIFIED:** nghe trên loa iPhone thật; rung trên máy thật.
