# Tiếng của phòng Koa

**Giọng Koa** (`koa-boop-1…3`, `koa-yawn`, `koa-cheer`, `koa-land`) tự tổng hợp bằng `voice.py`: giọng
hoạt hình mô phỏng tiếng ừm mũi, khàn của koala. Không dùng bản ghi koala vì chưa tìm được bản CC0 rõ
nguồn. Kiệt yêu cầu ngày 31/10; đổi tính cách giọng thì sửa `CUES`, rồi cho Kiệt nghe trên máy.

**Tiếng Kenney** (www.kenney.nl, CC0 1.0, không bắt buộc ghi công):

| File | Gốc | Bộ | Xử lý bằng ffmpeg |
| --- | --- | --- | --- |
| `ASCND/Resources/Sounds/koa-click.wav` (công tắc đèn) | `click2` | UI Audio | `highpass=f=250,alimiter=limit=0.7` |
| `tools/koa-sound/thud.wav` (tiếng bịch trong `koa-land`) | `bong_001` | Interface Sounds 1.0 | `lowpass=f=1200,alimiter=limit=0.7` |

Nguồn: https://kenney.nl/assets/interface-sounds, https://kenney.nl/assets/ui-audio; bản trên GitHub
`Calinou/kenney-interface-sounds`, `Calinou/kenney-ui-audio`.
