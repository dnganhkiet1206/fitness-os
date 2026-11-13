#if DEBUG
  import ASCNDCore
  import Foundation

  /// Clip 3D minh hoạ bài tập dựng trong repo (`artifacts/exercise-visual-system`,
  /// #527). Chuyển động là bản thử, CHƯA được người có chuyên môn duyệt
  /// ("UNVERIFIED — NOT APPROVED FOR PRODUCTION"), nên chỉ có ở bản Debug và
  /// luôn mang nhãn "chưa duyệt". Mỗi bài có nhiều góc quay của CÙNG một lần
  /// đẩy (cùng timeline). Gỡ: xoá tệp này, thư mục `Resources/ExerciseDemos`
  /// và các khối `#if DEBUG` trong `ExerciseGuideView`.
  enum ExerciseDemo3D {
    struct Angle {
      let file: String
      let labelKey: String.LocalizationValue
    }

    static let benchPress: [Angle] = [
      Angle(file: "bench_press_45", labelKey: "eg.demo3d.angle45"),
      Angle(file: "bench_press_side", labelKey: "eg.demo3d.side"),
      Angle(file: "bench_press_front", labelKey: "eg.demo3d.front"),
    ]

    /// Tên bài (đã gập như `PersonalRecords.exerciseKey`) → các góc.
    static let clips: [String: [Angle]] = [
      "bench press": benchPress,
      "barbell bench press": benchPress,
      "barbell bench press - medium grip": benchPress,
    ]

    static func angles(for name: String) -> [Angle] {
      clips[PersonalRecords.exerciseKey(name)] ?? []
    }

    static func media(for name: String, alt: String?) -> MediaState? {
      let found = angles(for: name).compactMap { angle -> (uri: String, posterUri: String?, durationS: Double?, alt: String?)? in
        guard let video = Bundle.main.url(forResource: "\(angle.file)_loop", withExtension: "mp4") else { return nil }
        let poster = Bundle.main.url(forResource: "\(angle.file)_poster", withExtension: "jpg")
        return (video.absoluteString, poster?.absoluteString, 5.5, alt)
      }
      return found.isEmpty ? nil : .bundledVideos(found)
    }

    static func labels(for name: String) -> [String] {
      angles(for: name).map { String(localized: $0.labelKey) }
    }
  }
#endif
