import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// Phần đầu tab Hôm nay (#527, E — chủ dự án giao làm lại Today theo RN):
// `BrandLockup`, `StreakChip`, `AccountAvatar`, hàng năng lượng và hàng Koa của
// `(tabs)/index.tsx` @ fac9ac2. Chỉ là vẽ: số liệu đến từ `MascotRoomController`
// (tín hiệu ngày, chuỗi, nhiệm vụ) mà `TodayExtras` dựng.

/// Logo + chữ "ASCND" (`brand-lockup.tsx`): dấu 37 điểm, chữ 22 đậm giãn 0,6;
/// một phần tử tiêu đề cho VoiceOver.
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
    .accessibilityLabel(Text(String(localized: "today.settings.a11y")))
  }
}

/// Hàng năng lượng (`EnergyRing size 64 stroke 8` + "Năng lượng hôm nay" + câu
/// theo số tín hiệu xong) — cả hàng là một nút mở phòng linh vật.
struct TodayEnergyRow: View {
  let room: MascotRoomController

  var body: some View {
    let total = MascotRules.energySignals.count
    HStack(spacing: DS.Spacing.md) {
      EnergyRing(
        segments: MascotRules.energySignals.map { (on: room.questDone($0), color: MascotRoomView.signalColor($0)) },
        lineWidth: 8, gap: 8
      )
      .frame(width: 64, height: 64)
      .overlay {
        (Text(verbatim: "\(room.energyCount)")
          .font(.system(size: 17, weight: .bold).monospacedDigit())
          .foregroundStyle(DS.Color.foreground.swiftUI)
          + Text(verbatim: "/\(total)")
          .font(.system(size: 13, weight: .bold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI))
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(String(localized: "mr.energy"))
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text(MascotRoomView.headline(room.energyHeadline))
          .font(.system(size: 13, weight: .medium))
          .lineSpacing(2)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(DS.Spacing.sm)
    .contentShape(Rectangle())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "mr.energy.a11y \(room.energyCount) \(total)")))
    .accessibilityValue(Text(MascotRoomView.headline(room.energyHeadline)))
  }
}

/// Hàng Koa dưới thẻ sẵn sàng: Koa nhỏ (to dần theo cấp như RN), chấm nhiệm vụ
/// hôm nay, "đã xong / tổng", viên xu đang chờ nhận. Chưa có: bong bóng lời
/// nói (`mascotLine` chưa port — không bịa câu).
struct TodayKoaRow: View {
  let room: MascotRoomController

  var body: some View {
    let quests = room.activeQuests
    let done = quests.filter { room.questDone($0.key) }
    let unclaimed = done.filter { !room.isClaimed(MascotRules.questRefKey(room.today, $0.key)) }.map(\.coins).reduce(0, +)
    HStack(spacing: DS.Spacing.sm) {
      MascotFigureView(size: 54 * min(1 + Double(room.level - 1) * 0.02, 1.2), animated: true)
        .frame(width: 74, height: 80)
        .accessibilityHidden(true)
      if !quests.isEmpty {
        HStack(spacing: DS.Spacing.sm) {
          HStack(spacing: 5) {
            ForEach(quests, id: \.key) { q in
              let on = room.questDone(q.key)
              Circle()
                .fill(on ? DS.Color.readinessGreen.swiftUI : .clear)
                .overlay(Circle().stroke(on ? DS.Color.readinessGreen.swiftUI : DS.Color.border.swiftUI, lineWidth: 1))
                .frame(width: 7, height: 7)
            }
          }
          Text(verbatim: "\(done.count)/\(quests.count)")
            .font(.system(size: 11, weight: .medium).monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          if unclaimed > 0 {
            HStack(spacing: 3) {
              Image(systemName: "circle.circle.fill").font(.system(size: 10))
              Text(verbatim: "+\(unclaimed)").font(.system(size: 11, weight: .bold).monospacedDigit())
            }
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
            .padding(.horizontal, 6)
            .frame(height: 18)
            .background(Color(red: 1, green: 217 / 255, blue: 61 / 255).opacity(0.12), in: Capsule())
          }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "today.quests.a11y \(done.count) \(quests.count)")))
        .accessibilityValue(Text(verbatim: unclaimed > 0 ? "+\(unclaimed)" : ""))
      }
      Spacer(minLength: 0)
    }
    .contentShape(Rectangle())
  }
}
