import ASCNDCore
import Foundation

/// Một món trên kệ / tường của phòng Koa mà người xem chạm được (#792): chỗ, nhãn VoiceOver, câu Koa kể.
struct ShelfItem: Identifiable, Equatable {
  enum Place: Equatable {
    /// Cúp thứ mấy trên kệ (0 = kỷ lục mới nhất).
    case cup(Int)
    case frame(KoaShelf.FrameKind)
  }

  let id: String
  let place: Place
  /// Tên hành động VoiceOver của sân khấu.
  let label: String
  /// Câu Koa kể khi được chạm, có ngày và số thật.
  let line: String

  /// Cúp và khung của phòng: mốc của hành trình, số của kỷ lục đã tính lại. Không tính lại được
  /// số thì Koa vẫn kể ngày ấy là ngày kỷ lục, không đoán số.
  @MainActor
  static func items(
    moments: [KoaJourney.Moment], records: [LocalDate: PersonalRecord], unit: WeightUnit, lang: AppPreferences.Lang,
    locale: Locale
  ) -> [ShelfItem] {
    let cups = KoaShelf.cups(moments, records: records).enumerated().map { i, c in
      let day = date(c.date, locale)
      let what = c.record.map(RecordCelebrationView.line(unit: unit)) ?? String(localized: "journey.line.record")
      return ShelfItem(
        id: c.id, place: .cup(i), label: String(localized: "koa.shelf.cup.a11y \(day)"),
        line: String(localized: "koa.shelf.when \(day) \(what)"))
    }
    let frames = KoaShelf.frames(moments).map { f in
      let day = date(f.date, locale)
      let label: String
      let what: String
      switch f.kind {
      case .first:
        label = String(localized: "koa.shelf.frame.first")
        what = String(localized: "journey.line.first")
      case .week:
        label = String(localized: "koa.shelf.frame.week")
        what = String(localized: "journey.line.firstWeek")
      case .rank:
        label = String(localized: "koa.shelf.frame.rank")
        let rank = MascotRules.ranks[min(f.rank, MascotRules.ranks.count - 1)]
        what = String(localized: "journey.line.rank \(rank.name(lang))")
      }
      return ShelfItem(
        id: "frame:\(f.kind.rawValue)", place: .frame(f.kind), label: label,
        line: String(localized: "koa.shelf.when \(day) \(what)"))
    }
    return cups + frames
  }

  /// Phần vẽ của căn phòng: số cúp và các khung.
  static func display(_ items: [ShelfItem]) -> KoaShelf.Display {
    var d = KoaShelf.Display()
    for item in items {
      switch item.place {
      case .cup: d.cups += 1
      case .frame(let kind): d.frames.insert(kind)
      }
    }
    return d
  }

  /// "29 thg 10", "Oct 29": ngày ngắn theo ngôn ngữ app.
  private static func date(_ d: LocalDate, _ locale: Locale) -> String {
    let date = Calendar.current.date(from: DateComponents(year: d.year, month: d.month, day: d.day)) ?? .now
    return date.formatted(.dateTime.day().month(.abbreviated).locale(locale))
  }
}
