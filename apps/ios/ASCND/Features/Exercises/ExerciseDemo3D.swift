#if DEBUG
  import ASCNDCore
  import Foundation

  /// Clip 3D minh hoạ bài tập dựng trong repo (`artifacts/exercise-visual-system`,
  /// #527, 11/11). Chuyển động là bản thử, CHƯA được người có chuyên môn duyệt
  /// ("UNVERIFIED — NOT APPROVED FOR PRODUCTION"), nên chỉ có ở bản Debug và
  /// luôn mang nhãn "chưa duyệt". Gỡ: xoá tệp này, thư mục
  /// `Resources/ExerciseDemos` và khối `#if DEBUG` trong `ExerciseGuideView`.
  enum ExerciseDemo3D {
    /// Tên bài (đã gập như `PersonalRecords.exerciseKey`) → tên tệp trong bundle.
    static let clips: [String: (video: String, poster: String, seconds: Double)] = [
      "bench press": ("bench_press_45_loop", "bench_press_poster", 5.5),
      "barbell bench press": ("bench_press_45_loop", "bench_press_poster", 5.5),
      "barbell bench press - medium grip": ("bench_press_45_loop", "bench_press_poster", 5.5),
    ]

    static func media(for name: String, alt: String?) -> MediaState? {
      guard let clip = clips[PersonalRecords.exerciseKey(name)],
        let video = Bundle.main.url(forResource: clip.video, withExtension: "mp4")
      else { return nil }
      let poster = Bundle.main.url(forResource: clip.poster, withExtension: "jpg")
      return .bundledVideo(uri: video.absoluteString, posterUri: poster?.absoluteString, durationS: clip.seconds, alt: alt)
    }
  }
#endif
