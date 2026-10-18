import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Khu vực Apple Health trên Hôm nay (18/10, chủ dự án duyệt mock A): kết nối một
/// lần, rồi một nút "Đồng bộ" — Health tự điền giấc ngủ, bước, buổi tập đồng hồ,
/// cân, nước, sinh trắc nên người dùng bớt phải ghi tay. Chưa kết nối: nói rõ
/// được gì và một nút "Kết nối" (cùng `HealthSyncCoordinator.syncNow`, xin quyền
/// nếu cần). Máy không có Health thì không hiện.
struct TodayHealthCard: View {
  let connected: Bool
  let lastSync: Date?
  let sync: @MainActor () async throws(HealthSync.Failure) -> Void

  @State private var running = false
  @State private var result: HealthSyncCard.Result?

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: 12) {
        Image(systemName: "heart.fill")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(DS.Color.destructive.swiftUI)
          .frame(width: 38, height: 38)
          .background(DS.Color.destructive.swiftUI.opacity(0.12), in: Circle())
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(connected ? "hs.title" : "hcard.connect.title").font(DS.TextStyle.headline)
          Text(verbatim: subtitle)
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 0)
        if connected { syncButton }
      }
      if connected {
        chips
      } else {
        Button { Task { await run() } } label: {
          Group {
            if running { ProgressView() } else { Text("hcard.connect") }
          }
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 46)
          .background(DS.Color.card.swiftUI, in: Capsule())
          .overlay(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75))
        }
        .buttonStyle(TodayPressStyle())
        .disabled(running)
      }
      if let result {
        Text(HealthSyncCard.message(result))
          .font(DS.TextStyle.caption)
          .foregroundStyle(result == .synced ? DS.Color.readinessGreen.swiftUI : DS.Color.destructive.swiftUI)
      }
    }
    .padding(DS.Spacing.md)
    .todayCard()
  }

  private var subtitle: String {
    guard connected else { return String(localized: "hcard.connect.body") }
    guard let lastSync else { return String(localized: "hcard.never") }
    return String(localized: "hcard.synced \(lastSync.formatted(date: .omitted, time: .shortened))")
  }

  private var syncButton: some View {
    Button { Task { await run() } } label: {
      Group {
        if running {
          ProgressView()
        } else {
          Label(String(localized: "hs.sync"), systemImage: "arrow.clockwise")
        }
      }
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .padding(.horizontal, 14)
      .frame(minHeight: 36)
      .background(.thinMaterial, in: Capsule())
      .overlay(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75))
      .frame(minHeight: 44)
    }
    .buttonStyle(TodayPressStyle())
    .disabled(running)
    .accessibilityLabel(Text(String(localized: "hs.a11y")))
  }

  /// Những gì Health tự điền — để người dùng biết vì sao không phải ghi tay.
  private var chips: some View {
    let keys: [LocalizedStringKey] = ["hcard.f.sleep", "hcard.f.steps", "hcard.f.workouts", "hcard.f.weight", "hcard.f.water", "hcard.f.heart"]
    return ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(keys.indices, id: \.self) { i in
          Text(keys[i])
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(DS.Color.readinessGreen.swiftUI)
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(DS.Color.readinessGreen.swiftUI.opacity(0.10), in: Capsule())
        }
      }
    }
    .accessibilityElement(children: .combine)
  }

  private func run() async {
    guard !running else { return }
    running = true
    result = nil
    defer { running = false }
    do throws(HealthSync.Failure) {
      try await sync()
      result = .synced
    } catch {
      result = .failed(error)
    }
    if let result { AccessibilityNotification.Announcement(HealthSyncCard.message(result)).post() }
  }
}
