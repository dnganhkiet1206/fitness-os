# Motion Kit: sổ lỗi và bài học

Đọc trước khi làm bài mới. Mỗi lần gặp lỗi (Kiệt phát hiện, QA bắt được hay tự thấy) thì **thêm một dòng vào đây trong cùng PR sửa lỗi**. Mỗi dòng ghi lỗi trông thế nào, nguyên nhân gốc, cách sửa đã đưa vào kit, và cách phát hiện sớm lần sau. Nếu một lỗi có thể chặn bằng máy thì thêm kiểm tra vào `evs/motion_qa.py` hay `evs/movement_gate.py`. Câu "đã ghi nhớ" không đủ.

## Luật rút ra (áp dụng cho mọi bài)

1. **QA số đạt chưa phải là xong.** Trước khi báo xong phải chụp nhân vật từ mọi góc (trước, sau, hai bên, 3/4, trên cao) ở các khung chính. Soi cả tay, cổ tay, lưng, đầu, chân và dáng tổng thể, đối chiếu nguồn kỹ thuật tìm được, rồi ghi trong báo cáo các góc đã soi (Kiệt, 14/11).
2. **Không đặt số cố định cho thứ phụ thuộc hình học.** Hướng lòng bàn tay, vị trí cực khuỷu, góc cổ tay phải tính từ xương (chuỗi hai xương, cẳng tay đã giải). Hằng số chỉ đúng với một thân hình và một độ rộng tay cầm.
3. **Không ngoại suy ngoài dải dữ liệu MakeHuman** (hệ số cơ > 1, cân nặng ngoài 0..1). Muốn cơ rõ hơn thì tạc khối và rãnh cơ, không thổi thể tích.
4. **Mỗi bộ phận phải đi theo khi thân thay đổi tư thế:** đầu và cổ bù khi thân đổ, bả vai theo cánh tay, cực khuỷu theo thân.
5. **Dụng cụ chạm người thì đặt theo bề mặt da, không theo khớp.** Thanh tạ trên lưng, tạ đơn sát đùi, thanh chạm ngực: tính từ hồ sơ da của nhân vật (`back_profile` trong `rest_skeleton`), vì khớp nằm sâu trong cơ và mỗi thân hình dày khác nhau.
6. **Lỗi có thể ảnh hưởng bài khác thì sửa ở tầng chung** (template, generator, QA), ghi vào sổ này và chạy lại các bài đã có. Không vá riêng cho một bài (Kiệt, 14/11).

## Sổ lỗi

| Ngày | Lỗi trông thế nào | Nguyên nhân gốc | Sửa trong kit | Phát hiện sớm bằng |
|---|---|---|---|---|
| 14/11 | Nhân vật 002 như Hulk: cơ thang lên tận tai, vai quá rộng, đầu trông nhỏ | `muscle_definition` 2,15 ngoại suy vượt cơ tối đa của MakeHuman 115%, cộng thêm các vùng cơ cục bộ chồng lên | Nhân vật 003 (phương án A): hệ số 1,0, vùng cơ còn khoảng nửa | Đo bằng anthro: vai rộng nhất so với người trung bình dựng cùng công cụ, không quá khoảng 1,15 lần |
| 14/11 | Phương án B: ngực to bất thường (Kiệt loại) | Mục tiêu ngực 0,8 cộng hệ số 1,3 | Ngực ở mức 0,6 | Soi ảnh nghiêng, so độ dày ngực với độ dày bụng |
| 14/11 | Squat: tay kỳ, khuỷu kẹp vào trong sau lưng, gập 152°, cổ tay bẻ 42° | Tay cầm hẹp (0,62 m); cực khuỷu đặt theo hằng số nên khi cổ tay ra ngoài thì thành phần vuông góc của cực chỉ vào trong; lòng bàn tay cố định ngửa lên 20° | Tay cầm 0,80 m; khuỷu giải bằng chuỗi hai xương tới cực dưới và sau bàn tay; lòng bàn tay vuông góc cẳng tay đã giải | Đo góc gập khuỷu, vị trí khuỷu so với vai và góc cổ tay ở mọi khung (`validate_motion`) |
| 14/11 | Squat: đầu gục vào ngực khi thân đổ | Đầu và cổ quay cứng theo thân, không bù | Cổ và đầu ngửa bù 35% độ đổ của thân (60/40), theo Donnelly 2006 | Đo góc nhìn so với phương ngang ở đáy |
| 14/11 | Mặt nạ cơ tay teo (bắp tay 33k → 1,8k texel) | Xương xoắn mới không có trong danh sách xương của tay | Thêm xương xoắn vào `ARM_BONES`/`LEG_BONES` | So số texel mỗi nhóm cơ trước và sau khi đổi rig |
| 14/11 | Squat: bàn tay giật 15° giữa hai khung | Cực khuỷu cố định trong thế giới khi thân đổ | `poles_trunk`: cực quay theo `spine_03` | `rotation_step` trong QA |
| 14/11 | Squat: chân nhấc 5 mm | Chân đứng rộng hơn hông nhưng chuỗi chân tính như nằm trong mặt phẳng dọc | Trừ phần ngang ra khỏi độ dài đoạn chân | `feet_planted` trong QA |
| 14/11 | Bộ kiểm báo bước quay 0,035° trong khi thực tế 6,1° | Đo `matrix_basis` thay vì ma trận đã tính | Dùng `parent.matrix.inverted() @ pb.matrix` | Đối chiếu với số đo trên mesh |
| 13/11 | Bench: ép vai chỉ bằng xương đòn làm ngực méo | Thiếu xương bả vai và cơ ngực | Rig 63 xương (bả vai, cơ ngực, xương xoắn), trọng số lấy từ rig default | Soi ảnh trước và 3/4 ở đáy |
| 14/11 | Curl: lòng bàn tay phải bị lật, khuỷu bung ra ngoài | Sai dấu quay; cực khuỷu không theo hướng gập | Khung lòng bàn tay tính từ cẳng tay; cực theo hướng gập | Đối xứng trái/phải trong QA |
| 14/11 | Squat: thanh tạ xuyên vào cổ và cơ thang 4,8 cm | Vị trí thanh tính từ khớp vai (nằm sâu trong người) cộng hằng số 5,5 cm ra sau; cơ thang của 002 dày hơn thế | Thanh đặt lên hồ sơ da lưng trên: tâm thanh = điểm da sau cùng ở độ cao thanh + bán kính thanh − 3 mm mô mềm | `implement_penetration` trong QA (BVH của dụng cụ so với da, ngưỡng 4 mm) |
| 14/11 | Squat: vai và thân trên bị dồn thành một cục | Cơ thang 002 quá dày; khuỷu kẹp trong và gập 152° kéo vai lên và vào | Nhân vật 003; khuỷu giải đúng; cổ tay thẳng | Soi ảnh trước, sau, 3/4 ở đáy (luật 1); `elbow_inside_shoulder`, `elbow_flexion_anatomical` |
| 14/11 | QA mới chạy trên squat cũ bắt đủ 4 lỗi Kiệt thấy (xuyên 48 mm, cổ tay 38°, khuỷu 152°, khuỷu vào trong 73 mm) | Bộ kiểm cũ chỉ đo chuyển động, không đo dáng | `motion_qa.posture` + `penetration` chạy cho mọi bài template | Chính các kiểm tra này |
| 14/11 | Bộ đo xuyên báo thanh tạ nằm trong cổ họng 4,9 cm, trong khi thanh ở sau lưng | Thanh tạ dựng từ nhiều đoạn rời có nắp bên trong nên pháp tuyến không cho biết trong hay ngoài | Đo ngược chiều: đỉnh của dụng cụ có nằm trong da người không (pháp tuyến da nhất quán); bỏ qua bàn tay | Test đơn vị; soi ảnh nơi máy báo lỗi trước khi sửa chuyển động |
| 14/11 | Tạc cơ bản đầu trông như tấm giáp robot (rãnh sắc, vòng cắt ở khuỷu và gối, đường thẳng như đường may trên đùi) | Một kiểu rãnh cho mọi đường viền; chỗ cơ thành gân cũng bị cắt rãnh; đường chia thẳng | Bốn loại đường viền (giữa các cơ, đường giữa, giữa các đầu, chỗ gân) với độ sâu và độ rộng riêng; đường chia ngực chéo (`tilt`), đùi trước xoắn (`twist`) | Soi ảnh trước, sau, 3/4 của nhân vật sau mỗi lần đổi `muscle_parts.json` |
| 14/11 | Xuất USDZ lỗi sau khi dựng nhân vật mới | Chạy chuỗi dựng nhân vật bằng tay nên sót `bake_fiber_fields.py` | `factory.py character` chạy đủ chuỗi theo thứ tự | Chính lệnh đó |
| 14/11 | Bench: tay không với tới thanh trên giá (0,547 m > 0,540 m) với nhân vật 003 | Độ cao giá đỡ đặt cứng 1,00 m cho thân hình cũ | Giá 0,98 m; bộ dựng tự báo con số cần đặt | Đổi nhân vật thì dựng lại MỌI bài (luật 6) |
| 14/11 | App: mặt nhân vật thành một mảng phẳng, viền răng cưa | Miếng vá mặt (không mặt) được dựng không có UV: cả 469 mặt dồn về một điểm UV, nên RealityKit không có tiếp tuyến và đổ bóng phẳng. Bản dựng Blender trông bình thường nên không thấy | `sculpt_muscles.py` cấp cho miếng vá một ô UV riêng ở vùng trống của atlas (chiếu phẳng mặt trước); normal map phẳng ở đó | Đọc lại USDZ đã xuất, đếm mặt có UV suy biến (phải bằng 0). Soi trong app, không chỉ trong Blender |
| 14/11 | Curl: đầu trong của tạ đơn đâm vào hông 7,3 cm ở đáy | Góc dang tay 6° đặt cứng; nhân vật 003 hông rộng hơn | Dang 12°, đưa tạ hơi ra trước đùi 6° | `implement_penetration` (QA) + tờ soi xoay vòng |
| 14/11 | Rãnh cơ bị răng cưa như đường khâu (cột sống, sau đùi) | Đường viền lấy theo từng texel | Làm mượt trường độ cao khoảng 2 mm trước khi tạo normal map | Soi ảnh sau lưng, phóng to |

