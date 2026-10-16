import { afterEach, describe, expect, it } from "vitest";
import { buildSessionOptions, clearSessionCookie, countSessionCookies, sessionCookieName } from "../src/session.config.js";

// Cookie phiên riêng của app: không dùng "connect.sid" (hay bị app Node khác trên
// cùng tên miền cha ghi đè/che) và dùng tiền tố "__Host-" khi chạy HTTPS.
describe("tên cookie phiên", () => {
  const original = process.env.COOKIE_SECURE;
  afterEach(() => {
    if (original === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = original;
  });

  it("HTTPS (COOKIE_SECURE=true): __Host-backlog.sid; HTTP: backlog.sid; không bao giờ là connect.sid", () => {
    process.env.COOKIE_SECURE = "true";
    expect(sessionCookieName()).toBe("__Host-backlog.sid");
    expect(buildSessionOptions().name).toBe("__Host-backlog.sid");
    process.env.COOKIE_SECURE = "false";
    expect(sessionCookieName()).toBe("backlog.sid");
  });

  it("countSessionCookies đếm đúng cookie trùng tên, bỏ qua cookie tên khác", () => {
    process.env.COOKIE_SECURE = "false";
    expect(countSessionCookies(undefined)).toBe(0);
    expect(countSessionCookies("connect.sid=abc; foo=bar")).toBe(0);
    expect(countSessionCookies("backlog.sid=a")).toBe(1);
    expect(countSessionCookies("x=1; backlog.sid=a; backlog.sid=b")).toBe(2);
  });

  it("xóa cookie __Host- phải kèm Secure + Path=/ (không thì trình duyệt bỏ qua lệnh xóa)", () => {
    process.env.COOKIE_SECURE = "true";
    let seen: { name?: string; opts?: Record<string, unknown> } = {};
    clearSessionCookie({
      clearCookie(name, opts) {
        seen = { name, opts: opts as Record<string, unknown> };
      },
    });
    expect(seen.name).toBe("__Host-backlog.sid");
    expect(seen.opts).toMatchObject({ path: "/", secure: true });
    expect(seen.opts && "domain" in seen.opts).toBe(false);
  });
});
