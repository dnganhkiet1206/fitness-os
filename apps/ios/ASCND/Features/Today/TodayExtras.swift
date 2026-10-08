import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Các thẻ dưới phần buổi tập của Today (#527 Phase 4/7/9) — như RN, Today là
/// cửa của chúng: thẻ sẵn sàng (→ sinh trắc học, tấm giải thích), thẻ Apple
/// Health, lối vào phòng linh vật (→ huy chương, thử thách tuần).
///
/// Chỉ là nối dây: sổ dựng ở `AppServices`, một lần mỗi phiên (cây của tab
/// dựng lại theo `.id(userId)`), đóng khi phiên kết thúc. Thiếu cấu hình
/// Supabase thì sổ là `nil` và thẻ không hiện.
struct TodayExtras: View {
  let userId: String

  @Environment(AppServices.self) private var services
  @Environment(\.scenePhase) private var scenePhase
  @State private var readiness: ReadinessBook?
  @State private var biometrics: BiometricsBook?
  @State private var awards: AwardsBook?
  @State private var mascot: MascotRoomController?
  @State private var challenges: WeeklyChallengesBook?
  @State private var showsBiometrics = false
  @State private var built = false

  var body: some View {
    VStack(spacing: DS.Spacing.md) {
      if let readiness {
        ReadinessCardView(
          book: readiness, lang: services.preferences.lang,
          onOpenBiometrics: biometrics == nil ? nil : { showsBiometrics = true })
      }
      HealthSyncCard(isAvailable: services.health.isAvailable, sync: syncHealth)
      if let mascot {
        NavigationLink {
          MascotRoomView(room: mascot, awards: awards, challenges: challenges)
        } label: {
          HStack {
            Label(String(localized: "mr.title"), systemImage: "pawprint.fill")
              .font(DS.TextStyle.headline)
            Spacer()
            Image(systemName: "chevron.right")
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
          }
          .padding(DS.Spacing.md)
          .frame(minHeight: 44)
          .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    }
    .navigationDestination(isPresented: $showsBiometrics) {
      if let biometrics { BiometricsView(book: biometrics) }
    }
    .task {
      guard !built else { return }
      built = true
      let today = Self.today()
      readiness = services.makeReadinessBook(userId: userId, date: today)
      biometrics = services.makeBiometricsBook(userId: userId)
      awards = services.makeAwardsBook(userId: userId)
      mascot = services.makeMascotRoom(userId: userId, today: today)
      challenges = services.makeWeeklyChallenges(userId: userId, today: today)
      await readiness?.load()
    }
    .onChange(of: scenePhase) { _, phase in
      // Ra tiền cảnh: qua nửa đêm thì đổi ngày; không thì đọc lại điểm (đồng
      // bộ Apple Health / ghi buổi ở nơi khác có thể vừa dựng lại hôm nay).
      guard phase == .active, let readiness else { return }
      Task {
        let today = Self.today()
        if today != readiness.date { await readiness.move(to: today) } else { await readiness.load() }
      }
    }
    // Đóng khi phiên không còn là của người này (đăng xuất / đổi tài khoản) —
    // KHÔNG ở `onDisappear`: nó chạy cả khi đẩy màn con hay đổi tab, và sổ đã
    // đóng thì không mở lại.
    .onChange(of: isCurrentSession) { _, current in
      guard !current else { return }
      readiness?.close()
      biometrics?.close()
      awards?.close()
      mascot?.close()
      challenges?.close()
    }
  }

  private var isCurrentSession: Bool { services.session.session?.userId == userId }

  /// Đồng bộ Apple Health của B (#554); xong thì điểm hôm nay đọc lại.
  private func syncHealth() async throws(HealthSync.Failure) {
    try await services.health.syncNow(userId: userId, lang: AppServices.appLang)
    await readiness?.load()
  }

  private static func today() -> LocalDate { LocalDate(SystemWallClock().nowMillis(), in: .current) }
}
