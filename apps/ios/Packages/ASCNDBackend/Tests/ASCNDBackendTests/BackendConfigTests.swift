@testable import ASCNDBackend
import Foundation
import Testing

struct BackendConfigTests {
  @Test func readsInfoPlistAndTrimsTrailingSlash() throws {
    let c = try BackendConfig.from(info: [
      "ASCNDSupabaseURL": "https://abcdefgh.supabase.co//",
      "ASCNDSupabaseKey": "sb_publishable_x",
    ])
    #expect(c.url.absoluteString == "https://abcdefgh.supabase.co")
    #expect(c.anonKey == "sb_publishable_x")
  }

  @Test func missingKeysAreNamed() {
    #expect(throws: BackendConfig.ConfigError.missing("ASCNDSupabaseURL")) { try BackendConfig.from(info: [:]) }
    #expect(throws: BackendConfig.ConfigError.missing("ASCNDSupabaseKey")) {
      try BackendConfig.from(info: ["ASCNDSupabaseURL": "https://a.supabase.co"])
    }
  }

  /// Info.plist chưa được xcconfig điền (`$(ASCND_SUPABASE_HOST)` còn nguyên,
  /// hoặc chỉ còn "https://") phải hỏng có tên, không thành một URL rỗng.
  @Test(arguments: ["https://", "http://abcdefgh.supabase.co", "not a url", "https://$(ASCND_SUPABASE_HOST)"])
  func rejectsBadURL(url: String) {
    #expect(throws: (any Error).self) { try BackendConfig(urlString: url, anonKey: "k") }
  }

  @Test func legacyJWTFromAnotherProjectIsRejected() {
    // {"ref":"otherproj"} → base64url
    let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJvdGhlcnByb2oifQ.sig"
    #expect(throws: BackendConfig.ConfigError.projectMismatch(urlProject: "abcdefgh", keyProject: "otherproj")) {
      try BackendConfig(urlString: "https://abcdefgh.supabase.co", anonKey: jwt)
    }
    #expect(throws: Never.self) { try BackendConfig(urlString: "https://otherproj.supabase.co", anonKey: jwt) }
  }

  @Test func publishableKeyHasNoProjectToCheck() {
    #expect(BackendConfig.project(ofKey: "sb_publishable_HU-mMPAU34iCDOHOukYPWA_XY_Vh9nX") == nil)
    #expect(BackendConfig.project(ofHost: "guqmbqtgxqleuwajvwvg.supabase.co") == "guqmbqtgxqleuwajvwvg")
    #expect(BackendConfig.project(ofHost: "api.example.com") == nil)
  }
}
