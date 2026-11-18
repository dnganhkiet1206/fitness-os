#if DEBUG
  import ASCNDDesignSystem
  import SwiftUI
  import RealityKit
  import simd

  /// Mẹo kỹ thuật trong trình xem 3D (Kiệt 13/11): nút "Mẹo" ở góc phải bật các chấm có số trên
  /// đúng vùng cơ thể; chạm một chấm để đọc mẹo (từ 17/11, trước đó là ô chữ + đường chỉ).
  /// Từ 17/11 (B1) mẹo là dữ liệu: `app_demo.tips` trong `exercise.json` →
  /// `<bài>_demo.json` (`pipeline/export_app_demos.py`); chữ vẫn trong
  /// Localizable.xcstrings (`eg.demo3d.tip.<id>*`). Điểm neo bám theo một khớp
  /// (`joint` + `offset`, `pipeline/tip_anchors.py`) nên đường chỉ đi theo người
  /// khi động tác chạy; không có khớp = điểm cố định (dụng cụ đứng yên).
  /// Chuyển động vẫn UNVERIFIED nên mẹo cũng chỉ ở bản Debug.
  struct ExerciseTip: Identifiable {
    let id: String
    var titleKey: String { "eg.demo3d.tip.\(id)" }
    var bodyKey: String { "eg.demo3d.tip.\(id).body" }
    /// Chi tiết khi chạm nhãn: các bước, lý do, lỗi cần tránh (khoá i18n).
    var howKeys: [String] { ["eg.demo3d.tip.\(id).how1", "eg.demo3d.tip.\(id).how2"] }
    var whyKey: String { "eg.demo3d.tip.\(id).why" }
    var avoidKey: String { "eg.demo3d.tip.\(id).avoid" }
    /// Điểm trên bề mặt cơ thể ở khung đầu, mét, hệ Y-up.
    let anchor: SIMD3<Float>
    /// Khớp mà điểm neo đi theo (tên đầy đủ trong khung xương USD) + độ lệch tới da.
    var joint: String?
    var offset: SIMD3<Float>?
  }

  /// Vị trí khớp của nhân vật đang chạy (mỗi khung), để điểm neo mẹo đi theo cơ thể.
  @MainActor final class TipAnchors {
    weak var body: ModelEntity?
    private var parents: [Int?] = []
    private var lookup: [String: Int] = [:]

    func attach(_ body: ModelEntity) {
      self.body = body
      let names = body.jointNames
      var index: [String: Int] = [:]
      for (i, n) in names.enumerated() { index[n] = i }
      parents = names.map { n in
        guard let slash = n.lastIndex(of: "/") else { return nil }
        return index[String(n[..<slash])]
      }
      lookup = index
      for (i, n) in names.enumerated() where lookup[String(n.split(separator: "/").last ?? "")] == nil {
        lookup[String(n.split(separator: "/").last ?? "")] = i
      }
    }

    /// Điểm neo hiện tại: khớp (đang chuyển động) + độ lệch; không có khớp thì điểm cố định.
    func position(of tip: ExerciseTip) -> SIMD3<Float> {
      guard let body, let joint = tip.joint, let offset = tip.offset,
        let i = lookup[joint] ?? lookup[String(joint.split(separator: "/").last ?? "")]
      else { return tip.anchor }
      let local = body.jointTransforms
      guard i < local.count else { return tip.anchor }
      var m = matrix_identity_float4x4
      var j: Int? = i
      while let k = j, k < local.count {
        m = local[k].matrix * m
        j = k < parents.count ? parents[k] : nil
      }
      let world = body.transformMatrix(relativeTo: nil) * m
      return SIMD3(world.columns.3.x, world.columns.3.y, world.columns.3.z) + offset
    }
  }

  /// Máy quay lỗ kim giống hệt máy quay RealityKit của trình xem: chiếu một
  /// điểm 3D ra toạ độ màn hình (điểm), `nil` khi nằm sau máy quay.
  struct PinholeCamera {
    let position: SIMD3<Float>
    let target: SIMD3<Float>
    let verticalFOVDegrees: Float
    let size: CGSize

    func project(_ p: SIMD3<Float>) -> CGPoint? {
      let f = simd_normalize(target - position)
      let r = simd_normalize(simd_cross(f, [0, 1, 0]))
      let u = simd_cross(r, f)
      let d = p - position
      let z = simd_dot(d, f)
      guard z > 0.05 else { return nil }
      let tanV = tan(verticalFOVDegrees * .pi / 360)
      let aspect = Float(size.width / max(size.height, 1))
      let x = simd_dot(d, r) / (z * tanV * aspect)
      let y = simd_dot(d, u) / (z * tanV)
      return CGPoint(x: CGFloat((x + 1) / 2) * size.width, y: CGFloat((1 - y) / 2) * size.height)
    }
  }

  /// Chấm có số trên người, mỗi mẹo một chấm (Kiệt 17/11: "mỗi chấm đánh 1 số rồi người dùng
  /// nhấn vào là mẹo hiện lên"). Không còn nhãn chữ và dây nối trên mô hình: chạm chấm thì thẻ
  /// chi tiết (`ExerciseTipDetail`) hiện ở đáy màn, chấm đó sáng lên, các chấm khác mờ đi.
  /// Chấm đi theo khớp khi động tác chạy. Hai chấm quá gần nhau được đẩy nhẹ ra để không chồng.
  struct ExerciseTipsOverlay: View {
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    let tips: [ExerciseTip]
    let camera: PinholeCamera
    /// Vị trí 3D hiện tại của điểm neo (đi theo khớp khi động tác chạy).
    var anchorOf: (ExerciseTip) -> SIMD3<Float> = { $0.anchor }
    /// Mép trên vùng đặt chấm (dưới nút đóng / nút mẹo).
    let topLimit: CGFloat
    @Binding var selected: String?

    private let dot: CGFloat = 28
    private let accent = Color(red: 0.91, green: 0.33, blue: 0.17)

    private struct Placed: Identifiable {
      let tip: ExerciseTip
      let number: Int
      var point: CGPoint
      var id: String { tip.id }
    }

    /// Chiếu điểm neo ra màn hình rồi đẩy các chấm chồng nhau ra xa (vài vòng thả lỏng).
    private func layout() -> [Placed] {
      var items: [Placed] = tips.enumerated().compactMap { n, tip in
        guard let a = camera.project(anchorOf(tip)) else { return nil }
        return Placed(tip: tip, number: n + 1, point: a)
      }
      let gap = dot + 4
      for _ in 0..<6 {
        for i in items.indices {
          for j in items.indices where j > i {
            let dx = items[j].point.x - items[i].point.x
            let dy = items[j].point.y - items[i].point.y
            let d = max(hypot(dx, dy), 0.01)
            guard d < gap else { continue }
            let push = (gap - d) / 2
            let ux = d < 0.1 ? 1 : dx / d
            let uy = d < 0.1 ? 0 : dy / d
            items[i].point.x -= ux * push
            items[i].point.y -= uy * push
            items[j].point.x += ux * push
            items[j].point.y += uy * push
          }
        }
      }
      let r = dot / 2 + 4
      for i in items.indices {
        items[i].point.x = min(max(items[i].point.x, r), camera.size.width - r)
        items[i].point.y = max(items[i].point.y, topLimit + r)
      }
      return items
    }

    var body: some View {
      ZStack(alignment: .topLeading) {
        ForEach(layout()) { p in
          badge(p).position(p.point)
        }
      }
      .frame(width: camera.size.width, height: camera.size.height)
    }

    private func badge(_ p: Placed) -> some View {
      let on = selected == p.id
      let dimmed = selected != nil && !on
      return Button {
        withAnimation(reduceMotion ? nil : .spring(response: 0.38, dampingFraction: 0.86)) { selected = on ? nil : p.id }
      } label: {
        Text(verbatim: "\(p.number)")
          .font(DS.TextStyle.footnote.weight(.bold))
          .monospacedDigit()
          .foregroundStyle(.white)
          .frame(width: dot, height: dot)
          .background(Circle().fill(accent))
          .overlay(Circle().strokeBorder(.white, lineWidth: on ? 2.5 : 1.5))
          .background(Circle().fill(accent.opacity(on ? 0.35 : 0.22)).padding(on ? -9 : -5))
          .shadow(color: .black.opacity(0.35), radius: 4, y: 1)
          .scaleEffect(on ? 1.15 : 1)
          .opacity(dimmed ? 0.45 : 1)
          // Vùng chạm 44 pt quanh chấm 28 pt.
          .frame(width: 44, height: 44)
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(LocalizedStringKey(p.tip.titleKey)))
      .accessibilityHint(Text(LocalizedStringKey(p.tip.bodyKey)))
      .accessibilityAddTraits(on ? .isSelected : [])
    }
  }

  /// Thẻ chi tiết của một mẹo, đặt ở đáy màn thay thẻ "Cơ hoạt động" để
  /// nhân vật vẫn để trống.
  struct ExerciseTipDetail: View {
    let tip: ExerciseTip
    let number: Int
    var onClose: () -> Void

    private let accent = Color(red: 0.91, green: 0.33, blue: 0.17)

    var body: some View {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(spacing: 8) {
          Text(verbatim: "\(number)")
            .font(DS.TextStyle.caption.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 22, height: 22)
            .background(Circle().fill(accent))
          Text(LocalizedStringKey(tip.titleKey))
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Spacer()
          Button(action: onClose) {
            Image(systemName: "xmark")
              .font(.caption.weight(.bold))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .frame(width: 30, height: 30)
              .background(Circle().fill(.ultraThinMaterial))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("eg.close"))
        }
        section("eg.demo3d.tip.how", symbol: "checkmark", tint: DS.Color.readinessGreen.swiftUI) {
          ForEach(Array(tip.howKeys.enumerated()), id: \.offset) { n, key in
            HStack(alignment: .firstTextBaseline, spacing: 6) {
              Text(verbatim: "\(n + 1).")
                .font(DS.TextStyle.footnote.weight(.semibold))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              Text(LocalizedStringKey(key))
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        }
        section("eg.demo3d.tip.why", symbol: "lightbulb", tint: DS.Color.metricOrange.swiftUI) {
          Text(LocalizedStringKey(tip.whyKey))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
        }
        section("eg.avoid", symbol: "xmark", tint: DS.Color.destructive.swiftUI) {
          Text(LocalizedStringKey(tip.avoidKey))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
        }
        Text("eg.demo3d.tip.unverified")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(DS.Spacing.md)
      .frame(maxWidth: .infinity, alignment: .leading)
      .todayCard()
      .accessibilityElement(children: .contain)
    }

    private func section<Content: View>(_ key: LocalizedStringKey, symbol: String, tint: Color,
                                        @ViewBuilder content: () -> Content) -> some View {
      VStack(alignment: .leading, spacing: 4) {
        Label(key, systemImage: symbol)
          .font(DS.TextStyle.caption.weight(.bold))
          .textCase(.uppercase)
          .foregroundStyle(tint)
          .accessibilityAddTraits(.isHeader)
        content()
      }
    }
  }
#endif
