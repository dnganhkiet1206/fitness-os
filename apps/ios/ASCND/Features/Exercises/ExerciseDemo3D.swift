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
