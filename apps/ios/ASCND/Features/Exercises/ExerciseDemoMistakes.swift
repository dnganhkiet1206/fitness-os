#if DEBUG
  import ASCNDDesignSystem
  import RealityKit
  import SwiftUI

  /// Clip lỗi sai thường gặp (C2, Kiệt 17/11): cùng nhân vật, cùng nhịp, chỉ khác chuyển động
  /// (`<bài>_mistake_<id>_motion.usdz` từ Motion Lab, `mistake_demo` trong `exercise.json`).
  /// Nút "Sai thường gặp" đổi chuyển động tại chỗ, thẻ dưới giải thích lỗi và cách sửa, vòng đỏ
  /// đánh dấu khớp làm sai và đi theo khớp khi động tác chạy.
  struct ExerciseMistake: Identifiable {
    let id: String
    /// File chuyển động sai (không đuôi), cùng khung xương với nhân vật dùng chung.
    let motionFile: String
    /// Khớp làm sai (tên ngắn trong khung xương), để vẽ vòng đỏ.
    let joints: [String]
    var titleKey: String { "eg.demo3d.mistake.\(id)" }
    var bodyKey: String { "eg.demo3d.mistake.\(id).body" }
    var fixKey: String { "eg.demo3d.mistake.\(id).fix" }
  }

  /// Các khối đang chạy của trình xem, để đổi giữa chuyển động đúng và sai mà không nạp lại cảnh.
  @MainActor final class DemoRig {
    weak var character: Entity?
    weak var apparel: Entity?
    /// "" = chuyển động đúng; còn lại theo `ExerciseMistake.id`.
    var motions: [String: Entity] = [:]

    /// Phát chuyển động `id` trên nhân vật, quần và file chuyển động tương ứng (dụng cụ đi theo);
    /// tắt các file chuyển động khác.
    func play(_ id: String, playback: DemoPlayback, speed: Float) {
      guard let character, let motion = motions[id], let animation = motion.availableAnimations.first else { return }
      for c in playback.controllers { c.stop() }
      for (key, entity) in motions { entity.isEnabled = key == id }
      playback.controllers = [character, motion, apparel].compactMap { $0?.playAnimation(animation.repeat()) }
      playback.duration = animation.definition.duration
      playback.setSpeed(speed)
    }
  }

  /// Vòng đỏ ở các khớp làm sai, chiếu theo máy quay mỗi khung.
  struct ExerciseMistakeMarkers: View {
    let points: [CGPoint]
    private let red = Color(red: 0.86, green: 0.18, blue: 0.16)

    var body: some View {
      Canvas { ctx, _ in
        for p in points {
          let outer = CGRect(x: p.x - 22, y: p.y - 22, width: 44, height: 44)
          ctx.fill(Path(ellipseIn: outer), with: .color(red.opacity(0.22)))
          ctx.stroke(Path(ellipseIn: outer), with: .color(red), lineWidth: 2.5)
          let dot = CGRect(x: p.x - 4, y: p.y - 4, width: 8, height: 8)
          ctx.fill(Path(ellipseIn: dot), with: .color(.white))
        }
      }
      .allowsHitTesting(false)
      .accessibilityHidden(true)
    }
  }

  /// Thẻ ở đáy khi đang xem clip sai: lỗi là gì, vì sao, cách sửa.
  struct ExerciseMistakeCard: View {
    let mistake: ExerciseMistake
    var onCorrect: () -> Void
    private let red = Color(red: 0.86, green: 0.18, blue: 0.16)

    var body: some View {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(spacing: 8) {
          Label("eg.demo3d.mistake.badge", systemImage: "exclamationmark.triangle.fill")
            .font(DS.TextStyle.caption.weight(.bold))
            .textCase(.uppercase)
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(red))
          Spacer()
        }
        Text(LocalizedStringKey(mistake.titleKey))
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text(LocalizedStringKey(mistake.bodyKey))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
        VStack(alignment: .leading, spacing: 4) {
          Label("eg.demo3d.mistake.fixLabel", systemImage: "checkmark")
            .font(DS.TextStyle.caption.weight(.bold))
            .textCase(.uppercase)
            .foregroundStyle(DS.Color.readinessGreen.swiftUI)
            .accessibilityAddTraits(.isHeader)
          Text(LocalizedStringKey(mistake.fixKey))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
        }
        Button(action: onCorrect) {
          Label("eg.demo3d.mistake.hide", systemImage: "arrow.uturn.backward")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.dsPillSecondary)
        Text("eg.demo3d.tip.unverified")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(DS.Spacing.md)
      .frame(maxWidth: .infinity, alignment: .leading)
      .todayCard()
      .accessibilityElement(children: .contain)
    }
  }
#endif
