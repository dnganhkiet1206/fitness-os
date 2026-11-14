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
      let loopFile: String
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

    /// Tên bài (đã gập như `PersonalRecords.exerciseKey`) → bản minh hoạ.
    static let demos: [String: Demo] = [
      "bench press": benchPress,
      "barbell bench press": benchPress,
      "barbell bench press - medium grip": benchPress,
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
        let video = Bundle.main.url(forResource: demo.loopFile, withExtension: "mp4"),
        let poster = Bundle.main.url(forResource: demo.posterFile, withExtension: "jpg")
      else { return nil }
      return .bundledVideos([(video.absoluteString, poster.absoluteString, demo.durationS, alt)])
    }
  }
#endif
