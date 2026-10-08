import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn Nhắc nhở (#527 1.10) — `app/reminders.tsx` + `useReminders` @ fac9ac2.
/// Luật (lưu, xin quyền, dựng và đặt lịch, giờ thông minh một lần) nằm ở
/// `ReminderCenter`; màn chỉ đọc và gọi nó.
///
/// RN behavior (giữ nguyên):
/// - nước: bật / tắt, nhịp 1–4 giờ; thưởng thử thách: chỉ bật / tắt (không có
///   giờ — nó bắn theo hạn nhận thưởng);
/// - bảy lời nhắc có giờ, đúng thứ tự RN; giờ chỉ hiện khi đang bật;
/// - quyền: bật cái đầu tiên mới xin; đã từ chối mà có cái bật → dải vàng chỉ
///   đường sang Cài đặt iOS;
/// - "Koa để ý": chỉ từ giờ ngủ / dậy người dùng ĐÃ TỰ LƯU, chỉ khi lời nhắc
///   đang bật và lệch ≥ 20 phút; một chạm mới dời, không tự dời;
/// - giờ suy từ hồ sơ áp MỘT lần cho mỗi tài khoản khi hồ sơ đã nạp.
///
/// Chưa có: lời mời theo giờ hay tập (`habitFor('workout')` chưa port) — dòng
/// Tập hôm nay im lặng, như RN khi chưa đủ sáu lần quan sát.
struct RemindersView: View {
  @Environment(AppServices.self) private var services
  @State private var known = ReminderTiming.Known()

  private var center: ReminderCenter { services.reminders }

  /// Bảy khoá có giờ, đúng thứ tự `timed` của màn RN.
  static let timed: [ReminderKey] = [.meal, .supplements, .workout, .weighIn, .biometrics, .sleepLog, .bedtime]
  static let waterIntervals: [Double] = [1, 2, 3, 4]

  var body: some View {
    List {
      Section {
        Label {
          Text(String(localized: "reminders.desc"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } icon: {
          Image(systemName: "bell")
            .foregroundStyle(DS.Color.primary.swiftUI)
        }
        if center.needsPermissionHint {
          Text(String(localized: "reminders.denied"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
        }
      }

      Section {
        Toggle(isOn: binding(.water)) {
          RowTitle(title: String(localized: "reminders.water"), systemImage: "drop.fill", color: DS.Color.metricBlue)
        }
        if center.prefs.water.enabled {
          Picker(selection: Binding(
            get: { center.prefs.water.everyHours },
            set: { n in Task { await center.setWaterInterval(n) } }
          )) {
            ForEach(Self.waterIntervals, id: \.self) { n in
              Text(String(localized: "reminders.everyHours \(Int(n))")).tag(n)
            }
          } label: {
            Text(String(localized: "reminders.water"))
          }
          .pickerStyle(.segmented)
          .frame(minHeight: 44)
        }
      }

      Section {
        Toggle(isOn: binding(.challengeClaim)) {
          RowTitle(
            title: String(localized: "reminders.claim.title"), subtitle: String(localized: "reminders.claim.desc"),
            systemImage: "trophy", color: DS.Color.metricOrangeGraphic)
        }
      }

      ForEach(Self.timed, id: \.self) { key in
        Section {
          timedRow(key)
          if let offer = ReminderTiming.offer(key, prefs: center.prefs, known: known), let source = source(key) {
            offerRow(key, offer: offer, source: source)
          }
        }
      }
    }
    .navigationTitle(Text(String(localized: "reminders.title")))
    .sensoryFeedback(.selection, trigger: center.prefs)
    .task { await load() }
    .refreshable { await load() }
  }

  // MARK: - Hàng

  private func timedRow(_ key: ReminderKey) -> some View {
    let row = center.prefs[timed: key]
    return HStack(spacing: DS.Spacing.sm) {
      RowTitle(title: Self.title(key), systemImage: Self.symbol(key), color: Self.tint(key))
      Spacer(minLength: DS.Spacing.xs)
      if row.enabled {
        DatePicker(
          Self.title(key),
          selection: Binding(
            get: { Self.date(hour: row.hour, minute: row.minute) },
            set: { d in
              let c = Calendar.current.dateComponents([.hour, .minute], from: d)
              Task { await center.setTime(key, hour: c.hour ?? row.hour, minute: c.minute ?? row.minute) }
            }),
          displayedComponents: .hourAndMinute
        )
        .labelsHidden()
      }
      Toggle(Self.title(key), isOn: binding(key))
        .labelsHidden()
    }
  }

  /// "Koa để ý: bạn dậy lúc 06:15" + nút "Nhắc lúc 6:30" — một gợi ý, không phải
  /// một cài đặt thứ hai: một chạm mới dời giờ.
  private func offerRow(_ key: ReminderKey, offer: ReminderClock, source: String) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      Text(String(localized: "reminders.smart.from \(source)"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .lineLimit(2)
      Spacer(minLength: DS.Spacing.xs)
      Button(String(localized: "reminders.smart.move \(ReminderTiming.format(offer))")) {
        Task { await center.setTime(key, hour: offer.hour, minute: offer.minute) }
      }
      .font(DS.TextStyle.caption.weight(.bold))
      .buttonStyle(.bordered)
      .frame(minHeight: 44)
    }
  }

  // MARK: - Dữ liệu

  private func binding(_ key: ReminderKey) -> Binding<Bool> {
    Binding(get: { center.prefs.isEnabled(key) }, set: { on in Task { await center.setEnabled(key, on) } })
  }

  /// Quyền đọc lại mỗi lần mở màn; hồ sơ: bản nhớ rồi server. Giờ suy từ hồ sơ
  /// chỉ áp khi hồ sơ đã nạp (`loaded && profile`), và chốt một lần.
  private func load() async {
    await center.refreshPermission()
    guard let userId = services.session.session?.userId else { return }
    let book = services.makeProfileBook(userId: userId)
    await book.load()
    apply(book.profile)
    await book.refresh()
    apply(book.profile)
    if let p = book.profile { await center.applySmartTiming(ReminderCenter.SleepSchedule(profile: p)) }
  }

  private func apply(_ profile: Profile?) {
    if profile != nil { known = ReminderTiming.Known(profile: profile) }
  }

  /// `SOURCE` của màn RN: điều Koa đã để ý, hoặc `nil` khi không có gì để nói.
  private func source(_ key: ReminderKey) -> String? {
    switch key {
    case .bedtime:
      ReminderTiming.Known.clockText(known.bedtime).map { String(localized: "reminders.smart.bedtime \($0)") }
    case .weighIn, .sleepLog:
      ReminderTiming.Known.clockText(known.waketime).map { String(localized: "reminders.smart.wake \($0)") }
    default: nil
    }
  }

  static func date(hour: Int, minute: Int) -> Date {
    Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date()
  }

  static func title(_ key: ReminderKey) -> String {
    switch key {
    case .meal: String(localized: "reminders.meal")
    case .supplements: String(localized: "reminders.supplements")
    case .workout: String(localized: "reminders.workout")
    case .weighIn: String(localized: "reminders.weighIn")
    case .biometrics: String(localized: "reminders.biometrics")
    case .sleepLog: String(localized: "reminders.sleepLog")
    case .bedtime: String(localized: "reminders.bedtime")
    case .water: String(localized: "reminders.water")
    case .challengeClaim: String(localized: "reminders.claim.title")
    }
  }

  static func symbol(_ key: ReminderKey) -> String {
    switch key {
    case .meal: "fork.knife"
    case .supplements: "pills"
    case .workout: "dumbbell"
    case .weighIn: "scalemass"
    case .biometrics: "waveform.path.ecg"
    case .sleepLog: "sunrise"
    case .bedtime: "moon"
    case .water: "drop.fill"
    case .challengeClaim: "trophy"
    }
  }

  static func tint(_ key: ReminderKey) -> DSColor {
    switch key {
    case .meal, .bedtime, .challengeClaim: DS.Color.metricOrangeGraphic
    case .supplements: DS.Color.metricPurple
    case .workout: DS.Color.primary
    case .weighIn, .water: DS.Color.metricBlue
    case .biometrics: DS.Color.readinessRed
    case .sleepLog: DS.Color.metricCyan
    }
  }
}

/// Tiêu đề một hàng: ô biểu tượng tròn + tên (+ dòng phụ).
private struct RowTitle: View {
  let title: String
  var subtitle: String?
  let systemImage: String
  let color: DSColor

  var body: some View {
    HStack(spacing: DS.Spacing.sm) {
      Image(systemName: systemImage)
        .font(.footnote)
        .foregroundStyle(color.swiftUI)
        .frame(width: 32, height: 32)
        .background(color.swiftUI.opacity(0.14), in: Circle())
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if let subtitle {
          Text(subtitle)
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
    }
  }
}
