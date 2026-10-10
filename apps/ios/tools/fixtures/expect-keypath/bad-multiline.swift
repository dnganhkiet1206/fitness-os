@Test func spread() {
  #expect(
    book.meals
      .flatMap { $0.items }
      .allSatisfy(\.pending)
  )
}
