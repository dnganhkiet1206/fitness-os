import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ sẵn sàng (#527 Phase 4/9) — `readiness-gauge.tsx` @ fac9ac2 trên
/// `ReadinessBook`: đọc điểm / trạng thái / giải thích / lời khuyên / ACWR mà
/// engine (#552) đã ghi vào `daily_logs`, KHÔNG tính lại.
///
/// Như RN:
/// - đóng: vòng điểm + nhãn trạng thái (≥75 tập, ≥50 vừa phải, còn lại phục hồi);
///   chạm để mở;
/// - mở: năm ô theo thứ tự cố định (HRV, RHR, SLEEP, LOAD, ACWR) — ô thiếu nói
///   việc sẽ lấp nó; dòng giải thích (hai chiều thấp nhất); dòng độ tin cậy khi
///   chưa đủ ba chiều; viên lời khuyên; chú giải ba vùng;
/// - chưa có điểm: thẻ trống với `dashReadinessMsg`;
/// - đang tải / lỗi (có nút thử lại).
///
/// - mở: nút "?" mở tấm giải thích (`ReadinessExplainerSheet`); cuối phần chi
///   tiết là lối "Xem sinh trắc học" khi Today truyền `onOpenBiometrics`.
///
/// Khác RN / chưa có: lời nhắc "?" đếm ba lần (`help-nudge.ts`); vòng không
/// chạy hoạt ảnh khi bật Giảm chuyển động. Màu ô ACWR đọc CÙNG bảng vùng với
/// thẻ tập luyện.
struct ReadinessCardView: View {
  let book: ReadinessBook
  let lang: AppPreferences.Lang
  /// Đường đi sâu sang màn sinh trắc học — Today (B) quyết định đẩy màn nào.
  var onOpenBiometrics: (() -> Void)? = nil

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var expanded = false
  @State private var helpOpen = false

  var body: some View {
    DSCard {
      switch book.phase {
      case .loading:
        ProgressView()
          .frame(maxWidth: .infinity, minHeight: 120)
          .accessibilityLabel(Text(String(localized: "rd.loading")))
      case .failed:
        VStack(spacing: DS.Spacing.sm) {
          Text(String(localized: "async.error.generic")).font(DS.TextStyle.footnote)
          Button(String(localized: "common.retry")) { Task { await book.load() } }
            .buttonStyle(.bordered)
            .frame(minHeight: 44)
        }
        .frame(maxWidth: .infinity)
      case .empty:
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          Label(String(localized: "rd.empty.title"), systemImage: "heart")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.readinessYellow.swiftUI)
          Text(String(localized: "rd.empty.message"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
      case .ready(let day):
        ready(day)
      }
    }
    .sheet(isPresented: $helpOpen) { ReadinessExplainerSheet() }
  }

  // MARK: - Có điểm

  private func ready(_ day: ReadinessCard.Day) -> some View {
    let score = day.score ?? 0
    let color = Self.statusColor(day.status)
    return VStack(spacing: DS.Spacing.md) {
      Button {
        withAnimation(DSMotion.animation(.easeInOut(duration: 0.25), reduceMotion: reduceMotion)) { expanded.toggle() }
      } label: {
        VStack(spacing: DS.Spacing.sm) {
          Text(String(localized: "rd.title")).font(DS.TextStyle.headline)
          ZStack {
            Circle().stroke(DS.Color.ringTrack.swiftUI.opacity(0.4), lineWidth: 12)
            Circle()
              .trim(from: 0, to: min(max(Double(score) / 100, 0), 1))
              .stroke(color, style: StrokeStyle(lineWidth: 12, lineCap: .round))
              .rotationEffect(.degrees(-90))
            Text(verbatim: "\(score)").font(DS.TextStyle.hero.monospacedDigit())
          }
          .frame(width: 140, height: 140)
          Text(Self.statusLabel(day.status))
            .font(DS.TextStyle.caption.weight(.bold))
            .foregroundStyle(color)
          Text(Self.hint(expanded: expanded))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(String(localized: "rd.a11y \(score) \(Self.statusLabel(day.status))")))
      .accessibilityHint(Text(Self.hint(expanded: expanded)))
      .accessibilityAddTraits(.isButton)

      if expanded { details(day, color: color) }
    }
  }

  private func details(_ day: ReadinessCard.Day, color: Color) -> some View {
    let copy = ReadinessCopyStore.copy
    let subs = copy.map { ReadinessCard.subscores(day.explain, copy: $0) } ?? [:]
    let tiles = ReadinessCard.tiles(subscores: subs, acwr: day.acwr)
    let explain = copy.map { ReadinessCard.explainText(day.explain, lang: lang, copy: $0) } ?? ""
    let reco = copy.map { ReadinessCard.recoText(day.recommendation, lang: lang, copy: $0) } ?? ""
    let confidence = ReadinessCard.confidence(subscores: subs)
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      // Nút "?" chỉ ở phần mở: nó giải thích RHR / LOAD / ACWR, mà phần đóng
      // không có chữ nào trong ba chữ ấy.
      HStack {
        Spacer()
        Button {
          helpOpen = true
        } label: {
          Image(systemName: "questionmark.circle")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "rd.help.a11y")))
      }
      HStack(spacing: DS.Spacing.xs) {
        ForEach(tiles, id: \.kind) { tile($0) }
      }
      if !explain.isEmpty {
        Text(verbatim: explain).font(DS.TextStyle.footnote)
      }
      if let confidence, confidence.level != .high {
        Text(Self.confidenceText(confidence.measured, low: confidence.level == .low))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      if !reco.isEmpty {
        Text(verbatim: reco)
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(color)
          .padding(DS.Spacing.sm)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: DS.Radius.sm))
      }
      legend
      if let onOpenBiometrics {
        Button(action: onOpenBiometrics) {
          HStack {
            Text(String(localized: "rd.biometrics.open")).font(DS.TextStyle.footnote.weight(.semibold))
            Spacer()
            Image(systemName: "chevron.right")
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
          }
          .frame(minHeight: 44)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isLink)
      }
    }
  }

  private func tile(_ t: ReadinessCard.Tile) -> some View {
    VStack(spacing: 2) {
      Text(verbatim: Self.tileLabel(t.kind)).font(DS.TextStyle.caption.weight(.semibold))
      Text(verbatim: Self.tileValue(t))
        .font(DS.TextStyle.headline.monospacedDigit())
        .foregroundStyle(Self.toneColor(t.tone))
      Text(Self.tileUnit(t))
        .font(.caption2)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
        .lineLimit(2)
        .minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .combine)
  }

  private var legend: some View {
    VStack(alignment: .leading, spacing: 2) {
      legendRow(DS.Color.readinessGreen.swiftUI, "75–100", .green)
      legendRow(DS.Color.readinessYellowGraphic.swiftUI, "50–74", .yellow)
      legendRow(DS.Color.readinessRed.swiftUI, "0–49", .red)
    }
  }

  private func legendRow(_ color: Color, _ range: String, _ status: ReadinessResult.Status) -> some View {
    HStack(spacing: DS.Spacing.xs) {
      Circle().fill(color).frame(width: 8, height: 8).accessibilityHidden(true)
      Text(verbatim: "\(range) · \(Self.statusLabel(status))")
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  // MARK: - Chữ, màu

  /// "Chạm để xem chi tiết" / "Thu gọn".
  static func hint(expanded: Bool) -> String {
    expanded ? String(localized: "rd.hint.close") : String(localized: "rd.hint.open")
  }

  static func statusLabel(_ s: ReadinessResult.Status) -> String {
    switch s {
    case .green: String(localized: "rd.status.train")
    case .yellow: String(localized: "rd.status.moderate")
    case .red: String(localized: "rd.status.recover")
    }
  }

  static func statusColor(_ s: ReadinessResult.Status) -> Color {
    switch s {
    case .green: DS.Color.readinessGreen.swiftUI
    case .yellow: DS.Color.readinessYellow.swiftUI
    case .red: DS.Color.readinessRed.swiftUI
    }
  }

  static func toneColor(_ t: ReadinessCard.Tone) -> Color {
    switch t {
    case .green: DS.Color.readinessGreen.swiftUI
    case .yellow: DS.Color.readinessYellow.swiftUI
    case .red: DS.Color.readinessRed.swiftUI
    case .muted: DS.Color.mutedForeground.swiftUI
    }
  }

  /// Nhãn ô — viết tắt kỹ thuật như RN (HRV, RHR, SLEEP, LOAD, ACWR), không dịch.
  static func tileLabel(_ k: ReadinessCard.Tile.Kind) -> String {
    switch k {
    case .hrv: "HRV"
    case .rhr: "RHR"
    case .sleep: "SLEEP"
    case .load: "LOAD"
    case .acwr: "ACWR"
    }
  }

  static func tileValue(_ t: ReadinessCard.Tile) -> String {
    if let v = t.subscore { return String(v) }
    if let a = t.acwr { return Units.text(a) }
    return "—"
  }

  static func tileUnit(_ t: ReadinessCard.Tile) -> String {
    if t.subscore != nil { return "/100" }
    if t.acwr != nil { return String(localized: "rd.unit.ratio") }
    switch t.need {
    case .readings: return String(localized: "rd.need.readings")
    case .night: return String(localized: "rd.need.night")
    case .session, nil: return String(localized: "rd.need.session")
    }
  }

  static func confidenceText(_ measured: Int, low: Bool) -> String {
    let base =
      measured == 1
      ? String(localized: "rd.confidence.one") : String(localized: "rd.confidence.other \(measured)")
    return low ? "\(base)\(String(localized: "rd.confidence.lowSuffix"))" : base
  }
}

/// Câu chữ của thẻ (`readiness-copy.json`, chép máy từ `readiness-i18n.ts`):
/// đọc một lần. `nil` chỉ khi tệp đi kèm app hỏng — khi ấy thẻ không hiện dòng
/// giải thích / lời khuyên, chứ không bịa.
enum ReadinessCopyStore {
  static let copy: ReadinessCard.Copy? = {
    guard let url = Bundle.main.url(forResource: "readiness-copy", withExtension: "json"),
      let data = try? Data(contentsOf: url)
    else { return nil }
    return try? JSONDecoder().decode(ReadinessCard.Copy.self, from: data)
  }()
}
