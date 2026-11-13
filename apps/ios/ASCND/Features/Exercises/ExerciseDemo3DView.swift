#if DEBUG
  import ASCNDCore
  import ASCNDDesignSystem
  import RealityKit
  import UIKit
  import SwiftUI

  /// Trình xem 3D tương tác cho bài minh hoạ (`artifacts/exercise-visual-system`,
  /// #527). USDZ tự chạy khi mở và lặp vô hạn, không cần nhấn phát thêm. Ghế
  /// và nhân vật đứng yên giữa một phòng tập 3D; kéo để máy quay bay vòng,
  /// chụm hai ngón để lại gần / ra xa, chạm đúp để về góc mặc định (45°).
  /// Chú thích nổi ở dưới. Chỉ bản
  /// Debug — chuyển động CHƯA được người có chuyên môn duyệt
  /// ("UNVERIFIED — NOT APPROVED FOR PRODUCTION").
  struct ExerciseDemo3DView: View {
    let name: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Máy quay bay vòng quanh bài; ghế và nhân vật đứng yên (Kiệt 13/11).
    @State private var yaw: Double = Self.home.yaw
    @State private var pitch: Double = Self.home.pitch
    @State private var distance: Double = Self.home.distance
    @State private var loadFailed = false
    @State private var showTips = false
    @State private var selectedTip: String?
    @GestureState private var dragOffset: CGSize = .zero
    @GestureState private var pinch: CGFloat = 1

    /// Góc mặc định: preset three_quarter (`bench-press/usdz/usdz_report.json`:
    /// `default_camera`, hệ Y-up). Phòng tập dựng quanh đúng điểm nhìn này.
    private static let cameraPosition: SIMD3<Float> = [3.5378, 2.3302, 3.3852]
    private static let cameraTarget: SIMD3<Float> = [0.1817, 0.6027, 0.0291]
    /// Cùng góc nhìn ngang với khung 9:16 gốc (41,26° dọc), kéo dài theo
    /// chiều cao màn để khung 3D tràn màn hình.
    private static var verticalFOV: Float {
      let tanH = tan(41.26 * Float.pi / 360) * (9.0 / 16.0)
      let bounds = UIScreen.main.bounds
      let aspect = Float(bounds.width / max(bounds.height, 1))
      return 2 * atan(tanH / aspect) * 180 / Float.pi
    }
    private static let cameraName = "OrbitCamera"
    private static let dragScale = 0.006
    /// Giới hạn bay: không chui xuống sàn, không chạm trần hay tường của
    /// phòng (12 m vuông, trần 5 m — `pipeline/build_gym_room.py`).
    private static let pitchRange = 0.06...0.95
    private static let distanceRange = 2.4...5.4

    private static var home: (yaw: Double, pitch: Double, distance: Double) {
      let o = cameraPosition - cameraTarget
      let d = Double(simd_length(o))
      return (Double(atan2(o.x, o.z)), Double(asin(o.y / Float(d))), d)
    }

    private static func orbit(yaw: Double, pitch: Double, distance: Double) -> SIMD3<Float> {
      let p = min(max(pitch, pitchRange.lowerBound), pitchRange.upperBound)
      let d = min(max(distance, distanceRange.lowerBound), distanceRange.upperBound)
      return cameraTarget + SIMD3<Float>(
        Float(d * cos(p) * sin(yaw)), Float(d * sin(p)), Float(d * cos(p) * cos(yaw)))
    }

    /// Vị trí máy quay lúc này (cả khi đang kéo / chụm) — RealityView và
    /// lớp mẹo dùng chung một công thức nên đường chỉ luôn khớp mô hình.
    private var cameraPosition: SIMD3<Float> {
      Self.orbit(
        yaw: yaw - Double(dragOffset.width) * Self.dragScale,
        pitch: pitch + Double(dragOffset.height) * Self.dragScale,
        distance: distance / Double(pinch))
    }

    var body: some View {
      NavigationStack {
        ZStack {
          ZStack {
              RealityView { content in
                let camera = Self.makeCamera()
                content.add(camera)
                content.camera = .virtual  // dùng thực thể có PerspectiveCameraComponent ở trên
                do {
                  // Phòng tập 3D, ánh sáng đã nướng sẵn: vẽ không cần đèn.
                  let roomName = scheme == .dark ? "gym_room_dark" : "gym_room_light"
                  if let room = try? await Entity(named: roomName, in: .main) {
                    Self.makeUnlit(room, dark: scheme == .dark)
                    content.add(room)
                  }
                  let scene = try await Entity(named: "bench_press_animation", in: .main)
                  content.add(scene)
                  Self.addLights(to: content)
                  // Tự chạy và lặp vô hạn, không dừng ở cuối.
                  if let animation = scene.availableAnimations.first {
                    scene.playAnimation(animation.repeat())
                  }
                } catch {
                  await MainActor.run { loadFailed = true }
                }
              } update: { content in
                guard let camera = content.entities.first(where: { $0.name == Self.cameraName }) else { return }
                camera.look(at: Self.cameraTarget, from: cameraPosition, relativeTo: nil)
              }
              .ignoresSafeArea()
              .gesture(
                DragGesture()
                  .updating($dragOffset) { value, state, _ in state = value.translation }
                  .onEnded { value in
                    yaw -= Double(value.translation.width) * Self.dragScale
                    pitch = min(max(pitch + Double(value.translation.height) * Self.dragScale, Self.pitchRange.lowerBound),
                                Self.pitchRange.upperBound)
                  }
                  .simultaneously(with:
                    MagnifyGesture()
                      .updating($pinch) { value, state, _ in state = value.magnification }
                      .onEnded { value in
                        distance = min(max(distance / Double(value.magnification), Self.distanceRange.lowerBound),
                                       Self.distanceRange.upperBound)
                      })
              )
              .onTapGesture(count: 2) {
                withAnimation(reduceMotion ? nil : .smooth) { (yaw, pitch, distance) = Self.home }
              }
              .accessibilityLabel(
                Text(verbatim: "\(name) — \(String(localized: "eg.demo3d.alt"))"))
              .accessibilityHint(Text("eg.demo3d.rotateHint"))
              if loadFailed {
                fallback
              }
          }
          if showTips {
            GeometryReader { geo in
              ExerciseTipsOverlay(
                tips: ExerciseTips.tips(for: PersonalRecords.exerciseKey(name)),
                camera: PinholeCamera(
                  position: cameraPosition, target: Self.cameraTarget, verticalFOVDegrees: Self.verticalFOV,
                  size: geo.size),
                // Lớp này tràn qua vùng an toàn (lề = 0): đặt hàng nhãn dưới
                // thanh nút (đảo Dynamic Island + nút đóng / mẹo).
                topLimit: (UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }
                  .first?.safeAreaInsets.top ?? 59) + 58,
                selected: $selectedTip)
            }
            .ignoresSafeArea()
            .transition(.opacity)
          }
          VStack(spacing: DS.Spacing.sm) {
            Spacer()
            Label("eg.demo3d.rotateHint", systemImage: "hand.draw")
              .font(DS.TextStyle.caption.weight(.medium))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .padding(.horizontal, DS.Spacing.sm)
              .padding(.vertical, 6)
              .background(.ultraThinMaterial, in: Capsule())
            let tips = ExerciseTips.tips(for: PersonalRecords.exerciseKey(name))
            if showTips, let id = selectedTip, let n = tips.firstIndex(where: { $0.id == id }) {
              ExerciseTipDetail(tip: tips[n], number: n + 1) {
                withAnimation(reduceMotion ? nil : .smooth(duration: 0.25)) { selectedTip = nil }
              }
              .padding(.horizontal, DS.Spacing.md)
              .padding(.bottom, DS.Spacing.sm)
              .transition(.move(edge: .bottom).combined(with: .opacity))
            } else if let legend = ExerciseDemo3D.demo(for: name)?.legend, !legend.isEmpty {
              legendView(legend)
                .padding(.horizontal, DS.Spacing.md)
                .padding(.bottom, DS.Spacing.sm)
            }
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // Màu tường / sàn của phòng, thấy trong lúc phòng 3D đang tải.
        .background { GymStage() }
        .toolbar {
          ToolbarItem(placement: .primaryAction) {
            if !ExerciseTips.tips(for: PersonalRecords.exerciseKey(name)).isEmpty {
              Button {
                withAnimation(reduceMotion ? nil : .smooth) {
                  showTips.toggle()
                  selectedTip = nil
                }
              } label: {
                Image(systemName: showTips ? "lightbulb.fill" : "lightbulb")
                  .foregroundStyle(showTips ? Color(red: 0.91, green: 0.33, blue: 0.17) : DS.Color.foreground.swiftUI)
                  .frame(minWidth: 44, minHeight: 44)
              }
              .accessibilityLabel(Text("eg.demo3d.tips"))
            }
          }
          ToolbarItem(placement: .cancellationAction) {
            Button {
              dismiss()
            } label: {
              Image(systemName: "xmark")
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel(Text("eg.close"))
          }
        }
      }
    }

    /// Chú thích cơ đang tô sáng (Kiệt 13/11: bắt buộc phải có, đặt dưới
    /// khung viewer gần dòng chú thích xoay): mỗi hàng là chấm màu đúng màu
    /// render + tên cơ + vai trò. Tĩnh, không tương tác.
    private func legendView(_ legend: [ExerciseDemo3D.LegendEntry]) -> some View {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text("eg.demo3d.legend.title")
          .font(DS.TextStyle.caption.weight(.semibold))
          .textCase(.uppercase)
          .tracking(0.8)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        ForEach(Array(legend.enumerated()), id: \.offset) { _, entry in
          let tint = Color(hex: entry.hex)
          let primary = entry.roleKey.hasSuffix(".primary")
          HStack(spacing: DS.Spacing.sm) {
            Circle()
              .fill(tint)
              .frame(width: 10, height: 10)
              .shadow(color: tint.opacity(0.8), radius: 5)
              .accessibilityHidden(true)
            Text(LocalizedStringKey(entry.nameKey))
              .font(DS.TextStyle.body.weight(.semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
            Spacer(minLength: DS.Spacing.sm)
            Text(LocalizedStringKey(entry.roleKey))
              .font(DS.TextStyle.caption.weight(.semibold))
              .foregroundStyle(primary ? Color.white : DS.Color.metricOrange.swiftUI)
              .padding(.horizontal, 10)
              .padding(.vertical, 4)
              .background {
                Capsule().fill(primary ? tint : tint.opacity(0.14))
              }
          }
          .accessibilityElement(children: .combine)
        }
      }
      .padding(DS.Spacing.md)
      .frame(maxWidth: .infinity, alignment: .leading)
      .todayCard()
    }

    /// USDZ không nạp được thì nói thẳng, kèm poster của bài.
    private var fallback: some View {
      ZStack {
        WarmPaper()
        VStack(spacing: DS.Spacing.sm) {
          if let url = Bundle.main.url(forResource: "bench_press_45_poster", withExtension: "jpg") {
            AsyncImage(url: url) { phase in
              switch phase {
              case .success(let image): image.resizable().scaledToFit()
              case .failure: Image(systemName: "photo").foregroundStyle(DS.Color.mutedForeground.swiftUI)
              default: ProgressView()
              }
            }
          }
          Text("eg.mediaFailed").foregroundStyle(DS.Color.foreground.swiftUI)
        }
        .padding(DS.Spacing.md)
      }
    }

    /// Phòng xuất từ Blender với màu đã nướng ánh sáng: đổi sang vật liệu
    /// không chiếu sáng để trông đúng như ảnh render. Biển logo dùng chính
    /// logo của app (`BrandMark`), sáng ở bản tối, xám kim loại ở bản sáng.
    private static func makeUnlit(_ root: Entity, dark: Bool) {
      var logoTexture: TextureResource?
      if let image = UIImage(named: "BrandMark")?.cgImage {
        logoTexture = try? TextureResource(image: image, options: .init(semantic: .color))
      }
      func visit(_ entity: Entity, insideLogo: Bool) {
        let isLogo = insideLogo || entity.name.contains("Logo")
        if var model = entity.components[ModelComponent.self] {
          model.materials = model.materials.map { material in
            if isLogo, let logoTexture {
              var unlit = UnlitMaterial()
              unlit.color = .init(
                tint: dark ? UIColor(white: 1, alpha: 1) : UIColor(white: 0.32, alpha: 1), texture: .init(logoTexture))
              unlit.opacityThreshold = 0.5
              return unlit
            }
            if let pbr = material as? PhysicallyBasedMaterial, let texture = pbr.baseColor.texture {
              var unlit = UnlitMaterial()
              unlit.color = .init(tint: .white, texture: texture)
              return unlit
            }
            return material
          }
          entity.components.set(model)
        }
        for child in entity.children { visit(child, insideLogo: isLogo) }
      }
      visit(root, insideLogo: false)
    }

    private static func makeCamera() -> Entity {
      var camera = Entity()
      camera.name = cameraName
      camera.components.set(
        PerspectiveCameraComponent(near: 0.1, far: 100, fieldOfViewInDegrees: verticalFOV))
      camera.look(at: cameraTarget, from: cameraPosition, relativeTo: nil)
      return camera
    }

    /// USDZ không kèm đèn: một đèn chính + một đèn phụ, đủ thấy khối cơ và
    /// sợi cơ phát sáng mà không cần ảnh môi trường.
    private static func addLights(to content: RealityViewCameraContent) {
      var key = Entity()
      key.components.set(DirectionalLightComponent(color: .white, intensity: 1200))
      key.look(at: cameraTarget, from: cameraTarget + [2, 4, 2], relativeTo: nil)
      content.add(key)
      var fill = Entity()
      fill.components.set(DirectionalLightComponent(color: .white, intensity: 400))
      fill.look(at: cameraTarget, from: cameraTarget + [-3, 1, -2], relativeTo: nil)
      content.add(fill)
    }
  }
#endif
