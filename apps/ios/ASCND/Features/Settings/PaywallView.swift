import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn gói trả phí (must-do #2, 17/11) — theo mock
/// `apps/ios/docs/design/mocks/paywall.html`, chờ Kiệt duyệt.
///
/// Nguyên tắc hiển thị, theo đúng những gì đã biết:
///
/// - Tên và giá do StoreKit trả về — không hardcode, không bịa.
/// - Không hứa quyền lợi nào: chưa có quyết định sản phẩm nào về việc gói
///   Plus/Max mở khoá gì, và `isPaid()` hiện chỉ đổi hiệu ứng logo. Màn này
///   chỉ bán gói, không kể quyền lợi chưa tồn tại.
/// - Chưa cấu hình product ID thì hiện "chưa mở bán", không hiện product giả;
///   nút khôi phục vẫn có cho người đã mua từ trước.
struct PaywallView: View {
  @State private var controller: PurchaseController
  var legalLang: AppPreferences.Lang?
  @Environment(\.openURL) private var openURL

  init(controller: PurchaseController, legalLang: AppPreferences.Lang? = nil) {
    _controller = State(initialValue: controller)
    self.legalLang = legalLang
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        Text("paywall.subtitle")
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)

        switch controller.state {
        case .loading:
          HStack(spacing: 8) {
            ProgressView()
            Text("paywall.loading")
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          .frame(maxWidth: .infinity, minHeight: 120)
        case .unconfigured:
          unconfiguredView
        case .ready(let products):
          ForEach(products, id: \.id) { productCard($0) }
        case .failed(let failure):
          VStack(alignment: .leading, spacing: 12) {
            Text(message(for: failure))
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.destructive.swiftUI)
            DSButton(String(localized: "paywall.error.retry")) {
              Task { await controller.load() }
            }
            .accessibilityIdentifier("paywall.retry")
          }
        }

        noticeView

        if controller.state != .loading {
          DSButton(restoreTitle, style: .secondary) {
            Task { await controller.restore() }
          }
          .disabled(controller.restoring || controller.purchasingID != nil)
          .accessibilityIdentifier("paywall.restore")
        }

        footerView
      }
      .padding(16)
    }
    .navigationTitle(Text("paywall.title"))
    .task { await controller.load() }
    .ascndPage()
  }

  private var restoreTitle: String {
    controller.restoring ? String(localized: "paywall.restoring") : String(localized: "paywall.restore")
  }

  /// Chưa mở bán: không product, không nút mua. Khôi phục vẫn hiện ở dưới
  /// cho người đã mua trước khi config bị gỡ.
  private var unconfiguredView: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("paywall.unconfigured.title")
        .font(DS.TextStyle.title2)
      Text("paywall.unconfigured.body")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  private func productCard(_ product: StoreProduct) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        Text(verbatim: product.displayName)
          .font(DS.TextStyle.title2)
        Spacer()
        Text(verbatim: product.displayPrice)
          .font(DS.TextStyle.headline)
      }
      if controller.purchasingID == product.id {
        HStack(spacing: 8) {
          ProgressView()
          Text("paywall.buying")
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .frame(maxWidth: .infinity, minHeight: 50)
      } else {
        DSButton(String(localized: "paywall.buy")) {
          Task { await controller.buy(product) }
        }
        .disabled(controller.purchasingID != nil || controller.restoring)
      }
    }
    .padding(16)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .strokeBorder(DS.Color.border.swiftUI, lineWidth: 1))
    .accessibilityIdentifier("paywall.buy.\(controller.tier(for: product)?.rawValue ?? "unknown")")
  }

  @ViewBuilder private var noticeView: some View {
    switch controller.notice {
    case .purchased:
      Text("paywall.purchased")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.readinessGreen.swiftUI)
    case .restored:
      Text("paywall.restored")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.readinessGreen.swiftUI)
    case .pending:
      Text("paywall.pending")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    case .failed(let failure):
      Text(message(for: failure))
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.destructive.swiftUI)
    case nil:
      EmptyView()
    }
  }

  private var footerView: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("paywall.footer")
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Button(String(localized: "paywall.manage")) {
        if let url = URL(string: "https://apps.apple.com/account/subscriptions") { openURL(url) }
      }
      .font(DS.TextStyle.footnote)
      .accessibilityIdentifier("paywall.manage")
      if let legalLang {
        NavigationLink {
          LegalView(lang: legalLang)
        } label: {
          Text("paywall.legal")
            .font(DS.TextStyle.footnote)
        }
        .accessibilityIdentifier("paywall.legal")
      }
    }
  }

  /// Câu báo lỗi gọi đúng tên lỗi — không nói "quá tải" hay "thử lại sau"
  /// khi lỗi thật là "chưa triển khai" hay "chưa đăng nhập".
  private func message(for failure: PurchaseFailure) -> String {
    switch failure {
    case .notConfigured: String(localized: "paywall.error.notConfigured")
    case .noProducts: String(localized: "paywall.error.noProducts")
    case .notSignedIn: String(localized: "paywall.error.notSignedIn")
    case .invalidAccount: String(localized: "paywall.error.invalidAccount")
    case .storeUnavailable: String(localized: "paywall.error.storeUnavailable")
    case .unverified: String(localized: "paywall.error.unverified")
    case .verificationFailed(let edge):
      switch edge {
      case .notDeployed: String(localized: "paywall.error.notDeployed")
      case .offline: String(localized: "paywall.error.offline")
      case .unauthorised: String(localized: "paywall.error.unauthorised")
      default: String(localized: "paywall.error.verificationFailed")
      }
    case .nothingToRestore: String(localized: "paywall.error.nothingToRestore")
    }
  }
}

extension PurchaseTier {
  /// Tên gói hiện cho người dùng — "Plus"/"Max" là tên sản phẩm, vẫn qua
  /// xcstrings như mọi chữ khác trong app.
  var localizedName: String {
    switch self {
    case .free: String(localized: "paywall.tier.free")
    case .plus: String(localized: "paywall.tier.plus")
    case .max: String(localized: "paywall.tier.max")
    }
  }
}

/// Hàng "Gói" trong Cài đặt: gói hiện tại bên phải, chạm mở paywall.
/// Controller tạo một lần và giữ trong `@State` — paywall dùng chung đúng
/// controller này nên gói vừa mua hiện ngay ở hàng này khi quay lại.
struct PlanSettingsRow: View {
  @State private var controller: PurchaseController
  var legalLang: AppPreferences.Lang?

  init(controller: PurchaseController, legalLang: AppPreferences.Lang? = nil) {
    _controller = State(initialValue: controller)
    self.legalLang = legalLang
  }

  var body: some View {
    NavigationLink {
      PaywallView(controller: controller, legalLang: legalLang)
    } label: {
      HStack {
        Label("paywall.settings.row", systemImage: "star.circle")
        Spacer()
        Text(controller.tier.localizedName)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .accessibilityIdentifier("settings.plan")
    .task { await controller.load() }
  }
}
