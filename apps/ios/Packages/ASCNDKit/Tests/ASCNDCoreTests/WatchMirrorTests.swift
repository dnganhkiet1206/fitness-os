import ASCNDCore
import Foundation
import Testing

/// Apple Watch: ảnh buổi tập, hàng lệnh khi mất liên lạc, và cách iPhone áp lệnh
/// một lần — không đụng WatchConnectivity.
struct WatchMirrorTests {
  let rows = [
    PlannedSet(key: "c1", exerciseId: "curl", exerciseName: "Curl", ordinal: 1, of: 2, weightKg: 15, reps: 10, plannedRest: 90, plannedRpe: 8),
    PlannedSet(key: "c2", exerciseId: "curl", exerciseName: "Curl", ordinal: 2, of: 2, weightKg: 20, reps: 8, plannedRest: 90, plannedRpe: 8),
    PlannedSet(key: "p1", exerciseId: "press", exerciseName: "Press", ordinal: 1, of: 1, weightKg: 40, reps: 5, plannedRest: 120, plannedRpe: 9),
  ]

  private func live(progress: DayProgress = DayProgress(), rest: RestTimer? = nil, acked: [String] = []) -> WatchWorkoutSnapshot {
    WatchWorkoutMirror.make(
      mode: .live, templateName: "Pull", rows: rows, progress: progress, unit: .kg, rest: rest, acked: acked,
      revision: 1, at: EpochMillis(0))!
  }

  @Test func nextSetUsesTheSameTextAsThePhone() {
    let snap = live()
    #expect(snap.sets.map(\.key) == ["c1", "c2", "p1"])
    #expect(snap.sets[0].weightText == "15")
    #expect(snap.sets[0].repsText == "10")
    #expect(snap.sets[0].rpe == 8)
    #expect(snap.sets[0].workingNumber == 1)
    #expect(snap.sets[0].workingTotal == 2)
    let display = WatchMirrorState(base: snap).displayed(at: EpochMillis(0))
    guard case .logging(let card) = display.mode else {
      Issue.record("expected the first set")
      return
    }
    #expect(card.exerciseName == "Curl")
    #expect(card.ready)
  }

  @Test func screenClosedBeforeAnySetIsIdle() {
    #expect(WatchMirrorPolicy.mode(hasSession: true, phase: .idle, workoutVisible: false, restLive: false) == .idle)
    #expect(WatchMirrorPolicy.mode(hasSession: true, phase: .idle, workoutVisible: true, restLive: false) == .live)
    #expect(WatchMirrorPolicy.mode(hasSession: true, phase: .active, workoutVisible: false, restLive: false) == .live)
    #expect(WatchMirrorPolicy.mode(hasSession: true, phase: .finished, workoutVisible: true, restLive: false) == .finished)
    #expect(WatchMirrorPolicy.mode(hasSession: true, phase: .finished, workoutVisible: false, restLive: false) == .idle)
    #expect(WatchMirrorPolicy.mode(hasSession: false, phase: .active, workoutVisible: true, restLive: true) == .idle)
    #expect(WatchMirrorPolicy.mode(hasSession: true, phase: .loading, workoutVisible: true, restLive: false) == .hold)
    #expect(WatchWorkoutMirror.make(
      mode: .hold, templateName: "Pull", rows: rows, progress: DayProgress(), unit: .kg, rest: nil, acked: [],
      revision: 1, at: EpochMillis(0)) == nil)
  }

  @Test func completeStartsRestAndDoesNotFlattenAPyramid() throws {
    let now = EpochMillis(1_000)
    var state = WatchMirrorState(base: live())
    let display = state.displayed(at: now)
    let command = try #require(WatchWrist.complete(display, now: now, id: "done-1"))
    state = state.performing(command)
    let shown = state.displayed(at: now)
    guard case .resting(let rest) = shown.mode else {
      Issue.record("expected rest")
      return
    }
    #expect(rest.timer.remaining(at: now) == 90)
    #expect(rest.next?.key == "c2")
    #expect(rest.next?.weightText == "20", "set kế giữ 20 kg của kế hoạch")
    #expect(shown.pendingCount == 1)
    // Hết giờ thì hiện set kế, không bắt đầu lại nghỉ.
    let later = state.displayed(at: now + 91_000)
    guard case .logging(let next) = later.mode else {
      Issue.record("expected the next set")
      return
    }
    #expect(next.key == "c2")
  }

  @Test func editedWeightCarriesToTheNextSetOfTheSameExercise() throws {
    var state = WatchMirrorState(base: live())
    let now = EpochMillis(0)
    let bumped = try #require(WatchWrist.changeWeight(state.displayed(at: now), steps: 1, now: now, id: "w"))
    state = state.performing(bumped)
    guard case .logging(let card) = state.displayed(at: now).mode else { return }
    #expect(card.weightText == "17.5")
    let done = try #require(WatchWrist.complete(state.displayed(at: now), now: now, id: "done"))
    state = state.performing(done)
    guard case .resting(let rest) = state.displayed(at: now).mode else { return }
    #expect(rest.next?.weightText == "17.5")
    #expect(rest.next?.repsText == "8", "reps theo kế hoạch không bị san")
  }

  @Test func warmupDoesNotCarryIntoTheWorkingSet() throws {
    let warm = PlannedSet(key: "w", exerciseId: "curl", exerciseName: "Curl", ordinal: 1, of: 1, weightKg: 10, reps: 12, plannedRest: 45, warmup: true)
    let work = PlannedSet(key: "s", exerciseId: "curl", exerciseName: "Curl", ordinal: 1, of: 1, weightKg: 15, reps: 10, plannedRest: 90)
    var progress = DayProgress()
    progress.weightText["w"] = "12.5"
    let snap = WatchWorkoutMirror.make(
      mode: .live, templateName: "Pull", rows: [warm, work], progress: progress, unit: .kg, rest: nil, acked: [],
      revision: 1, at: EpochMillis(0))!
    var state = WatchMirrorState(base: snap)
    let done = try #require(WatchWrist.complete(state.displayed(at: EpochMillis(0)), now: EpochMillis(0), id: "d"))
    state = state.performing(done)
    guard case .resting(let rest) = state.displayed(at: EpochMillis(0)).mode else { return }
    #expect(rest.next?.key == "s")
    #expect(rest.next?.weightText == "15")
  }

  @Test func restButtonsUseTheSameTimerAsThePhone() throws {
    let start = EpochMillis(0)
    var state = WatchMirrorState(base: live())
    state = state.performing(try #require(WatchWrist.complete(state.displayed(at: start), now: start, id: "d")))
    let nudged = try #require(WatchWrist.nudgeRest(state.displayed(at: start), delta: 15, now: start, id: "n"))
    state = state.performing(nudged)
    guard case .resting(let rest) = state.displayed(at: start).mode else { return }
    #expect(rest.timer.remaining(at: start) == 105)
    let paused = try #require(WatchWrist.setRestPaused(state.displayed(at: start), paused: true, now: start, id: "p"))
    state = state.performing(paused)
    guard case .resting(let held) = state.displayed(at: start + 10_000).mode else { return }
    #expect(held.timer.remaining(at: start + 10_000) == 105)
    state = state.performing(try #require(WatchWrist.skipRest(state.displayed(at: start), now: start, id: "s")))
    guard case .logging(let next) = state.displayed(at: start).mode else { return }
    #expect(next.key == "c2")
  }

  @Test func queueKeepsCompletesAndDropsOldDrafts() {
    var queue = WatchCommandQueue()
    for i in 0..<60 {
      queue = queue.appending(WatchCommand(
        id: "d\(i)", issuedAt: EpochMillis(Int64(i)),
        action: .draft(key: "k\(i)", weightText: "1", repsText: "1", rpe: 8)))
    }
    queue = queue.appending(WatchCommand(
      id: "done", issuedAt: EpochMillis(100),
      action: .complete(key: "c1", weightText: "15", repsText: "10", rpe: 8, rest: nil)))
    #expect(queue.pending.count == WatchCommandQueue.limit)
    #expect(queue.pending.contains { $0.id == "done" })
    #expect(!queue.pending.contains { $0.id == "d0" })
    // Bản nháp cùng set bị thay, không xếp chồng.
    queue = queue.appending(WatchCommand(
      id: "d-new", issuedAt: EpochMillis(2), action: .draft(key: "k59", weightText: "2", repsText: "1", rpe: 8)))
    let drafts = queue.pending.filter { if case .draft(let key, _, _, _) = $0.action { return key == "k59" } else { return false } }
    #expect(drafts.count == 1)
    #expect(drafts[0].id == "d-new")
  }

  @Test func ackDropsOnlyConfirmedCommands() throws {
    var state = WatchMirrorState(base: live())
    state = state.performing(try #require(WatchWrist.complete(state.displayed(at: EpochMillis(0)), now: EpochMillis(0), id: "a")))
    state = state.performing(WatchCommand(
      id: "b", issuedAt: EpochMillis(1), action: .draft(key: "c2", weightText: "22.5", repsText: "8", rpe: 8)))
    let snap = live(acked: ["a"])
    state = state.receiving(snap)
    #expect(state.queue.pending.map(\.id) == ["b"])
    guard case .logging(let card) = state.displayed(at: EpochMillis(0)).mode else { return }
    #expect(card.key == "c1", "lệnh tick đã được iPhone xác nhận thì vẽ theo ảnh mới")
    #expect(state.queue.pending.count == 1)
  }

  @Test func unackedCompleteStillShowsWhileThePhoneIsAway() throws {
    var state = WatchMirrorState(base: live())
    let now = EpochMillis(5_000)
    state = state.performing(try #require(WatchWrist.complete(state.displayed(at: now), now: now, id: "a")))
    // Ảnh cũ (chưa tick) tới lại, không kèm ack — lệnh vẫn còn và vẫn đang nghỉ.
    state = state.receiving(live())
    guard case .resting(let rest) = state.displayed(at: now).mode else {
      Issue.record("queued complete must still project")
      return
    }
    #expect(rest.timer.remaining(at: now) == 90)
    #expect(state.queue.pending.map(\.id) == ["a"])
  }

  @Test func roundTripKeepsTheQueue() throws {
    var state = WatchMirrorState(base: live())
    state = state.performing(try #require(WatchWrist.complete(state.displayed(at: EpochMillis(0)), now: EpochMillis(0), id: "a")))
    let data = try JSONEncoder().encode(state)
    let decoded = try JSONDecoder().decode(WatchMirrorState.self, from: data)
    #expect(decoded == state)
  }

  @Test func phoneAppliesEachCommandOnceAndIgnoresAStaleDraft() throws {
    var context = WatchApplyContext()
    let first = WatchCommand(
      id: "w1", issuedAt: EpochMillis(10), action: .draft(key: "c1", weightText: "17.5", repsText: "10", rpe: 8))
    let older = WatchCommand(
      id: "w0", issuedAt: EpochMillis(1), action: .draft(key: "c1", weightText: "12.5", repsText: "10", rpe: 8))
    let again = first
    var progress = DayProgress()
    let open = WatchPhonePlan.resolve(first, rows: rows, progress: progress, unit: .kg, context: context)
    #expect(open.steps == [.weight(key: "c1", text: "17.5")])
    #expect(!open.settled)
    progress.weightText["c1"] = "17.5"
    context.settle(first)
    let replay = WatchPhonePlan.resolve(again, rows: rows, progress: progress, unit: .kg, context: context)
    #expect(replay.settled)
    #expect(replay.steps.isEmpty)
    let stale = WatchPhonePlan.resolve(older, rows: rows, progress: progress, unit: .kg, context: context)
    #expect(stale.settled)
    let missing = WatchPhonePlan.resolve(
      WatchCommand(id: "z", issuedAt: EpochMillis(3), action: .complete(key: "nope", weightText: "1", repsText: "1", rpe: 8, rest: nil)),
      rows: rows, progress: progress, unit: .kg, context: context)
    #expect(missing.settled)
  }

  @Test func completingADoneSetDoesNotToggleAgain() {
    var progress = DayProgress()
    progress.done["c1"] = true
    let command = WatchCommand(
      id: "d", issuedAt: EpochMillis(1),
      action: .complete(key: "c1", weightText: "15", repsText: "10", rpe: 8, rest: RestTimer.start(seconds: 90, at: EpochMillis(1))))
    let resolution = WatchPhonePlan.resolve(command, rows: rows, progress: progress, unit: .kg, context: WatchApplyContext())
    #expect(resolution.settled)
    #expect(resolution.steps.isEmpty)
  }

  @Test func lateCompleteKeepsANewerRest() throws {
    let tickAt = EpochMillis(1_000)
    let nudgeAt = EpochMillis(2_000)
    let started = try #require(RestTimer.start(seconds: 90, at: tickAt))
    let nudged = started.adjusted(by: 15, at: nudgeAt)
    var context = WatchApplyContext()
    let nudge = WatchCommand(id: "n", issuedAt: nudgeAt, action: .rest(nudged))
    #expect(WatchPhonePlan.restUpdate(for: nudge, latest: nil) == .adopt(nudged))
    context.settle(nudge)
    let complete = WatchCommand(
      id: "d", issuedAt: tickAt,
      action: .complete(key: "c1", weightText: "15", repsText: "10", rpe: 8, rest: started))
    // Nudge tới trước vì mất gói. Tick tới sau không được đè mất +15.
    #expect(WatchPhonePlan.restUpdate(for: complete, latest: context.latestRest) == .adopt(nudged))
    context.settle(complete)
    #expect(context.latestRest?.timer == nudged)
    let older = WatchCommand(id: "old", issuedAt: EpochMillis(500), action: .rest(started))
    #expect(WatchPhonePlan.restUpdate(for: older, latest: context.latestRest) == .leave)
  }

  @Test func longWorkoutKeepsTheOpenSetInTheWindow() {
    let many = (0..<100).map { i in
      PlannedSet(key: "s\(i)", exerciseId: "e", exerciseName: "Row", ordinal: (i % 5) + 1, of: 5, weightKg: 50, reps: 8, plannedRest: 60)
    }
    var progress = DayProgress()
    for i in 0..<30 { progress.done["s\(i)"] = true }
    let snap = WatchWorkoutMirror.make(
      mode: .live, templateName: "Long", rows: many, progress: progress, unit: .kg, rest: nil, acked: [], revision: 1,
      at: EpochMillis(0))!
    #expect(snap.sets.count == WatchWorkoutSnapshot.maxCues)
    #expect(snap.sets.contains { $0.key == "s30" && !$0.done })
  }

  @Test func hapticsFireOncePerRest() throws {
    let timer = try #require(RestTimer.start(seconds: 90, at: EpochMillis(0)))
    var memory = WatchHapticMemory()
    let early = WatchHaptics.events(memory: memory, timer: timer, now: EpochMillis(84_000))
    #expect(early.events.isEmpty)
    memory = early.memory
    let warn = WatchHaptics.events(memory: memory, timer: timer, now: EpochMillis(85_000))
    #expect(warn.events == [.restWarning])
    let again = WatchHaptics.events(memory: warn.memory, timer: timer, now: EpochMillis(86_000))
    #expect(again.events.isEmpty)
    let paused = timer.paused(at: EpochMillis(86_000))
    let quiet = WatchHaptics.events(memory: WatchHapticMemory(), timer: paused, now: EpochMillis(86_000))
    #expect(quiet.events.isEmpty)
    let done = WatchHaptics.events(memory: again.memory, timer: timer, now: EpochMillis(90_000))
    #expect(done.events == [.restDone])
    let over = WatchHaptics.events(memory: done.memory, timer: timer, now: EpochMillis(92_000))
    #expect(over.events.isEmpty)
  }

  @Test func lbsStepMatchesThePhone() throws {
    let row = PlannedSet(key: "c1", exerciseId: "curl", exerciseName: "Curl", ordinal: 1, of: 1, weightKg: 20, reps: 10, plannedRest: 60)
    let snap = WatchWorkoutMirror.make(
      mode: .live, templateName: "Pull", rows: [row], progress: DayProgress(), unit: .lbs, rest: nil, acked: [],
      revision: 1, at: EpochMillis(0))!
    let state = WatchMirrorState(base: snap)
    let command = try #require(WatchWrist.changeWeight(state.displayed(at: EpochMillis(0)), steps: 1, now: EpochMillis(0), id: "w"))
    guard case .draft(_, let weight, _, _) = command.action else { return }
    #expect(weight == WorkoutFocus.stepWeight(WeightUnit.lbs.seed(20), by: 1, unit: .lbs))
  }
}
