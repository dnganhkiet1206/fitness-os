#if DEBUG
  import SwiftUI

  /// Màu nền lúc phòng tập 3D (`gym_room_*.usdz`,
  /// `artifacts/exercise-visual-system/pipeline/build_gym_room.py`) đang tải:
  /// màu tường và sàn của phòng, sáng và tối.
  enum GymBackdrop {
    /// Màu mép trên (tường) và mép dưới (sàn) đo trên chính ảnh, để phần
    /// màn ngoài khung 3D nối liền với ảnh.
    static func edges(_ scheme: ColorScheme) -> (top: Color, bottom: Color) {
      scheme == .dark
        ? (Color(red: 120 / 255, green: 98 / 255, blue: 75 / 255), Color(red: 54 / 255, green: 56 / 255, blue: 58 / 255))
        : (Color(red: 202 / 255, green: 190 / 255, blue: 177 / 255), Color(red: 159 / 255, green: 159 / 255, blue: 159 / 255))
    }

  }

  /// Nền cả màn: tường ở trên, sàn ở dưới, nối với ảnh trong khung 3D.
  struct GymStage: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
      let e = GymBackdrop.edges(scheme)
      LinearGradient(colors: [e.top, e.top, e.bottom, e.bottom], startPoint: .top, endPoint: .bottom)
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
  }

#endif
