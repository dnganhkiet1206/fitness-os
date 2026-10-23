@testable import ASCNDBackend
import Foundation
import Testing

/// Google kiểu native (23/10): URL tới Google, scheme quay về, đọc mã, PKCE / nonce.
struct GoogleNativeSignInTests {
  static let id = "751814705388-gonm9e313v927p3o8baubu9ibluu27t1.apps.googleusercontent.com"

  @Test func clientIdOnlyWhenConfigured() {
    #expect(GoogleNativeSignIn.clientId(info: [GoogleNativeSignIn.clientIdKey: Self.id]) == Self.id)
    #expect(GoogleNativeSignIn.clientId(info: [GoogleNativeSignIn.clientIdKey: "$(ASCND_GOOGLE_IOS_CLIENT_ID)"]) == nil)
    #expect(GoogleNativeSignIn.clientId(info: [GoogleNativeSignIn.clientIdKey: ""]) == nil)
    #expect(GoogleNativeSignIn.clientId(info: nil) == nil)
  }

  @Test func requestGoesStraightToGoogleWithPKCEAndHashedNonce() throws {
    let r = GoogleNativeSignIn.request(clientId: Self.id, state: "st", verifier: "v", rawNonce: "raw")
    #expect(r.callbackScheme == "com.googleusercontent.apps.751814705388-gonm9e313v927p3o8baubu9ibluu27t1")
    #expect(r.redirectURI == r.callbackScheme + ":/oauthredirect")
    let q = Dictionary(uniqueKeysWithValues: (URLComponents(url: r.url, resolvingAgainstBaseURL: false)?.queryItems ?? [])
      .map { ($0.name, $0.value ?? "") })
    #expect(r.url.host == "accounts.google.com", "không qua Supabase")
    #expect(q["client_id"] == Self.id && q["response_type"] == "code" && q["code_challenge_method"] == "S256")
    #expect(q["code_challenge"] == GoogleNativeSignIn.challenge("v"))
    #expect(q["nonce"] == GoogleNativeSignIn.sha256Hex("raw"), "Google nhận bản băm; Supabase nhận bản thô")
    #expect(q["state"] == "st")
  }

  @Test func callbackNeedsMatchingStateAndCode() throws {
    let ok = URL(string: "com.googleusercontent.apps.x:/oauthredirect?state=st&code=4%2F0Ab")!
    #expect(try GoogleNativeSignIn.code(from: ok, state: "st") == "4/0Ab")
    #expect(throws: GoogleNativeSignIn.Failure.stateMismatch) {
      try GoogleNativeSignIn.code(from: ok, state: "other")
    }
    let denied = URL(string: "com.googleusercontent.apps.x:/oauthredirect?error=access_denied&state=st")!
    #expect(throws: GoogleNativeSignIn.Failure.cancelled) { try GoogleNativeSignIn.code(from: denied, state: "st") }
  }

  @Test func tokenBodyEncodesTheCode() {
    let body = String(decoding: GoogleNativeSignIn.tokenRequestBody(
      clientId: "c", code: "4/0A+b", verifier: "v", redirectURI: "s:/oauthredirect"), as: UTF8.self)
    #expect(body.contains("code=4/0A%2Bb") && body.contains("grant_type=authorization_code") && !body.contains("secret"))
  }
}
