#if DEBUG
  import RealityKit
  import SwiftUI

  /// Trình xem 3D tương tác cho bài minh hoạ (`artifacts/exercise-visual-system`,
  /// #527). USDZ tự chạy khi mở và lặp vô hạn, không cần nhấn phát thêm; kéo
  /// để xoay 360° quanh bài, chạm đúp để về góc mặc định (three-quarter 45°,
  /// góc dễ nhìn nhất). Khung dọc 9:16, chú thích mờ bên dưới khung. Chỉ bản
  /// Debug — chuyển động CHƯA được người có chuyên môn duyệt
  /// ("UNVERIFIED — NOT APPROVED FOR PRODUCTION").
  struct ExerciseDemo3DView: View {
    let name: String

    @Environment(\.dismiss) private var dismiss
    @State private var yaw: Double = 0
    @State private var pitch: Double = 0
    @State private var loadFailed = false
    @GestureState private var dragOffset: CGSize = .zero

    /// Góc mặc định: preset three_quarter refit cho khung 9:16
    /// (`bench-press/usdz/usdz_report.json`: `default_camera`, hệ Y-up).
    private static let cameraPosition: SIMD3<Float> = [3.5378, 2.3302, 3.3852]
    private static let cameraTarget: SIMD3<Float> = [0.1817, 0.6027, 0.0291]
    private static let verticalFOV: Float = 41.26
    private static let rigName = "OrbitRig"
    /// Nghiêng tối đa ~63°: xem được từ trên cao mà không lật ngược.
    private static let maxPitch: Double = 1.1
    private static let dragScale = 0.005

    var body: some View {
      NavigationStack {
        ZStack {
          Color.black
          VStack(spacing: DS.Spacing.sm) {
            ZStack {
              RealityView { content in
                let camera = Self.makeCamera()
                content.add(camera)
                content.camera = .entity(camera)
                do {
                  let scene = try await Entity(named: "bench_press_animation", in: .main)
                  // Xoay quanh tâm bài: rig đặt ở target, scene dời ngược lại.
                  let rig = Entity()
                  rig.name = Self.rigName
                  rig.position = Self.cameraTarget
                  scene.position = -Self.cameraTarget
                  rig.addChild(scene)
                  content.add(rig)
                  Self.addLights(to: content)
                  // Tự chạy và lặp vô hạn, không dừng ở cuối.
                  if let animation = scene.availableAnimations.first {
                    scene.playAnimation(animation.repeat())
                  }
                } catch {
                  await MainActor.run { loadFailed = true }
                }
              } update: { content in
                guard let rig = content.entities.first(where: { $0.name == Self.rigName }) else { return }
                let totalYaw = yaw + Double(dragOffset.width) * Self.dragScale
                let totalPitch = max(
                  -Self.maxPitch, min(Self.maxPitch, pitch + Double(dragOffset.height) * Self.dragScale))
                rig.transform.rotation =
                  simd_quatf(angle: Float(totalYaw), axis: [0, 1, 0])
                  * simd_quatf(angle: Float(totalPitch), axis: [1, 0, 0])
              }
              .aspectRatio(9 / 16, contentMode: .fit)
              .gesture(
                DragGesture()
                  .updating($dragOffset) { value, state, _ in state = value.translation }
                  .onEnded { value in
                    yaw += Double(value.translation.width) * Self.dragScale
                    pitch = max(
                      -Self.maxPitch, min(Self.maxPitch, pitch + Double(value.translation.height) * Self.dragScale))
                  }
              )
              .onTapGesture(count: 2) { yaw = 0; pitch = 0 }
              .accessibilityLabel(
                Text(verbatim: "\(name) — \(String(localized: "eg.demo3d.alt"))"))
              .accessibilityHint(Text("eg.demo3d.rotateHint"))
              if loadFailed {
                fallback
              }
            }
            Text("eg.demo3d.rotateHint")
              .font(DS.TextStyle.caption)
              .foregroundStyle(.white.opacity(0.5))
            if let legend = ExerciseDemo3D.demo(for: name)?.legend, !legend.isEmpty {
              legendView(legend)
            }
          }
        }
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
    }

    /// Chú thích cơ đang tô sáng (Kiệt 13/11: bắt buộc phải có, đặt dưới
    /// khung viewer gần dòng chú thích xoay): mỗi hàng là chấm màu đúng màu
    /// render + tên cơ + vai trò. Tĩnh, không tương tác.
    private func legendView(_ legend: [ExerciseDemo3D.LegendEntry]) -> some View {
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        ForEach(Array(legend.enumerated()), id: \.offset) { _, entry in
          HStack(spacing: DS.Spacing.xs) {
            Circle()
              .fill(Color(hex: entry.hex))
              .frame(width: 8, height: 8)
              .accessibilityHidden(true)
            Text(LocalizedStringKey(entry.nameKey))
            Text(verbatim: "·").foregroundStyle(.white.opacity(0.5))
            Text(LocalizedStringKey(entry.roleKey))
              .foregroundStyle(.white.opacity(0.5))
          }
          .font(DS.TextStyle.caption)
          .foregroundStyle(.white.opacity(0.85))
          .accessibilityElement(children: .combine)
        }
      }
      .padding(.top, DS.Spacing.xs)
    }

    /// USDZ không nạp được thì nói thẳng, kèm poster của bài.
    private var fallback: some View {
      ZStack {
        Color.black
        VStack(spacing: DS.Spacing.sm) {
          if let url = Bundle.main.url(forResource: "bench_press_45_poster", withExtension: "jpg") {
            AsyncImage(url: url) { phase in
              switch phase {
              case .success(let image): image.resizable().scaledToFit()
              case .failure: Image(systemName: "photo").foregroundStyle(.white.opacity(0.6))
              default: ProgressView().tint(.white)
              }
            }
          }
          Text("eg.mediaFailed").foregroundStyle(.white)
        }
        .padding(DS.Spacing.md)
      }
    }

    private static func makeCamera() -> Entity {
      var camera = Entity()
      camera.components.set(
        PerspectiveCameraComponent(near: 0.1, far: 100, fieldOfViewInDegrees: verticalFOV))
      camera.look(at: cameraTarget, from: cameraPosition, relativeTo: nil)
      return camera
    }

    /// USDZ không kèm đèn: một đèn chính + một đèn phụ, đủ thấy khối cơ và
    /// sợi cơ phát sáng mà không cần ảnh môi trường.
    private static func addLights(to content: RealityViewContent) {
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
