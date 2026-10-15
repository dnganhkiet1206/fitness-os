import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// Phần đầu tab Hôm nay (#527): `BrandLockup`, `StreakChip`, `AccountAvatar` của
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

/// Viên chuỗi ngày (`streak-chip.tsx`): cao 44, ngọn lửa + số; hôm nay đã ghi
/// thì cam, chưa ghi thì xám. Chỉ hiện khi chuỗi ≥ 1 (nơi gọi quyết).
struct StreakChip: View {
  let count: Int
  let lit: Bool
  let action: () -> Void

  var body: some View {
    let tint = lit ? DS.Color.metricOrangeGraphic.swiftUI : DS.Color.border.swiftUI
    Button(action: action) {
      HStack(spacing: 5) {
        Image(systemName: lit ? "flame.fill" : "flame")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(lit ? DS.Color.metricOrangeGraphic.swiftUI : DS.Color.mutedForeground.swiftUI)
        Text(verbatim: "\(count)")
          .font(.system(size: 16, weight: .heavy).monospacedDigit())
          .tracking(-0.3)
          .foregroundStyle(lit ? DS.Color.metricOrange.swiftUI : DS.Color.mutedForeground.swiftUI)
      }
      .padding(.horizontal, 10)
      .frame(height: 44)
      .background(
        lit ? DS.Color.metricOrangeGraphic.swiftUI.opacity(0.13) : DS.Color.secondary.swiftUI.opacity(0.2), in: Capsule()
      )
      .overlay(Capsule().stroke(tint.opacity(lit ? 0.28 : 0.3), lineWidth: 1))
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .sensoryFeedback(.selection, trigger: count)
    .accessibilityLabel(Text(Self.label(count: count, lit: lit)))
  }

  static func label(count: Int, lit: Bool) -> String {
    switch (lit, count == 1) {
    case (true, true): String(localized: "today.streak.lit.one")
    case (true, false): String(localized: "today.streak.lit.other \(count)")
    case (false, true): String(localized: "today.streak.risk.one")
    case (false, false): String(localized: "today.streak.risk.other \(count)")
    }
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
