/**
 * ATTT Session (Phiên không hết hạn):
 * Cookie connect.sid trước đây chỉ có maxAge 24 giờ, không có giới hạn
 * thời gian nhàn rỗi (idle timeout) lẫn thời gian tuyệt đối (absolute
 * timeout) ở phía server — kẻ đánh cắp cookie có thể dùng lại phiên hợp lệ
 * vô thời hạn. Module này là nguồn cấu hình duy nhất cho:
 *  - Idle timeout: SESSION_IDLE_MINUTES (mặc định 45 phút — khuyến nghị
 *    ATTT 30-50 phút). Cookie + TTL phía store được "lăn" (rolling) sau
 *    mỗi request; không tương tác quá thời hạn này -> phiên hết hạn.
 *  - Absolute timeout: SESSION_ABSOLUTE_MINUTES (mặc định 480 phút = 8 giờ
 *    làm việc). Đo từ thời điểm đăng nhập (session.loginAt), KHÔNG được
 *    kéo dài bởi hoạt động — sau thời hạn này người dùng phải đăng nhập lại
 *    dù vẫn đang tương tác.
 * Cả hai đều được kiểm tra ở phía SERVER (requireAuth + meHandler), không
 * chỉ dựa vào cookie phía client.
 */

export function sessionIdleMinutes(): number {
  const raw = Number(process.env.SESSION_IDLE_MINUTES ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : 45;
}

export function sessionAbsoluteMinutes(): number {
  const raw = Number(process.env.SESSION_ABSOLUTE_MINUTES ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : 480;
}

export function sessionIdleMs(): number {
  return sessionIdleMinutes() * 60 * 1000;
}

export function sessionAbsoluteMs(): number {
  return sessionAbsoluteMinutes() * 60 * 1000;
}

/**
 * Kiểm tra phiên đã đăng nhập (có session.user) còn hiệu lực không.
 * Fail-closed: session không có loginAt (dữ liệu cũ/đáng ngờ) coi như hết hạn
 * — người dùng chỉ cần đăng nhập lại một lần sau khi bản fix được triển khai.
 */
export function isSessionExpired(
  session: { loginAt?: number; lastSeen?: number } | undefined | null,
): boolean {
  if (!session || typeof session.loginAt !== "number") return true;
  const now = Date.now();
  // Absolute timeout — tính từ lúc đăng nhập, không bị hoạt động kéo dài.
  if (now - session.loginAt > sessionAbsoluteMs()) return true;
  // Idle timeout — tính từ lần tương tác gần nhất (mặc định bằng loginAt).
  const lastSeen = typeof session.lastSeen === "number" ? session.lastSeen : session.loginAt;
  return now - lastSeen > sessionIdleMs();
}

/** Cập nhật thời điểm tương tác gần nhất (sliding idle window). */
export function touchSession(req: { session?: { user?: unknown; lastSeen?: number } | null }): void {
  if (req.session?.user) {
    req.session.lastSeen = Date.now();
  }
}

/**
 * Options express-session dùng chung cho app thật (app.ts) và test.
 * rolling: true — mỗi request có phiên hợp lệ đều gia hạn lại cookie maxAge
 * (và TTL phía store) => "nhàn rỗi" quá sessionIdleMs là phiên tự chết,
 * kể cả khi cookie cũ còn nằm trong tay attacker.
 */
export function buildSessionOptions(): {
  resave: boolean;
  saveUninitialized: boolean;
  rolling: boolean;
  cookie: {
    secure: boolean;
    httpOnly: boolean;
    sameSite: "lax";
    maxAge: number;
  };
} {
  return {
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: process.env.COOKIE_SECURE === "true",
      httpOnly: true,
      sameSite: "lax",
      maxAge: sessionIdleMs(),
    },
  };
}
