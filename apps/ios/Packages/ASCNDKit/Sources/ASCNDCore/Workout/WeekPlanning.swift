/// Màn kế hoạch tuần (#527 Phase 2) — phần thuần của
/// `components/ascnd/week-plan.tsx` @ fac9ac2. Ghi qua `PlanEditor`
/// (`assign` / `setDeload`); trạng thái ngày là `WorkoutPlanning.plan`
/// (`dayStateOf`).
///
/// RN behavior (giữ nguyên):
/// - mở trên hôm nay; mũi tên lùi / tiến tối đa 4 tuần (`WEEKS_BACK`,
///   `WEEKS_FORWARD`), tuần bắt đầu Thứ Hai;
/// - ngày chưa lên lịch (không phải ngày nghỉ đã chốt) gợi ý 3 buổi DÙNG GẦN
///   NHẤT — theo tên buổi trong lịch sử, buổi chưa dùng xếp sau, giữ thứ tự;
/// - bộ chọn buổi: hai buổi trùng tên thì kèm ngày tạo để phân biệt.
public enum WeekPlanning {
  public static let weeksBack = 4
  public static let weeksForward = 4

  /// `step`: kẹp trong [−4, 4].
  public static func clamp(offset: Int) -> Int {
    min(weeksForward, max(-weeksBack, offset))
  }

  /// `weekDates(anchor)` với `anchor = hôm nay + 7 × offset`: bảy ngày Thứ Hai → Chủ nhật.
  public static func weekDates(today: LocalDate, offset: Int) -> [LocalDate] {
    let anchor = today.adding(days: 7 * offset)
    let monday = anchor.adding(days: -WorkoutPlanning.routineIndex(anchor))
    return (0..<7).map { monday.adding(days: $0) }
  }

  /// `suggestions` (`:313`): 3 buổi theo lần dùng gần nhất (khớp tên buổi đã
  /// cắt khoảng trắng); buổi chưa dùng xếp sau; bằng nhau giữ thứ tự gốc.
  public static func suggestions(
    _ templates: [WorkoutTemplate], sessions: [(name: String, at: EpochMillis)], limit: Int = 3
  ) -> [WorkoutTemplate] {
    var lastUsed: [String: Int64] = [:]
    for s in sessions {
      let name = s.name.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !name.isEmpty else { continue }
      if let prev = lastUsed[name], prev >= s.at.millis { continue }
      lastUsed[name] = s.at.millis
    }
    func key(_ t: WorkoutTemplate) -> Int64 {
      lastUsed[t.name.trimmingCharacters(in: .whitespacesAndNewlines)] ?? -1
    }
    return Array(
      templates.enumerated()
        .sorted { a, b in
          let ka = key(a.element), kb = key(b.element)
          return ka != kb ? ka > kb : a.offset < b.offset
        }
        .map(\.element)
        .prefix(limit))
  }

  /// `dupNames` (`:286`): tên xuất hiện hơn một lần trong chính danh sách.
  public static func duplicateNames(_ templates: [WorkoutTemplate]) -> Set<String> {
    var seen: [String: Int] = [:]
    for t in templates { seen[t.name, default: 0] += 1 }
    return Set(seen.filter { $0.value > 1 }.keys)
  }
}
