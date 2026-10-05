/// Một quãng nghỉ giữa hai set — nguồn sự thật DUY NHẤT cho cả màn tập lẫn
/// Live Activity / Dynamic Island (#227, H5).
///
/// ── vì sao một giá trị thuần ──
///
/// Bản RN có hai nguồn: React state trong `RestHost` và `ContentState` mà
/// extension sửa trực tiếp, nối bằng Darwin ping. App bị suspend thì lỡ ping,
/// và hai bề mặt lệch nhau. Ở đây trạng thái là MỘT giá trị; app vẽ nó, Live
/// Activity là phép chiếu của nó, intent của Island gọi vào cùng hàm
/// `adjusted(by:at:)` này trong process của app.
///
/// ── vì sao mili giây số nguyên ──
///
/// `left = ceil((endsAt − now) / 1000)` là luật của baseline. Với `Double`
/// giây, `105.1 − 60.1 = 45.00000000000001` và `ceil` ra 46 — lệch một giây so
/// với RN, đúng loại lệch golden vectors sinh ra để bắt. `Date` chỉ đổi ra ở
/// rìa (`EpochMillis(date)`), không bao giờ đi vào phép tính.
///
/// Luật lấy từ baseline `fac9ac2` (`native/src/components/ascnd/day-plan.tsx`),
/// đã ghi ở #230. Hai điểm còn chờ Kiệt (#235) đang giữ đúng baseline:
/// −15 khi còn ít giây thì còn 1 giây (không kết thúc), và vòng đo phần CÒN LẠI.
public struct RestTimer: Sendable, Hashable, Codable {
  /// Trần một quãng nghỉ sau khi chỉnh (`REST_MAX`, day-plan.tsx:156).
  public static let maxSeconds = 600
  /// Bước của nút ±, "cách đọc đồng hồ phòng tập" (`REST_STEP`).
  public static let step = 15
  /// Sau `endsAt`, thẻ còn hiện `0` trong đúng chừng này rồi mới đóng — để
  /// người dùng phân biệt "đã hết" với "biến mất vì lỗi" (day-plan.tsx:201).
  public static let doneGraceMillis: Int64 = 1000

  /// Thời điểm hết nghỉ, tuyệt đối. Không bao giờ đếm lùi theo nhịp: app bị
  /// suspend rồi quay lại vẫn ra đúng số giây còn lại.
  public private(set) var endsAt: EpochMillis
  /// Mẫu số của vòng, tính bằng giây. Thêm giờ thì nó lớn theo (vòng vẫn là
  /// một phần của một cái gì đó); bớt giờ thì giữ nguyên (nghỉ thật sự bị cắt
  /// ngắn, và vòng nói đúng điều đó).
  public private(set) var total: Int

  /// Bắt đầu nghỉ khi tick xong một set. `seconds ≤ 0` nghĩa là bài không có
  /// nghỉ — không có quãng nghỉ nào cả (day-plan.tsx: `secs > 0`).
  public static func start(seconds: Int, at now: EpochMillis) -> RestTimer? {
    guard seconds > 0 else { return nil }
    return RestTimer(endsAt: now + Int64(seconds) * 1000, total: seconds)
  }

  private init(endsAt: EpochMillis, total: Int) {
    self.endsAt = endsAt
    self.total = total
  }

  /// Số giây còn lại như người dùng đọc: làm tròn LÊN, không âm.
  public func remaining(at now: EpochMillis) -> Int {
    let ms = endsAt.millis - now.millis
    guard ms > 0 else { return 0 }
    return Int((ms + 999) / 1000)
  }

  public func phase(at now: EpochMillis) -> RestPhase {
    let left = remaining(at: now)
    if left > 0 { return .running(left: left) }
    return now.millis - endsAt.millis < Self.doneGraceMillis ? .done : .over
  }

  /// ±15 (hoặc bất kỳ `delta` nào). Tính từ `endsAt` thật chứ không từ con số
  /// đang vẽ — nhịp vẽ có thể chậm tới một giây. Kết quả kẹp trong
  /// [1, `maxSeconds`]: −15 khi còn 10 giây để lại 1 giây (baseline, #235).
  public func adjusted(by delta: Int, at now: EpochMillis) -> RestTimer {
    let left = min(Self.maxSeconds, max(1, remaining(at: now) + delta))
    return RestTimer(endsAt: now + Int64(left) * 1000, total: max(total, left))
  }

  /// Gốc của khoảng thời gian mà vòng chạy trên: `endsAt − total`.
  ///
  /// Đây là chỗ sửa H4 của #227. Bản RN neo vòng của Island vào `startDate`
  /// lúc bắt đầu và không bao giờ dời, trong khi vòng trong app chia cho
  /// `total` — nên sau lần ±15 đầu tiên hai vòng không bao giờ khớp nữa. Với
  /// `ringStart + total = endsAt`, `ProgressView(timerInterval: ringStart...endsAt)`
  /// của Island và `ringFraction(at:)` của app là CÙNG một hàm của `now`.
  public var ringStart: EpochMillis { endsAt - Int64(total) * 1000 }

  /// Phần CÒN LẠI của vòng, 1 → 0 (baseline: vòng rút dần, #235). Liên tục
  /// theo mili giây chứ không theo giây làm tròn — để app vẽ mượt bằng chính
  /// công thức mà Island dùng.
  public func ringFraction(at now: EpochMillis) -> Double {
    let span = endsAt.millis - ringStart.millis
    guard span > 0 else { return 0 }
    let left = endsAt.millis - now.millis
    return min(1, max(0, Double(left) / Double(span)))
  }
}

public enum RestPhase: Sendable, Hashable {
  /// Đang đếm; `left` > 0 là số giây hiển thị.
  case running(left: Int)
  /// Vừa hết: thẻ hiện 0 và dấu "xong" trong `doneGraceMillis` đầu.
  case done
  /// Đã qua: không còn quãng nghỉ nào để hiện.
  case over
}

/// Những gì làm thay đổi quãng nghỉ, theo đúng thứ tự chúng xảy ra.
public enum RestEvent: Sendable, Hashable {
  /// Tick xong một set có thời gian nghỉ `seconds`.
  case start(seconds: Int)
  /// Nút ±15 trong app hoặc trên Island.
  case adjust(delta: Int)
  /// Skip, hoặc bỏ tick set vừa tick.
  case cancel
}

extension RestTimer {
  /// Áp một sự kiện lên trạng thái hiện có. Quãng nghỉ đã `.over` coi như
  /// không còn: ±15 lúc ấy không hồi sinh nó (bản RN đã dọn nó ở nhịp trước),
  /// còn ±15 lúc `.done` thì có — người dùng còn nhìn thấy thẻ.
  public static func reduce(_ state: RestTimer?, _ event: RestEvent, at now: EpochMillis) -> RestTimer? {
    let live = state.flatMap { $0.phase(at: now) == .over ? nil : $0 }
    switch event {
    case .start(let seconds):
      return RestTimer.start(seconds: seconds, at: now)
    case .adjust(let delta):
      return live?.adjusted(by: delta, at: now)
    case .cancel:
      return nil
    }
  }
}
