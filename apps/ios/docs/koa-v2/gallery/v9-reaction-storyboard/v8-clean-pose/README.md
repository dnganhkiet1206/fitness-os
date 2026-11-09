# `v8-clean-pose/`: dáng nhảy không lộ khuyết điểm (06/11/2026)

**Kiệt:**
- "khi koa nhảy tư thế bị lộ ra nhiều khuyết điểm lớn" (`kiet-neck-gap.png`, khoanh khe cổ);
- "vẫn còn tồn tại ở một số khung hình" (`kiet-armpit.png`, tay dang ngang);
- "vẽ tào lao cái gì vậy" (về lần thử đắp mảng vai, `rejected-shoulder-caps.jpg`).

| Lỗi | Vì sao | Sửa |
|---|---|---|
| Khe giữa cằm và vai lúc nhảy | Đầu nghiêng theo đà tới 9° | Nghiêng theo đà ≤ 4° (`maxHeadLag`). Khi đầu có nghiêng, đặt mảng vai / gáy có sẵn của app (`KoaGesture.neckFill`, cùng mảng các dáng nghiêng đầu đã dùng) sau đầu |
| Hai vạch giữa hai chân | Hạ thân sâu (−8…−13) mà bàn chân đứng yên: vệt bóng chân (theo thân) lệch khỏi bàn chân | Hạ thân trong khung ≥ −3 (`minCanvasBob`). Sâu hơn thì nén CẢ hình, kể cả bàn chân |
| Góc lõm ở nách khi tay dang ngang | Tay một mảnh vẽ để buông; xoay quá ~52° thì mép dưới tay rời cạnh thân, lộ chỗ bản vẽ chưa từng vẽ | Tay rig giơ ≤ 52° (`maxArmRaise`). Ăn mừng, đấm tay, khoe tay trong khoảng ấy |
| (bỏ) Mảng vai tròn tự chế | Đắp để lấp góc nách, nhưng lộ ra thành hai cục u | **Đã gỡ.** Không tự vẽ thêm mảng: giới hạn chuyển động trong khoảng bản vẽ chịu được |

- **Giơ tay cao hơn** (ngang vai, chữ V trên đầu) cần **vẽ thêm tay giơ** có khớp vai riêng. Đó là art, chờ Kiệt duyệt.
- **Lật tay:** `KoaRender.armFlipDeg` giờ là 70°. Tay cảnh phản ứng không chạm tới, nên không lật đi lật lại khi đấm tay.
- **Debug:** `SIMCTL_CHILD_ASCND_DEBUG_KOA_REACTION_T=<ms>` dừng màn phát ở một mốc, để chụp so sánh đúng khung.

| Tệp | Là gì |
|---|---|
| `after.jpg` | Cuối cảnh xong buổi, lúc nhảy, kỷ lục lúc nhảy và lúc đấm tay |
| `koa-reaction-*.mp4` | Ba cảnh, có tiếng |
