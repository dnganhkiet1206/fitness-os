#if DEBUG
  import ASCNDCore
  import Foundation

  /// Minh hoạ 3D của bài tập dựng trong repo (`artifacts/exercise-visual-system`,
  /// #527). Chuyển động là bản thử, CHƯA được người có chuyên môn duyệt
  /// ("UNVERIFIED — NOT APPROVED FOR PRODUCTION"), nên chỉ có ở bản Debug và
  /// luôn mang nhãn "chưa duyệt". Một file USDZ duy nhất cho mỗi bài, trình
  /// xem (`ExerciseDemo3DView`) cho xoay 360° thay cho bộ clip nhiều góc quay
  /// trước đây. Gỡ: xoá tệp này, `ExerciseDemo3DView.swift`, thư mục
  /// `Resources/ExerciseDemos` và các khối `#if DEBUG` trong `ExerciseGuideView`.
  enum ExerciseDemo3D {
    struct Demo {
      /// USDZ hoạt hình (`Resources/ExerciseDemos`), không đuôi file.
      let usdzFile: String
      /// Clip vòng lặp của góc 45°: chỉ làm nền cho tấm ảnh đại diện ở đầu
      /// trang, trình xem không phát clip này mà mở USDZ.
      let loopFile: String?
      /// Poster của góc 45° cho ảnh đại diện ở đầu trang, không đuôi file.
      let posterFile: String
      /// Thời lượng hoạt hình trong USDZ: khung 24–228 ở 24 fps (phần giữ
      /// yên ở đầu/cuối clip bị USD export lược, không ảnh hưởng chuyển động).
      let durationS: Double
      /// Legend chú thích cơ của trình xem (Kiệt 13/11: bắt buộc phải có):
      /// mỗi mục là một nhóm cơ ĐANG ĐƯỢC TÔ SÁNG trong bản render. Danh
      /// sách lấy từ `bench-press/exercise.json` — chỉ các vai trò trong
      /// `highlight_roles` (cơ chính + cơ phụ); nhóm ổn định không tô sáng
      /// nên không có trong legend. Bài sau thêm demo thì kèm legend của
      /// bài đó, cùng nguồn dữ liệu.
      let legend: [LegendEntry]
      /// Góc mặc định của trình xem (Y-up, mét): `default_camera` trong
      /// `<bài>/usdz/usdz_report.json` của pipeline.
      var cameraPosition: SIMD3<Float> = [3.5378, 2.3302, 3.3852]
      var cameraTarget: SIMD3<Float> = [0.1817, 0.6027, 0.0291]
      /// Tiền tố texture thân "chỉ cơ chính" (`<prefix>_albedo/_emission/_normal.png`,
      /// `pipeline/export_usdz.py`); nil = bài không có nút ẩn cơ phụ.
      var focusTexturePrefix: String?
    }

    /// Một mục trong legend: chấm màu đúng màu tô sáng của vai trò trong
    /// bản render + tên cơ + vai trò, qua key i18n.
    struct LegendEntry {
      /// Mã màu hex, đúng `muscle_primary` / `muscle_secondary` trong
      /// `config/brand.config.json` của pipeline render.
      let hex: String
      /// Key tên cơ (`eg.demo3d.legend.*` trong Localizable.xcstrings).
      let nameKey: String
      /// Key vai trò (`eg.demo3d.legend.primary` / `.secondary`).
      let roleKey: String
    }

    static let benchPress = Demo(
      usdzFile: "bench_press_animation", loopFile: "bench_press_45_loop", posterFile: "bench_press_45_poster",
      durationS: 8.5,
      legend: [
        LegendEntry(
          hex: "#E8552B", nameKey: "eg.demo3d.legend.pectoralisMajor", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(
          hex: "#F2A33A", nameKey: "eg.demo3d.legend.deltoidAnterior", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(
          hex: "#F2A33A", nameKey: "eg.demo3d.legend.tricepsBrachii", roleKey: "eg.demo3d.legend.secondary"),
      ],
      focusTexturePrefix: "bench_press_focus")

    /// Motion Lab (14/11): tạo từ template họ "curl" (`motionlab/families/curl.py`).
    static let dumbbellCurl = Demo(
      usdzFile: "dumbbell_curl_animation", loopFile: nil, posterFile: "dumbbell_curl_poster",
      durationS: 9.8,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.bicepsBrachii", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.forearms", roleKey: "eg.demo3d.legend.secondary"),
      ],
      cameraPosition: [1.6631, 1.7949, 1.7473], cameraTarget: [-0.0249, 0.926, 0.0593],
      focusTexturePrefix: "dumbbell_curl_focus")

    /// Motion Lab (14/11): tạo từ template họ "squat" (`motionlab/families/squat.py`).
    static let backSquat = Demo(
      usdzFile: "back_squat_animation", loopFile: nil, posterFile: "back_squat_poster",
      durationS: 9.3,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.quadriceps", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.gluteusMaximus", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.adductors", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.erectorSpinae", roleKey: "eg.demo3d.legend.secondary"),
      ],
      cameraPosition: [2.8529, 2.2835, 2.7084], cameraTarget: [0.1056, 0.8694, -0.039],
      focusTexturePrefix: "back_squat_focus")

    /// Motion Lab (14/11, P1): họ "curl", tay cầm trung tính.
    static let hammerCurl = Demo(
      usdzFile: "hammer_curl_animation", loopFile: nil, posterFile: "hammer_curl_poster",
      durationS: 9.8,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.forearms", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.bicepsBrachii", roleKey: "eg.demo3d.legend.primary"),
      ],
      cameraPosition: [1.6303, 1.7949, 1.7803], cameraTarget: [-0.0105, 0.9503, 0.1396],
      focusTexturePrefix: "hammer_curl_focus")

    /// Motion Lab (14/11, P1): họ "raise_lateral" (`motionlab/families/raise_lateral.py`).
    static let sideLateralRaise = Demo(
      usdzFile: "side_lateral_raise_animation", loopFile: nil, posterFile: "side_lateral_raise_poster",
      durationS: 9.0,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.deltoidLateral", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.deltoidAnterior", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.trapezius", roleKey: "eg.demo3d.legend.secondary"),
      ],
      cameraPosition: [2.2529, 2.0924, 2.3874], cameraTarget: [0.0102, 0.938, 0.1448],
      focusTexturePrefix: "side_lateral_raise_focus")

    /// Motion Lab (14/11, P1): họ "hinge" (`motionlab/families/hinge.py`).
    static let stiffLegDeadlift = Demo(
      usdzFile: "stiff_leg_dumbbell_deadlift_animation", loopFile: nil, posterFile: "stiff_leg_dumbbell_deadlift_poster",
      durationS: 9.7,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.hamstrings", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.gluteusMaximus", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.erectorSpinae", roleKey: "eg.demo3d.legend.secondary"),
      ],
      cameraPosition: [1.6231, 1.798, 1.7876], cameraTarget: [-0.0182, 0.9532, 0.1462],
      focusTexturePrefix: "stiff_leg_dumbbell_deadlift_focus")

    /// Motion Lab (14/11, P1 lô 2): họ "row" (`motionlab/families/row.py`).
    static let bentOverRow = Demo(
      usdzFile: "bent_over_two_dumbbell_row_animation", loopFile: nil, posterFile: "bent_over_two_dumbbell_row_poster",
      durationS: 8.2,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.latissimusDorsi", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.trapezius", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.deltoidPosterior", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.bicepsBrachii", roleKey: "eg.demo3d.legend.secondary"),
      ],
      cameraPosition: [1.4831, 1.3596, 1.5948], cameraTarget: [0.0211, 0.6071, 0.1328],
      focusTexturePrefix: "bent_over_two_dumbbell_row_focus")

    /// Motion Lab (14/11, P1 lô 2): họ "press_vertical", ngồi ghế tựa, bả vai theo tay.
    static let dumbbellShoulderPress = Demo(
      usdzFile: "dumbbell_shoulder_press_animation", loopFile: nil, posterFile: "dumbbell_shoulder_press_poster",
      durationS: 8.8,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.deltoidAnterior", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.deltoidLateral", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.tricepsBrachii", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.trapezius", roleKey: "eg.demo3d.legend.secondary"),
      ],
      cameraPosition: [1.8265, 1.7499, 1.9738], cameraTarget: [-0.0029, 0.8082, 0.1443],
      focusTexturePrefix: "dumbbell_shoulder_press_focus")

    /// Danh sách các bài đã có bản 3D, mỗi bài một dòng (màn Lab "3D", Kiệt
    /// 14/11): tên hiện + tên tra trong `demos` + họ động tác của Motion Lab.
    static let catalog: [(title: String, key: String, family: String)] = [
      ("Barbell Bench Press", "bench press", "press_horizontal (script riêng)"),
      ("Barbell Back Squat", "back squat", "squat"),
      ("Dumbbell Biceps Curl", "dumbbell curl", "curl"),
      ("Hammer Curl", "hammer curl", "curl"),
      ("Side Lateral Raise", "side lateral raise", "raise_lateral"),
      ("Stiff-Legged Dumbbell Deadlift", "stiff-legged dumbbell deadlift", "hinge"),
      ("Bent Over Two-Dumbbell Row", "bent over two-dumbbell row", "row"),
      ("Dumbbell Shoulder Press", "dumbbell shoulder press", "press_vertical (ngồi)"),
    ]

    /// Tên bài (đã gập như `PersonalRecords.exerciseKey`) → bản minh hoạ.
    static let demos: [String: Demo] = [
      "bench press": benchPress,
      "barbell bench press": benchPress,
      "barbell bench press - medium grip": benchPress,
      "squat": backSquat,
      "back squat": backSquat,
      "barbell back squat": backSquat,
      "barbell squat": backSquat,
      "bicep curl": dumbbellCurl,
      "biceps curl": dumbbellCurl,
      "dumbbell curl": dumbbellCurl,
      "dumbbell bicep curl": dumbbellCurl,
      "dumbbell biceps curl": dumbbellCurl,
      "hammer curls": hammerCurl,
      "hammer curl": hammerCurl,
      "dumbbell hammer curl": hammerCurl,
      "side lateral raise": sideLateralRaise,
      "lateral raise": sideLateralRaise,
      "dumbbell lateral raise": sideLateralRaise,
      "stiff-legged dumbbell deadlift": stiffLegDeadlift,
      "stiff-leg dumbbell deadlift": stiffLegDeadlift,
      "dumbbell stiff-legged deadlift": stiffLegDeadlift,
      "bent over two-dumbbell row": bentOverRow,
      "bent over dumbbell row": bentOverRow,
      "dumbbell bent over row": bentOverRow,
      "dumbbell shoulder press": dumbbellShoulderPress,
      "seated dumbbell shoulder press": dumbbellShoulderPress,
      "seated dumbbell press": dumbbellShoulderPress,
    ]

    static func demo(for name: String) -> Demo? {
      demos[PersonalRecords.exerciseKey(name)]
    }

    /// Poster của bài (ảnh đại diện trên thẻ buổi tập); nil khi bài không có
    /// bản 3D hay thiếu USDZ trong bundle.
    static func posterURL(for name: String) -> URL? {
      guard let demo = demo(for: name),
        Bundle.main.url(forResource: demo.usdzFile, withExtension: "usdz") != nil
      else { return nil }
      return Bundle.main.url(forResource: demo.posterFile, withExtension: "jpg")
    }

    /// Một tấm duy nhất cho ảnh đại diện ở đầu trang (poster + nút ▶): chạm
    /// mở trình xem 3D, không phát clip này. Trả nil khi thiếu USDZ.
    static func media(for name: String, alt: String?) -> MediaState? {
      guard let demo = demo(for: name),
        Bundle.main.url(forResource: demo.usdzFile, withExtension: "usdz") != nil,
        let loop = demo.loopFile,
        let video = Bundle.main.url(forResource: loop, withExtension: "mp4"),
        let poster = Bundle.main.url(forResource: demo.posterFile, withExtension: "jpg")
      else { return nil }
      return .bundledVideos([(video.absoluteString, poster.absoluteString, demo.durationS, alt)])
    }
  }
#endif
