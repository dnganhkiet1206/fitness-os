// Key path lồng trong biểu thức hai ngôi — đang có trong repo và biên dịch được.
@Test func nested() throws {
  #expect(list.map(\.id) == ["aaaa", "b"])
  #expect(book.items.map(\.taken) == [true, false])
  #expect(items.filter(\.done).count == 2)
  #expect(items.first(where: \.done) != nil)
  #expect(try #require(h.flow.session).plan.rows.count == 3)
}
