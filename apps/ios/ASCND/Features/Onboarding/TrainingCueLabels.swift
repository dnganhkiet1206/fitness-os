import ASCNDCore
import Foundation

/// Chữ của câu "nếu… thì…" (`TrainingCue`), dùng chung cho onboarding và Nhắc nhở.
extension TrainingCue.Anchor {
  var label: String {
    switch self {
    case .wake: String(localized: "cue.after.wake")
    case .lunch: String(localized: "cue.after.lunch")
    case .afterWork: String(localized: "cue.after.work")
    case .dinner: String(localized: "cue.after.dinner")
    case .custom: String(localized: "cue.after.custom")
    }
  }
}

extension TrainingCue.Busy {
  var label: String {
    switch self {
    case .short: String(localized: "cue.busy.short")
    case .tomorrow: String(localized: "cue.busy.tomorrow")
    }
  }
}
