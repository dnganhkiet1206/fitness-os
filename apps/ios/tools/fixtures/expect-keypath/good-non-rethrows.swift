// Hàm không nằm trong bảng rethrows của thư viện chuẩn (dự án tự viết, nhận KeyPath).
@Test func custom() {
  #expect(stats.average(\.kcal) > 0)
  #expect(report.has(\.protein))
}
