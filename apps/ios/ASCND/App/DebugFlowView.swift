#if DEBUG
  import ASCNDCore
  import SwiftUI

  /// Xem trọn luồng người mới — màn đăng nhập rồi toàn bộ onboarding — trên bất kỳ
  /// máy nào, kể cả khi đang đăng nhập (Kiệt 22/10). Chỉ bản Debug, bật bằng
  /// `SIMCTL_CHILD_ASCND_DEBUG_FLOW=1`.
  ///
  /// Không đụng tài khoản thật: nháp nằm trong bộ nhớ, "Xong" không ghi hồ sơ, màn
  /// Apple Health không xin quyền, không lưu lịch chờ áp. Ở màn đăng nhập, nút
  /// "Bỏ qua đăng nhập" đi tiếp mà không đăng nhập; đăng nhập thật vẫn chạy như
  /// thường nếu bấm.
  struct DebugFlowView: View {
    enum Stage { case auth, onboarding, done }

    @Environment(AppServices.self) private var services
    @State private var stage = Stage.auth
    @State private var flow: OnboardingController?

    static var enabled: Bool { ProcessInfo.processInfo.environment["ASCND_DEBUG_FLOW"] == "1" }

    var body: some View {
      switch stage {
      case .auth:
        AuthView()
          .overlay(alignment: .topTrailing) {
            debugButton("DEBUG · Skip sign-in →") { startOnboarding() }
          }
      case .onboarding:
        if let flow, flow.loaded {
          OnboardingStepsView(flow: flow, dryRun: true)
            .overlay(alignment: .topTrailing) {
              debugButton("DEBUG · Restart") { stage = .auth }
            }
        } else {
          ProgressView()
        }
      case .done:
        VStack(spacing: 16) {
          Text(verbatim: "DEBUG · End of the new-user flow")
            .font(.headline)
          Text(verbatim: "Nothing was saved to the account.")
            .font(.footnote)
            .foregroundStyle(.secondary)
          Button { stage = .auth } label: {
            Text(verbatim: "Run again")
          }
          .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AuthHero.ink)
        .environment(\.colorScheme, .dark)
      }
    }

    private func startOnboarding() {
      let c = OnboardingController(
        userId: "debug-flow", store: MemoryOnboardingStore(), writer: DryRunWriter(),
        healthAvailable: services.health.isAvailable,
        onFinished: { stage = .done })
      flow = c
      stage = .onboarding
      Task { await c.load() }
    }

    private func debugButton(_ title: String, action: @escaping () -> Void) -> some View {
      Button(action: action) {
        Text(verbatim: title)
          .font(.caption.weight(.bold))
          .foregroundStyle(.black)
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .background(Capsule().fill(.yellow))
      }
      .padding(.trailing, 12)
      .padding(.top, 8)
      .accessibilityLabel(Text(verbatim: title))
    }
  }

  /// Nháp onboarding chỉ trong bộ nhớ — mất khi đóng app.
  private actor MemoryOnboardingStore: OnboardingStore {
    var draft: OnboardingDraft?
    func loadDraft(userId: String) async throws -> OnboardingDraft? { draft }
    func saveDraft(userId: String, _ draft: OnboardingDraft) async throws { self.draft = draft }
    func clearDraft(userId: String) async throws { draft = nil }
    func loadCompleted(userId: String) async throws -> Bool? { nil }
    func saveCompleted(userId: String, _ done: Bool) async throws {}
  }

  /// "Xong" của luồng debug: không ghi gì.
  private struct DryRunWriter: OnboardingWriter {
    func completeOnboarding(userId: String, row: JSONValue) async throws {}
  }
#endif
