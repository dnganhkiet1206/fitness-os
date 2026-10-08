import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Văn bản pháp lý — `lib/legal-content.ts` @ RN, chép nguyên bằng
/// `apps/ios/tools/legal-content/gen.mjs` vào `legal-content.json` (không chép
/// tay sang xcstrings: văn bản pháp lý chép tay là văn bản sẽ lệch).
struct LegalContent: Decodable {
  struct Block: Decodable, Hashable {
    let title: String
    let intro: String?
    let body: String?
    let bullets: [String]?
  }

  struct Doc: Decodable {
    let title: String
    let blocks: [Block]
  }

  let pageTitle: String
  let tabTerms: String
  let tabPrivacy: String
  let tabHealth: String
  let tabData: String
  let terms: Doc
  let privacy: Doc
  let health: Doc
  let data: Doc

  private struct File: Decodable {
    let vi: LegalContent
    let en: LegalContent
    let es: LegalContent
  }

  /// Bản theo ngôn ngữ của app; `nil` chỉ khi tệp đi kèm app hỏng (lỗi đóng gói).
  static func load(_ lang: AppPreferences.Lang) -> LegalContent? {
    guard let url = Bundle.main.url(forResource: "legal-content", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let file = try? JSONDecoder().decode(File.self, from: data)
    else { return nil }
    switch lang {
    case .vi: return file.vi
    case .en: return file.en
    case .es: return file.es
    }
  }
}

/// Ba tài liệu trong một sheet, mở ngay trong onboarding (`LegalSheet` của
/// `onboarding-flow.tsx`): màn 13 nói "bắt đầu tức là bạn đồng ý với…", nên
/// cả ba phải đọc được TRƯỚC khi đồng ý — màn Pháp lý của app nằm sau cổng.
struct LegalSheet: View {
  /// Đọc một lần khi mở sheet, không mỗi lần đổi tab.
  private let content: LegalContent?
  @Environment(\.dismiss) private var dismiss

  init(lang: AppPreferences.Lang) {
    content = LegalContent.load(lang)
  }

  var body: some View {
    NavigationStack {
      LegalDocumentView(content: content, tabs: [.terms, .privacy, .health])
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button {
              dismiss()
            } label: {
              Image(systemName: "xmark")
            }
            .accessibilityLabel(Text(String(localized: "onboarding.legal.close")))
          }
        }
    }
  }
}

/// Màn Pháp lý của app (`app/legal.tsx` @ fac9ac2), mở từ Cài đặt
/// (`settings.tsx:739`): đủ BỐN tab — Điều khoản, Riêng tư, Sức khoẻ, Dữ liệu.
struct LegalView: View {
  private let content: LegalContent?

  init(lang: AppPreferences.Lang) {
    content = LegalContent.load(lang)
  }

  var body: some View {
    LegalDocumentView(content: content, tabs: LegalDocumentView.Tab.allCases)
  }
}

/// Phần chung: bộ chọn tab + các khối của tài liệu đang chọn.
struct LegalDocumentView: View {
  enum Tab: Hashable, CaseIterable { case terms, privacy, health, data }

  let content: LegalContent?
  let tabs: [Tab]
  @State private var tab: Tab = .terms

  var body: some View {
    VStack(spacing: 0) {
      if let content {
        Picker(selection: $tab) {
          ForEach(tabs, id: \.self) { t in
            Text(verbatim: label(t, content)).tag(t)
          }
        } label: {
          Text(verbatim: label(tab, content))
        }
        .pickerStyle(.segmented)
        .padding(DS.Spacing.md)
        ScrollView {
          VStack(alignment: .leading, spacing: DS.Spacing.md) {
            ForEach(Array(doc(tab, content).blocks.enumerated()), id: \.offset) { i, b in
              // Khối đầu của Sức khoẻ là lời cảnh báo y tế: viền đỏ như RN `warnCard`.
              block(b, warning: tab == .health && i == 0)
            }
          }
          .padding(DS.Spacing.md)
        }
      }
    }
    .background(DS.Color.background.swiftUI)
    .navigationTitle(content.map { doc(tab, $0).title } ?? "")
    .navigationBarTitleDisplayMode(.inline)
  }

  private func label(_ t: Tab, _ c: LegalContent) -> String {
    switch t {
    case .terms: c.tabTerms
    case .privacy: c.tabPrivacy
    case .health: c.tabHealth
    case .data: c.tabData
    }
  }

  private func doc(_ t: Tab, _ c: LegalContent) -> LegalContent.Doc {
    switch t {
    case .terms: c.terms
    case .privacy: c.privacy
    case .health: c.health
    case .data: c.data
    }
  }

  /// Thứ tự của RN: tiêu đề, thân, lời dẫn, gạch đầu dòng.
  private func block(_ b: LegalContent.Block, warning: Bool) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      Text(b.title)
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      if let body = b.body {
        Text(body)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      if let intro = b.intro {
        Text(intro)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.foreground.swiftUI)
      }
      ForEach(Array((b.bullets ?? []).enumerated()), id: \.offset) { _, line in
        HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.xs) {
          Text(verbatim: "•").accessibilityHidden(true)
          Text(line)
        }
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.card.swiftUI)
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.md))
    .overlay {
      if warning {
        RoundedRectangle(cornerRadius: DS.Radius.md).stroke(DS.Color.readinessRed.swiftUI, lineWidth: 1)
      }
    }
  }
}
