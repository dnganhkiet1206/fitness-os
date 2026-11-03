import Foundation
import Testing

@testable import ASCNDCore

@Suite struct TrainingCueTests {
  @Test func eachAnchorHasASensibleDefaultTime() {
    #expect(TrainingCue(anchor: .afterWork).clock == ReminderClock(hour: 18, minute: 0))
    #expect(TrainingCue(anchor: .lunch).clock == ReminderClock(hour: 12, minute: 0))
    #expect(TrainingCue(anchor: .wake, wake: ReminderClock(hour: 7, minute: 15)).clock == ReminderClock(hour: 7, minute: 15))
    #expect(TrainingCue(anchor: .custom, clock: ReminderClock(hour: 20, minute: 45)).clock.hour == 20)
  }

  @Test func textNamesTheAnchorAndTheBusyPlan() {
    let cue = TrainingCue(anchor: .afterWork, busy: .short)
    #expect(cue.text(.vi).title.hasPrefix("Tan làm rồi"))
    #expect(cue.text(.vi).body.contains("15 phút"))
    for lang in [AppPreferences.Lang.vi, .en, .es] {
      for a in TrainingCue.Anchor.allCases {
        #expect(!TrainingCue(anchor: a).text(lang).title.isEmpty)
      }
    }
  }

  @Test func onboardingPicksAndUnpicksTheCue() throws {
    var draft = OnboardingDraft()
    draft.trainingCue = TrainingCue(anchor: .dinner, busy: .tomorrow)
    let data = try JSONEncoder().encode(draft)
    let back = try JSONDecoder().decode(OnboardingDraft.self, from: data)
    #expect(back.trainingCue?.anchor == .dinner && back.trainingCue?.busy == .tomorrow)
    // nháp lưu trước 03/11 không có khoá này: vẫn đọc được
    var json = try #require(JSONSerialization.jsonObject(with: try JSONEncoder().encode(OnboardingDraft())) as? [String: Any])
    json.removeValue(forKey: "trainingCue")
    let old = try JSONDecoder().decode(OnboardingDraft.self, from: try JSONSerialization.data(withJSONObject: json))
    #expect(old.trainingCue == nil)
  }

  /// Câu "nếu… thì…" quyết định giờ và câu của lời nhắc tập của Koa, thay giờ quen.
  @Test func cueSetsTheKoaReminderTimeAndText() {
    var p = ReminderPrefs.defaults
    p.koaTraining = true
    p.workout.enabled = false
    var ctx = ReminderContext()
    ctx.missedDays = 0
    ctx.plannedByOffset = [0: true]
    ctx.habitTimes = [.workout: ReminderClock(hour: 7, minute: 0)]
    ctx.trainingCue = TrainingCue(anchor: .afterWork, busy: .short)
    ctx.cueLang = .vi
    let plan = ReminderPlan.plan(p, ctx, now: KoaReminderTests.morning, calendar: KoaReminderTests.hcm)
    let koa = plan.first { $0.key == .koaTraining }
    #expect(koa.map { KoaReminderTests.hm($0.at) } == "18:00")
    #expect(koa?.title?.hasPrefix("Tan làm rồi") == true)
    #expect(plan.filter { $0.key == .koaTraining && KoaReminderTests.hcm.isDate($0.at, inSameDayAs: koa!.at) }.count == 1)
  }
}
