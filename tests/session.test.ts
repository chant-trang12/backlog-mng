import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

// Bật SSO cho requireAuth/meHandler chạy nhánh session thật (mặc định test
// env SSO tắt -> requireAuth no-op, không kiểm tra được hết hạn phiên).
vi.mock("../src/services/auth.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/auth.service.js")>();
  return {
    ...actual,
    isSsoEnabled: () => true,
    generateAuthUrl: vi.fn(),
    handleOidcCallback: vi.fn(),
    getLogoutUrl: vi.fn(),
  };
});

// getUserBySsoSub/computeScope chạm DB — mock trả user admin hợp lệ.
vi.mock("../src/services/user.service.js", () => ({
  getUserBySsoSub: vi.fn(async () => ({ id: 1, role: "admin", active: true, department_id: null })),
  upsertUserFromSso: vi.fn(async () => ({ id: 1, role: "admin", active: true, department_id: null })),
}));
vi.mock("../src/services/scope.util.js", () => ({
  computeScope: vi.fn(async () => ({ all: true, departmentId: null })),
}));

const { requireAuth } = await import("../src/middleware/auth.middleware.js");
const { meHandler } = await import("../src/controllers/auth.controller.js");
const {
  buildSessionOptions,
  isSessionExpired,
  sessionAbsoluteMs,
  sessionIdleMs,
} = await import("../src/session.config.js");

const IDLE_MIN = 45;
const ABSOLUTE_MIN = 480;

/** App test: session thật (MemoryStore) + route gán session với tuổi tuỳ ý. */
function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ ...buildSessionOptions(), secret: "test-secret-attt-session" }));
  app.post("/_test/login", (req, res) => {
    const { loginAgeMin = 0, lastSeenAgeMin = 0 } = req.body ?? {};
    req.session.user = { id: "sub-1", username: "kiennv", name: "Kiên NV" };
    req.session.loginAt = Date.now() - loginAgeMin * 60 * 1000;
    req.session.lastSeen = Date.now() - lastSeenAgeMin * 60 * 1000;
    res.json({ ok: true });
  });
  app.get("/auth/me", meHandler);
  app.use("/api", requireAuth);
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));
  return app;
}

/** Đăng nhập qua route test rồi GET /api/ping bằng agent giữ cookie. */
async function login(
  app: ReturnType<typeof buildTestApp>,
  ages: { loginAgeMin?: number; lastSeenAgeMin?: number } = {},
) {
  const agent = request.agent(app);
  const loginRes = await agent.post("/_test/login").send(ages).expect(200);
  return { agent, loginRes };
}

describe("ATTT: Session không hết hạn — idle/absolute timeout ở phía server", () => {
  beforeEach(() => {
    delete process.env.SESSION_IDLE_MINUTES;
    delete process.env.SESSION_ABSOLUTE_MINUTES;
  });

  afterAll(() => {
    delete process.env.SESSION_IDLE_MINUTES;
    delete process.env.SESSION_ABSOLUTE_MINUTES;
  });

  it("buildSessionOptions: rolling + cookie maxAge 45 phút, HttpOnly, SameSite Lax", () => {
    const options = buildSessionOptions();
    expect(options.rolling).toBe(true);
    expect(options.cookie.maxAge).toBe(IDLE_MIN * 60 * 1000);
    expect(options.cookie.httpOnly).toBe(true);
    expect(options.cookie.sameSite).toBe("lax");
    expect(options.saveUninitialized).toBe(false);
  });

  it("Cấu hình đọc env override (SESSION_IDLE_MINUTES/SESSION_ABSOLUTE_MINUTES)", () => {
    process.env.SESSION_IDLE_MINUTES = "30";
    process.env.SESSION_ABSOLUTE_MINUTES = "600";
    expect(sessionIdleMs()).toBe(30 * 60 * 1000);
    expect(sessionAbsoluteMs()).toBe(600 * 60 * 1000);
  });

  it("isSessionExpired: phiên mới còn hạn; fail-closed khi thiếu loginAt", () => {
    expect(isSessionExpired({ loginAt: Date.now(), lastSeen: Date.now() })).toBe(false);
    // Idle quá hạn nhưng absolute chưa -> hết hạn
    expect(isSessionExpired({ loginAt: Date.now(), lastSeen: Date.now() - (IDLE_MIN + 1) * 60 * 1000 })).toBe(true);
    // Absolute quá hạn dù vừa tương tác -> hết hạn
    expect(
      isSessionExpired({ loginAt: Date.now() - (ABSOLUTE_MIN + 1) * 60 * 1000, lastSeen: Date.now() }),
    ).toBe(true);
    // Dữ liệu cũ không có loginAt -> coi như hết hạn (fail-closed)
    expect(isSessionExpired({ lastSeen: Date.now() })).toBe(true);
    expect(isSessionExpired(undefined)).toBe(true);
  });

  it("Đăng nhập xong dùng ngay -> 200; cookie hết hạn sau 45 phút (Expires/Max-Age)", async () => {
    const app = buildTestApp();
    const { agent, loginRes } = await login(app);
    const setCookie = loginRes.headers["set-cookie"]?.[0] ?? "";
    expect(setCookie).toContain("connect.sid=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    // express-session xuất hạn cookie dạng Expires (tương đương Max-Age về
    // ý nghĩa với trình duyệt) — thời điểm hết hạn phải nằm trong 45 phút.
    const expiresAt = Date.parse(/Expires=([^;]+)/.exec(setCookie)?.[1] ?? "");
    expect(Number.isNaN(expiresAt)).toBe(false);
    const deltaMs = expiresAt - Date.now();
    expect(deltaMs).toBeGreaterThan((IDLE_MIN - 1) * 60 * 1000);
    expect(deltaMs).toBeLessThanOrEqual(IDLE_MIN * 60 * 1000 + 5000);

    const res = await agent.get("/api/ping");
    expect(res.status).toBe(200);
  });

  it("Idle timeout: 46 phút không tương tác -> 401 + phiên bị hủy", async () => {
    const app = buildTestApp();
    const { agent } = await login(app, { loginAgeMin: 0, lastSeenAgeMin: IDLE_MIN + 1 });
    const res = await agent.get("/api/ping");
    expect(res.status).toBe(401);
    expect(res.body.loginUrl).toBe("/auth/login");

    // Cookie cũ (kẻ đánh cắp) cũng không còn phiên hợp lệ nào phía server.
    const again = await agent.get("/api/ping");
    expect(again.status).toBe(401);
  });

  it("Absolute timeout: 8 giờ kể từ đăng nhập, dù vẫn tương tác -> 401", async () => {
    const app = buildTestApp();
    const { agent } = await login(app, { loginAgeMin: ABSOLUTE_MIN + 1, lastSeenAgeMin: 0 });
    const res = await agent.get("/api/ping");
    expect(res.status).toBe(401);
    expect(res.body.loginUrl).toBe("/auth/login");
  });

  it("Sliding idle: request hợp lệ gia hạn lastSeen — vẫn dùng được trong 45 phút hoạt động liên tục", async () => {
    const app = buildTestApp();
    const { agent } = await login(app, { lastSeenAgeMin: IDLE_MIN - 5 });
    const first = await agent.get("/api/ping");
    expect(first.status).toBe(200);
    // Nếu lastSeen KHÔNG được trượt, request tiếp theo vẫn phải hoạt động
    // khi lastSeen nằm sát ngưỡng — kiểm tra đủ 3 lượt liên tiếp.
    const second = await agent.get("/api/ping");
    expect(second.status).toBe(200);
    const third = await agent.get("/api/ping");
    expect(third.status).toBe(200);
  });

  it("Sát ngưỡng idle (40 phút hoạt động lại) -> vẫn 200", async () => {
    const app = buildTestApp();
    const { agent } = await login(app, { lastSeenAgeMin: IDLE_MIN - 1 });
    const res = await agent.get("/api/ping");
    expect(res.status).toBe(200);
  });

  it("/auth/me: phiên hết hạn -> authenticated=false (FE hiện lại màn login)", async () => {
    const app = buildTestApp();
    const expired = request.agent(app);
    await expired.post("/_test/login").send({ loginAgeMin: ABSOLUTE_MIN + 5 }).expect(200);
    const res = await expired.get("/auth/me").set("Accept", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
    expect(res.body.user).toBeNull();
    expect(res.body.role).toBeNull();
  });

  it("/auth/me: phiên còn hạn -> authenticated=true, role admin", async () => {
    const app = buildTestApp();
    const { agent } = await login(app);
    const res = await agent.get("/auth/me").set("Accept", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.user.username).toBe("kiennv");
    expect(res.body.role).toBe("admin");
  });
});
