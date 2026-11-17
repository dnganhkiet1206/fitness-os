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
      var usdzFile: String
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
      /// Mã cơ theo vai trò (`primary` / `secondary` / `stabilizing`) cho shader tô cơ lúc chạy
      /// (`MuscleShader`, 17/11). Rỗng = bài dùng texture nướng sẵn.
      var roles: [String: [String]] = [:]
      /// File 3D phải có trong bundle để mở bài: file chuyển động (dạng khối)
      /// hoặc USDZ đầy đủ (bài cũ).
      var bundledFile: String { motionFile ?? usdzFile }
    }

    /// Nhân vật dùng chung cho mọi bài dạng khối (`characters/master_character_003/usdz`).
    static let sharedCharacterFile = "character_003"
    /// Quần áo dùng chung (khung xương + quần, tư thế nghỉ), Kiệt 16/11: đổi
    /// đồ không đụng thân hay bài nào.
    static let sharedApparelFile = "apparel_shorts"

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

    /// Dữ liệu từng bài nằm trong `<bài>_demo.json` + `demo3d_index.json`
    /// (Kiệt 16/11, `artifacts/exercise-visual-system/pipeline/export_app_demos.py`
    /// sinh từ `exercise.json`): thêm hay sửa bài không đụng code app.
    private struct DemoFile: Decodable {
      struct Legend: Decodable { let hex: String; let name_key: String; let role_key: String }
      struct Camera: Decodable { let position: [Float]?; let target: [Float]? }
      struct ReviewFile: Decodable { let date: String; let checked: [String]; let remaining: [String] }
      let id: String
      let title: String
      let family_label: String
      let aliases: [String]
      let usdz: String
      let loop: String?
      let poster: String
      let duration_s: Double
      let camera: Camera
      let legend: [Legend]
      let focus_prefix: String?
      let motion: String?
      let full_prefix: String?
      let roles: [String: [String]]?
      let review: ReviewFile?
      let note: String?
    }

    private struct Index: Decodable { let demos: [String] }

    private static func vector(_ v: [Float]?) -> SIMD3<Float>? {
      guard let v, v.count == 3 else { return nil }
      return SIMD3(v[0], v[1], v[2])
    }

    /// Nạp một lần từ bundle; thiếu tệp nào thì bỏ bài đó (không crash).
    private static let loaded: [DemoFile] = {
      func read<T: Decodable>(_ name: String, _ type: T.Type) -> T? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
          let data = try? Data(contentsOf: url)
        else { return nil }
        return try? JSONDecoder().decode(type, from: data)
      }
      guard let index = read("demo3d_index", Index.self) else { return [] }
      return index.demos.compactMap { read("\($0)_demo", DemoFile.self) }
    }()

    private static func makeDemo(_ f: DemoFile) -> Demo {
      var d = Demo(
        usdzFile: f.usdz, loopFile: f.loop, posterFile: f.poster, durationS: f.duration_s,
        legend: f.legend.map { LegendEntry(hex: $0.hex, nameKey: $0.name_key, roleKey: $0.role_key) })
      if let p = vector(f.camera.position) { d.cameraPosition = p }
      if let t = vector(f.camera.target) { d.cameraTarget = t }
      d.focusTexturePrefix = f.focus_prefix
      d.motionFile = f.motion
      d.fullTexturePrefix = f.full_prefix
      d.roles = f.roles ?? [:]
      return d
    }

    /// Kết quả agent tự kiểm một bài (Kiệt 14/11: bài đã kiểm đầy đủ có dấu
    /// tích xanh kèm ghi chú đã kiểm những gì). KHÔNG phải duyệt chuyên môn:
    /// chuyển động vẫn "chưa duyệt" cho tới khi có người có chuyên môn xem.
    /// Nguồn: `app_demo.review` trong `<bài>/exercise.json` của Motion Lab.
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

    /// Danh sách các bài đã có bản 3D, mỗi dòng một bài (màn Lab "3D", Kiệt
    /// 14/11), theo thứ tự trong `demo3d_index.json`.
    static let catalog: [CatalogEntry] = loaded.map { f in
      CatalogEntry(
        title: f.title, key: f.aliases.first ?? f.id, family: f.family_label,
        review: f.review.map { Review(date: $0.date, checked: $0.checked, remaining: $0.remaining) },
        note: f.note)
    }

    /// Tên bài (đã gập như `PersonalRecords.exerciseKey`) → bản minh hoạ.
    static let demos: [String: Demo] = {
      var out: [String: Demo] = [:]
      for f in loaded {
        let d = makeDemo(f)
        for a in f.aliases { out[PersonalRecords.exerciseKey(a)] = d }
      }
      return out
    }()

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
