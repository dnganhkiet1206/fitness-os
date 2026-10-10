// Bản đã sửa (4d764c42, 321550ac): closure biên dịch được.
@Test func fixed() {
  #expect(q.prefix(3).allSatisfy { $0.favorite })
  #expect(b.posts.allSatisfy { $0.mine })
  #expect(items.contains { $0.done })
}
