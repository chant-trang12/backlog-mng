import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// /auth/me (và mọi /auth/*) không được cache: bản "chưa đăng nhập" bị trình
// duyệt giữ lại sau khi đăng nhập xong gây vòng lặp /auth/login <-> trang chủ.
describe("/auth/* không bị trình duyệt cache", () => {
  it("/auth/me trả Cache-Control: no-store", async () => {
    const res = await request(createApp()).get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });
});
