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
/// - lời nhắc "?" (`help-nudge.ts` + `useHelpTopic`, #527): khi thẻ có điểm,
///   tối đa một lần mỗi lần chạy app, ba lần suốt đời, không bao giờ nữa khi
///   đã mở giải thích (`HelpNudge`); nằm trong phần mở, chạm dải = mở giải
///   thích, X = chỉ ẩn (lần hiện đã được đếm).
///
/// Khác RN / chưa có: vòng không chạy hoạt ảnh khi bật Giảm chuyển động. Màu ô ACWR đọc CÙNG bảng vùng với
/// thẻ tập luyện.
struct ReadinessCardView: View {
  let book: ReadinessBook
  let lang: AppPreferences.Lang
  /// Đường đi sâu sang màn sinh trắc học — Today (B) quyết định đẩy màn nào.
  var onOpenBiometrics: (() -> Void)? = nil
  /// Mở sẵn phần chi tiết — khi thẻ là màn chi tiết của dòng sẵn sàng trên Today.
  var startExpanded = false

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var expanded = false
  @State private var helpOpen = false
  @State private var nudge = false
  @State private var taps = 0

  /// Kho đếm lời nhắc (`ascnd-help-nudge`), theo người.
  static let nudges = HelpNudge(store: UserDefaultsStore())

  /// Trang hero của Today (`ReadinessGauge` / `EmptyHero` trong `HeroPanel`):
  /// không có nền thẻ — nằm thẳng trên trang; đệm trên 24, dưới 8, ngang 20.
  var body: some View {
    Group {
      switch book.phase {
      case .loading:
        ProgressView()
          .frame(maxWidth: .infinity, minHeight: Self.ring)
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
        empty
      case .ready(let day):
        ready(day)
      }
    }
    .padding(.top, DS.Spacing.lg)
    .padding(.bottom, DS.Spacing.sm)
    .padding(.horizontal, DS.Spacing.card)
    .sheet(isPresented: $helpOpen) { ReadinessExplainerSheet() }
    .onAppear { if startExpanded { expanded = true } }
    .sensoryFeedback(.selection, trigger: taps)
    // `useHelpTopic` chạy khi thẻ sẵn sàng DỰNG — RN chỉ dựng nó khi có điểm.
    .task(id: hasScore) {
      guard hasScore, !nudge, Self.nudges.shouldNudge(HelpNudge.readiness, userId: book.userId) else { return }
      nudge = true
      Self.nudges.noteNudged(HelpNudge.readiness, userId: book.userId)
    }
  }

  /// `HERO_RING` của RN: vòng 264 điểm, nét ≈ 13 (r 52 / nét 6 trong hộp 120).
  static let ring: CGFloat = 264
  static let stroke: CGFloat = 13.2

  /// Nhãn trên vòng: chữ hoa 12, giãn chữ, mờ.
  private func eyebrow(_ text: String, tracking: CGFloat) -> some View {
    Text(text)
      .font(.system(size: 12, weight: .semibold))
      .textCase(.uppercase)
      .tracking(tracking)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  /// Nút mũi tên mở / đóng phần chi tiết (xoay 180° khi mở).
  private func chevron(expanded: Bool) -> some View {
    Image(systemName: "chevron.down")
      .font(.system(size: 17, weight: .semibold))
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .rotationEffect(.degrees(expanded ? 180 : 0))
  }

  private func toggle() {
    withAnimation(DSMotion.animation(.easeInOut(duration: 0.24), reduceMotion: reduceMotion)) { expanded.toggle() }
  }

  // MARK: - Chưa có điểm (`EmptyHero`)

  /// Vòng chỉ có rãnh, giữa là trái tim và "—" (không bao giờ "0": chưa đo
  /// được không phải điểm tệ nhất); mũi tên mở câu giải thích.
  private var empty: some View {
    VStack(spacing: DS.Spacing.md) {
      eyebrow(String(localized: "rd.empty.title"), tracking: 1.6)
      ZStack {
        Circle().stroke(DS.Color.ringTrack.swiftUI, lineWidth: Self.stroke)
        VStack(spacing: DS.Spacing.sm) {
          Image(systemName: "heart")
            .font(.system(size: 20))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Text(verbatim: "—")
            .font(.system(size: 28, weight: .bold))
            .tracking(-0.4)
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
      }
      .frame(width: Self.ring - Self.stroke, height: Self.ring - Self.stroke)
      .accessibilityHidden(true)
      Button(action: toggle) {
        chevron(expanded: expanded)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "today.hero.details \(String(localized: "rd.empty.title"))")))
      .accessibilityValue(Text(Self.hint(expanded: expanded)))
      if expanded {
        VStack(spacing: DS.Spacing.sm) {
          Text(String(localized: "rd.empty.message"))
            .font(DS.TextStyle.footnote)
            .lineSpacing(3)
            .multilineTextAlignment(.center)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          if let onOpenBiometrics { detailRow(String(localized: "rd.biometrics.open"), action: onOpenBiometrics) }
        }
      }
    }
    .frame(maxWidth: .infinity)
  }

  /// Hàng dẫn sâu trong phần chi tiết (`detailRow`: nền mực 4,5%, bo 12).
  private func detailRow(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack {
        Text(title).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.foreground.swiftUI)
        Spacer()
        Image(systemName: "chevron.right")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(.horizontal, DS.Spacing.sm)
      .frame(minHeight: 44)
      .background(DS.Color.foreground.swiftUI.opacity(0.045), in: RoundedRectangle(cornerRadius: 12))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(.isLink)
  }

  private var hasScore: Bool {
    if case .ready = book.phase { return true }
    return false
  }

  /// `openHelp`: tắt lời nhắc, mở giải thích, chủ đề này xong.
  private func openHelp() {
    taps += 1
    nudge = false
    helpOpen = true
    Self.nudges.noteHelpOpened(HelpNudge.readiness, userId: book.userId)
  }

  // MARK: - Có điểm

  /// `ReadinessGauge`: chấm trạng thái + "ĐIỂM SẴN SÀNG", vòng 264 tô theo vùng
  /// (dải màu đậm → màu vùng), điểm 60 Menlo đậm + nhãn vùng, nút "Chạm để
  /// xem chi tiết" có mũi tên.
  private func ready(_ day: ReadinessCard.Day) -> some View {
    let score = day.score ?? 0
    // Chỉ có tải tập, chưa có HRV / RHR / giấc ngủ → như Hôm nay: chưa chấm
    // (`AssistantSummary.provisional`). 19/10: màn này hiện "80 · Sẵn sàng tập"
    // trong khi Hôm nay nói "Chưa đủ dữ liệu để chấm".
    let hasRecovery = ReadinessCopyStore.copy.map { ReadinessCard.hasRecoverySignal(day.explain, copy: $0) } ?? true
    let provisional = AssistantSummary.provisional(score: day.score, hasRecovery: hasRecovery)
    let color = provisional ? DS.Color.mutedForeground.swiftUI : Self.statusColor(day.status)
    return VStack(spacing: DS.Spacing.md) {
      Button(action: toggle) {
        VStack(spacing: DS.Spacing.md) {
          HStack(spacing: DS.Spacing.sm) {
            Circle().fill(provisional ? DS.Color.ringTrack.swiftUI : Self.statusGraphic(day.status)).frame(width: 10, height: 10)
            eyebrow(String(localized: "rd.title"), tracking: 2.4)
          }
          ZStack {
            Circle().stroke(DS.Color.ringTrack.swiftUI, lineWidth: Self.stroke)
            Circle()
              .trim(from: 0, to: provisional ? 0 : min(max(Double(score) / 100, 0), 1))
              .stroke(
                LinearGradient(colors: [Self.statusDeep(day.status), color], startPoint: .topLeading, endPoint: .bottomTrailing),
                style: StrokeStyle(lineWidth: Self.stroke, lineCap: .round)
              )
              .rotationEffect(.degrees(-90))
            VStack(spacing: 6) {
              Text(verbatim: provisional ? "—" : "\(score)")
                .font(DS.TextStyle.number(60).weight(.bold).monospacedDigit())
                .foregroundStyle(provisional ? DS.Color.foreground.swiftUI : color)
                .dynamicTypeSize(...DynamicTypeSize.xxLarge)
              if provisional {
                Text(String(localized: "rd.provisional.title"))
                  .font(.system(size: 13, weight: .semibold))
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                Text(String(localized: "rd.provisional.reason"))
                  .font(.system(size: 12))
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  .multilineTextAlignment(.center)
                  .padding(.horizontal, 36)
              } else {
                Text(Self.statusLabel(day.status))
                  .font(.system(size: 12, weight: .bold))
                  .tracking(2.4)
                  .foregroundStyle(color)
              }
            }
          }
          .frame(width: Self.ring - Self.stroke, height: Self.ring - Self.stroke)
          HStack(spacing: 6) {
            Text(Self.hint(expanded: expanded))
              .font(.system(size: 12))
              .tracking(0.2)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            chevron(expanded: expanded)
          }
          .frame(maxWidth: .infinity, minHeight: 44)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(provisional
        ? String(localized: "rd.provisional.title")
        : String(localized: "rd.a11y \(score) \(Self.statusLabel(day.status))")))
      .accessibilityHint(Text(Self.hint(expanded: expanded)))
      .accessibilityAddTraits(.isButton)

      if expanded { details(day, color: color, provisional: provisional) }
    }
  }

  private func details(_ day: ReadinessCard.Day, color: Color, provisional: Bool = false) -> some View {
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
          openHelp()
        } label: {
          Image(systemName: "questionmark.circle")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "rd.help.a11y")))
      }
      if nudge { nudgeRow }
      // Căn đầu dòng: một ô có chú thích hai dòng ("chưa ghi đêm qua") không
      // còn đẩy ô ấy lệch lên so với các ô khác.
      HStack(alignment: .top, spacing: DS.Spacing.xs) {
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
      // Chưa chấm thì không khuyên cách tập (19/10: "Tập theo kế hoạch — đẩy top
      // set…" ngay dưới "Chưa đủ dữ liệu để chấm"), và không cần bảng màu điểm.
      if !reco.isEmpty, !provisional {
        Text(verbatim: reco)
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(color)
          .padding(DS.Spacing.sm)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: DS.Radius.sm))
      }
      if !provisional { legend }
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

  /// `HelpNudge` của RN: dải chạm-để-mở và nút X là hai nút CẠNH nhau (nút
  /// trong nút thì VoiceOver không thấy X).
  private var nudgeRow: some View {
    HStack(spacing: DS.Spacing.sm) {
      Button {
        openHelp()
      } label: {
        HStack(spacing: DS.Spacing.sm) {
          Image(systemName: "questionmark.circle")
            .font(.caption)
            .foregroundStyle(DS.Color.metricBlue.swiftUI)
            .accessibilityHidden(true)
          Text(String(localized: "rd.nudge.text"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      Button {
        // Ẩn không phải là đọc: lần hiện đã được đếm, mai có thể quay lại.
        taps += 1
        nudge = false
      } label: {
        Image(systemName: "xmark")
          .font(.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "rd.nudge.dismiss")))
    }
    .padding(.horizontal, DS.Spacing.sm)
    .background(DS.Color.metricBlue.swiftUI.opacity(0.10), in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .overlay(
      RoundedRectangle(cornerRadius: DS.Radius.md).strokeBorder(DS.Color.metricBlue.swiftUI.opacity(0.25), lineWidth: 0.5))
  }

  private func tile(_ t: ReadinessCard.Tile) -> some View {
    VStack(spacing: 2) {
      Text(verbatim: Self.tileLabel(t.kind))
        .font(DS.TextStyle.caption.weight(.semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
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

  /// Màu đồ hoạ của chấm (vàng dùng `readinessYellowGraphic` như RN).
  static func statusGraphic(_ s: ReadinessResult.Status) -> Color {
    s == .yellow ? DS.Color.readinessYellowGraphic.swiftUI : statusColor(s)
  }

  /// Đầu dải màu của cung (`ZONE_DEEP` của RN, bản sáng).
  static func statusDeep(_ s: ReadinessResult.Status) -> Color {
    switch s {
    case .green: Color(hex: "#006e48")
    case .yellow: Color(hex: "#725e00")
    case .red: Color(hex: "#c30039")
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

  /// Nhãn ô. HRV / RHR / ACWR là viết tắt kỹ thuật (giữ nguyên); "SLEEP" /
  /// "LOAD" của RN là chữ tiếng Anh thường — dịch theo ngôn ngữ (19/10).
  static func tileLabel(_ k: ReadinessCard.Tile.Kind) -> String {
    switch k {
    case .hrv: "HRV"
    case .rhr: "RHR"
    case .sleep: String(localized: "rd.tile.sleep")
    case .load: String(localized: "rd.tile.load")
    case .acwr: "ACWR"
    }
  }

  static func tileValue(_ t: ReadinessCard.Tile) -> String {
    if let v = t.subscore { return String(v) }
    if let a = t.acwr { return Units.display(a, locale: .app) }
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
