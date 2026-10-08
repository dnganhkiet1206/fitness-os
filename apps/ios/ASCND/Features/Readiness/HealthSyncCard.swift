import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ Apple Health (#527 Phase 4/9) — `HealthSourceCard` + chip "Đồng bộ
/// Apple Health" của Today (`health-source-card.tsx`, `use-health-sync.ts`)
/// @ fac9ac2. Chỉ là lớp hiện: việc đồng bộ là `HealthSyncCoordinator.syncNow`
/// của B (#554), truyền vào qua `sync` — thẻ không đụng tới dịch vụ ấy.
///
/// Như RN: không có Apple Health trên máy thì không hiện gì; chạm để đồng bộ
/// (xin quyền nếu cần); đang chạy thì quay vòng và khoá nút; xong báo "Đã đồng
/// bộ"; lỗi nói đúng tên (không có dữ liệu / phần nào chưa xong / lỗi chung).
/// Khác RN: không có toast — kết quả hiện ngay dưới thẻ và đọc bằng VoiceOver.
struct HealthSyncCard: View {
  let isAvailable: Bool
  let sync: @MainActor () async throws(HealthSync.Failure) -> Void

  @State private var running = false
  @State private var result: Result?

  enum Result: Equatable {
    case synced
    case failed(HealthSync.Failure)
  }

  var body: some View {
    if isAvailable {
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        Button {
          Task { await run() }
        } label: {
          HStack(spacing: DS.Spacing.md) {
            Image(systemName: "heart.fill")
              .foregroundStyle(DS.Color.destructive.swiftUI)
              .frame(width: 36, height: 36)
              .background(DS.Color.destructive.swiftUI.opacity(0.12), in: Circle())
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
              Text(String(localized: "hs.title")).font(DS.TextStyle.headline)
              Text(String(localized: "hs.brings"))
                .font(DS.TextStyle.caption)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .lineLimit(2)
            }
            Spacer()
            if running {
              ProgressView()
            } else {
              Text(String(localized: "hs.sync")).font(DS.TextStyle.footnote.weight(.semibold))
            }
          }
          .frame(minHeight: 44)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(running)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "hs.a11y")))
        .accessibilityAddTraits(.isButton)
        .accessibilityValue(Text(running ? String(localized: "hs.running") : ""))

        if let result {
          Text(Self.message(result))
            .font(DS.TextStyle.caption)
            .foregroundStyle(result == .synced ? DS.Color.readinessGreen.swiftUI : DS.Color.destructive.swiftUI)
        }
      }
      .padding(DS.Spacing.md)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    }
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
    if let result { AccessibilityNotification.Announcement(Self.message(result)).post() }
  }

  static func message(_ r: Result) -> String {
    switch r {
    case .synced: String(localized: "hs.synced")
    case .failed(.noData): String(localized: "hs.error.noData")
    case .failed(.write(_)): String(localized: "hs.error.generic")
    case .failed(.incomplete(let parts)):
      String(localized: "hs.error.incomplete \(parts.map(partName).formatted(.list(type: .and).locale(.app)))")
    }
  }

  /// Tên phần chưa xong (`nCxHealthSyncPart*`, khoá do `HealthSync` trả về).
  static func partName(_ key: String) -> String {
    if key == "nCxHealthSyncPartToday" { return String(localized: "hs.part.today") }
    if key == "nCxHealthSyncPartSteps" { return String(localized: "hs.part.steps") }
    if key.hasPrefix("nCxHealthSyncPartRebuild:") {
      let day = String(key.dropFirst("nCxHealthSyncPartRebuild:".count))
      return String(localized: "hs.part.rebuild \(day)")
    }
    return key
  }
}
