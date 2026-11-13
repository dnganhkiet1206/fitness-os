#if DEBUG
  import ASCNDDesignSystem
  import SwiftUI
  import simd

  /// Mẹo kỹ thuật trong trình xem 3D (Kiệt 13/11): nút "Mẹo" ở góc phải bật
  /// các ô chữ, mỗi ô có đường chỉ tới đúng vùng cơ thể trên mô hình. Điểm
  /// neo là toạ độ 3D (hệ Y-up của USDZ) ở vùng không chuyển động trong lần
  /// đẩy; mỗi khung hình được chiếu lại theo máy quay hiện tại, nên quay
  /// hướng nào đường chỉ cũng bám đúng chỗ. Ô chữ dạt về mép màn gần điểm neo.
  /// Nội dung lấy từ các cue của `bench-press/exercise.json`; chuyển động vẫn
  /// UNVERIFIED nên mẹo cũng chỉ ở bản Debug.
  struct ExerciseTip: Identifiable {
    let id: String
    let titleKey: String
    let bodyKey: String
    /// Chi tiết khi chạm nhãn: các bước, lý do, lỗi cần tránh (khoá i18n).
    var howKeys: [String] { ["eg.demo3d.tip.\(id).how1", "eg.demo3d.tip.\(id).how2"] }
    var whyKey: String { "eg.demo3d.tip.\(id).why" }
    var avoidKey: String { "eg.demo3d.tip.\(id).avoid" }
    /// Điểm trên bề mặt cơ thể, mét, hệ Y-up (khớp `bench_press_animation.usdz`).
    let anchor: SIMD3<Float>
  }

  enum ExerciseTips {
    /// Toạ độ đo từ khớp xương của tư thế nằm ghế
    /// (`bench-press/motion_metadata.json` / bản lấy mẫu kiểm định), đẩy ra
    /// bề mặt da: vai trái, bụng, điểm thanh chạm ngực, bàn chân trái.
    static let benchPress: [ExerciseTip] = [
      ExerciseTip(id: "shoulders", titleKey: "eg.demo3d.tip.shoulders", bodyKey: "eg.demo3d.tip.shoulders.body",
                  anchor: [0.24, 0.62, -0.10]),
      ExerciseTip(id: "core", titleKey: "eg.demo3d.tip.core", bodyKey: "eg.demo3d.tip.core.body",
                  anchor: [0.0, 0.66, 0.27]),
      ExerciseTip(id: "chest", titleKey: "eg.demo3d.tip.chest", bodyKey: "eg.demo3d.tip.chest.body",
                  anchor: [0.0, 0.69, 0.03]),
      ExerciseTip(id: "feet", titleKey: "eg.demo3d.tip.feet", bodyKey: "eg.demo3d.tip.feet.body",
                  anchor: [0.30, 0.04, 0.80]),
    ]

    static func tips(for exerciseKey: String) -> [ExerciseTip] {
      ["bench press", "barbell bench press", "barbell bench press - medium grip"].contains(exerciseKey) ? benchPress : []
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

  /// Nhãn + đường chỉ của mọi mẹo, vẽ trên cả màn hình. Nhãn (số + tên) xếp
  /// hai hàng ở vùng phía trên mô hình, trượt ngang theo điểm neo khi máy
  /// quay xoay, nên đường chỉ thả xuống luôn ngắn gọn và rõ. Chạm nhãn để
  /// xem câu giải thích.
  struct ExerciseTipsOverlay: View {
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    let tips: [ExerciseTip]
    let camera: PinholeCamera
    /// Mép trên của hàng nhãn đầu (dưới nút đóng / nút mẹo).
    let topLimit: CGFloat
    @Binding var selected: String?

    private let pillHeight: CGFloat = 34
    private let rowGap: CGFloat = 10
    private let margin: CGFloat = 12
    private let accent = Color(red: 0.91, green: 0.33, blue: 0.17)

    private struct Placed: Identifiable {
      let tip: ExerciseTip
      let number: Int
      let anchor: CGPoint
      var x: CGFloat
      var row: Int
      let width: CGFloat
      var id: String { tip.id }
    }

    /// Bề rộng ước lượng của nhãn (số + tên một dòng).
    private func width(_ tip: ExerciseTip) -> CGFloat {
      let title = String(localized: String.LocalizationValue(tip.titleKey))
      return min(190, CGFloat(title.count) * 7.4 + 44)
    }

    /// Dàn các nhãn của một hàng: gần điểm neo nhất có thể, không chồng
    /// nhau, không ra khỏi màn. `nil` khi hàng không đủ chỗ.
    private func resolve(_ row: [Placed], desired: [String: CGFloat]) -> [Placed]? {
      let w = camera.size.width
      let gap: CGFloat = 8
      let total = row.reduce(0) { $0 + $1.width } + gap * CGFloat(max(row.count - 1, 0))
      guard total <= w - 2 * margin else { return nil }
      var r = row.sorted { desired[$0.id]! < desired[$1.id]! }
      for i in r.indices { r[i].x = desired[r[i].id]! }
      var left = margin
      for i in r.indices {
        r[i].x = max(r[i].x, left + r[i].width / 2)
        left = r[i].x + r[i].width / 2 + gap
      }
      var limit = w - margin
      for i in r.indices.reversed() {
        r[i].x = min(r[i].x, limit - r[i].width / 2)
        limit = r[i].x - r[i].width / 2 - gap
      }
      return r
    }

    private func layout() -> [Placed] {
      let w = camera.size.width
      let projected: [Placed] = tips.enumerated().compactMap { n, tip in
        guard let a = camera.project(tip.anchor) else { return nil }
        let pw = width(tip)
        return Placed(tip: tip, number: n + 1, anchor: a, x: min(max(a.x, margin + pw / 2), w - margin - pw / 2), row: 0, width: pw)
      }
      let desired = Dictionary(uniqueKeysWithValues: projected.map { ($0.id, $0.x) })
      // Mỗi nhãn vào hàng đầu tiên còn chỗ, ở đó ít bị dời khỏi điểm neo
      // nhất; không hàng nào đủ thì mở hàng mới. Kết quả: không bao giờ
      // chồng nhau, dù máy quay xoay hướng nào.
      var rows: [[Placed]] = []
      for item in projected.sorted(by: { $0.anchor.x < $1.anchor.x }) {
        var best: (row: Int, placed: [Placed], cost: CGFloat)?
        for r in rows.indices {
          guard let placed = resolve(rows[r] + [item], desired: desired) else { continue }
          let cost = placed.reduce(0) { $0 + abs($1.x - desired[$1.id]!) }
            - rows[r].reduce(0) { $0 + abs($1.x - desired[$1.id]!) }
          if best == nil || cost < best!.cost - 0.5 { best = (r, placed, cost) }
          if cost < 1 { break }
        }
        if let best, best.cost < w * 0.35 {
          rows[best.row] = best.placed
        } else {
          rows.append(resolve([item], desired: desired) ?? [item])
        }
      }
      return rows.enumerated().flatMap { r, row in row.map { var p = $0; p.row = r; return p } }
    }

    private func pillCenterY(_ row: Int) -> CGFloat {
      topLimit + pillHeight / 2 + CGFloat(row) * (pillHeight + rowGap)
    }

    var body: some View {
      let items = layout()
      ZStack(alignment: .topLeading) {
        Canvas { ctx, _ in
          for p in items {
            let from = CGPoint(x: p.x, y: pillCenterY(p.row) + pillHeight / 2)
            var path = Path()
            path.move(to: from)
            path.addLine(to: p.anchor)
            let on = selected == nil || selected == p.id
            ctx.stroke(path, with: .color(.black.opacity(on ? 0.35 : 0.15)), style: StrokeStyle(lineWidth: 4, lineCap: .round))
            ctx.stroke(path, with: .color(.white.opacity(on ? 1 : 0.25)), style: StrokeStyle(lineWidth: on && selected != nil ? 2.4 : 1.8, lineCap: .round, dash: [5, 4]))
            let ring = CGRect(x: p.anchor.x - 11, y: p.anchor.y - 11, width: 22, height: 22)
            ctx.fill(Path(ellipseIn: ring), with: .color(accent.opacity(on ? 0.35 : 0.15)))
            let dot = CGRect(x: p.anchor.x - 5, y: p.anchor.y - 5, width: 10, height: 10)
            ctx.fill(Path(ellipseIn: dot), with: .color(.white))
            ctx.stroke(Path(ellipseIn: dot), with: .color(accent), lineWidth: 2.5)
          }
        }
        .allowsHitTesting(false)
        ForEach(items) { p in
          pill(p)
            .position(x: p.x, y: pillCenterY(p.row))
        }
      }
      .frame(width: camera.size.width, height: camera.size.height)
    }

    private func pill(_ p: Placed) -> some View {
      let on = selected == p.id
      let dimmed = selected != nil && !on
      return Button {
        withAnimation(reduceMotion ? nil : .smooth(duration: 0.25)) { selected = on ? nil : p.id }
      } label: {
        HStack(spacing: 6) {
          Text(verbatim: "\(p.number)")
            .font(DS.TextStyle.caption.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 20, height: 20)
            .background(Circle().fill(accent))
          Text(LocalizedStringKey(p.tip.titleKey))
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(on ? Color.white : DS.Color.foreground.swiftUI)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
        .padding(.leading, 7)
        .padding(.trailing, 12)
        .frame(height: pillHeight)
        .background {
          Capsule().fill(on ? AnyShapeStyle(accent) : AnyShapeStyle(.ultraThinMaterial))
        }
        .overlay(Capsule().strokeBorder(.white.opacity(0.22)))
        .shadow(color: .black.opacity(0.2), radius: 6, y: 2)
        // Một nhãn đang chọn: các nhãn khác mờ đi (vẫn chạm được để đổi).
        .opacity(dimmed ? 0.35 : 1)
        .scaleEffect(on ? 1.04 : 1)
      }
      .buttonStyle(.plain)
      .accessibilityHint(Text(LocalizedStringKey(p.tip.bodyKey)))
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
