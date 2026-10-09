import ASCNDCore
import Observation

/// Các sổ Dinh dưỡng của MỘT phiên: nước uống, thực phẩm bổ sung.
///
/// Dựng ở phạm vi phiên (`SignedInScope`), không ở tab: tab Dinh dưỡng hiện
/// chúng, và kế hoạch nhắc nhở (`useReminderSync` của RN, gắn ở Today) đọc
/// chúng — "đã uống đủ nước" / "đã uống hết thực phẩm bổ sung" thì lời nhắc ấy
/// không được đặt. Một sổ, hai nơi đọc: không có hai bản số liệu lệch nhau.
@MainActor @Observable
final class NutritionBooks {
  let water: WaterBook?
  let supplements: SupplementBook?
  @ObservationIgnored private var loaded = false

  init(water: WaterBook?, supplements: SupplementBook?) {
    self.water = water
    self.supplements = supplements
  }

  /// Lần đầu: bản lưu trên máy rồi server, hai sổ song song. Gọi lại là vô hại.
  func loadOnce() async {
    guard !loaded else { return }
    loaded = true
    let water = self.water, supplements = self.supplements
    async let w: Void? = water?.load()
    async let s: Void? = supplements?.load()
    _ = await (w, s)
  }

  /// Ra tiền cảnh: qua nửa đêm thì "hôm nay" đổi.
  func becameActive() async {
    await water?.clockTick()
    await supplements?.refresh()
  }

  func refresh() async {
    await water?.refresh()
    await supplements?.refresh()
  }

  /// Phiên không còn là của người này: không lượt nào của hai sổ đổi màn nữa.
  func close() {
    water?.close()
    supplements?.close()
  }
}
