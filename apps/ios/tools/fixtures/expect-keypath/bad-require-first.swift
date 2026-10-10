@Test func firstOpen() throws {
  let x = try #require(items.first(where: \.isOpen))
  _ = x
}
