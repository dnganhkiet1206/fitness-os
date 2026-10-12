import ASCNDDesignSystem
import SwiftUI

/// Tấm giải thích mục tiêu calo (#527) — `nutrition-explainer.tsx` @ fac9ac2,
/// mở từ nút "?" của thẻ calo trên tab Dinh dưỡng.
///
/// Bốn mục như RN: mục tiêu calo đến từ đâu; vì sao tập xong số này KHÔNG tăng;
/// nếu mức vận động chọn sai thì sửa nó chứ không cộng bù; bốn ô macro.
///
/// Khác RN: mục thứ ba không chỉ tới "Hiệu chỉnh mục tiêu trong tab Tiến độ" —
/// màn ấy ở native không nằm chỗ đó, và một lời chỉ đường sai là một câu sai.
struct NutritionExplainerSheet: View {
  @Environment(\.dismiss) private var dismiss

  private var rows: [(String, String)] {
    [
      (String(localized: "nx.target.term"), String(localized: "nx.target.body")),
      (String(localized: "nx.training.term"), String(localized: "nx.training.body")),
      (String(localized: "nx.wrong.term"), String(localized: "nx.wrong.body")),
      (String(localized: "nx.macros.term"), String(localized: "nx.macros.body")),
    ]
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.lg) {
          Text(String(localized: "nx.lede")).font(DS.TextStyle.body)
          ForEach(rows, id: \.0) { term, text in
            VStack(alignment: .leading, spacing: 6) {
              Text(verbatim: term).font(DS.TextStyle.footnote.weight(.semibold))
              Text(verbatim: text)
                .font(DS.TextStyle.footnote.weight(.regular))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
          }
        }
        .padding(DS.Spacing.md)
      }
      .navigationTitle(String(localized: "nc.seg.today"))
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "eg.close")) { dismiss() }
        }
      }
    }
  }
}
