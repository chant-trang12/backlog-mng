import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/auth.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/auth.service.js")>();
  let n = 0;
  return {
    ...actual,
    isSsoEnabled: () => true,
    generateAuthUrl: vi.fn(async () => {
      n += 1;
      return { url: `https://sso.example/authorize?state=s${n}`, state: `s${n}`, codeVerifier: `v${n}` };
    }),
  };
});

import { loginHandler } from "../src/controllers/auth.controller.js";
import { generateAuthUrl } from "../src/services/auth.service.js";

function fakeRes() {
  const r: { redirected?: string } = {};
  return {
    r,
    res: {
      redirect(url: string) {
        r.redirected = url;
      },
    } as any,
  };
}

describe("loginHandler — 2 request /auth/login liền nhau không ghi đè state của nhau", () => {
  afterEach(() => vi.clearAllMocks());

  it("lần 2 dùng lại đúng URL/state của lần 1 và không sinh state mới", async () => {
    const session: any = {};
    const req = { session, get: () => "localhost:8810", protocol: "http" } as any;
    const a = fakeRes();
    const b = fakeRes();
    await loginHandler(req, a.res, (() => {}) as any);
    const stateAfterFirst = session.state;
    await loginHandler(req, b.res, (() => {}) as any);

    expect(generateAuthUrl).toHaveBeenCalledTimes(1);
    expect(b.r.redirected).toBe(a.r.redirected);
    expect(session.state).toBe(stateAfterFirst);
  });

  it("đã đăng nhập hợp lệ -> về trang chủ, không gọi IdP", async () => {
    const session: any = { user: { id: "u" }, loginAt: Date.now(), lastSeen: Date.now() };
    const { r, res } = fakeRes();
    await loginHandler({ session, get: () => "x", protocol: "http" } as any, res, (() => {}) as any);
    expect(r.redirected).toBe("/");
    expect(generateAuthUrl).not.toHaveBeenCalled();
  });
});
