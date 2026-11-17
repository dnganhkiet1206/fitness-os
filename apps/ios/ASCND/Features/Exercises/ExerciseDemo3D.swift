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
      /// 3D dạng khối (`docs/exercise-visual-system/MODULAR_3D_PLAN.md`, Kiệt
      /// 16/11): chỉ khung xương + dụng cụ + chuyển động (`<bài>_motion.usdz`,
      /// `export_usdz.py --split`). Có giá trị thì trình xem nạp nhân vật dùng
      /// chung (`sharedCharacterFile`) và phát chuyển động này lên nó, texture
      /// da lấy từ `fullTexturePrefix`. Sửa nhân vật = thay một file.
      var motionFile: String?
      /// Tiền tố texture da đủ ba vai trò (`<prefix>_albedo/_emission/_normal.png`
      /// + `_apparel_albedo/_emission`) cho bài dạng khối.
      var fullTexturePrefix: String?
      /// File 3D phải có trong bundle để mở bài: file chuyển động (dạng khối)
      /// hoặc USDZ đầy đủ (bài cũ).
      var bundledFile: String { motionFile ?? usdzFile }
    }

    /// Nhân vật dùng chung cho mọi bài dạng khối (`characters/master_character_003/usdz`).
    static let sharedCharacterFile = "character_003"

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
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.deltoidAnterior", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.trapeziusUpper", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.trapezius", roleKey: "eg.demo3d.legend.stabilizer"),
      ],
      cameraPosition: [1.628, 1.7949, 1.7825], cameraTarget: [-0.0457, 0.9334, 0.1088],
      focusTexturePrefix: "dumbbell_curl_focus",
      motionFile: "dumbbell_curl_motion", fullTexturePrefix: "dumbbell_curl_full")

    /// Motion Lab (14/11): tạo từ template họ "squat" (`motionlab/families/squat.py`).
    static let backSquat = Demo(
      usdzFile: "back_squat_animation", loopFile: nil, posterFile: "back_squat_poster",
      durationS: 9.3,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.quadriceps", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.gluteusMaximus", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.adductors", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.calves", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.erectorSpinae", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.hamstrings", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.rectusAbdominis", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.trapeziusUpper", roleKey: "eg.demo3d.legend.stabilizer"),
      ],
      cameraPosition: [2.8566, 2.297, 2.7079], cameraTarget: [0.1091, 0.8827, -0.0397],
      focusTexturePrefix: "back_squat_focus",
      motionFile: "back_squat_motion", fullTexturePrefix: "back_squat_full")

    /// Motion Lab (14/11, P1): họ "curl", tay cầm trung tính.
    static let hammerCurl = Demo(
      usdzFile: "hammer_curl_animation", loopFile: nil, posterFile: "hammer_curl_poster",
      durationS: 9.8,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.forearms", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.bicepsBrachii", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.deltoidAnterior", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.trapeziusUpper", roleKey: "eg.demo3d.legend.stabilizer"),
      ],
      cameraPosition: [1.6303, 1.7949, 1.7803], cameraTarget: [-0.0145, 0.9483, 0.1356],
      focusTexturePrefix: "hammer_curl_focus",
      motionFile: "hammer_curl_motion", fullTexturePrefix: "hammer_curl_full")

    /// Motion Lab (14/11, P1): họ "raise_lateral" (`motionlab/families/raise_lateral.py`).
    static let sideLateralRaise = Demo(
      usdzFile: "side_lateral_raise_animation", loopFile: nil, posterFile: "side_lateral_raise_poster",
      durationS: 9.0,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.deltoidLateral", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.deltoidAnterior", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.trapezius", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.serratusAnterior", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.trapeziusUpper", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.rotatorCuffPosterior", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.erectorSpinae", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.forearms", roleKey: "eg.demo3d.legend.stabilizer"),
      ],
      cameraPosition: [2.4272, 2.1371, 2.4476], cameraTarget: [0.0783, 0.9281, 0.0987],
      focusTexturePrefix: "side_lateral_raise_focus",
      motionFile: "side_lateral_raise_motion", fullTexturePrefix: "side_lateral_raise_full")

    /// Motion Lab (14/11, P1): họ "hinge" (`motionlab/families/hinge.py`).
    static let stiffLegDeadlift = Demo(
      usdzFile: "stiff_leg_dumbbell_deadlift_animation", loopFile: nil, posterFile: "stiff_leg_dumbbell_deadlift_poster",
      durationS: 9.7,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.hamstrings", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.gluteusMaximus", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.adductors", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.erectorSpinae", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.trapeziusUpper", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.rhomboids", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.forearms", roleKey: "eg.demo3d.legend.stabilizer"),
      ],
      // Góc mặc định từ phía sau (14/11): cơ chính ở mặt sau thân.
      cameraPosition: [1.3615, 1.7978, -1.8009], cameraTarget: [-0.013, 0.9256, 0.162],
      focusTexturePrefix: "stiff_leg_dumbbell_deadlift_focus",
      motionFile: "stiff_leg_dumbbell_deadlift_motion", fullTexturePrefix: "stiff_leg_dumbbell_deadlift_full")

    /// Motion Lab (14/11, P1 lô 2): họ "row" (`motionlab/families/row.py`).
    static let bentOverRow = Demo(
      usdzFile: "bent_over_two_dumbbell_row_animation", loopFile: nil, posterFile: "bent_over_two_dumbbell_row_poster",
      durationS: 8.2,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.latissimusDorsi", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.trapezius", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.rhomboids", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.deltoidPosterior", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.bicepsBrachii", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.rotatorCuffPosterior", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.forearms", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.erectorSpinae", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.trapeziusUpper", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.hamstrings", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.gluteusMaximus", roleKey: "eg.demo3d.legend.stabilizer"),
      ],
      // Góc mặc định từ phía sau (14/11): cơ lưng xô ở mặt sau thân.
      cameraPosition: [1.0558, 1.4568, -1.514], cameraTarget: [-0.0757, 0.7388, 0.1019],
      focusTexturePrefix: "bent_over_two_dumbbell_row_focus",
      motionFile: "bent_over_two_dumbbell_row_motion", fullTexturePrefix: "bent_over_two_dumbbell_row_full")

    /// Motion Lab (14/11, P1 lô 2): họ "press_vertical", ngồi ghế tựa, bả vai theo tay.
    static let dumbbellShoulderPress = Demo(
      usdzFile: "dumbbell_shoulder_press_animation", loopFile: nil, posterFile: "dumbbell_shoulder_press_poster",
      durationS: 8.8,
      legend: [
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.deltoidAnterior", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#E8552B", nameKey: "eg.demo3d.legend.deltoidLateral", roleKey: "eg.demo3d.legend.primary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.tricepsBrachii", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.trapezius", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#F2A33A", nameKey: "eg.demo3d.legend.serratusAnterior", roleKey: "eg.demo3d.legend.secondary"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.trapeziusUpper", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.rotatorCuffPosterior", roleKey: "eg.demo3d.legend.stabilizer"),
        LegendEntry(hex: "#6FA7C9", nameKey: "eg.demo3d.legend.bicepsBrachii", roleKey: "eg.demo3d.legend.stabilizer"),
      ],
      cameraPosition: [1.7982, 1.6958, 1.9101], cameraTarget: [0.0105, 0.7756, 0.1224],
      focusTexturePrefix: "dumbbell_shoulder_press_focus",
      motionFile: "dumbbell_shoulder_press_motion", fullTexturePrefix: "dumbbell_shoulder_press_full")

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
        "Render lại 16/11 trên nhân vật 3.3: bản đồ cơ 48 phần, thớ cơ theo từng phần, tô 3 cấp Chính / Phụ / Ổn định (vai trò theo ExRx)",
      ] + extra
    }


    /// Danh sách các bài đã có bản 3D, mỗi bài một dòng (màn Lab "3D", Kiệt
    /// 14/11): tên hiện + tên tra trong `demos` + họ động tác của Motion Lab
    /// + kết quả tự kiểm.
    static let catalog: [CatalogEntry] = [
      CatalogEntry(
        title: "Barbell Bench Press", key: "bench press", family: "press_horizontal (script riêng)", review: nil,
        note: "Chưa kiểm lại: bản trong app là bản cũ; dựng lại trên nhân vật 003 đang chờ chọn phương án đáy A/B"),
      CatalogEntry(
        title: "Barbell Back Squat", key: "back squat", family: "squat", review: nil,
        note: "Kiệt 16/11: vai/ngực/cơ thang phồng, tư thế chưa đúng. Làm lại theo 2 video (PureGym, Dave Watkeys) + Catalyst Athletics, Squat University: tay nắm ngoài vai 1 nắm tay, kép bả vai, khuỷu chĩa xuống, đòn trên cơ thang; nhân vật thêm xương phụ chia góc xoay cánh tay. QA 18/18. Chờ Kiệt xem lại"),
      CatalogEntry(
        title: "Dumbbell Biceps Curl", key: "dumbbell curl", family: "curl",
        review: Review(
          date: "16/11",
          checked: fullCheck(qa: "19/19", technique: "cánh tay trên sát thân, khuỷu gập ~138°, lòng bàn tay ngửa, thân đứng yên"),
          remaining: [])),
      CatalogEntry(
        title: "Hammer Curl", key: "hammer curl", family: "curl",
        review: Review(
          date: "16/11",
          checked: fullCheck(qa: "19/19", technique: "tay cầm trung tính (ngón cái hướng lên) suốt đường đi, khuỷu sát thân"),
          remaining: [])),
      CatalogEntry(
        title: "Side Lateral Raise", key: "side lateral raise", family: "raise_lateral", review: nil,
        note: "Kiệt 14/11: chưa đúng. Đã sửa theo ảnh ExRx: bắt đầu tạ trước đùi, thân hơi cúi, gối hơi gập; ở đỉnh khuỷu ngang vai ngay bên vai, cẳng tay chếch trước; tay cầm nằm ngang (trước bị xoay nghiêng ~45°); vai nâng theo tay. QA 18/18. Chờ Kiệt xem lại"),
      CatalogEntry(
        title: "Stiff-Legged Dumbbell Deadlift", key: "stiff-legged dumbbell deadlift", family: "hinge",
        review: Review(
          date: "16/11",
          checked: fullCheck(qa: "18/18", technique: "gập hông, lưng thẳng, gối mềm, hông lùi ra sau, tạ sát chân xuống giữa cẳng chân, trọng tâm trên bàn chân"),
          remaining: [])),
      CatalogEntry(
        title: "Bent Over Two-Dumbbell Row", key: "bent over two-dumbbell row", family: "row", review: nil,
        note: "Kiệt 14–15/11: sai tư thế. Làm lại theo 2 video YouTube người thật + Garage Gym Reviews, PowerliftingTechnique, Muscle & Strength: thân gập ~52° và giữ nguyên, gối hơi gập, lưng thẳng, cổ trung tính; khuỷu sát thân kéo về phía hông, tạ lên ngang eo. QA 17/17. Chờ Kiệt xem lại"),
      CatalogEntry(
        title: "Dumbbell Shoulder Press", key: "dumbbell shoulder press", family: "press_vertical (ngồi)",
        review: Review(
          date: "16/11",
          checked: fullCheck(
            qa: "19/19",
            technique: "ghế 70°, lưng và đầu tựa đệm, vai hạ, khuỷu dưới cổ tay ~35° ra trước, hạ tới ngang cằm, đẩy thẳng lên, hai tạ không chạm",
            extra: [
              "Đối chiếu 3 video YouTube người thật + ACE, Muscle & Strength, ExRx",
              "Kiệt duyệt động tác 15/11",
              "Mẹo: 5 ô (ghế, vai, khuỷu, độ sâu, bụng)",
            ]),
          remaining: []),
        note: "Kiệt duyệt động tác 15/11. Bấm nút Mẹo (bóng đèn) trong trình xem để xem 5 mẹo kỹ thuật"),
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
        Bundle.main.url(forResource: demo.bundledFile, withExtension: "usdz") != nil
      else { return nil }
      return Bundle.main.url(forResource: demo.posterFile, withExtension: "jpg")
    }

    /// Một tấm duy nhất cho ảnh đại diện ở đầu trang (poster + nút ▶): chạm
    /// mở trình xem 3D, không phát clip này. Trả nil khi thiếu USDZ.
    static func media(for name: String, alt: String?) -> MediaState? {
      guard let demo = demo(for: name),
        Bundle.main.url(forResource: demo.bundledFile, withExtension: "usdz") != nil,
        let loop = demo.loopFile,
        let video = Bundle.main.url(forResource: loop, withExtension: "mp4"),
        let poster = Bundle.main.url(forResource: demo.posterFile, withExtension: "jpg")
      else { return nil }
      return .bundledVideos([(video.absoluteString, poster.absoluteString, demo.durationS, alt)])
    }
  }
#endif
