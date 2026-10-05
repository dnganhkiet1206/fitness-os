// Design system của ASCND — C sở hữu (#229).
//
// Nguồn sự thật về thương hiệu là `spec/design/tokens.json`; file Swift ở đây
// sinh ra hoặc viết theo nó, không theo cách app RN đang vẽ.
//
// Target này import SwiftUI, nên phần nội dung nằm sau `canImport` để package
// vẫn build được trên Linux (nơi ASCNDCore chạy test).
#if canImport(SwiftUI)
#if canImport(SwiftUI)
@_exported import SwiftUI

/// Không gian tên cho token và component. C thay phần thân khi làm #229.
public enum DS {}
#endif
