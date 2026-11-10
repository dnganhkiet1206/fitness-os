import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Chữ của bậc trong hạng (10/11, Kiệt duyệt `docs/design/mocks/koa-rank-tiers.html`: số La Mã
/// kèm vạch). Một chỗ ghép tên để Hôm nay, tổng kết buổi, Hành trình và phòng Koa nói cùng một kiểu.
enum KoaTierText {
  static func roman(_ n: Int) -> String {
    let marks: [(Int, String)] = [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    var left = max(1, min(n, 39))
    var out = ""
    for (value, mark) in marks {
      while left >= value {
        out += mark
        left -= value
      }
    }
    return out
  }

  /// "Lifter II"; hạng không chia bậc: "Newbie"; hạng cuối (bậc không giới hạn): "Mass Monster · bậc 7".
  static func name(rank: Int, tier: Int, lang: AppPreferences.Lang) -> String {
    let ranks = MascotRules.ranks
    let rankName = ranks[min(max(0, rank), ranks.count - 1)].name(lang)
    guard rank < KoaGains.tierCounts.count else { return String(localized: "koa.tier.open \(rankName) \(tier)") }
    return KoaGains.tierCounts[rank] == 1 ? rankName : "\(rankName) \(roman(tier))"
  }

  static func name(_ t: KoaGains.Tier, lang: AppPreferences.Lang) -> String {
    name(rank: t.rank, tier: t.tier, lang: lang)
  }

  /// Tên mốc kế. Mốc kế là hạng mới thì chỉ gọi tên hạng ("tới Swole"), như trước khi có bậc.
  static func nextName(_ t: KoaGains.Tier, lang: AppPreferences.Lang) -> String {
    let next = t.next
    let ranks = MascotRules.ranks
    return next.tier == 1 ? ranks[min(next.rank, ranks.count - 1)].name(lang) : name(rank: next.rank, tier: next.tier, lang: lang)
  }

  /// "còn 38 Gains tới Lifter II · khoảng 4 buổi".
  static func toNext(_ t: KoaGains.Tier, lang: AppPreferences.Lang) -> String {
    let sessions = t.sessions == 1 ? String(localized: "koa.tier.sessions.one") : String(localized: "koa.tier.sessions.other \(t.sessions)")
    return String(localized: "koa.tier.next \(t.remaining) \(nextName(t, lang: lang)) \(sessions)")
  }

  static func color(_ t: KoaGains.Tier) -> Color {
    Color.rank(MascotRules.ranks[min(t.rank, MascotRules.ranks.count - 1)])
  }
}

/// Vạch bậc của hạng đang đứng: mỗi bậc một vạch, bậc đã đạt tô màu hạng. Hạng không chia bậc và
/// hạng cuối (không giới hạn) không có vạch. Chỉ để nhìn: chữ bên cạnh đã nói tên bậc.
struct KoaTierPips: View {
  let tier: KoaGains.Tier
  /// Vạch vừa đạt toả một vòng sáng rồi tắt, một lần (màn tổng kết buổi lúc lên bậc). Vạch luôn
  /// đầy màu từ đầu: hiệu ứng không chạy (Giảm chuyển động, ảnh tĩnh) thì vẫn đọc đúng bậc.
  var highlightNewest = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var pulsed = false

  var body: some View {
    if let count = tier.count, count > 1 {
      let tint = KoaTierText.color(tier)
      HStack(spacing: 3) {
        ForEach(1...count, id: \.self) { i in
          Capsule()
            .fill(i <= tier.tier ? tint : DS.Color.mutedForeground.swiftUI.opacity(0.28))
            .frame(width: 12, height: 5)
            .overlay {
              if highlightNewest, i == tier.tier, !reduceMotion {
                Capsule()
                  .stroke(tint, lineWidth: 1.5)
                  .scaleEffect(pulsed ? 2.2 : 1)
                  .opacity(pulsed ? 0 : 0.9)
              }
            }
        }
      }
      .onAppear {
        guard highlightNewest, !reduceMotion else { return }
        withAnimation(DSMotion.animation(.easeOut(duration: 0.9).delay(0.4), reduceMotion: reduceMotion)) { pulsed = true }
      }
      .accessibilityHidden(true)
    }
  }
}

/// Thanh tiến độ trong bậc đang đứng: rãnh lõm, phần đã có tô màu hạng (không hoà vào thẻ).
struct KoaTierBar: View {
  let tier: KoaGains.Tier

  var body: some View {
    GeometryReader { g in
      ZStack(alignment: .leading) {
        Capsule().fill(DS.Color.mutedForeground.swiftUI.opacity(0.2))
        Capsule()
          .fill(KoaTierText.color(tier))
          .frame(width: max(5, g.size.width * min(1, max(0, tier.progress))))
      }
    }
    .frame(height: 5)
    .accessibilityHidden(true)
  }
}
