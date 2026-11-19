#if DEBUG
  import ASCNDCore
  import Foundation

  /// Dữ liệu mẫu kiểm duyệt cho chế độ UI test (`UITestMode`) — trả lời các RPC
  /// `my_app_role` / `mod_*` / `admin_*` / `community_my_reports` mà
  /// `FakeSupabaseStore` chưa có, để flow Maestro 14 chụp được bảng kiểm duyệt
  /// (#915) mà không cần tài khoản staff hay dữ liệu thật trên server.
  ///
  /// Người mở app trong chế độ test là ADMIN: nút khiên ở Cộng đồng hiện, mục
  /// Quản trị trong bảng hiện. Nội dung mẫu bằng tiếng Anh (flow chạy với
  /// `AppleLanguages: (en)`), ngày tính lùi từ HÔM NAY của máy để nhãn "chờ
  /// hơn 48 giờ" và chữ "ago" luôn đúng.
  enum UITestModerationSeed {
    typealias Row = [String: Any]

    // MARK: - Người và đích mẫu

    static let mike = "e2e0d010-0000-4000-8000-000000000001"
    static let anna = "e2e0d010-0000-4000-8000-000000000002"
    static let mod = "e2e0d012-0000-4000-8000-000000000001"
    static let postSpam = "e2e0d001-0000-4000-8000-000000000001"
    static let postParent = "e2e0d001-0000-4000-8000-000000000002"
    static let postTrick = "e2e0d001-0000-4000-8000-000000000003"
    static let commentMean = "e2e0d002-0000-4000-8000-000000000001"

    /// ISO-8601 của một thời điểm cách hiện tại `days` ngày (âm = quá khứ).
    static func iso(days: Double) -> String {
      FakeSupabaseStore.iso(Date().addingTimeInterval(-days * 86_400))
    }

    static func person(_ id: String, _ handle: String, _ name: String) -> Row {
      ["user_id": id, "handle": handle, "display_name": name]
    }

    static func audit(_ id: Int, _ action: String, _ reason: String, days: Double) -> Row {
      audit(id, action, reason, days: days, type: nil, target: nil)
    }

    static func audit(_ id: Int, _ action: String, _ reason: String, days: Double, type: String?, target: String?) -> Row {
      var row: Row = [
        "id": id, "action": action, "reason": reason, "actor_role": "moderator",
        "created_at": iso(days: days), "actor": person(mod, "mod_koa", "Koa Mod"),
      ]
      if let type { row["target_type"] = type }
      if let target { row["target_id"] = target }
      return row
    }

    // MARK: - `my_app_role` / `mod_dashboard`

    static func dashboard() -> JSONValue {
      UITestSeed.json([
        "pending_reports": 3, "pending_appeals": 1, "hidden_posts": 5, "hidden_comments": 2,
        "removed_posts": 1, "reports_today": 2,
        "recent": [
          audit(101, "HIDE_POST", "Spam", days: 0.1, type: "post", target: postSpam),
          audit(100, "DISMISS_REPORT", "Not a violation", days: 0.5, type: "comment", target: commentMean),
          audit(99, "RESTRICT_USER", "Repeated spam", days: 1),
        ] as [Row],
      ] as Row)
    }

    // MARK: - `mod_reports` / `mod_appeals`

    /// Hàng đợi báo cáo theo trạng thái. Mở: bài spam (kháng nghị chờ + chờ
    /// hơn 48 giờ), bình luận ác ý (đã tự ẩn), bài gây hiểu lầm.
    static func reports(status: String?) -> JSONValue {
      let open: [Row] = [
        [
          "target_type": "post", "target_id": postSpam, "report_count": 4, "counted_count": 3,
          "reasons": ["spam": 3, "misleading": 1] as Row, "last_at": iso(days: 3),
          "target": [
            "kind": "workout", "caption": "BUY 10K FOLLOWERS CHEAP — DM me now, limited offer, 100% real!",
            "hidden": false, "removed": false, "author_id": mike, "created_at": iso(days: 4),
          ] as Row,
          "author": person(mike, "fitlife_mike", "Mike Tran"),
          "appeal": ["id": "e2e0d021-0000-4000-8000-000000000001", "status": "open", "created_at": iso(days: 1)] as Row,
        ],
        [
          "target_type": "comment", "target_id": commentMean, "report_count": 2, "counted_count": 2,
          "reasons": ["harassment": 2] as Row, "last_at": iso(days: 0.2),
          "target": [
            "body": "You look terrible, just quit already lol", "post_id": postParent,
            "hidden": true, "removed": false, "author_id": anna, "created_at": iso(days: 0.5),
          ] as Row,
          "author": person(anna, "gymrat_anna", "Anna Nguyen"),
        ],
        [
          "target_type": "post", "target_id": postTrick, "report_count": 2, "counted_count": 1,
          "reasons": ["misleading": 2] as Row, "last_at": iso(days: 1),
          "target": [
            "kind": "progress", "caption": "My 90-day transformation — down 12kg with this one weird trick doctors hate",
            "hidden": false, "removed": false, "author_id": mike, "created_at": iso(days: 2),
          ] as Row,
          "author": person(mike, "fitlife_mike", "Mike Tran"),
        ],
      ]
      let actioned: [Row] = [
        [
          "target_type": "post", "target_id": "e2e0d001-0000-4000-8000-000000000004", "report_count": 3,
          "counted_count": 3, "reasons": ["spam": 3] as Row, "last_at": iso(days: 5),
          "target": [
            "kind": "recipe", "caption": "Free protein powder giveaway — click the link in my bio to claim",
            "hidden": true, "removed": false, "author_id": anna, "created_at": iso(days: 6),
          ] as Row,
          "author": person(anna, "gymrat_anna", "Anna Nguyen"),
        ]
      ]
      let dismissed: [Row] = [
        [
          "target_type": "comment", "target_id": "e2e0d002-0000-4000-8000-000000000002", "report_count": 1,
          "counted_count": 0, "reasons": ["other": 1] as Row, "last_at": iso(days: 7),
          "target": [
            "body": "Try lowering the weight and slowing down the negative", "post_id": postParent,
            "hidden": false, "removed": false, "author_id": mike, "created_at": iso(days: 8),
          ] as Row,
          "author": person(mike, "fitlife_mike", "Mike Tran"),
        ]
      ]
      switch status {
      case "actioned": return UITestSeed.json(actioned)
      case "dismissed": return UITestSeed.json(dismissed)
      default: return UITestSeed.json(open)
      }
    }

    static func appeals(status: String?) -> JSONValue {
      let open: [Row] = [
        [
          "id": "e2e0d021-0000-4000-8000-000000000001", "status": "open",
          "message": "I did not spam — that post was a joke between friends. Please restore it.",
          "created_at": iso(days: 1), "target_type": "post", "target_id": postSpam,
          "excerpt": "BUY 10K FOLLOWERS CHEAP — DM me now, limited offer, 100% real!", "reports": 4,
          "author": person(mike, "fitlife_mike", "Mike Tran"),
        ]
      ]
      let decided: [Row] = [
        [
          "id": "e2e0d021-0000-4000-8000-000000000002", "status": status ?? "restored",
          "message": "My comment was training advice, not harassment.", "created_at": iso(days: 6),
          "decided_at": iso(days: 5), "target_type": "comment", "target_id": commentMean,
          "excerpt": "You look terrible, just quit already lol", "reports": 2,
          "author": person(anna, "gymrat_anna", "Anna Nguyen"),
        ]
      ]
      switch status {
      case "open": return UITestSeed.json(open)
      case "restored", "upheld": return UITestSeed.json(decided)
      default: return UITestSeed.json(open)
      }
    }

    // MARK: - `mod_target` / `mod_user_restriction`

    /// Chi tiết đích theo `p_type`: bài spam (có dải lịch sử tác giả + tạm
    /// khoá đăng) hay bình luận ác ý (có nút "Xem bài gốc").
    static func target(type: String?, id: String?) -> JSONValue {
      if type == "comment" {
        return UITestSeed.json([
          "type": "comment",
          "target": [
            "id": commentMean, "body": "You look terrible, just quit already lol", "post_id": postParent,
            "visibility": "public", "hidden": true, "like_count": 1, "comment_count": 0,
            "created_at": iso(days: 0.5),
          ] as Row,
          "author": person(anna, "gymrat_anna", "Anna Nguyen"),
          "author_stats": ["posts": 32, "hidden_posts": 1, "removed_posts": 0, "open_reports_against": 2, "reports_filed": 0] as Row,
          "reports": [
            [
              "id": "e2e0d020-0000-4000-8000-000000000011", "reason": "harassment", "status": "open",
              "created_at": iso(days: 0.2), "counted": true,
              "reporter": person("e2e0d011-0000-4000-8000-000000000001", "sarah_fitness", "Sarah Lee"),
            ] as Row,
            [
              "id": "e2e0d020-0000-4000-8000-000000000012", "reason": "harassment", "status": "open",
              "created_at": iso(days: 0.2), "counted": true,
              "reporter": person("e2e0d011-0000-4000-8000-000000000002", "coach_tom", "Tom Pham"),
            ] as Row,
          ] as [Row],
          "appeals": [] as [Row],
          "history": [audit(98, "HIDE_COMMENT", "Auto-hidden at threshold", days: 0.2)] as [Row],
        ] as Row)
      }
      return UITestSeed.json([
        "type": "post",
        "target": [
          "id": postSpam, "kind": "workout",
          "caption": "BUY 10K FOLLOWERS CHEAP — DM me now, limited offer, 100% real!",
          "visibility": "public", "hidden": false, "like_count": 42, "comment_count": 7,
          "created_at": iso(days: 4),
        ] as Row,
        "author": person(mike, "fitlife_mike", "Mike Tran"),
        "author_stats": ["posts": 18, "hidden_posts": 2, "removed_posts": 0, "open_reports_against": 4, "reports_filed": 1] as Row,
        "restriction": ["until": iso(days: -2), "reason": "Repeated spam", "created_at": iso(days: 1)] as Row,
        "reports": [
          [
            "id": "e2e0d020-0000-4000-8000-000000000001", "reason": "spam", "status": "open",
            "created_at": iso(days: 3), "counted": true,
            "reporter": person("e2e0d011-0000-4000-8000-000000000001", "sarah_fitness", "Sarah Lee"),
          ] as Row,
          [
            "id": "e2e0d020-0000-4000-8000-000000000002", "reason": "spam", "status": "open",
            "created_at": iso(days: 3), "counted": true, "note": "Same link in three posts today",
            "reporter": person("e2e0d011-0000-4000-8000-000000000002", "coach_tom", "Tom Pham"),
          ] as Row,
          [
            "id": "e2e0d020-0000-4000-8000-000000000003", "reason": "spam", "status": "open",
            "created_at": iso(days: 2), "counted": true,
            "reporter": person("e2e0d011-0000-4000-8000-000000000003", "linh_runs", "Linh Ho"),
          ] as Row,
          [
            "id": "e2e0d020-0000-4000-8000-000000000004", "reason": "misleading", "status": "open",
            "created_at": iso(days: 2), "counted": false,
            "reporter": person("e2e0d011-0000-4000-8000-000000000001", "sarah_fitness", "Sarah Lee"),
          ] as Row,
        ] as [Row],
        "appeals": [
          [
            "id": "e2e0d021-0000-4000-8000-000000000001", "status": "open",
            "message": "I did not spam — that post was a joke between friends. Please restore it.",
            "created_at": iso(days: 1),
          ] as Row
        ] as [Row],
        "history": [
          audit(97, "HIDE_POST", "Spam", days: 3, type: "post", target: postSpam),
          audit(96, "RESTORE_POST", "Pending review", days: 2, type: "post", target: postSpam),
        ] as [Row],
      ] as Row)
    }

    /// Chỉ tác giả bài spam đang bị khoá đăng; mọi người khác `null`.
    static func restriction(user: String?) -> JSONValue {
      guard user == mike else { return .null }
      return UITestSeed.json(["until": iso(days: -2), "reason": "Repeated spam", "created_at": iso(days: 1)] as Row)
    }

    // MARK: - `admin_*`

    static func users(query: String?) -> JSONValue {
      let all: [Row] = [
        [
          "user_id": mike, "email": "mike@example.com", "handle": "fitlife_mike", "display_name": "Mike Tran",
          "role": "user", "posts": 18, "hidden_posts": 2, "removed_posts": 0, "open_reports_against": 4,
          "reports_filed": 1,
        ],
        [
          "user_id": anna, "email": "anna@example.com", "handle": "gymrat_anna", "display_name": "Anna Nguyen",
          "role": "user", "posts": 32, "hidden_posts": 1, "removed_posts": 0, "open_reports_against": 2,
          "reports_filed": 0,
        ],
        [
          "user_id": mod, "email": "mod@example.com", "handle": "mod_koa", "display_name": "Koa Mod",
          "role": "moderator", "posts": 5, "hidden_posts": 0, "removed_posts": 0, "open_reports_against": 0,
          "reports_filed": 3,
        ],
      ]
      guard let q = query?.trimmingCharacters(in: .whitespacesAndNewlines), !q.isEmpty else {
        return UITestSeed.json(all)
      }
      let needle = q.lowercased()
      return UITestSeed.json(all.filter { row in
        ["display_name", "handle", "email"].contains { key in
          (row[key] as? String)?.lowercased().contains(needle) == true
        }
      })
    }

    static func userDetail(id: String?) -> JSONValue {
      let isAnna = id == anna
      let userId = isAnna ? anna : mike
      let name = isAnna ? "Anna Nguyen" : "Mike Tran"
      let handle = isAnna ? "gymrat_anna" : "fitlife_mike"
      let email = isAnna ? "anna@example.com" : "mike@example.com"
      return UITestSeed.json([
        "user_id": userId, "email": email, "role": "user",
        "profile": ["handle": handle, "display_name": name, "bio": isAnna ? "Marathon in training." : "Lifting since 2019."] as Row,
        "posts": [
          [
            "id": isAnna ? postParent : postSpam, "kind": "workout",
            "caption": isAnna ? "Sunday long run — 18km in the rain" : "BUY 10K FOLLOWERS CHEAP — DM me now, limited offer, 100% real!",
            "hidden": false, "removed": false, "created_at": iso(days: 4), "reports": isAnna ? 0 : 4,
          ] as Row
        ] as [Row],
        "reports_against": isAnna ? [] as [Row] : [
          [
            "id": "e2e0d020-0000-4000-8000-000000000001", "reason": "spam", "status": "open",
            "created_at": iso(days: 3), "target_type": "post", "target_id": postSpam,
          ] as Row
        ] as [Row],
        "reports_filed": isAnna ? 0 : 1,
        "history": [audit(99, "RESTRICT_USER", "Repeated spam", days: 1)] as [Row],
      ] as Row)
    }

    static func audit(action: String?) -> JSONValue {
      let all: [Row] = [
        audit(101, "HIDE_POST", "Spam", days: 0.1, type: "post", target: postSpam),
        audit(100, "DISMISS_REPORT", "Not a violation", days: 0.5, type: "comment", target: commentMean),
        audit(99, "RESTRICT_USER", "Repeated spam", days: 1),
        audit(98, "HIDE_COMMENT", "Auto-hidden at threshold", days: 0.2, type: "comment", target: commentMean),
        audit(97, "REMOVE_POST", "Advertising", days: 2, type: "post", target: "e2e0d001-0000-4000-8000-000000000004"),
      ]
      guard let action, !action.isEmpty else { return UITestSeed.json(all) }
      return UITestSeed.json(all.filter { ($0["action"] as? String) == action })
    }

    static func art() -> JSONValue {
      UITestSeed.json([
        [
          "id": "e2e0d030-0000-4000-8000-000000000001", "kind": "workout", "style": "minimal",
          "tags": ["gym", "morning"], "path": "workout/minimal-01.jpg",
          "alt_en": "Barbell on a gym platform", "alt_vi": "Tạ đòn trên sàn phòng tập",
          "active": true, "sort": 1, "created_at": iso(days: 30), "used_by": 12,
        ] as Row,
        [
          "id": "e2e0d030-0000-4000-8000-000000000002", "kind": "recipe", "style": "bright",
          "tags": ["breakfast"], "path": "recipe/bright-01.jpg",
          "alt_en": "Overnight oats with berries", "alt_vi": "Yến mạch qua đêm với quả mọng",
          "active": false, "sort": 2, "created_at": iso(days: 20), "used_by": 3,
        ] as Row,
      ] as [Row])
    }

    // MARK: - `community_my_reports`

    static func myReports() -> JSONValue {
      UITestSeed.json([
        [
          "id": "e2e0d020-0000-4000-8000-000000000001", "reason": "spam", "status": "open",
          "created_at": iso(days: 0.1), "target_type": "post", "target_id": postSpam,
          "excerpt": "BUY 10K FOLLOWERS CHEAP — DM me now, limited offer, 100% real!", "removed": false,
        ] as Row,
        [
          "id": "e2e0d020-0000-4000-8000-000000000011", "reason": "harassment", "status": "actioned",
          "created_at": iso(days: 3), "target_type": "comment", "target_id": commentMean,
          "excerpt": "You look terrible, just quit already lol", "removed": false,
        ] as Row,
      ] as [Row])
    }
  }
#endif
