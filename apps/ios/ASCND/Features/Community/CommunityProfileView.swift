import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Tạo / sửa hồ sơ cộng đồng (#527, lát 2) — `app/community-profile.tsx` @
/// fac9ac2 trên `CommunityProfileBook`.
///
/// Như RN: tên người dùng (tự về chữ thường, `@` đứng trước, luật 3–24 ký tự
/// nói ngay dưới ô; trùng tên nói dưới ô), tên hiển thị (≤ 40), giới thiệu
/// (≤ 160), chọn linh vật đã mở khoá; câu Quy tắc cộng đồng ngay trên nút Lưu
/// kèm lối đọc Điều khoản (App Store 1.2); điền một lần khi hồ sơ về; lưu xong
/// thì quay lại.
///
/// Linh vật vẽ thật (Koa K4 + V1). Khác RN: hồ sơ đọc hỏng là thẻ lỗi có thử
/// lại (RN coi như chưa có hồ sơ và mời tạo mới).
struct CommunityProfileScreen: View {
  let userId: String
  var onSaved: () -> Void = {}
  @Environment(AppServices.self) private var services
  @State private var book: CommunityProfileBook?
  @State private var built = false

  var body: some View {
    Group {
      if let book {
        CommunityProfileView(book: book, selectedMascot: services.preferences.mascotSelected, onSaved: onSaved)
      } else if built {
        ContentUnavailableView {
          Label("community.profile.title", systemImage: "person.crop.circle")
        } description: {
          Text("placeholder.building")
        }
      } else {
        DSLoadingView()
      }
    }
    .task {
      guard !built else { return }
      book = services.makeCommunityProfile(userId: userId)
      built = true
    }
  }
}

struct CommunityProfileView: View {
  let book: CommunityProfileBook
  let selectedMascot: String
  var onSaved: () -> Void = {}

  @Environment(\.dismiss) private var dismiss
  @Environment(AppServices.self) private var services
  @State private var handle = ""
  @State private var name = ""
  @State private var bio = ""
  @State private var pick: String?
  @State private var taken = false
  @State private var filled = false
  @State private var error: CommunityProfileFailure?

  var body: some View {
    content
      .navigationTitle(book.existing == nil ? Text("community.profile.title") : Text("community.profile.edit"))
      .navigationBarTitleDisplayMode(.inline)
      .task { if book.phase == .loading { await book.load() } }
      .onChange(of: book.phase, initial: true) { _, phase in fill(phase) }
      .alert(
        Text("community.profile.savefailed"), isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })
      ) {
        Button(String(localized: "common.ok"), role: .cancel) {}
      } message: {
        error == .offline ? Text("community.profile.offline") : Text("community.profile.tryagain")
      }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed:
      DSErrorView(message: String(localized: "community.profile.loadfailed")) { Task { await book.load() } }
    case .ready:
      form
    }
  }

  private var form: some View {
    Form {
      Section {
        HStack {
          Spacer()
          MascotAvatar(mascotId: pick, size: 88)
          Spacer()
        }
        .listRowBackground(Color.clear)
      }
      Section {
        VStack(alignment: .leading, spacing: 6) {
          Text("community.profile.handle").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          HStack(spacing: 4) {
            Text(verbatim: "@").font(DS.TextStyle.headline).foregroundStyle(DS.Color.mutedForeground.swiftUI)
            TextField(String(localized: "community.profile.handle"), text: handleBinding, prompt: Text("community.profile.handleexample"))
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .textContentType(.username)
          }
          if let hint = handleHint {
            Text(verbatim: hint)
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.readinessRed.swiftUI)
          }
        }
        VStack(alignment: .leading, spacing: 6) {
          Text("community.profile.name").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          TextField(String(localized: "community.profile.name"), text: clamped($name, CommunityProfileForm.nameMax))
            .textContentType(.nickname)
        }
        VStack(alignment: .leading, spacing: 6) {
          Text("community.profile.bio").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          TextField(
            String(localized: "community.profile.bio"), text: clamped($bio, CommunityProfileForm.bioMax), axis: .vertical
          )
          .lineLimit(3...6)
        }
      }
      Section {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: DS.Spacing.sm) {
            ForEach(book.choices) { m in mascotChip(m) }
          }
          .padding(.vertical, DS.Spacing.xs)
        }
      } header: {
        Text("community.profile.avatar")
      }
      Section {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          Text("community.profile.rules")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          NavigationLink {
            LegalView(lang: services.preferences.lang)
          } label: {
            Text("community.profile.ruleslink").font(DS.TextStyle.footnote.weight(.semibold))
          }
        }
        DSButton(String(localized: "community.profile.save")) { Task { await submit() } }
          .disabled(!canSave)
          .opacity(canSave ? 1 : 0.4)
          .listRowBackground(Color.clear)
      }
    }
    .scrollDismissesKeyboard(.interactively)
  }

  private var canSave: Bool { CommunityProfileForm.canSave(handle: handle, name: name) && !book.saving }

  private var handleHint: String? {
    if taken { return String(localized: "community.profile.handletaken") }
    if CommunityProfileForm.isBad(handle) { return String(localized: "community.profile.handlehint") }
    return nil
  }

  /// Gõ là về chữ thường (`setHandle(t.toLowerCase())`), tối đa 24; gõ lại thì
  /// bỏ dòng "đã có người dùng".
  private var handleBinding: Binding<String> {
    Binding(
      get: { handle },
      set: {
        taken = false
        handle = CommunityProfileForm.clamp($0.lowercased(), max: CommunityProfileForm.handleMax)
      })
  }

  private func clamped(_ b: Binding<String>, _ max: Int) -> Binding<String> {
    Binding(get: { b.wrappedValue }, set: { b.wrappedValue = CommunityProfileForm.clamp($0, max: max) })
  }

  private func mascotChip(_ m: CommunityMascots.Mascot) -> some View {
    let on = pick == m.id
    return Button {
      pick = m.id
    } label: {
      VStack(spacing: 6) {
        MascotAvatar(mascotId: m.id, size: 52)
        Text(verbatim: m.name).font(DS.TextStyle.caption).foregroundStyle(DS.Color.foreground.swiftUI)
      }
      .padding(DS.Spacing.sm)
      .overlay(
        RoundedRectangle(cornerRadius: DS.Radius.md)
          .stroke(on ? DS.Color.foreground.swiftUI : .clear, lineWidth: 1.5)
      )
      .contentShape(RoundedRectangle(cornerRadius: DS.Radius.md))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(verbatim: m.name))
    .accessibilityAddTraits(on ? .isSelected : [])
  }

  /// Điền MỘT lần khi hồ sơ về — không ghi đè thứ người ta đang gõ dở.
  private func fill(_ phase: CommunityProfileBook.Phase) {
    guard !filled, phase == .ready else { return }
    if let p = book.existing {
      handle = p.handle
      name = p.displayName
      bio = p.bio
    }
    pick = book.initialMascot(selected: selectedMascot)
    filled = true
  }

  private func submit() async {
    guard canSave else { return }
    taken = false
    switch await book.save(handle: handle, name: name, bio: bio, mascotId: pick) {
    case .saved:
      onSaved()
      dismiss()
    case .handleTaken:
      taken = true
    case .failed(let f):
      error = f
    }
  }
}

/// Linh vật làm ảnh đại diện (`CommunityAvatar` của RN): hình thật của linh vật
/// người ấy chọn, cắt vào mặt trong vòng tròn.
struct MascotAvatar: View {
  let mascotId: String?
  let size: CGFloat

  /// `community-avatar.tsx`: hình phóng `ZOOM` × đường kính, đỉnh nhô `LIFT` ×
  /// đường kính — phần lọt vào vòng là đầu và vai; đứng yên (một feed ba mươi
  /// bài không chạy ba mươi vòng lặp).
  static let zoom: CGFloat = 1.25
  static let lift: CGFloat = 0.08

  var body: some View {
    Circle()
      .fill(DS.Color.secondary.swiftUI)
      .frame(width: size, height: size)
      .overlay(alignment: .topLeading) {
        MascotFigureView(
          mascotId: CommunityMascots.mascot(mascotId).id, size: (size * Self.zoom).rounded(), animated: false
        )
        .offset(x: (size - size * Self.zoom) / 2, y: -size * Self.lift)
      }
      .clipShape(Circle())
      .accessibilityHidden(true)
  }
}
