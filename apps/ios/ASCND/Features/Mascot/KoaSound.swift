import AVFoundation

/// Tiếng của phòng Koa (31/10, Kiệt): vài tiếng nhỏ cho Koa sống động hơn, chỉ khi người dùng chạm
/// hoặc ở khoảnh khắc lớn. Giọng Koa kiểu hoạt hình tự tổng hợp, công tắc là tiếng CC0 của Kenney
/// (`tools/koa-sound`). `.ambient`: im theo công tắc im lặng, không ngắt
/// nhạc đang nghe. Tắt được bằng nút loa trên thanh của phòng.
///
/// 04/11 (Kiệt): bước chân nhẹ, nhạc nền thư giãn rất nhỏ, tiếng nền ngày / đêm và tiếng lẻ thỉnh
/// thoảng (xe xa, ván kêu, đồng hồ, chim…) — tự tổng hợp bằng `tools/koa-sound/room.py`.
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
      case .step1, .step2, .step3, .stepWood1, .stepWood2: 0.22
      case .car, .creak, .buzz, .tick, .bird: 0.16
      case .rustle, .hop: 0.25
      default: 0.4
      }
    }
  }

  /// Chạm Koa: đổi tiếng, không lặp liền một tiếng.
  private static var lastBoop = Cue.boop3
  static func boop() {
    lastBoop = [Cue.boop1, .boop2, .boop3].filter { $0 != lastBoop }.randomElement() ?? .boop1
    play(lastBoop)
  }

  /// Bàn chân Koa chạm sàn (hay mặt bục gỗ): đổi bản, độ to lệch chút cho tự nhiên.
  private static var lastStep: Cue?
  static func step(wood: Bool) {
    let pool: [Cue] = wood ? [.stepWood1, .stepWood2] : [.step1, .step2, .step3]
    let cue = pool.filter { $0 != lastStep }.randomElement() ?? pool[0]
    lastStep = cue
    play(cue, gain: Float.random(in: 0.8...1))
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

  // MARK: - Nền của phòng

  /// Nhạc nền và tiếng nền chỉ là không khí: rất nhỏ, vào / ra từ từ.
  static let musicVolume: Float = 0.1
  static let ambienceVolume: Float = 0.22

  private static var music: AVAudioPlayer?
  private static var ambience: (day: Bool, player: AVAudioPlayer)?
  private static var oddments: Task<Void, Never>?

  /// Mở phòng / bật loa / đổi ngày đêm: chạy nền (nếu loa đang bật). Gọi lại nhiều lần không sao.
  static func startRoom(day: Bool) {
    guard !off else { return stopRoom() }
    activate()
    if music == nil, let p = load("koa-music") {
      p.numberOfLoops = -1
      p.volume = 0
      p.play()
      p.setVolume(musicVolume, fadeDuration: 2.5)
      music = p
    }
    if ambience?.day != day {
      ambience?.player.setVolume(0, fadeDuration: 1.5)
      let old = ambience?.player
      Task {
        try? await Task.sleep(for: .seconds(1.6))
        old?.stop()
      }
      if let p = load(day ? "koa-amb-day" : "koa-amb-night") {
        p.numberOfLoops = -1
        p.volume = 0
        p.play()
        p.setVolume(ambienceVolume, fadeDuration: 2)
        ambience = (day, p)
      }
    }
    if oddments == nil {
      oddments = Task {
        while !Task.isCancelled {
          try? await Task.sleep(for: .seconds(Double.random(in: 9...22)))
          guard !Task.isCancelled else { return }
          let night = !(ambience?.day ?? false)
          let pool: [Cue] = night ? [.car, .creak, .tick, .buzz, .car] : [.bird, .bird, .creak, .tick]
          if let cue = pool.randomElement() { play(cue, gain: Float.random(in: 0.6...1)) }
        }
      }
    }
  }

  /// Rời phòng / tắt loa / app ra nền: tắt dần nền, dừng tiếng lẻ.
  static func stopRoom() {
    oddments?.cancel()
    oddments = nil
    for p in [music, ambience?.player].compactMap({ $0 }) {
      p.setVolume(0, fadeDuration: 0.6)
      Task {
        try? await Task.sleep(for: .seconds(0.7))
        p.stop()
      }
    }
    music = nil
    ambience = nil
  }
}
