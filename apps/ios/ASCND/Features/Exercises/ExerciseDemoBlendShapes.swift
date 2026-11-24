import Foundation
import RealityKit

extension ExerciseDemo3D {
  /// Biến dạng nướng sẵn (24/11, Kiệt: "sửa sao để mọi chuyển động đều tự nhiên như người thật và không
  /// bị biến dạng đồng thời vẫn giữ rõ được toàn bộ khối cơ"). Skinning tuyến tính của RealityKit làm teo
  /// khớp và dính nách khi giơ tay; Motion Lab tính biến dạng tốt trong Blender, nén phần chênh thành
  /// vài chục blend shape trên thân (`<bài>_body_<nv>.usdz`) và trọng số từng khung (`<bài>_blendshapes.json`).
  /// Trình xem phát trọng số như một animation, cùng tốc độ và vòng lặp với chuyển động xương.
  struct BlendTrack: Decodable {
    let schema: Int
    let fps: Float
    let names: [String]
    let frames: [[Float]]

    static let supportedSchema = 1

    static func load(_ name: String) -> BlendTrack? {
      guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
        let data = try? Data(contentsOf: url),
        let track = try? JSONDecoder().decode(BlendTrack.self, from: data),
        track.schema <= supportedSchema, track.fps > 0, !track.frames.isEmpty
      else { return nil }
      return track
    }

    /// Gắn trọng số lên thân và phát lặp; `nil` khi thân không có blend shape nào trùng tên.
    @MainActor
    func play(on body: ModelEntity) -> AnimationPlaybackController? {
      guard let mesh = body.model?.mesh else { return nil }
      let component = BlendShapeWeightsComponent(weightsMapping: BlendShapeWeightsMapping(meshResource: mesh))
      guard let set = component.weightSet.first else {
        NSLog("[blend] %@: no blend shapes on body mesh", body.name)
        return nil
      }
      let have = set.weightNames
      let column = have.map { names.firstIndex(of: $0) }
      NSLog("[blend] %@: id %@, %d shapes on mesh, %d matched, %d frames", body.name, set.id, have.count,
            column.compactMap { $0 }.count, frames.count)
      guard column.contains(where: { $0 != nil }) else { return nil }
      body.components.set(component)
      let keyed = frames.map { row in
        BlendShapeWeights(column.map { c in c.flatMap { $0 < row.count ? row[$0] : nil } ?? 0 })
      }
      let clip = SampledAnimation<BlendShapeWeights>(
        weightNames: have, frames: keyed, frameInterval: 1 / fps,
        bindTarget: .blendShapeWeightsWithID(set.id), repeatMode: .repeat,
        // khung 0..N-1 của Blender = clip xương dài (N-1)/fps; lặp phải cùng độ dài, không trôi dần
        trimDuration: TimeInterval(Float(max(frames.count - 1, 1)) / fps))
      guard let resource = try? AnimationResource.generate(with: clip) else { return nil }
      return body.playAnimation(resource)
    }
  }
}
