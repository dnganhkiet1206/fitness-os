import ASCNDCore
import AVFoundation

/// Tiếng của phòng Koa (31/10, Kiệt): vài tiếng nhỏ cho Koa sống động hơn, chỉ khi người dùng chạm
/// hoặc ở khoảnh khắc lớn. Giọng Koa kiểu hoạt hình tự tổng hợp, công tắc là tiếng CC0 của Kenney
/// (`tools/koa-sound`). `.ambient`: im theo công tắc im lặng, không ngắt
/// nhạc đang nghe. Tắt được bằng nút loa trên thanh của phòng.
///
/// 04/11 (Kiệt): bước chân nhẹ (cả lúc chạy), tiếng nền ngày / đêm, tiếng lẻ thỉnh thoảng (xe xa, ván
/// kêu, đồng hồ, chim…), neon rè theo nhịp chớp, tiếng ngủ ở phòng ngủ; không có nhạc nền — tự tổng
/// hợp bằng `tools/koa-sound/room.py`.
@MainActor
enum KoaSound {
  enum Cue: String, CaseIterable {
    case boop1 = "koa-boop-1"
    case boop2 = "koa-boop-2"
    case boop3 = "koa-boop-3"
    case click = "koa-click"
    case land = "koa-land"
    case yawn = "koa-yawn"
    case cheer = "koa-cheer"
    case step1 = "koa-step-1"
    case step2 = "koa-step-2"
    case step3 = "koa-step-3"
    case stepWood1 = "koa-step-wood-1"
    case stepWood2 = "koa-step-wood-2"
    case rustle = "koa-rustle"
    case coin = "koa-coin"
    case sweep = "koa-sweep"
    case hop = "koa-hop"
    case car = "koa-car"
    case creak = "koa-creak"
    case buzz = "koa-buzz"
    case tick = "koa-tick"
    case bird = "koa-bird"

    /// Độ to riêng: bước chân và tiếng lẻ của phòng nhỏ hơn hẳn giọng Koa.
    var volume: Float {
      switch self {
      case .step1, .step2, .step3, .stepWood1, .stepWood2: 0.13
      case .car, .creak, .buzz, .tick, .bird: 0.16
      case .rustle: 0.14
      case .hop: 0.25
      default: 0.4
      }
    }
  }

  /// Chạm Koa: đổi tiếng, không lặp liền một tiếng.
  static func boop() {
    // tiếng game thay tiếng ừm giọng người (Kiệt 04/11: giọng gần người nghe đáng sợ)
    react(["hehe", "hm", "yay"].randomElement() ?? "hehe")
  }

  /// Bàn chân Koa chạm sàn (hay mặt bục gỗ): đổi bản, độ to lệch chút cho tự nhiên.
  private static var lastStep: Cue?
  private static var lastStepAt = 0.0
  static func step(wood: Bool, gain: Float = 1) {
    // không dồn dập: hai bước cách nhau ít nhất 0,22 giây (Kiệt 04/11: sinh động nhưng dễ chịu)
    let now = Date.timeIntervalSinceReferenceDate
    guard now - lastStepAt >= 0.22 else { return }
    lastStepAt = now
    let pool: [Cue] = wood ? [.stepWood1, .stepWood2] : [.step1, .step2, .step3]
    let cue = pool.filter { $0 != lastStep }.randomElement() ?? pool[0]
    lastStep = cue
    play(cue, gain: gain * Float.random(in: 0.8...1))
  }

  nonisolated static let offKey = "koa.sound.off"

  private static var players: [Cue: AVAudioPlayer] = [:]

  private static var off: Bool { UserDefaults.standard.bool(forKey: offKey) }

  private static func activate() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.ambient, options: .mixWithOthers)
    try? session.setActive(true)
  }

  static func play(_ cue: Cue, gain: Float = 1) {
    guard !off else { return }
    activate()
    guard let player = player(cue) else { return }
    player.volume = cue.volume * gain
    player.currentTime = 0
    player.play()
  }

  private static func player(_ cue: Cue) -> AVAudioPlayer? {
    if let p = players[cue] { return p }
    guard let p = load(cue.rawValue) else { return nil }
    players[cue] = p
    return p
  }

  private static func load(_ name: String) -> AVAudioPlayer? {
    guard let url = Bundle.main.url(forResource: name, withExtension: "wav"),
      let p = try? AVAudioPlayer(contentsOf: url)
    else { return nil }
    p.prepareToPlay()
    return p
  }

  // MARK: - Giọng Koa (Kiệt 04/11: tiếng koala nhân hoá thành lời, như mèo Tom)

  private static var voices: [String: AVAudioPlayer] = [:]
  private static var talking: Task<Void, Never>?

  /// Tiếng phản ứng khi bị chạm (`koa-v-<name>`: "no no no", "hì hì", "ưm~"…), sau `delay` giây
  /// (để cú giật mình đi trước).
  static func react(_ name: String, delay: Double = 0) {
    Task {
      if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
      voice("koa-v-\(name)", volume: 0.3)
    }
  }

  /// Koa nói (kiểu Animalese): mỗi khẩu hình mở miệng là một âm tiết giọng koala, đúng nhịp miệng
  /// (`KoaTalk.mouthStart`, `mouthStep`); câu hỏi thì âm cuối lên giọng. Câu mới thay câu cũ.
  static func talk(_ beat: KoaTalk.Beat) {
    talking?.cancel()
    guard !off, !beat.mouth.isEmpty else { return }
    let mouth = beat.mouth
    talking = Task {
      try? await Task.sleep(for: .seconds(KoaTalk.mouthStart))
      var previous = 0
      var opens = 0
      var said = 0
      for m in mouth {
        guard !Task.isCancelled else { return }
        // miệng khép (m, b, p, dấu câu) thì không có tiếng; âm mở thứ hai mới "nói" một tiếng, tối đa
        // sáu tiếng một câu — sinh động mà không lách chách
        if m != .content { opens += 1 }
        if m != .content, opens % 2 == 1, said < 6 {
          said += 1
          var n = Int.random(in: 1...10)
          if n == previous { n = n % 10 + 1 }
          previous = n
          voice("koa-talk-\(n)", volume: 0.16)
        }
        try? await Task.sleep(for: .seconds(KoaTalk.mouthStep))
      }
    }
  }

  private static func voice(_ name: String, volume: Float, rate: Float = 1) {
    guard !off else { return }
    activate()
    let p: AVAudioPlayer
    if let cached = voices[name] {
      p = cached
    } else {
      guard let url = Bundle.main.url(forResource: name, withExtension: "wav"),
        let made = try? AVAudioPlayer(contentsOf: url)
      else { return }
      made.enableRate = true
      made.prepareToPlay()
      voices[name] = made
      p = made
    }
    p.volume = volume
    p.rate = rate
    p.currentTime = 0
    p.play()
  }

  // MARK: - Nền của phòng

  /// Tiếng nền chỉ là không khí: rất nhỏ, vào / ra từ từ. Không có nhạc nền (Kiệt 04/11: nghe ảm
  /// đạm) — chỉ tiếng của căn phòng.
  static let ambienceVolume: Float = 0.22
  static let snoreVolume: Float = 0.2

  private static var roomOn = false
  private static var asleep = false
  private static var ambience: (day: Bool, player: AVAudioPlayer)?
  private static var snore: AVAudioPlayer?
  private static var oddments: Task<Void, Never>?
  private static var neon: Task<Void, Never>?

  /// Mở phòng / bật loa / đổi ngày đêm: chạy nền (nếu loa đang bật). Gọi lại nhiều lần không sao.
  static func startRoom(day: Bool) {
    guard !off else { return stopRoom() }
    roomOn = true
    activate()
    if asleep {
      startSnore()
      return
    }
    if ambience?.day != day {
      fadeOut(ambience?.player, over: 1.5)
      ambience = loop(day ? "koa-amb-day" : "koa-amb-night", volume: ambienceVolume, fadeIn: 2).map { (day, $0) }
    }
    if oddments == nil {
      oddments = Task {
        while !Task.isCancelled {
          // thưa: tiếng phụ chỉ thỉnh thoảng (Kiệt 04/11: dồn dập thì phiền)
          try? await Task.sleep(for: .seconds(Double.random(in: 40...90)))
          guard !Task.isCancelled else { return }
          let night = !(ambience?.day ?? false)
          let pool: [Cue] = night ? [.car, .creak, .tick, .car] : [.bird, .bird, .creak, .tick]
          if let cue = pool.randomElement() { play(cue, gain: Float.random(in: 0.6...1)) }
        }
      }
    }
    // bảng neon (chỉ đêm) rè đúng lúc đèn sụt (`StudioNeon.dips`, cùng đồng hồ với hình)
    if neon == nil {
      neon = Task {
        var was = false
        // đèn sụt khá thường xuyên: chỉ rè ở một lần sụt mỗi 1–2 phút (Kiệt 04/11: lặp nhiều quá)
        var next = Date.timeIntervalSinceReferenceDate + Double.random(in: 20...40)
        while !Task.isCancelled {
          try? await Task.sleep(for: .milliseconds(40))
          let now = Date.timeIntervalSinceReferenceDate
          let dip = StudioNeon.dips(at: now)
          if dip, !was, now >= next, ambience?.day == false {
            play(.buzz, gain: Float.random(in: 0.6...0.85))
            next = now + Double.random(in: 60...120)
          }
          was = dip
        }
      }
    }
  }

  /// Koa sang phòng ngủ: tiếng nền nhỏ dần rồi tắt, ngáp một cái, rồi tiếng thở khò khò rất nhỏ.
  /// Thức dậy: tắt tiếng ngủ, tiếng nền vào lại.
  static func setAsleep(_ on: Bool, day: Bool) {
    guard on != asleep else { return }
    asleep = on
    guard roomOn, !off else { return }
    if on {
      stopAmbience(over: 3)
      Task {
        try? await Task.sleep(for: .seconds(2.2))
        guard asleep, roomOn else { return }
        play(.yawn, gain: 0.7)
        try? await Task.sleep(for: .seconds(2))
        guard asleep, roomOn else { return }
        startSnore()
      }
    } else {
      fadeOut(snore, over: 1)
      snore = nil
      startRoom(day: day)
    }
  }

  /// Rời phòng / tắt loa / app ra nền: tắt dần nền, dừng tiếng lẻ.
  static func stopRoom() {
    roomOn = false
    stopAmbience(over: 0.6)
    fadeOut(snore, over: 0.6)
    snore = nil
  }

  private static func stopAmbience(over seconds: Double) {
    oddments?.cancel()
    oddments = nil
    neon?.cancel()
    neon = nil
    fadeOut(ambience?.player, over: seconds)
    ambience = nil
  }

  private static func startSnore() {
    guard snore == nil else { return }
    snore = loop("koa-snore", volume: snoreVolume, fadeIn: 2.5)
  }

  private static func loop(_ name: String, volume: Float, fadeIn: Double) -> AVAudioPlayer? {
    guard let p = load(name) else { return nil }
    p.numberOfLoops = -1
    p.volume = 0
    p.play()
    p.setVolume(volume, fadeDuration: fadeIn)
    return p
  }

  private static func fadeOut(_ p: AVAudioPlayer?, over seconds: Double) {
    guard let p else { return }
    p.setVolume(0, fadeDuration: seconds)
    Task {
      try? await Task.sleep(for: .seconds(seconds + 0.1))
      p.stop()
    }
  }
}
