#if DEBUG
  import ASCNDCore
  import SwiftUI

  /// Soát độ vừa của tủ đồ (29/10): vẽ Koa mặc TỪNG món ở vài hạng vóc dáng và tư thế,
  /// ghi PNG vào Documents/wardrobe để ghép bảng bằng `magick montage`.
  /// `SIMCTL_CHILD_ASCND_DEBUG_WARDROBE=1 xcrun simctl launch <máy> com.ascnd.fitnessos.dev`
  struct KoaWardrobeDump: View {
    static var enabled: Bool { ProcessInfo.processInfo.environment["ASCND_DEBUG_WARDROBE"] == "1" }

    @State private var done = 0

    var body: some View {
      Text(verbatim: "wardrobe dump \(done)")
        .task { await dump() }
    }

    @MainActor private func dump() async {
      let dir = URL.documentsDirectory.appending(path: "wardrobe")
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let builds = [0, 3, 5]
      let poses: [KoaFlags.Pose] = [.idle, .lifting]
      if ProcessInfo.processInfo.environment["ASCND_DEBUG_WARDROBE_RANKS"] == "1" {
        for id in ["tee", "hoodie", "windbreak", "jersey"] {
          for build in 0...5 {
            let view = KoaFigureView(pose: .idle, worn: [.top: id], size: 440, animated: false, build: build)
              .frame(width: 480, height: 600).background(Color(white: 0.12))
            let r = ImageRenderer(content: view)
            r.scale = 1
            try? r.uiImage?.pngData()?.write(to: dir.appending(path: "rank_\(id)_b\(build).png"))
          }
        }
        try? "ok".write(to: dir.appending(path: "DONE"), atomically: true, encoding: .utf8)
        return
      }
      for slot in KoaFlags.Slot.allCases {
        for id in KoaFlags.items[slot] ?? [] {
          for pose in poses {
            for build in builds {
              let view = KoaFigureView(pose: pose, worn: [slot: id], size: 220, animated: false, build: build)
                .frame(width: 240, height: 300)
                .background(Color(white: 0.12))
              let r = ImageRenderer(content: view)
              r.scale = 1
              if let png = r.uiImage?.pngData() {
                try? png.write(to: dir.appending(path: "\(slot.rawValue)_\(id)_\(pose.rawValue)_b\(build).png"))
              }
              done += 1
              await Task.yield()
            }
          }
        }
      }
      for pose in poses {
        for build in builds {
          let view = KoaFigureView(pose: pose, worn: [:], size: 220, animated: false, build: build)
            .frame(width: 240, height: 300).background(Color(white: 0.12))
          let r = ImageRenderer(content: view)
          r.scale = 1
          try? r.uiImage?.pngData()?.write(to: dir.appending(path: "_bare_\(pose.rawValue)_b\(build).png"))
        }
      }
      // Tư thế thử đồ (dang tay) — áo / đồ cầm tay ở cả ba hạng (Kiệt 29/10: tay áo trái).
      for slot in [KoaFlags.Slot.top, .hand, .back] {
        for id in KoaFlags.items[slot] ?? [] {
          for build in builds {
            let view = KoaFigureView(dress: true, worn: [slot: id], size: 220, animated: false, build: build)
              .frame(width: 240, height: 300).background(Color(white: 0.12))
            let r = ImageRenderer(content: view)
            r.scale = 1
            try? r.uiImage?.pngData()?.write(to: dir.appending(path: "\(slot.rawValue)_\(id)_dress_b\(build).png"))
            await Task.yield()
          }
        }
      }
      // Bộ phối cho mock (nền trong suốt, lớn).
      let outfits: [(String, KoaFlags.Worn, Int)] = [
        ("street", [.head: "cap", .top: "tee", .bottom: "short", .shoes: "sneaker"], 2),
        ("winter", [.head: "beanie", .top: "hoodie", .bottom: "jogger", .shoes: "runner", .back: "backpack"], 2),
        ("beast", [.face: "shades", .top: "tank", .bottom: "legging", .shoes: "boot", .hand: "bottle"], 5),
        ("plain", [:], 2),
      ]
      for (name, worn, build) in outfits {
        for pose in [KoaFlags.Pose.idle, .lifting] {
          let view = KoaFigureView(pose: pose, worn: worn, size: 440, animated: false, build: build)
            .frame(width: 480, height: 600)
          let r = ImageRenderer(content: view)
          r.scale = 1
          r.isOpaque = false
          try? r.uiImage?.pngData()?.write(to: dir.appending(path: "_outfit_\(name)_\(pose.rawValue).png"))
        }
      }
      try? "ok".write(to: dir.appending(path: "DONE"), atomically: true, encoding: .utf8)
    }
  }
#endif
