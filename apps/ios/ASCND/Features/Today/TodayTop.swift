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
  var body: some View {
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
    .frame(height: 44)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "brand.name")))
    .accessibilityAddTraits(.isHeader)
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

/// Avatar tài khoản (`account-avatar.tsx`): nút 44, vòng tròn tô `primary` 12%,
/// viền 28%, chữ cái đầu (`AccountInitials`); không có gì thì hình người. Lối
/// duy nhất vào Cài đặt.
struct AccountAvatar: View {
  let initials: String?
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      ZStack {
        Circle().fill(DS.Color.primary.swiftUI.opacity(0.12))
        Circle().stroke(DS.Color.primary.swiftUI.opacity(0.28), lineWidth: 1)
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
