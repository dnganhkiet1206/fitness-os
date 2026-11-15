import ASCNDCore
import Foundation

/// Minh hoạ 3D của bài tập dựng trong repo (`artifacts/exercise-visual-system`,
/// #527). Một file USDZ duy nhất cho mỗi bài, trình xem (`ExerciseDemo3DView`)
/// cho xoay 360° thay cho bộ clip nhiều góc quay trước đây.
///
/// Chốt theo từng bài (Kiệt 14/11): bài nào `approved` thì có mặt cả bản
/// Release; bài chưa chốt chỉ ở bản Debug và mang nhãn "chưa duyệt" ở trang
/// hướng dẫn. Chuẩn chốt là đối chiếu chuyển động thật theo quyết định của
/// Kiệt (không budget chuyên gia) — ghi trong `<bài>/exercise.json`
/// (`status`, `reviewer`, `approval_date`, `approval_basis`); không ghi đã có
/// chuyên gia duyệt khi chưa có. Gỡ: xoá tệp này, `ExerciseDemo3DView.swift`,
/// `ExerciseDemoTips.swift`, `ExerciseDemoStage.swift`, thư mục
/// `Resources/ExerciseDemos` và các chỗ gọi `ExerciseDemo3D` trong
/// `ExerciseGuideView` / `WorkoutView`.
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
    /// Bài đã chốt lên product (đối chiếu chuyển động thật, xem chú thích ở
    /// đầu tệp): có mặt cả bản Release. Mặc định false = chỉ bản Debug và
    /// mang nhãn "chưa duyệt".
    var approved = false
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

  /// Bench press đã chốt 14/11 (đối chiếu chuyển động thật + quyết định (a),
  /// xem `bench-press/exercise.json`): có mặt cả bản Release. Góc máy =
  /// `default_camera` trong `usdz_report.json` của bản export nhân vật 003.
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
    cameraPosition: [3.5877, 2.3205, 3.4597], cameraTarget: [0.1766, 0.5647, 0.0485],
    focusTexturePrefix: "bench_press_focus",
    approved: true)

  /// Motion Lab (14/11): tạo từ template họ "curl" (`motionlab/families/curl.py`).
  static let dumbbellCurl = Demo(
    usdzFile: "dumbbell_curl_animation", loopFile: nil, posterFile: "dumbbell_curl_poster",
    durationS: 9.8,
    legend: [
      LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.bicepsBrachii", roleKey: "eg.demo3d.legend.primary"),
      LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.forearms", roleKey: "eg.demo3d.legend.secondary"),
    ],
    cameraPosition: [1.6631, 1.7949, 1.7473], cameraTarget: [-0.0249, 0.926, 0.0593],
    focusTexturePrefix: "dumbbell_curl_focus",
    approved: true)

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
    cameraPosition: [2.4272, 2.1371, 2.4476], cameraTarget: [0.0779, 0.9279, 0.0983],
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
    // Góc mặc định từ phía sau (14/11): cơ chính ở mặt sau thân.
    cameraPosition: [1.3624, 1.7978, -1.8002], cameraTarget: [-0.0119, 0.9257, 0.1624],
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
    // Góc mặc định từ phía sau (14/11): cơ lưng xô ở mặt sau thân.
    cameraPosition: [1.0343, 1.294, -1.4504], cameraTarget: [-0.0586, 0.6005, 0.1104],
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
    cameraPosition: [1.7982, 1.6958, 1.9101], cameraTarget: [0.015, 0.7779, 0.1269],
    focusTexturePrefix: "dumbbell_shoulder_press_focus")

  /// Kết quả agent tự kiểm một bài (Kiệt 14/11: bài đã kiểm đầy đủ có dấu
  /// tích xanh kèm ghi chú đã kiểm những gì). KHÔNG phải duyệt chuyên môn:
  /// chuyển động vẫn "chưa duyệt" cho tới khi có người có chuyên môn xem.
  /// Nguồn: `agent_review` trong `<bài>/exercise.json` của Motion Lab.
  struct Review {
    let date: String
    /// Những gì đã kiểm và đạt.
    let checked: [String]
    /// Lỗi còn lại đã biết (rỗng = không còn lỗi máy bắt được).
    let remaining: [String]
  }

  struct CatalogEntry {
    let title: String
    let key: String
    let family: String
    /// nil = chưa kiểm lại đầy đủ.
    let review: Review?
    var note: String?
  }

  private static func fullCheck(qa: String, technique: String, extra: [String] = []) -> [String] {
    [
      "QA tự động \(qa): xương, tay bám dụng cụ, chân không trượt, dụng cụ không xuyên da, dáng toàn thân, khớp nhịp tempo.json",
      "Tờ soi xoay vòng 8 góc × 3 khung (đầu, giữa, cuối pha)",
      "Tờ soi tầm mắt người đứng nhìn (1,6 m) 5 góc: \(technique)",
      "Mở trong trình xem 3D của app (simulator iPhone 17), chú thích cơ đúng",
    ] + extra
  }

  private static let groinStretch = "Giãn da vùng háng trước khi gập hông sâu (giới hạn lưới nhân vật 003, chung cho mọi bài gập hông ≥ 90°)"

  /// Danh sách các bài đã có bản 3D, mỗi bài một dòng (màn Lab "3D", Kiệt
  /// 14/11): tên hiện + tên tra trong `demos` + họ động tác của Motion Lab
  /// + kết quả tự kiểm.
  static let catalog: [CatalogEntry] = [
    CatalogEntry(
      title: "Barbell Bench Press", key: "bench press", family: "press_horizontal (script riêng)", review: nil,
      note: "Đã chốt 14/11: bản trong app là bản xuất 003 đã đánh giá (gập khuỷu đáy 105,8°); Kiệt chọn chấp nhận combo tay rộng + đáy sâu, khuỷu dưới đệm là giới hạn đã biết."),
    CatalogEntry(
      title: "Barbell Back Squat", key: "back squat", family: "squat",
      review: Review(
        date: "14/11",
        checked: fullCheck(qa: "16/17", technique: "đáy ngang song song, thân đổ ~40°, thanh trên giữa bàn chân, gối theo mũi chân, gót chạm sàn"),
        remaining: [groinStretch + ": 3,82 / ngưỡng 2,6"])),
    CatalogEntry(
      title: "Dumbbell Biceps Curl", key: "dumbbell curl", family: "curl",
      review: Review(
        date: "14/11",
        checked: fullCheck(qa: "18/18", technique: "cánh tay trên sát thân, khuỷu gập ~138°, lòng bàn tay ngửa, thân đứng yên"),
        remaining: [])),
    CatalogEntry(
      title: "Hammer Curl", key: "hammer curl", family: "curl",
      review: Review(
        date: "14/11",
        checked: fullCheck(qa: "18/18", technique: "tay cầm trung tính (ngón cái hướng lên) suốt đường đi, khuỷu sát thân"),
        remaining: [])),
    CatalogEntry(
      title: "Side Lateral Raise", key: "side lateral raise", family: "raise_lateral", review: nil,
      note: "Kiệt 14/11: chưa đúng. Đã sửa theo ảnh ExRx: bắt đầu tạ trước đùi, thân hơi cúi, gối hơi gập; ở đỉnh khuỷu ngang vai ngay bên vai, cẳng tay chếch trước; tay cầm nằm ngang (trước bị xoay nghiêng ~45°); vai nâng theo tay. QA 18/18. Chờ Kiệt xem lại"),
    CatalogEntry(
      title: "Stiff-Legged Dumbbell Deadlift", key: "stiff-legged dumbbell deadlift", family: "hinge",
      review: Review(
        date: "14/11",
        checked: fullCheck(qa: "16/17", technique: "gập hông, lưng thẳng, gối mềm, hông lùi ra sau, tạ sát chân xuống giữa cẳng chân, trọng tâm trên bàn chân"),
        remaining: [groinStretch + ": 2,80 / ngưỡng 2,6"])),
    CatalogEntry(
      title: "Bent Over Two-Dumbbell Row", key: "bent over two-dumbbell row", family: "row", review: nil,
      note: "Kiệt 14/11: sai tư thế. Đã sửa: gối gập 31° (cẳng chân thẳng đứng, hông đẩy ra sau), lưng thẳng hơi ưỡn ngực, đầu ngẩng thẳng hàng cột sống, bả vai kéo về sau ở đỉnh. Chờ Kiệt xem lại; còn giãn da háng 2,98"),
    CatalogEntry(
      title: "Dumbbell Shoulder Press", key: "dumbbell shoulder press", family: "press_vertical (ngồi)", review: nil,
      note: "Kiệt 14–15/11: sai hoàn toàn, rồi ghi chú thêm. Soi lại 3 video YouTube người thật + ACE + ExRx: ghế 70°, lưng và đầu tựa đệm (đệm dài 82 cm); vai hạ; khuỷu khép ~35° ra trước; hạ sâu tới tạ gần chạm vai (cánh tay trên 37° so với thân, Kiệt 15/11: thấp thêm); lòng bàn tay xoay vào ~20°; cẳng tay thẳng đứng, đẩy thẳng lên, hai tạ không chạm nhau. QA 18/19 (còn giãn da háng). Chờ Kiệt xem lại"),
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

  /// Bản minh hoạ của bài, nếu được phép hiện ở bản build này: bản Debug
  /// tất cả các bài, bản Release chỉ bài đã chốt (`approved`).
  static func demo(for name: String) -> Demo? {
    guard let demo = demos[PersonalRecords.exerciseKey(name)] else { return nil }
    #if DEBUG
      return demo
    #else
      return demo.approved ? demo : nil
    #endif
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
