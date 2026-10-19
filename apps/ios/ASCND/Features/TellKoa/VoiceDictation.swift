import ASCNDCore
import AVFoundation
import Foundation
import Observation
import Speech

/// Nói thay gõ cho "Kể cho Koa" (18/10, chủ dự án: "có tuỳ chọn voice to text,
/// phần này nên làm kỹ").
///
/// - `SFSpeechRecognizer` theo ngôn ngữ của app (vi-VN / en-US / es-ES).
/// - Chạy TRÊN MÁY khi máy hỗ trợ ngôn ngữ ấy (`supportsOnDeviceRecognition`);
///   không thì Apple nhận dạng trên máy chủ của Apple — chính sách quyền riêng tư
///   nói rõ điều này. App không lưu âm thanh.
/// - Chữ chỉ được đổ vào ô chữ; người dùng xem, sửa rồi mới ghi. Không có gì
///   được ghi thẳng từ giọng nói.
/// - Tự dừng sau `silenceLimit` giây im lặng và sau `maxLength` giây.
///
/// Nâng cấp sau (khi đã thử trên iPhone thật): `SpeechAnalyzer` / `SpeechTranscriber`
/// của iOS 26 khi `supportedLocales` có vi-VN.
@MainActor
@Observable
final class VoiceDictation {
  enum State: Equatable {
    case idle
    /// Đang nghe; `onDevice` = không gửi âm thanh đi đâu.
    case listening(onDevice: Bool)
    /// Người dùng chưa cho phép micro / nhận dạng giọng nói.
    case denied
    /// Máy không nhận dạng được ngôn ngữ này lúc này.
    case unavailable
    case failed
  }

  private(set) var state: State = .idle
  /// Chữ đang nghe được (cả phần chưa chốt).
  private(set) var transcript = ""

  static let silenceLimit: TimeInterval = 2.5
  static let maxLength: TimeInterval = 90

  private let engine = AVAudioEngine()
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var silenceTimer: Task<Void, Never>?
  private var limitTimer: Task<Void, Never>?

  var isListening: Bool { if case .listening = state { true } else { false } }

  static func locale(_ lang: AppPreferences.Lang) -> Locale {
    switch lang {
    case .vi: Locale(identifier: "vi-VN")
    case .en: Locale(identifier: "en-US")
    case .es: Locale(identifier: "es-ES")
    }
  }

  /// Bắt đầu nghe. Xin quyền lần đầu (micro + nhận dạng giọng nói).
  func start(lang: AppPreferences.Lang) async {
    guard !isListening else { return }
    transcript = ""
    guard await Self.authorize() else {
      state = .denied
      return
    }
    guard let recognizer = SFSpeechRecognizer(locale: Self.locale(lang)), recognizer.isAvailable else {
      state = .unavailable
      return
    }
    let onDevice = recognizer.supportsOnDeviceRecognition
    let req = SFSpeechAudioBufferRecognitionRequest()
    req.shouldReportPartialResults = true
    req.requiresOnDeviceRecognition = onDevice
    req.taskHint = .dictation
    // Từ hay gặp của app — tăng khả năng nghe đúng.
    req.contextualStrings = Self.vocabulary(lang)
    if #available(iOS 16, *) { req.addsPunctuation = true }

    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.record, mode: .measurement, options: .duckOthers)
      try session.setActive(true, options: .notifyOthersOnDeactivation)
      let input = engine.inputNode
      let format = input.outputFormat(forBus: 0)
      guard format.sampleRate > 0 else {
        state = .unavailable
        return
      }
      input.removeTap(onBus: 0)
      input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in req.append(buffer) }
      engine.prepare()
      try engine.start()
    } catch {
      teardown()
      state = .failed
      return
    }
    request = req
    state = .listening(onDevice: onDevice)
    task = recognizer.recognitionTask(with: req) { [weak self] result, error in
      let text = result?.bestTranscription.formattedString
      let final = result?.isFinal ?? false
      Task { @MainActor [weak self] in
        guard let self else { return }
        if let text, self.isListening || final {
          self.transcript = text
          self.armSilenceTimer()
        }
        if final || error != nil {
          // Lỗi sau khi đã có chữ (ví dụ huỷ do im lặng) không phải lỗi với người dùng.
          let hadText = !self.transcript.isEmpty
          self.teardown()
          self.state = error != nil && !hadText ? .failed : .idle
        }
      }
    }
    limitTimer = Task { [weak self] in
      try? await Task.sleep(for: .seconds(Self.maxLength))
      self?.stop()
    }
  }

  /// Dừng nghe; phần đã nghe được giữ lại trong `transcript`.
  func stop() {
    guard isListening else { return }
    request?.endAudio()
    teardown()
    state = .idle
  }

  private func armSilenceTimer() {
    silenceTimer?.cancel()
    silenceTimer = Task { [weak self] in
      try? await Task.sleep(for: .seconds(Self.silenceLimit))
      guard !Task.isCancelled else { return }
      self?.stop()
    }
  }

  private func teardown() {
    silenceTimer?.cancel()
    limitTimer?.cancel()
    if engine.isRunning { engine.stop() }
    engine.inputNode.removeTap(onBus: 0)
    task?.finish()
    task = nil
    request = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  static func authorize() async -> Bool {
    let speech = await withCheckedContinuation { (c: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
      SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) }
    }
    guard speech == .authorized else { return false }
    return await AVAudioApplication.requestRecordPermission()
  }

  /// Từ ngữ của nhật ký — gợi ý cho bộ nhận dạng.
  static func vocabulary(_ lang: AppPreferences.Lang) -> [String] {
    switch lang {
    case .vi:
      ["ngủ", "tiếng", "rưỡi", "uống", "nước", "lít", "ly", "cân", "ký", "tập gym", "chạy bộ", "bữa sáng", "bữa trưa", "bữa tối",
        "phở", "bún", "cơm", "bánh mì", "ức gà", "trứng", "Koa"]
    case .en:
      ["slept", "hours", "drank", "water", "liters", "glasses", "weighed", "kilograms", "pounds", "worked out", "breakfast",
        "lunch", "dinner", "Koa"]
    case .es:
      ["dormí", "horas", "bebí", "agua", "litros", "vasos", "pesé", "kilos", "entrené", "corrí", "desayuno", "almuerzo",
        "cena", "Koa"]
    }
  }
}
