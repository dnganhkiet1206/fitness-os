@testable import ASCNDCore
import Foundation
import Testing

/// Nút Sign in with Apple chỉ hiện khi khoá Info.plist bật rõ ràng (#527).
struct AppleFeatureGatesTests {
  @Test func signInWithAppleIsOffUnlessExplicitlyOn() {
    let key = AppleFeatureGates.signInWithAppleKey
    #expect(!AppleFeatureGates.signInWithApple(info: nil))
    #expect(!AppleFeatureGates.signInWithApple(info: [:]))
    for off in ["NO", "no", "", "  ", "0", "false", "$(ASCND_SIGN_IN_WITH_APPLE)", "maybe"] {
      #expect(!AppleFeatureGates.signInWithApple(info: [key: off]), "\(off)")
    }
    #expect(!AppleFeatureGates.signInWithApple(info: [key: false]))
    for on in ["YES", "yes", "true", "1", " YES "] {
      #expect(AppleFeatureGates.signInWithApple(info: [key: on]), "\(on)")
    }
    #expect(AppleFeatureGates.signInWithApple(info: [key: true]))
  }

  /// Google: cùng luật — tắt trừ khi bật rõ ràng (dự án chưa bật nhà cung cấp Google).
  @Test func signInWithGoogleIsOffUnlessExplicitlyOn() {
    #expect(!AppleFeatureGates.signInWithGoogle(info: nil))
    #expect(!AppleFeatureGates.signInWithGoogle(info: ["ASCNDSignInWithGoogle": "NO"]))
    #expect(!AppleFeatureGates.signInWithGoogle(info: ["ASCNDSignInWithGoogle": "$(ASCND_SIGN_IN_WITH_GOOGLE)"]))
    #expect(AppleFeatureGates.signInWithGoogle(info: ["ASCNDSignInWithGoogle": "YES"]))
    #expect(!AppleFeatureGates.signInWithGoogle(info: ["ASCNDSignInWithApple": "YES"]), "khoá riêng")
  }
}
