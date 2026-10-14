import ASCNDCore
import ASCNDDesignSystem
import AVKit
import SwiftUI

/// Hướng dẫn bài tập (#527 Phase 2) — sheet `app/exercise-guide.tsx` @
/// fac9ac2, trên `ExerciseGuideBook` (#440: id → tên → không có; nội dung theo
/// tiếng, es đọc en; media một kiểu một bộ). Màn không biết gì về cơ sở dữ
/// liệu: nhãn, nội dung, media đều đến từ lõi đã chọn sẵn.
///
/// RN behavior (giữ nguyên):
/// - tên bài + MỘT dòng "Nhóm cơ · Dụng cụ" (nhãn đầy đủ ở VoiceOver);
/// - (RN: ba tab Tổng quan / Cơ & dụng cụ / Liên quan — native 14/10 gộp
///   thành MỘT trang, xem "Khác RN");
/// - Tổng quan: các bước có hình (chỉ tấm CÓ chú thích), "Cách thực hiện" có
///   số, kẻ ngang khi có hai khối, "Điểm kỹ thuật" ✓ / "Lỗi thường gặp" ✕ (hai
///   cột khi đủ chỗ và chữ chưa phóng to), "chưa có hướng dẫn" chỉ khi không
///   có cả chữ lẫn media;
/// - Cơ & dụng cụ: từng nhóm cơ; dụng cụ (hình chỉ cho tạ đơn); câu riêng khi
///   chưa ghi;
/// - Liên quan: bài cùng nhóm cơ (chung nhiều trước), bài cùng dụng cụ; thư
///   viện chỉ được đọc khi mở tab này; đọc hỏng ≠ không có;
/// - nút "Bắt đầu bài tập" ở đáy và ✕ cùng làm một việc: đóng sheet.
///
/// Khác RN có chủ đích:
/// - thiết kế lại 14/10 (chủ dự án: "chưa đẹp, hơi phức tạp"): một trang cuộn
///   không tab — ảnh / video lớn, tên + nhãn (nhóm cơ, dụng cụ, cơ phụ), "Cách
///   làm" là chuỗi bước nối nhau (ảnh có chú thích nằm trong bước), "Nên" /
///   "Tránh" hai ô màu, "Bài tương tự" một hàng thẻ trượt; nút đáy "Đã hiểu"
///   (RN ghi "Bắt đầu bài tập" mà chỉ đóng sheet);
/// - không có ảnh demo `DEMO_HERO` (RN tự ghi là tạm thời, "phải gỡ"): không
///   có media thì không dựng khung hình;
/// - chưa có hình giải phẫu `MuscleArt` (cùng chỗ thiếu với builder): ô nhóm
///   cơ là nhãn;
/// - bản đã đọc (theo người, bài, ngôn ngữ) hiện ngay kể cả offline; lỗi làm
///   mới chỉ chiếm màn khi chưa có bản nào.
struct ExerciseGuideView: View {
  let guides: ExerciseGuideBook
  /// Cho "Bài tương tự"; `nil` thì mục ấy nói "không tải được".
  let library: ExerciseLibrary?
  let exerciseId: String?
  let name: String

  @Environment(\.dismiss) private var dismiss
  @Environment(\.locale) private var locale
  @State private var page = 0
  @State private var viewer: ViewerTarget?

  private var lang: MuscleGroup.Language { MuscleGroup.Language(locale: locale) }
  private var title: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
  private var g: ExerciseGuide? { guides.guide }
  private var displayName: String { g?.name ?? title }
  /// RN `showMedia = !isPending && !isError`: đã có một bản để vẽ.
  private var shown: Bool { g != nil }
  private var media: MediaState { g?.media ?? .none }
  private static var accent: Color { WorkoutsHomeView.accent }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.lg) {
          if shown, media.hasMedia {
            hero
          }
          header
          content
        }
        .padding(.horizontal, DS.Spacing.md)
        .padding(.bottom, DS.Spacing.lg)
      }
      .ascndPage()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark")
              .frame(minWidth: 44, minHeight: 44)
          }
          .accessibilityLabel(Text("eg.close"))
        }
      }
      .safeAreaInset(edge: .bottom) {
        if shown {
          Button {
            dismiss()
          } label: {
            Text(String(localized: "eg.gotIt"))
              .font(DS.TextStyle.headline)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .frame(maxWidth: .infinity, minHeight: 50)
              .background(.ultraThinMaterial, in: Capsule())
              .overlay(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12)))
          }
          .buttonStyle(TodayPressStyle())
          .padding(.horizontal, DS.Spacing.md)
          .padding(.bottom, DS.Spacing.sm)
        }
      }
      .fullScreenCover(item: $viewer) { target in
        GuideMediaViewer(media: media, name: displayName, start: target.index)
      }
    }
    .task(id: "\(exerciseId ?? "")|\(title)|\(lang.rawValue)") {
      await guides.open(exerciseId: exerciseId, name: title, lang: lang)
    }
    .task(id: shown) {
      // "Bài tương tự" nằm ngay trong trang — đọc thư viện khi đã có bài.
      if shown, let library, !library.loaded { await library.load() }
    }
  }

  // MARK: - Đầu trang

  /// Ảnh / video lớn, chạm mở trình xem đúng tấm; video có nút ▶ và thời lượng.
  private var hero: some View {
    TabView(selection: $page) {
      ForEach(Array(media.items.enumerated()), id: \.offset) { i, item in
        Button {
          viewer = ViewerTarget(index: i)
        } label: {
          MediaThumb(item: item, label: mediaA11y(item))
        }
        .buttonStyle(.plain)
        .accessibilityHint(Text("eg.openMedia"))
        .tag(i)
      }
    }
    .tabViewStyle(.page(indexDisplayMode: media.showsDots ? .always : .never))
    .frame(height: 260)
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
    .overlay(alignment: .bottomTrailing) {
      if let d = media.displayDuration {
        Text(verbatim: MediaState.clockLabel(d))
          .font(DS.TextStyle.caption.monospacedDigit())
          .padding(.horizontal, DS.Spacing.sm)
          .padding(.vertical, DS.Spacing.xs)
          .background(.ultraThinMaterial, in: Capsule())
          .padding(DS.Spacing.sm)
      }
    }
  }

  /// `mediaLabel` thắng `alt`, thắng câu dựng sẵn.
  private func mediaA11y(_ item: MediaItem) -> String {
    item.title.map { "\(displayName) — \($0)" } ?? item.alt ?? String(localized: "eg.mediaAlt \(displayName)")
  }

  /// Tên lớn + nhãn: nhóm cơ chính (màu Tập luyện), dụng cụ, cơ phụ.
  private var header: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      if !displayName.isEmpty {
        Text(verbatim: displayName)
          .font(DS.TextStyle.largeTitle)
          .accessibilityAddTraits(.isHeader)
      }
      let others = (g?.muscles ?? []).dropFirst().map(\.label)
      if g?.muscleGroup != nil || g?.equipment != nil || !others.isEmpty {
        GuideChipFlow {
          if let m = g?.muscleGroup {
            chip(m, symbol: "scope", tint: Self.accent, a11y: "\(String(localized: "eg.muscles")): \(m)")
          }
          if let e = g?.equipment {
            chip(e, symbol: "dumbbell", tint: DS.Color.mutedForeground.swiftUI, a11y: "\(String(localized: "eg.equipment")): \(e)")
          }
          if !others.isEmpty {
            let list = others.joined(separator: ", ")
            let text = String(localized: "eg.secondary \(list)")
            chip(text, symbol: nil, tint: DS.Color.mutedForeground.swiftUI, a11y: text)
          }
        }
      }
    }
  }

  private func chip(_ text: String, symbol: String?, tint: Color, a11y: String) -> some View {
    HStack(spacing: 4) {
      if let symbol { Image(systemName: symbol).font(.caption2.weight(.semibold)).accessibilityHidden(true) }
      Text(verbatim: text).font(DS.TextStyle.caption.weight(.semibold)).lineLimit(1)
    }
    .foregroundStyle(tint)
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(tint.opacity(0.12), in: Capsule())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: a11y))
  }

  // MARK: - Nội dung: một trang, không tab

  @ViewBuilder private var content: some View {
    if g == nil, guides.failure == nil {
      ProgressView().frame(maxWidth: .infinity, minHeight: 88)
    } else if g == nil {
      DSErrorView(message: String(localized: "eg.loadFailed")) {
        Task { await guides.open(exerciseId: exerciseId, name: title, lang: lang) }
      }
    } else if let g {
      if !g.hasContent, !g.media.hasMedia {
        VStack(alignment: .leading, spacing: DS.Spacing.xs) {
          Text("eg.empty").font(DS.TextStyle.body)
          Text("eg.empty.hint")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      steps(g)
      dosAndDonts(g)
      similar(g)
    }
  }

  /// Một bước của "Cách làm": chữ, và ảnh của bước ấy nếu có.
  private struct Step: Identifiable {
    let id: Int
    let title: String?
    let text: String
    let media: MediaItem?
  }

  /// Các bước: chữ hướng dẫn, kèm ảnh có chú thích theo cùng thứ tự; bộ ảnh
  /// có chú thích mà không có chữ thì chính chú thích là bước.
  private func stepList(_ g: ExerciseGuide) -> [Step] {
    let pics = g.media.captionedItems
    let count = max(g.instructions.count, pics.count)
    return (0..<count).map { i in
      let pic = i < pics.count ? pics[i] : nil
      let text = i < g.instructions.count ? g.instructions[i] : (pic?.description ?? "")
      return Step(id: i, title: pic?.title, text: text, media: pic)
    }
  }

  @ViewBuilder private func steps(_ g: ExerciseGuide) -> some View {
    let list = stepList(g)
    if !list.isEmpty {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        sectionTitle("eg.howTo")
        VStack(alignment: .leading, spacing: 0) {
          ForEach(list) { step in
            HStack(alignment: .top, spacing: DS.Spacing.md) {
              VStack(spacing: 4) {
                Text(verbatim: "\(step.id + 1)")
                  .font(DS.TextStyle.mono(.footnote).weight(.semibold))
                  .foregroundStyle(step.id == 0 ? .white : Self.accent)
                  .frame(width: 28, height: 28)
                  .background(step.id == 0 ? Self.accent : Self.accent.opacity(0.14), in: Circle())
                if step.id < list.count - 1 {
                  Rectangle()
                    .fill(DS.Color.foreground.swiftUI.opacity(0.12))
                    .frame(width: 1.5)
                    .frame(maxHeight: .infinity)
                }
              }
              .accessibilityHidden(true)
              HStack(alignment: .top, spacing: DS.Spacing.sm) {
                VStack(alignment: .leading, spacing: DS.Spacing.xs) {
                  if let t = step.title {
                    Text(verbatim: t).font(DS.TextStyle.headline)
                  }
                  if !step.text.isEmpty {
                    Text(verbatim: step.text)
                      .font(DS.TextStyle.body)
                      .foregroundStyle(step.title == nil ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
                      .fixedSize(horizontal: false, vertical: true)
                  }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                // Ảnh của bước: ảnh nhỏ cạnh chữ (ảnh lớn đã ở đầu trang);
                // chạm mở trình xem đúng tấm ấy.
                if let item = step.media {
                  Button {
                    viewer = ViewerTarget(index: media.items.firstIndex(of: item) ?? 0)
                  } label: {
                    MediaThumb(item: item, label: mediaA11y(item))
                      .frame(width: 76, height: 76)
                      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.md, style: .continuous))
                  }
                  .buttonStyle(.plain)
                  .accessibilityHint(Text("eg.openMedia"))
                }
              }
              .padding(.bottom, DS.Spacing.lg)
              .accessibilityElement(children: .combine)
              .accessibilityLabel(Text(String(localized: "eg.step \(step.id + 1)") + ". " + [step.title, step.text].compactMap { $0 }.joined(separator: ". ")))
            }
          }
        }
      }
    }
  }

  /// "Nên" (xanh, ✓) và "Tránh" (đỏ, ✕): dấu mang nghĩa, không chỉ ở màu
  /// (WCAG 1.4.1). Mỗi ô rộng hết hàng — hai cột lệch chiều cao khi một bên
  /// dài (thử trên simulator 14/10).
  @ViewBuilder private func dosAndDonts(_ g: ExerciseGuide) -> some View {
    if !g.formCues.isEmpty || !g.commonMistakes.isEmpty {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        if !g.formCues.isEmpty {
          tipBox("eg.do", g.formCues, symbol: "checkmark", tint: DS.Color.readinessGreen.swiftUI)
        }
        if !g.commonMistakes.isEmpty {
          tipBox("eg.avoid", g.commonMistakes, symbol: "xmark", tint: DS.Color.destructive.swiftUI)
        }
      }
    }
  }

  private func tipBox(_ titleKey: LocalizedStringKey, _ items: [String], symbol: String, tint: Color) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Label(titleKey, systemImage: symbol)
        .font(DS.TextStyle.footnote.weight(.bold))
        .foregroundStyle(tint)
        .accessibilityAddTraits(.isHeader)
      ForEach(Array(items.enumerated()), id: \.offset) { _, t in
        HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
          Circle().fill(tint).frame(width: 5, height: 5).accessibilityHidden(true)
          Text(verbatim: t)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
  }

  /// Bài tương tự: cùng nhóm cơ (chung nhiều trước), rồi cùng dụng cụ — một
  /// hàng thẻ trượt ngang. Đọc hỏng ≠ không có.
  @ViewBuilder private func similar(_ g: ExerciseGuide) -> some View {
    // RN đưa `guideLang` (es → en) cho nhãn nhóm cơ của bài liên quan.
    let relatedLang = MuscleGroup.Language(rawValue: GuideLang(lang).rawValue) ?? .en
    let subject = GuideRelated.Subject(g)
    let rows = library?.exercises ?? []
    let muscle = g.muscles.isEmpty ? [] : GuideRelated.sameMuscle(rows, subject, lang: relatedLang)
    let gear = g.equipment == nil ? [] : GuideRelated.sameEquipment(rows, subject, lang: relatedLang)
    var seen = Set<String>()
    let items = (muscle + gear).filter { seen.insert($0.id).inserted }
    if let library, !library.loaded, library.failure == nil {
      ProgressView().frame(maxWidth: .infinity, minHeight: 44)
    } else if library == nil || (rows.isEmpty && library?.failure != nil) {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        sectionTitle("eg.similar")
        hint("eg.loadFailed")
      }
    } else if !items.isEmpty {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        sectionTitle("eg.similar")
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: DS.Spacing.sm) {
            ForEach(items) { r in
              VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: r.name)
                  .font(DS.TextStyle.footnote.weight(.semibold))
                  .lineLimit(2)
                Text(verbatim: r.muscleLabel)
                  .font(DS.TextStyle.caption)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  .lineLimit(1)
              }
              .padding(DS.Spacing.sm)
              .frame(width: 140, height: 64, alignment: .topLeading)
              .todayCard(radius: DS.Radius.lg)
              .accessibilityElement(children: .combine)
            }
          }
          .padding(.vertical, 4)
        }
        .scrollClipDisabled()
      }
    }
  }

  private func sectionTitle(_ key: LocalizedStringKey) -> some View {
    Text(key)
      .font(DS.TextStyle.headline)
      .accessibilityAddTraits(.isHeader)
  }

  private func hint(_ key: LocalizedStringKey) -> some View {
    Text(key)
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }
}

/// Nhãn xuống dòng khi hết chỗ.
private struct GuideChipFlow: Layout {
  var spacing: CGFloat = 6

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, maxX: CGFloat = 0
    for v in subviews {
      let s = v.sizeThatFits(.unspecified)
      if x > 0, x + s.width > width { x = 0; y += line + spacing; line = 0 }
      x += s.width + spacing
      maxX = max(maxX, x - spacing)
      line = max(line, s.height)
    }
    return CGSize(width: min(maxX, width), height: y + line)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
    for v in subviews {
      let s = v.sizeThatFits(.unspecified)
      if x > bounds.minX, x + s.width > bounds.maxX { x = bounds.minX; y += line + spacing; line = 0 }
      v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
      x += s.width + spacing
      line = max(line, s.height)
    }
  }
}

private struct ViewerTarget: Identifiable {
  let index: Int
  var id: Int { index }
}

/// Một tấm media: ảnh, hay poster của video (video chạy ở trình xem).
private struct MediaThumb: View {
  let item: MediaItem
  let label: String

  var body: some View {
    let uri = item.kind == .video ? (item.posterUri ?? "") : item.uri
    ZStack {
      DS.Color.secondary.swiftUI
      if let url = URL(string: uri), !uri.isEmpty {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let image): image.resizable().scaledToFill()
          case .failure: Image(systemName: "photo").foregroundStyle(DS.Color.mutedForeground.swiftUI)
          default: ProgressView()
          }
        }
      }
      if item.kind == .video {
        Image(systemName: "play.circle.fill")
          .font(.system(size: 44))
          .foregroundStyle(.white, .black.opacity(0.4))
          .accessibilityHidden(true)
      }
    }
    .clipped()
    .accessibilityElement()
    .accessibilityLabel(Text(verbatim: label))
    .accessibilityAddTraits(.isImage)
  }
}

/// Trình xem toàn màn (`app/media-viewer.tsx`): bộ ảnh vuốt ngang, mở đúng
/// tấm đã chạm; video có điều khiển hệ thống. Không có media thì nói thẳng.
struct GuideMediaViewer: View {
  let media: MediaState
  let name: String
  let start: Int

  @Environment(\.dismiss) private var dismiss
  @State private var page = 0

  var body: some View {
    NavigationStack {
      Group {
        if media.items.isEmpty {
          Text("eg.noMedia").foregroundStyle(.white)
        } else if media.shape == .video, let v = media.items.first {
          if let url = URL(string: v.uri) {
            VideoPlayer(player: AVPlayer(url: url))
              .accessibilityLabel(Text(verbatim: label(v)))
          } else {
            Text("eg.mediaFailed").foregroundStyle(.white)
          }
        } else {
          TabView(selection: $page) {
            ForEach(Array(media.items.enumerated()), id: \.offset) { i, item in
              VStack(spacing: DS.Spacing.sm) {
                AsyncImage(url: URL(string: item.uri)) { phase in
                  switch phase {
                  case .success(let image): image.resizable().scaledToFit()
                  case .failure: Text("eg.mediaFailed").foregroundStyle(.white)
                  default: ProgressView().tint(.white)
                  }
                }
                .accessibilityLabel(Text(verbatim: label(item)))
                if let t = item.title {
                  Text(verbatim: t).font(DS.TextStyle.headline).foregroundStyle(.white)
                }
                if !item.description.isEmpty {
                  Text(verbatim: item.description).font(DS.TextStyle.body).foregroundStyle(.white.opacity(0.8))
                }
              }
              .padding(DS.Spacing.md)
              .tag(i)
            }
          }
          .tabViewStyle(.page(indexDisplayMode: media.showsDots ? .always : .never))
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.black)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark").foregroundStyle(.white)
          }
          .accessibilityLabel(Text("eg.close"))
        }
      }
    }
    .onAppear { page = min(max(start, 0), max(0, media.items.count - 1)) }
  }

  private func label(_ item: MediaItem) -> String {
    item.title.map { "\(name) — \($0)" } ?? item.alt ?? String(localized: "eg.mediaAlt \(name)")
  }
}
