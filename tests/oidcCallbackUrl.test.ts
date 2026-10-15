import { afterEach, describe, expect, it } from "vitest";
import { buildCallbackUrl } from "../src/services/auth.service.js";

// Sau reverse proxy (IIS/ARR) Node thấy Host nội bộ (localhost:8810) nhưng IdP
// đã nhận redirect_uri công khai ở bước authorize — URL dùng để đổi token phải
// lấy origin+path từ cấu hình, nếu không IdP báo invalid_grant (redirect_uri
// không khớp).
describe("buildCallbackUrl — redirect_uri đổi token khớp redirect_uri bước authorize", () => {
  const original = process.env.OIDC_REDIRECT_URI;
  afterEach(() => {
    if (original === undefined) delete process.env.OIDC_REDIRECT_URI;
    else process.env.OIDC_REDIRECT_URI = original;
  });

  it("OIDC_REDIRECT_URI đầy đủ: dùng origin+path cấu hình, giữ nguyên query từ request", () => {
    process.env.OIDC_REDIRECT_URI = "https://backlog.example.com:8820/auth/callback";
    const url = buildCallbackUrl("http://localhost:8810", "/auth/callback?code=abc&state=xyz&iss=https%3A%2F%2Fsso");
    expect(url.origin).toBe("https://backlog.example.com:8820");
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("code")).toBe("abc");
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.get("iss")).toBe("https://sso");
  });

  it("OIDC_REDIRECT_URI là đường dẫn: ghép theo baseUrl của request (hành vi cũ)", () => {
    process.env.OIDC_REDIRECT_URI = "/auth/callback";
    const url = buildCallbackUrl("http://localhost:3001", "/auth/callback?code=c&state=s");
    expect(url.origin).toBe("http://localhost:3001");
    expect(url.pathname).toBe("/auth/callback");
    expect(url.search).toBe("?code=c&state=s");
  });
});
