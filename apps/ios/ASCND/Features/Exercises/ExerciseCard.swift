import ASCNDCore
import ASCNDDesignSystem
import SwiftUI
import UIKit

/// Thẻ một bài tập (Kiệt duyệt mock A, 15/11 — `docs/design/exercise-library/card-mock-1511.jpg`):
/// ảnh poster 3D vuông bên trái (nhãn "3D" nhỏ) khi bài có bản 3D; bài chưa có
/// 3D thì KHÔNG có ảnh (Kiệt chọn), chữ chiếm hết chiều ngang. Dưới tên: nhóm cơ
/// chính (xám) + dụng cụ (màu Tập luyện). Dùng ở thư viện, chỗ chọn bài của
/// builder và hộp "Có phải bạn muốn…?".
///
/// Bài nào có 3D đi theo `ExerciseDemo3D` — hiện chỉ có ở bản Debug; bản Release
/// chưa có poster nên mọi thẻ là dạng chữ.
struct ExerciseCard<Accessory: View>: View {
  let exercise: LibraryExercise
  var lang: MuscleGroup.Language
  @ViewBuilder var accessory: () -> Accessory

  static var rose: Color { DS.Color.metricRose.swiftUI }
  static var thumbSide: CGFloat { 64 }

  var body: some View {
    let poster = ExercisePoster.image(for: exercise.name)
    HStack(spacing: DS.Spacing.sm) {
      if let poster {
        Self.thumbnail(poster)
      }
      VStack(alignment: .leading, spacing: 3) {
        // Tên tiếng Anh là tên chính; tên theo ngôn ngữ app nhỏ bên dưới (Kiệt 15/11).
        Text(verbatim: exercise.primaryName)
          .font(DS.TextStyle.body.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(2)
          .multilineTextAlignment(.leading)
        if let local = exercise.localSubtitle {
          Text(verbatim: local)
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
        let muscle = Self.muscle(exercise, lang)
        let gear = Self.gear(exercise, lang)
        if muscle != nil || gear != nil {
          HStack(spacing: 6) {
            if let muscle { Self.tag(muscle, tinted: false) }
            if let gear, gear != muscle { Self.tag(gear, tinted: true) }
          }
          .padding(.top, 2)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      accessory()
    }
    .frame(minHeight: poster == nil ? 48 : Self.thumbSide)
    .accessibilityElement(children: .combine)
    .accessibilityHint(poster != nil ? Text(String(localized: "ex.card.has3d")) : Text(verbatim: ""))
  }

  /// Nhóm cơ chính (khoá đầu tiên); không nhận ra thì chữ gốc.
  static func muscle(_ e: LibraryExercise, _ lang: MuscleGroup.Language) -> String? {
    if let first = e.muscles.first { return first.label(lang) }
    let raw = (e.muscleGroup ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return raw.isEmpty ? nil : raw
  }

  static func gear(_ e: LibraryExercise, _ lang: MuscleGroup.Language) -> String? {
    guard let raw = e.equipment, !raw.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
    let label = Equipment.label(raw, lang)
    return label.isEmpty ? nil : label
  }

  static func thumbnail(_ poster: UIImage) -> some View {
    ZStack(alignment: .bottomLeading) {
      // Poster 16:9, người ở giữa: cắt vuông rồi phóng nhẹ cho người đầy ô.
      Image(uiImage: poster)
        .resizable()
        .scaledToFill()
        .scaleEffect(1.3)
        .frame(width: thumbSide, height: thumbSide)
        .clipped()
      Text(verbatim: "3D")
        .font(.system(size: 9.5, weight: .heavy))
        .foregroundStyle(.white)
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(Color.black.opacity(0.72), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        .padding(4)
    }
    .frame(width: thumbSide, height: thumbSide)
    .background(Color(white: 0.92))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .accessibilityHidden(true)
  }

  static func tag(_ text: String, tinted: Bool) -> some View {
    Text(verbatim: text)
      .font(DS.TextStyle.caption.weight(.semibold))
      .foregroundStyle(tinted ? rose : DS.Color.foreground.swiftUI.opacity(0.75))
      .lineLimit(1)
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(Capsule().fill(tinted ? rose.opacity(0.12) : DS.Color.secondary.swiftUI))
  }
}

extension ExerciseCard where Accessory == EmptyView {
  init(exercise: LibraryExercise, lang: MuscleGroup.Language) {
    self.init(exercise: exercise, lang: lang) { EmptyView() }
  }
}

/// Poster 3D của bài, đọc một lần rồi giữ (danh sách cuộn ~900 hàng).
@MainActor
enum ExercisePoster {
  private static var cache: [String: UIImage] = [:]
  private static var missing: Set<String> = []

  static func image(for name: String) -> UIImage? {
    #if DEBUG
      let key = PersonalRecords.exerciseKey(name)
      if let hit = cache[key] { return hit }
      if missing.contains(key) { return nil }
      guard let url = ExerciseDemo3D.posterURL(for: name), let img = UIImage(contentsOfFile: url.path) else {
        missing.insert(key)
        return nil
      }
      cache[key] = img
      return img
    #else
      return nil
    #endif
  }
}
