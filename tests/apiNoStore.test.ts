import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// Mọi /api không được cache: GET sau PUT phải luôn lấy dữ liệu mới, và dữ liệu riêng
// tư của người dùng không nằm lại trong cache trình duyệt/proxy.
describe("/api không bị cache", () => {
  const original = process.env.SSO_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.SSO_ENABLED;
    else process.env.SSO_ENABLED = original;
  });

  it("GET /api/departments trả Cache-Control: no-store", async () => {
    const res = await request(createApp()).get("/api/departments");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });

  it("trả lời 401 (chưa đăng nhập, SSO bật) cũng không bị cache", async () => {
    process.env.SSO_ENABLED = "true";
    const res = await request(createApp()).get("/api/departments");
    expect(res.status).toBe(401);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });

  it("sửa phòng ban rồi đọc lại: dữ liệu mới, không có ETag để điều kiện hóa bản cũ", async () => {
    const app = createApp();
    const created = await request(app).post("/api/departments").send({ name: `NoStore ${Date.now()}` });
    expect(created.status).toBe(201);
    const put = await request(app).put(`/api/departments/${created.body.id}`).send({ is_full_access: true });
    expect(put.status).toBe(200);
    const list = await request(app).get("/api/departments");
    const row = list.body.find((d: { id: number }) => d.id === created.body.id);
    expect(row.is_full_access).toBe(true);
    expect(list.headers["cache-control"]).toMatch(/no-store/);
  });
});
