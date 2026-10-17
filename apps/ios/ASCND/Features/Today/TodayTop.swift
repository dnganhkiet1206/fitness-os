import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// Phần đầu tab Hôm nay (#527): `BrandLockup`, chuông Thông báo (thay `StreakChip`
// từ 16/10), `AccountAvatar` của
// `(tabs)/index.tsx` @ fac9ac2. Hàng năng lượng và hàng Koa của RN đã thay bằng
// khối ngày (`RN-PARITY.md`). Logo trở lại thay tiêu đề lớn "Hôm nay" theo chỉ
// thị chủ dự án (13/10, B).

/// Logo + chữ "ASCND" (`brand-lockup.tsx`): cao 44 bằng hàng nút để nằm cùng
/// trục với viên chuỗi ngày và avatar; MỘT phần tử với VoiceOver (không đọc
/// "ASCND ASCND"); không bấm được — danh tính, không phải lối đi. Chữ theo cỡ
/// của máy nhưng có trần (`WORD_MAX_SCALE`).
struct BrandLockup: View {
  /// Gói trả phí (16/10, chủ dự án): thỉnh thoảng — không mặc định, không thay
  /// logo cũ — logo chuyển sang "ASCND Intelligence" vài giây rồi trở lại, để người
  /// dùng gói trả phí nhận ra một thay đổi nhẹ.
  var paid = false
  @State private var showsIntelligence = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack(alignment: .leading) {
      if showsIntelligence {
        IntelligenceOrb(size: 34)
          .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .leading)))
      } else {
        brand
          .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .leading)))
      }
    }
    .frame(height: 44)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "brand.name")))
    .accessibilityAddTraits(.isHeader)
    .task(id: paid) { await reveal() }
  }

  /// Lịch hiện: một lần mỗi lần mở trang (sau 2,5 s), tối đa một lần mỗi 3 giờ;
  /// giữ 4 s rồi về logo cũ. Giảm chuyển động: không đổi.
  private func reveal() async {
    guard paid, !reduceMotion else { return }
    let key = "ascnd-intelligence-reveal-at"
    let last = UserDefaults.standard.double(forKey: key)
    let now = Date().timeIntervalSince1970
    guard now - last > 3 * 3600 else { return }
    try? await Task.sleep(for: .seconds(2.5))
    guard !Task.isCancelled else { return }
    UserDefaults.standard.set(now, forKey: key)
    withAnimation(reduceMotion ? nil : .smooth(duration: 0.6)) { showsIntelligence = true }
    try? await Task.sleep(for: .seconds(4))
    withAnimation(reduceMotion ? nil : .smooth(duration: 0.6)) { showsIntelligence = false }
  }

  private var brand: some View {
    HStack(spacing: 7) {
      Image("BrandMark")
        .resizable()
        .interpolation(.high)
        .frame(width: 37, height: 37)
      Text(String(localized: "brand.name"))
        .font(.system(size: 22, weight: .bold))
        .tracking(0.6)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
    }
  }
}

/// Chuông Thông báo (16/10, chủ dự án: thay viên chuỗi ngày trên đầu trang Hôm
/// nay — một chuông cho cả app). Nút 44 cùng cỡ avatar; chấm đỏ khi có tin chưa
/// đọc hoặc việc cần làm.
struct NotificationBell: View {
  let dot: Bool

  var body: some View {
    Image(systemName: "bell")
      .font(.system(size: 17, weight: .semibold))
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .frame(width: 44, height: 44)
      .background(Circle().fill(.thinMaterial))
      .overlay(Circle().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75))
      .overlay(alignment: .topTrailing) {
        if dot {
          Circle()
            .fill(DS.Color.destructive.swiftUI)
            .frame(width: 10, height: 10)
            .overlay(Circle().stroke(DS.Color.background.swiftUI, lineWidth: 2))
            .offset(x: -6, y: 6)
        }
      }
      .contentShape(Circle())
      .accessibilityLabel(dot ? Text("community.inbox.opennew") : Text("community.inbox.title"))
  }
}

/// Avatar tài khoản (`account-avatar.tsx`): nút 44, kính mờ + viền mảnh như
/// chuông Thông báo (16/10), chữ cái đầu (`AccountInitials`); không có gì thì hình người. Lối
/// duy nhất vào Cài đặt.
struct AccountAvatar: View {
  let initials: String?
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      // Cùng vật liệu với chuông bên cạnh (16/10, chủ dự án chọn mock "B · Giống
      // chuông"): kính mờ, viền mực mảnh, chữ mực — hai nút thành một cặp.
      ZStack {
        Circle().fill(.thinMaterial)
        Circle().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75)
        if let initials {
          Text(verbatim: initials)
            .font(.system(size: 15, weight: .semibold))
            .tracking(0.3)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        } else {
          Image(systemName: "person")
            .font(.system(size: 18))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      .frame(width: 44, height: 44)
      .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(String(localized: "community.user.heading")))
  }
}
