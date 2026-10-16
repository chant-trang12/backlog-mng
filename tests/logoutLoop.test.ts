import { afterEach, describe, expect, it } from "vitest";
import { sessionCookieName } from "../src/session.config.js";
import { logoutHandler } from "../src/controllers/auth.controller.js";

// Khi OIDC_LOGOUT_URI = .../auth/logout, IdP đưa trình duyệt quay lại
// /auth/logout SAU khi đã đăng xuất. Phiên lúc đó đã hủy -> phải về trang chủ,
// không được redirect lên IdP lần nữa (vòng lặp).
describe("logoutHandler — không lặp vô hạn khi đã đăng xuất", () => {
  const original = process.env.SSO_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.SSO_ENABLED;
    else process.env.SSO_ENABLED = original;
  });

  it("SSO bật, không còn phiên đăng nhập -> redirect '/' (không gọi IdP)", async () => {
    process.env.SSO_ENABLED = "true";
    const calls: { redirect?: string; cleared?: string } = {};
    const res = {
      clearCookie(name: string) {
        calls.cleared = name;
      },
      redirect(url: string) {
        calls.redirect = url;
      },
    };
    await logoutHandler({ session: {}, method: "GET", path: "/auth/logout" } as any, res as any, (() => {
      throw new Error("không được gọi next(err)");
    }) as any);
    expect(calls.redirect).toBe("/");
    expect(calls.cleared).toBe(sessionCookieName());
  });
});
