import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// Cổng trang (SSO bật): "/" chỉ được phục vụ khi đã đăng nhập hợp lệ; chưa
// đăng nhập thì chuyển hướng ngay ở server, không để JS tự quyết (tránh lặp/cache).
describe("cổng trang HTML chính", () => {
  const original = process.env.SSO_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.SSO_ENABLED;
    else process.env.SSO_ENABLED = original;
  });

  it("SSO bật, chưa đăng nhập: GET / -> 302 /auth/login, không trả HTML ứng dụng", async () => {
    process.env.SSO_ENABLED = "true";
    const res = await request(createApp()).get("/").set("Accept", "text/html");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/auth/login");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.text).not.toMatch(/<html/i);
  });

  it("SSO bật: GET /index.html cũng bị chặn; file tĩnh (css/js) vẫn công khai", async () => {
    process.env.SSO_ENABLED = "true";
    const app = createApp();
    expect((await request(app).get("/index.html")).status).toBe(302);
    expect((await request(app).get("/style.css")).status).toBe(200);
  });

  it("SSO tắt (dev/test): GET / phục vụ bình thường", async () => {
    process.env.SSO_ENABLED = "false";
    const res = await request(createApp()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<html/i);
  });
});
