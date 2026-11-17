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
    /// Mở trang hướng dẫn đầy đủ (bước làm, bài tương tự) khi trình xem được
    /// mở thẳng từ buổi tập; nil khi đã mở từ trang hướng dẫn.
    var onFullGuide: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Máy quay bay vòng quanh bài; ghế và nhân vật đứng yên (Kiệt 13/11).
    @State private var yaw: Double
    @State private var pitch: Double
    @State private var distance: Double
    @State private var loadFailed = false
    @State private var showTips = false
    @State private var selectedTip: String?
    /// Ẩn vùng tô sáng của cơ phụ để tập trung vào cơ chính (Kiệt 13/11).
    /// Mặc định chỉ hiện cơ chính (Kiệt 16/11); nút "Hiện cơ phụ" bật Phụ + Ổn định.
    @State private var hideSecondary = true
    @State private var bodySkins = BodySkins()
    /// Thu gọn thẻ chú thích / thanh zoom (Kiệt 16/11), nhớ cho lần mở sau.
    /// Lưu bằng AppStorage, nhưng vẽ theo @State: thay đổi AppStorage không
    /// nằm trong transaction của withAnimation nên thẻ / thanh nhảy cái một
    /// (Kiệt 16/11: "cho mượt").
    @AppStorage("demo3d.legendCollapsed") private var legendCollapsedStored = false
    @AppStorage("demo3d.zoomCollapsed") private var zoomCollapsedStored = false
    @State private var legendCollapsed = false
    @State private var zoomCollapsed = false
    @Namespace private var zoomMorph
    /// Lò xo nhẹ cho thu gọn / mở (Kiệt 16/11: "cho mượt"); tắt khi Giảm chuyển động.
    private var collapseAnimation: Animation? { reduceMotion ? nil : .spring(response: 0.38, dampingFraction: 0.86) }
    @GestureState private var dragOffset: CGSize = .zero
    @GestureState private var pinch: CGFloat = 1

    init(name: String, onFullGuide: (() -> Void)? = nil) {
      self.name = name
      self.onFullGuide = onFullGuide
      let h = Self.home(of: ExerciseDemo3D.demo(for: name))
      _yaw = State(initialValue: h.yaw)
      _pitch = State(initialValue: h.pitch)
      _distance = State(initialValue: h.distance)
    }

    /// Góc mặc định của bài: preset three_quarter (`<bài>/usdz/usdz_report.json`
    /// → `default_camera`, hệ Y-up), mang trong `ExerciseDemo3D.Demo`.
    private var demoInfo: ExerciseDemo3D.Demo? { ExerciseDemo3D.demo(for: name) }
    private var cameraTarget: SIMD3<Float> { Self.target(of: demoInfo) }
    private static func target(of demo: ExerciseDemo3D.Demo?) -> SIMD3<Float> {
      demo?.cameraTarget ?? [0.1817, 0.6027, 0.0291]
    }
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
    /// Trần góc 0,55 rad (≈ 31°, 16/11): ở 0,95 rad mà zoom sát thì máy quay chúc
    /// thẳng xuống đỉnh đầu, chân co ngắn, nền phòng mất — Kiệt tưởng hình hỏng.
    /// Góc mặc định của các bài ≈ 0,35 rad; 31° vẫn thấy được vai, lưng trên.
    private static let pitchRange = 0.06...0.55
    /// Gần nhất 1,6 m để soi được sợi cơ (thanh zoom, Kiệt 13/11).
    private static let distanceRange = 1.6...5.4

    private static func home(of demo: ExerciseDemo3D.Demo?) -> (yaw: Double, pitch: Double, distance: Double) {
      let o = (demo?.cameraPosition ?? [3.5378, 2.3302, 3.3852]) - target(of: demo)
      let d = Double(simd_length(o))
      return (Double(atan2(o.x, o.z)), Double(asin(o.y / Float(d))), d)
    }

    private static func orbit(target: SIMD3<Float>, yaw: Double, pitch: Double, distance: Double) -> SIMD3<Float> {
      let p = min(max(pitch, pitchRange.lowerBound), pitchRange.upperBound)
      let d = min(max(distance, distanceRange.lowerBound), distanceRange.upperBound)
      return target + SIMD3<Float>(
        Float(d * cos(p) * sin(yaw)), Float(d * sin(p)), Float(d * cos(p) * cos(yaw)))
    }

    /// Vị trí máy quay lúc này (cả khi đang kéo / chụm) — RealityView và
    /// lớp mẹo dùng chung một công thức nên đường chỉ luôn khớp mô hình.
    private var cameraPosition: SIMD3<Float> {
      Self.orbit(
        target: cameraTarget,
        yaw: yaw - Double(dragOffset.width) * Self.dragScale,
        pitch: pitch + Double(dragOffset.height) * Self.dragScale,
        distance: distance / Double(pinch))
    }

    var body: some View {
      NavigationStack {
        ZStack {
          ZStack {
              RealityView { content in
                let camera = Self.makeCamera(position: cameraPosition, target: cameraTarget)
                content.add(camera)
                content.camera = .virtual  // dùng thực thể có PerspectiveCameraComponent ở trên
                do {
                  // Phòng tập 3D, ánh sáng đã nướng sẵn: vẽ không cần đèn.
                  if let room = await Self.loadRoom(look: scheme == .dark ? "dark" : "light") {
                    Self.makeUnlit(room, dark: scheme == .dark)
                    content.add(room)
                  }
                  // Bài dạng khối: nhân vật dùng chung + file chuyển động
                  // (khung xương, dụng cụ). Bài cũ: một USDZ chứa tất cả.
                  let motionFile = demoInfo?.motionFile
                  let scene = try await Entity(
                    named: motionFile == nil ? (demoInfo?.usdzFile ?? "bench_press_animation") : ExerciseDemo3D.sharedCharacterFile,
                    in: .main)
                  content.add(scene)
                  let motion: Entity? = if let motionFile { try await Entity(named: motionFile, in: .main) } else { nil }
                  // Quần áo là khối riêng (Kiệt 16/11); bản nhân vật cũ còn quần
                  // trong thân thì không có file này.
                  let apparel: Entity? = motionFile == nil ? nil : try? await Entity(named: ExerciseDemo3D.sharedApparelFile, in: .main)
                  if let apparel { content.add(apparel) }
                  if let motion, let motionFile {
                    content.add(motion)
                    await Self.mountEquipment(on: motion, manifest: motionFile.replacingOccurrences(of: "_motion", with: "_equipment"))
                  }
                  // Dạng khối có vai trò cơ: tô cơ lúc chạy từ bộ ảnh dùng chung (17/11); thiếu tệp
                  // thì lùi về texture nướng sẵn như trước.
                  let painted: Bool =
                    if motionFile != nil, let roles = demoInfo?.roles, !roles.isEmpty {
                      await bodySkins.prepareShader(scene: scene, apparel: apparel, roles: roles)
                    } else { false }
                  if painted {
                    bodySkins.apply(focus: hideSecondary, force: true)
                  } else if let prefix = demoInfo?.focusTexturePrefix {
                    await bodySkins.prepare(scene: scene, apparel: apparel, prefix: prefix, fullPrefix: demoInfo?.fullTexturePrefix)
                    // update{} không chạy lại khi texture nạp xong: gán ngay.
                    bodySkins.apply(focus: hideSecondary, force: true)
                  }
                  Self.addLights(to: content, target: cameraTarget)
                  // Phòng nướng sẵn không còn bóng của bài nào (dùng chung,
                  // 16/11): bóng tiếp xúc mềm dưới nhân vật + dụng cụ.
                  if let shadow = Self.contactShadow(under: [scene] + [motion, apparel].compactMap { $0 }) {
                    content.add(shadow)
                  }
                  // Tự chạy và lặp vô hạn, không dừng ở cuối. Dạng khối: cùng
                  // một chuyển động phát trên nhân vật và trên file chuyển động
                  // (dụng cụ), bắt đầu cùng khung hình nên khớp nhau.
                  if let animation = (motion ?? scene).availableAnimations.first {
                    scene.playAnimation(animation.repeat())
                    motion?.playAnimation(animation.repeat())
                    apparel?.playAnimation(animation.repeat())
                  }
                } catch {
                  await MainActor.run { loadFailed = true }
                }
              } update: { content in
                guard let camera = content.entities.first(where: { $0.name == Self.cameraName }) else { return }
                camera.look(at: cameraTarget, from: cameraPosition, relativeTo: nil)
                bodySkins.apply(focus: hideSecondary)
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
                withAnimation(reduceMotion ? nil : .smooth) { (yaw, pitch, distance) = Self.home(of: demoInfo) }
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
                  position: cameraPosition, target: cameraTarget, verticalFOVDegrees: Self.verticalFOV,
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
                .animation(collapseAnimation, value: legendCollapsed)
            }
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay(alignment: .trailing) {
          zoomSlider
            .padding(.trailing, DS.Spacing.sm)
            .offset(y: -60)
            .animation(collapseAnimation, value: zoomCollapsed)
        }
        .onAppear {
          legendCollapsed = legendCollapsedStored
          zoomCollapsed = zoomCollapsedStored
        }
        .onChange(of: legendCollapsed) { _, v in legendCollapsedStored = v }
        .onChange(of: zoomCollapsed) { _, v in zoomCollapsedStored = v }
        // Màu tường / sàn của phòng, thấy trong lúc phòng 3D đang tải.
        .background { GymStage() }
        .toolbar {
          if let onFullGuide {
            ToolbarItem(placement: .primaryAction) {
              Button(action: onFullGuide) {
                Image(systemName: "book")
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                  .frame(minWidth: 44, minHeight: 44)
              }
              .accessibilityLabel(Text("eg.demo3d.fullGuide"))
            }
          }
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

    /// 0 = xa nhất, 1 = gần nhất; cùng trạng thái với chụm hai ngón.
    private var zoom: Binding<Double> {
      let lo = Self.distanceRange.lowerBound, hi = Self.distanceRange.upperBound
      return Binding(
        get: { (hi - min(max(distance, lo), hi)) / (hi - lo) },
        set: { distance = hi - $0 * (hi - lo) })
    }

    /// Thanh zoom dọc ở mép phải (Kiệt 13/11): kéo lên để lại gần soi sợi cơ.
    private var zoomSlider: some View {
      Group {
        if zoomCollapsed {
          // Thu gọn: một nút kính lúp; chụm hai ngón vẫn zoom được.
          Button {
            withAnimation(collapseAnimation) { zoomCollapsed = false }
          } label: {
            Image(systemName: "plus.magnifyingglass")
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .frame(width: 44, height: 44)
              .background { zoomShell }
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("eg.demo3d.expandZoom"))
          .transition(.opacity)
        } else {
          zoomBar.transition(.opacity)
        }
      }
    }

    /// Vỏ kính chung của thanh zoom và nút thu gọn: hai trạng thái cùng một
    /// hình (matchedGeometryEffect), nên thanh co lại thành nút tròn liền mạch.
    private var zoomShell: some View {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .fill(.ultraThinMaterial)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.12), lineWidth: 0.5))
        .matchedGeometryEffect(id: "zoomShell", in: zoomMorph)
    }

    private var zoomBar: some View {
      VStack(spacing: DS.Spacing.sm) {
        Button {
          withAnimation(collapseAnimation) { zoomCollapsed = true }
        } label: {
          Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 30, height: 28)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("eg.demo3d.collapseZoom"))
        Image(systemName: "plus.magnifyingglass")
        Slider(value: zoom, in: 0...1)
          .tint(Color(red: 0.91, green: 0.33, blue: 0.17))
          .frame(width: 180)
          .rotationEffect(.degrees(-90))
          .frame(width: 30, height: 180)
          .accessibilityLabel(Text("eg.demo3d.zoom"))
        Image(systemName: "minus.magnifyingglass")
      }
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .padding(.vertical, DS.Spacing.sm + 2)
      .padding(.horizontal, 6)
      .background { zoomShell }
    }

    /// Chú thích cơ đang tô sáng (Kiệt 13/11: bắt buộc phải có, đặt dưới
    /// khung viewer gần dòng chú thích xoay): mỗi hàng là chấm màu đúng màu
    /// render + tên cơ + vai trò. Tĩnh, không tương tác.
    static let roleOrder = ["eg.demo3d.legend.primary", "eg.demo3d.legend.secondary", "eg.demo3d.legend.stabilizer"]

    private func legendView(_ legend: [ExerciseDemo3D.LegendEntry]) -> some View {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(spacing: DS.Spacing.sm) {
          if legendCollapsed {
            // Thu gọn (Kiệt 16/11: "nhìn hơi kì"): một hàng như hàng Chính của
            // thẻ đầy đủ: nhãn vai trò + chip cơ chính, nút mở ở cuối.
            collapsedPrimary(legend)
              .transition(.opacity)
          } else {
            Text("eg.demo3d.legend.title")
              .font(DS.TextStyle.caption.weight(.semibold))
              .textCase(.uppercase)
              .tracking(0.8)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityAddTraits(.isHeader)
              .transition(.opacity)
          }
          Spacer(minLength: DS.Spacing.sm)
          if bodySkins.ready, !legendCollapsed, legend.contains(where: { !$0.roleKey.hasSuffix(".primary") }) {
            Button {
              withAnimation(reduceMotion ? nil : .smooth(duration: 0.2)) { hideSecondary.toggle() }
            } label: {
              Label(hideSecondary ? "eg.demo3d.showSecondary" : "eg.demo3d.hideSecondary",
                    systemImage: hideSecondary ? "eye" : "eye.slash")
                .font(DS.TextStyle.caption.weight(.semibold))
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .padding(.horizontal, 10)
                .frame(minHeight: 30)
                .background(DS.Color.foreground.swiftUI.opacity(0.08), in: Capsule())
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(hideSecondary ? [.isButton, .isSelected] : .isButton)
          }
          Button {
            withAnimation(collapseAnimation) { legendCollapsed.toggle() }
          } label: {
            Image(systemName: "chevron.down")
              .rotationEffect(.degrees(legendCollapsed ? 180 : 0))
              .font(.system(size: 13, weight: .bold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .frame(width: 30, height: 30)
              .background(DS.Color.foreground.swiftUI.opacity(0.08), in: Circle())
              .frame(minWidth: 44, minHeight: 44)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text(legendCollapsed ? "eg.demo3d.expandLegend" : "eg.demo3d.collapseLegend"))
        }
        if !legendCollapsed {
          VStack(alignment: .leading, spacing: DS.Spacing.sm) { legendRows(legend) }
            .transition(.opacity.combined(with: .offset(y: 14)))
        }
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.vertical, legendCollapsed ? DS.Spacing.sm : DS.Spacing.md)
      .frame(maxWidth: .infinity, alignment: .leading)
      .todayCard()
      .clipped()
    }

    /// Hàng thu gọn: nhãn "Chính" + chip cơ chính (chấm màu), một dòng, cắt
    /// bằng dấu … khi quá dài.
    private func collapsedPrimary(_ legend: [ExerciseDemo3D.LegendEntry]) -> some View {
      let primary = legend.filter { $0.roleKey.hasSuffix(".primary") }
      let tint = Color(hex: primary.first?.hex ?? "#E8552B")
      return HStack(spacing: DS.Spacing.sm) {
        Text(LocalizedStringKey(Self.roleOrder[0]))
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(Color.white)
          .padding(.horizontal, 10)
          .padding(.vertical, 4)
          .background { Capsule().fill(tint) }
        HStack(spacing: 6) {
          Circle().fill(tint).frame(width: 8, height: 8)
            .shadow(color: tint.opacity(0.8), radius: 4)
            .accessibilityHidden(true)
          Text(primary.map { String(localized: String.LocalizationValue($0.nameKey)) }.joined(separator: " · "))
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(1)
            .truncationMode(.tail)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(DS.Color.foreground.swiftUI.opacity(0.06), in: Capsule())
      }
      .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func legendRows(_ legend: [ExerciseDemo3D.LegendEntry]) -> some View {
        // Ba cấp (Kiệt 15/11): Chính = chịu tải, tạo lực chính; Phụ = hỗ trợ
        // trực tiếp chuyển động; Ổn định = giữ tư thế, ổn định khớp. Mỗi cấp
        // một hàng: nhãn màu + chip tên cơ xuống dòng tự do, để 10+ cơ vẫn
        // gọn và không che mô hình.
        ForEach(Self.roleOrder, id: \.self) { role in
          let entries = legend.filter { $0.roleKey == role }
          if let first = entries.first {
            let tint = Color(hex: first.hex)
            let primary = role.hasSuffix(".primary")
            HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
              Text(LocalizedStringKey(role))
                .font(DS.TextStyle.caption.weight(.semibold))
                .foregroundStyle(primary ? Color.white : tint)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background { Capsule().fill(primary ? tint : tint.opacity(0.16)) }
                .frame(minWidth: 72, alignment: .leading)
              FlowRows(spacing: 6, centered: false) {
                ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
                  HStack(spacing: 6) {
                    Circle()
                      .fill(tint)
                      .frame(width: 8, height: 8)
                      .shadow(color: tint.opacity(0.8), radius: 4)
                      .accessibilityHidden(true)
                    Text(LocalizedStringKey(entry.nameKey))
                      .font(DS.TextStyle.footnote.weight(.semibold))
                      .foregroundStyle(DS.Color.foreground.swiftUI)
                  }
                  .padding(.horizontal, 8)
                  .padding(.vertical, 4)
                  .background(DS.Color.foreground.swiftUI.opacity(0.06), in: Capsule())
                }
              }
            }
            .opacity(hideSecondary && !primary ? 0.35 : 1)
            .accessibilityElement(children: .combine)
          }
        }
    }

    /// USDZ không nạp được thì nói thẳng, kèm poster của bài.
    private var fallback: some View {
      ZStack {
        WarmPaper()
        VStack(spacing: DS.Spacing.sm) {
          if let url = Bundle.main.url(forResource: demoInfo?.posterFile ?? "bench_press_45_poster", withExtension: "jpg") {
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

    private static func makeCamera(position cameraPosition: SIMD3<Float>, target cameraTarget: SIMD3<Float>) -> Entity {
      var camera = Entity()
      camera.name = cameraName
      camera.components.set(
        PerspectiveCameraComponent(near: 0.1, far: 100, fieldOfViewInDegrees: verticalFOV))
      camera.look(at: cameraTarget, from: cameraPosition, relativeTo: nil)
      return camera
    }

    /// Phòng dạng khối (Kiệt 16/11): `room_manifest_<look>.json` liệt kê từng
    /// phần (sàn, tường, trần, thanh gỗ, kệ, LED, biển logo), mỗi phần một
    /// USDZ, cùng các điểm neo cho đồ trang trí. Đổi một phần = thay một file.
    /// Không có manifest thì dùng file phòng gộp như trước.
    private struct RoomManifest: Decodable {
      struct Part: Decodable { let part: String; let file: String }
      let parts: [Part]
      let anchors: [String: [Float]]
    }

    private static func loadRoom(look: String) async -> Entity? {
      guard let url = Bundle.main.url(forResource: "room_manifest_\(look)", withExtension: "json"),
        let data = try? Data(contentsOf: url),
        let manifest = try? JSONDecoder().decode(RoomManifest.self, from: data)
      else { return try? await Entity(named: "gym_room_\(look)", in: .main) }
      let room = Entity()
      room.name = "GymRoom"
      for part in manifest.parts {
        if let e = try? await Entity(named: part.file, in: .main) { room.addChild(e) }
      }
      return room
    }

    private struct EquipmentManifest: Decodable {
      struct Socket: Decodable { let socket: String; let key: String }
      let sockets: [Socket]
    }

    /// Dụng cụ dạng khối (Kiệt 16/11): file chuyển động chỉ có "ổ cắm" (vật
    /// trống cùng tên, vẫn chuyển động); mẫu dụng cụ nằm ở
    /// `equipment_<key>.usdz`, dùng chung mọi bài. Đổi mẫu tạ = thay một file.
    /// Bài không có `<bài>_equipment.json` thì dụng cụ đã nằm sẵn trong file.
    private static func mountEquipment(on motion: Entity, manifest name: String) async {
      guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
        let data = try? Data(contentsOf: url),
        let manifest = try? JSONDecoder().decode(EquipmentManifest.self, from: data)
      else { return }
      var models: [String: Entity] = [:]
      for s in manifest.sockets {
        guard let socket = motion.findEntity(named: s.socket) else { continue }
        var model = models[s.key]
        if model == nil, let file = try? await Entity(named: "equipment_\(s.key)", in: .main),
          let root = file.findEntity(named: "EQ_\(s.key)")
        {
          root.removeFromParent()
          models[s.key] = root
          model = root
        }
        guard let model else { continue }
        // Cùng khung toạ độ với ổ cắm: mẫu xuất ở gốc, ổ cắm mang vị trí.
        let instance = model.clone(recursive: true)
        instance.transform = .identity
        socket.addChild(instance)
      }
    }

    /// Bóng tiếp xúc mềm trên sàn (y = 0) dưới khung bao của nhân vật và
    /// dụng cụ: mặt phẳng không chiếu sáng, texture dải mờ tròn sinh lúc chạy.
    /// Thay cho bóng nướng vào sàn phòng, vốn chỉ đúng với một bài.
    private static func contactShadow(under entities: [Entity]) -> Entity? {
      var bounds: BoundingBox?
      for e in entities {
        let b = e.visualBounds(relativeTo: nil)
        guard b.isEmpty == false else { continue }
        bounds = bounds.map { $0.union(b) } ?? b
      }
      guard let bounds, let texture = shadowTexture() else { return nil }
      let w = max(bounds.extents.x * 1.15, 0.9), d = max(bounds.extents.z * 1.15, 0.9)
      var material = UnlitMaterial()
      // Texture đen có kênh alpha = độ đậm của bóng.
      material.color = .init(tint: .white, texture: .init(texture))
      material.blending = .transparent(opacity: .init(floatLiteral: 1.0))
      let plane = ModelEntity(mesh: .generatePlane(width: w, depth: d), materials: [material])
      plane.position = [bounds.center.x, 0.003, bounds.center.z]
      plane.name = "ContactShadow"
      return plane
    }

    /// Bóng đen, alpha 55 % ở tâm, tắt dần ra mép (smoothstep), alpha nhân sẵn.
    private static func shadowTexture() -> TextureResource? {
      let n = 128
      var px = [UInt8](repeating: 0, count: n * n * 4)
      for y in 0..<n {
        for x in 0..<n {
          let dx = (Double(x) + 0.5) / Double(n) * 2 - 1, dy = (Double(y) + 0.5) / Double(n) * 2 - 1
          let r = min((dx * dx + dy * dy).squareRoot(), 1)
          let t = 1 - r
          let a = 0.55 * t * t * (3 - 2 * t)
          px[(y * n + x) * 4 + 3] = UInt8(a * 255)  // RGB 0 = đen (nhân sẵn)
        }
      }
      guard let provider = CGDataProvider(data: Data(px) as CFData),
        let image = CGImage(
          width: n, height: n, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: n * 4,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
          provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
      else { return nil }
      return try? TextureResource(image: image, options: .init(semantic: .color))
    }

    /// USDZ không kèm đèn: một đèn chính + một đèn phụ, đủ thấy khối cơ và
    /// sợi cơ phát sáng mà không cần ảnh môi trường.
    private static func addLights(to content: RealityViewCameraContent, target cameraTarget: SIMD3<Float>) {
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

  /// Hai bộ vật liệu thân nhân vật: đủ (USDZ) và "chỉ cơ chính" (texture
  /// `<prefix>_albedo/_emission/_normal.png` cùng UV). Đổi tại chỗ khi người
  /// dùng bấm ẩn / hiện cơ phụ, không nạp lại mô hình.
  @Observable @MainActor final class BodySkins {
    private typealias Skin = (
      base: PhysicallyBasedMaterial.Texture?, emissive: PhysicallyBasedMaterial.Texture?,
      normal: PhysicallyBasedMaterial.Texture?
    )
    @ObservationIgnored private weak var body: ModelEntity?
    /// Lưới mang quần: chính thân (file gộp) hoặc khối quần riêng
    /// (`apparel_shorts.usdz`, dạng khối từ 16/11).
    @ObservationIgnored private weak var apparelBody: ModelEntity?
    @ObservationIgnored private var full: Skin = (nil, nil, nil)
    @ObservationIgnored private var focus: Skin = (nil, nil, nil)
    /// Quần (vật liệu không có normal map) cũng tô cơ bên dưới, nên có bộ
    /// texture "chỉ cơ chính" riêng (`<prefix>_apparel_*`, từ 16/11). Bài cũ
    /// không có thì quần giữ nguyên.
    @ObservationIgnored private var apparelIndex: Int?
    @ObservationIgnored private var fullApparel: Skin = (nil, nil, nil)
    @ObservationIgnored private var focusApparel: Skin = (nil, nil, nil)
    @ObservationIgnored private var shownFocus = false
    private(set) var ready = false

    /// RealityKit gộp các lưới có xương (thân + quần) vào thực thể của khung
    /// xương (`config/master_character.json` → `armature_object`).
    private static let bodyName = "MasterRig"

    func prepare(scene: Entity, apparel: Entity? = nil, prefix: String, fullPrefix: String? = nil) async {
      guard let body = Self.find(in: scene), let model = body.model,
        let bodyMaterial = model.materials.lazy.compactMap({ $0 as? PhysicallyBasedMaterial })
          .first(where: { $0.normal.texture != nil }),
        let albedo = await Self.texture("\(prefix)_albedo", .color),
        let emission = await Self.texture("\(prefix)_emission", .color),
        let normal = await Self.texture("\(prefix)_normal", .normal)
      else { return }
      full = (bodyMaterial.baseColor.texture, bodyMaterial.emissiveColor.texture, bodyMaterial.normal.texture)
      focus = (.init(albedo), .init(emission), .init(normal))
      // Dạng khối: nhân vật dùng chung không mang texture của bài, nên bộ
      // "đủ vai trò" cũng nạp từ PNG.
      if let fullPrefix,
        let fa = await Self.texture("\(fullPrefix)_albedo", .color),
        let fe = await Self.texture("\(fullPrefix)_emission", .color),
        let fn = await Self.texture("\(fullPrefix)_normal", .normal)
      {
        full = (.init(fa), .init(fe), .init(fn))
      }
      let apparelModel = apparel.flatMap { Self.find(in: $0) } ?? body
      if let index = apparelModel.model?.materials.firstIndex(where: {
        guard let pbr = $0 as? PhysicallyBasedMaterial else { return false }
        return pbr.normal.texture == nil && pbr.baseColor.texture != nil
      }),
        let apparelMaterial = apparelModel.model?.materials[index] as? PhysicallyBasedMaterial,
        let apparelAlbedo = await Self.texture("\(prefix)_apparel_albedo", .color),
        let apparelEmission = await Self.texture("\(prefix)_apparel_emission", .color)
      {
        apparelIndex = index
        apparelBody = apparelModel
        fullApparel = (apparelMaterial.baseColor.texture, apparelMaterial.emissiveColor.texture, nil)
        focusApparel = (.init(apparelAlbedo), .init(apparelEmission), nil)
        if let fullPrefix,
          let fa = await Self.texture("\(fullPrefix)_apparel_albedo", .color),
          let fe = await Self.texture("\(fullPrefix)_apparel_emission", .color)
        {
          fullApparel = (.init(fa), .init(fe), nil)
        }
      }
      self.body = body
      ready = true
    }

    /// Tô cơ lúc chạy (17/11, `MuscleShader`): da pha từ bộ ảnh dùng chung theo vai trò cơ của bài,
    /// thay texture nướng sẵn từng bài. false = thiếu tệp hay không tìm thấy lưới thân, để bên gọi
    /// lùi về texture nướng sẵn.
    func prepareShader(scene: Entity, apparel: Entity?, roles: [String: [String]]) async -> Bool {
      guard let body = Self.find(in: scene), body.model != nil else { return false }
      var gpuAllowed = true
      #if DEBUG
        // So hai đường: chạy với biến môi trường ASCND_MUSCLE_CPU=1 để ép đường CPU.
        gpuAllowed = ProcessInfo.processInfo.environment["ASCND_MUSCLE_CPU"] == nil
      #endif
      if gpuAllowed, await prepareGPU(body: body, apparel: apparel, roles: roles) { return true }
      let skins = await Task.detached(priority: .userInitiated) { () -> MuscleShader.Skins? in
        let start = Date()
        guard let shared = MuscleShader.shared() else { return nil }
        let skins = MuscleShader.skins(roles: roles, shared: shared)
        #if DEBUG
          print("[muscle] composed in \(Int(Date().timeIntervalSince(start) * 1000)) ms")
        #endif
        return skins
      }.value
      guard let skins else { return false }
      func tex(_ image: CGImage?, _ semantic: TextureResource.Semantic = .color) -> PhysicallyBasedMaterial.Texture? {
        image.flatMap { try? TextureResource(image: $0, options: .init(semantic: semantic)) }.map { .init($0) }
      }
      guard let fa = tex(skins.fullBody.albedo), let fe = tex(skins.fullBody.emission),
        let fn = tex(skins.fullBody.normal, .normal),
        let ca = tex(skins.focusBody.albedo), let ce = tex(skins.focusBody.emission),
        let cn = tex(skins.focusBody.normal, .normal)
      else { return false }
      full = (fa, fe, fn)
      focus = (ca, ce, cn)
      let apparelModel = apparel.flatMap { Self.find(in: $0) } ?? body
      if let index = apparelModel.model?.materials.firstIndex(where: {
        guard let pbr = $0 as? PhysicallyBasedMaterial else { return false }
        return pbr.normal.texture == nil && pbr.baseColor.texture != nil
      }),
        let afa = tex(skins.fullApparel.albedo), let afe = tex(skins.fullApparel.emission),
        let aca = tex(skins.focusApparel.albedo), let ace = tex(skins.focusApparel.emission)
      {
        apparelIndex = index
        apparelBody = apparelModel
        fullApparel = (afa, afe, nil)
        focusApparel = (aca, ace, nil)
      }
      self.body = body
      ready = true
      return true
    }

    /// Tô cơ trên GPU (17/11, `MuscleMaterial`): vật liệu gốc giữ lại, mỗi lần đổi chỉ dựng
    /// `CustomMaterial` với bảng màu đủ / chỉ cơ chính. false = không dựng được (lùi về đường CPU).
    private struct GPUSkin {
      let textures: MuscleMaterial.Textures
      let full: TextureResource
      let focus: TextureResource
      let bodyIndex: Int
      let bodyOriginal: PhysicallyBasedMaterial
      let apparelOriginal: PhysicallyBasedMaterial?
    }
    @ObservationIgnored private var gpu: GPUSkin?

    private func prepareGPU(body: ModelEntity, apparel: Entity?, roles: [String: [String]]) async -> Bool {
      let start = Date()
      let built = await Task.detached(priority: .userInitiated) { () -> (MuscleShader.Shared, MuscleMaterial.Images)? in
        guard let shared = MuscleShader.shared(), let images = MuscleMaterial.images(shared) else { return nil }
        return (shared, images)
      }.value
      guard let (shared, images) = built, let textures = MuscleMaterial.textures(images),
        let full = MuscleMaterial.palette(roles: roles, shared: shared, primaryOnly: false),
        let focus = MuscleMaterial.palette(roles: roles, shared: shared, primaryOnly: true),
        let materials = body.model?.materials,
        let bodyIndex = materials.firstIndex(where: { ($0 as? PhysicallyBasedMaterial)?.normal.texture != nil }),
        let bodyOriginal = materials[bodyIndex] as? PhysicallyBasedMaterial,
        MuscleMaterial.material(replacing: bodyOriginal, body: true, textures: textures, palette: full) != nil
      else { return false }
      let apparelModel = apparel.flatMap { Self.find(in: $0) } ?? body
      var apparelOriginal: PhysicallyBasedMaterial?
      if let index = apparelModel.model?.materials.firstIndex(where: {
        guard let pbr = $0 as? PhysicallyBasedMaterial else { return false }
        return pbr.normal.texture == nil && pbr.baseColor.texture != nil
      }) {
        apparelIndex = index
        apparelBody = apparelModel
        apparelOriginal = apparelModel.model?.materials[index] as? PhysicallyBasedMaterial
      }
      gpu = GPUSkin(
        textures: textures, full: full, focus: focus, bodyIndex: bodyIndex, bodyOriginal: bodyOriginal,
        apparelOriginal: apparelOriginal)
      #if DEBUG
        print("[muscle] GPU material ready in \(Int(Date().timeIntervalSince(start) * 1000)) ms")
      #endif
      self.body = body
      ready = true
      return true
    }

    private func applyGPU(_ g: GPUSkin, focus on: Bool, body: ModelEntity) {
      let palette = on ? g.focus : g.full
      func swap(_ entity: ModelEntity, _ index: Int, _ original: PhysicallyBasedMaterial, isBody: Bool) {
        guard var materials = entity.model?.materials, index < materials.count,
          let m = MuscleMaterial.material(replacing: original, body: isBody, textures: g.textures, palette: palette)
        else { return }
        materials[index] = m
        entity.model?.materials = materials
      }
      swap(body, g.bodyIndex, g.bodyOriginal, isBody: true)
      if let apparelBody, let apparelIndex, let original = g.apparelOriginal {
        swap(apparelBody, apparelIndex, original, isBody: false)
      }
      shownFocus = on
    }

    private static func texture(_ name: String, _ semantic: TextureResource.Semantic) async -> TextureResource? {
      // Bài dạng khối xuất JPEG (nhẹ hơn ~3 lần), bài cũ PNG.
      guard let url = Bundle.main.url(forResource: name, withExtension: "jpg")
        ?? Bundle.main.url(forResource: name, withExtension: "png") else { return nil }
      return try? await TextureResource(contentsOf: url, options: .init(semantic: semantic))
    }

    /// Gán bộ texture vào vật liệu thân (vật liệu duy nhất có normal map) và
    /// quần. Gán lại mảng vật liệu cũ thì RealityKit không vẽ lại, nên luôn
    /// dựng vật liệu mới.
    func apply(focus on: Bool, force: Bool = false) {
      guard ready, force || on != shownFocus, let body else { return }
      if let gpu { return applyGPU(gpu, focus: on, body: body) }
      let skin = on ? focus : full
      let apparelSkin = on ? focusApparel : fullApparel
      Self.retexture(body) { index, pbr in
        if pbr.normal.texture != nil {
          pbr.baseColor.texture = skin.base
          pbr.emissiveColor.texture = skin.emissive
          pbr.normal.texture = skin.normal
          return true
        }
        return false
      }
      if let apparelBody, let apparelIndex {
        Self.retexture(apparelBody) { index, pbr in
          guard index == apparelIndex, pbr.normal.texture == nil else { return false }
          pbr.baseColor.texture = apparelSkin.base
          pbr.emissiveColor.texture = apparelSkin.emissive
          return true
        }
      }
      shownFocus = on
    }

    /// Dựng mảng vật liệu mới (gán lại mảng cũ thì RealityKit không vẽ lại).
    private static func retexture(_ entity: ModelEntity, _ change: (Int, inout PhysicallyBasedMaterial) -> Bool) {
      guard let model = entity.model else { return }
      entity.model?.materials = model.materials.enumerated().map { index, material in
        guard var pbr = material as? PhysicallyBasedMaterial, change(index, &pbr) else { return material }
        return pbr
      }
    }

    private static func find(in entity: Entity) -> ModelEntity? {
      if entity.name.contains(bodyName), let model = entity as? ModelEntity, model.model != nil { return model }
      for child in entity.children {
        if let hit = find(in: child) { return hit }
      }
      return nil
    }
  }
#endif
