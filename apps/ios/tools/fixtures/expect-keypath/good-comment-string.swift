// #expect(b.posts.allSatisfy(\.mine)) từng làm hỏng target test — chỉ là chú thích.
@Test func text() {
  let s = "#expect(xs.allSatisfy(\\.x))"
  #expect(s.isEmpty == false)
}
