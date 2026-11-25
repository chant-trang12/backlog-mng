import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// Menu "Hệ thống & Tính năng" dùng CHUNG bảng he_thong_options với Cấu hình > Hệ thống.
describe("Hệ thống (map với Cấu hình > Hệ thống)", () => {
  it("tạo ở trang Hệ thống -> hiện ở danh mục Cấu hình; tạo ở Cấu hình -> hiện ở trang Hệ thống kèm mã tự sinh", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "Sys phòng A" });
    const res = await request(app).post("/api/systems").send({ ma_he_thong: "HT-T1", ten_he_thong: "Sys Test Một", don_vi_quan_ly_id: dept.body.id, trang_thai: "dang_van_hanh", dia_chi_truy_cap: "https://a.vn" });
    expect(res.status).toBe(201);
    expect(res.body.tai_lieu_bat_buoc.length).toBe(5);
    const cfg = await request(app).get("/api/he-thong");
    expect(cfg.body.some((h: any) => h.ten_he_thong === "Sys Test Một")).toBe(true);

    const c2 = await request(app).post("/api/he-thong").send({ ten_he_thong: "Sys Test Hai" });
    expect(c2.status).toBe(201);
    const list = await request(app).get("/api/systems");
    const two = list.body.find((s: any) => s.ten_he_thong === "Sys Test Hai");
    expect(two.ma_he_thong).toMatch(/^HT-\d+$/);
    expect(two.trang_thai).toBe("dang_phat_trien");
  });

  it("kiểm tra dữ liệu: thiếu đơn vị, trùng mã/tên, URL không hợp lệ, trạng thái sai", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "Sys phòng B" });
    const ok = { ma_he_thong: "HT-T9", ten_he_thong: "Sys Test Chín", don_vi_quan_ly_id: dept.body.id };
    expect((await request(app).post("/api/systems").send({ ...ok, don_vi_quan_ly_id: undefined })).status).toBe(400);
    expect((await request(app).post("/api/systems").send(ok)).status).toBe(201);
    expect((await request(app).post("/api/systems").send({ ...ok, ten_he_thong: "Khác" })).status).toBe(400); // trùng mã
    expect((await request(app).post("/api/systems").send({ ...ok, ma_he_thong: "HT-T10" })).status).toBe(400); // trùng tên
    expect((await request(app).post("/api/systems").send({ ...ok, ma_he_thong: "HT-T11", ten_he_thong: "X1", dia_chi_truy_cap: "javascript:alert(1)" })).status).toBe(400);
    expect((await request(app).post("/api/systems").send({ ...ok, ma_he_thong: "HT-T12", ten_he_thong: "X2", trang_thai: "sai" })).status).toBe(400);
  });

  it("sửa hệ thống giữ nguyên mã của chính nó", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "Sys phòng C" });
    const c = await request(app).post("/api/systems").send({ ma_he_thong: "HT-T20", ten_he_thong: "Sys Sửa", don_vi_quan_ly_id: dept.body.id });
    const u = await request(app).put(`/api/systems/${c.body.id}`).send({ ma_he_thong: "HT-T20", ten_he_thong: "Sys Sửa 2", don_vi_quan_ly_id: dept.body.id, trang_thai: "bao_tri" });
    expect(u.status).toBe(200);
    expect(u.body.trang_thai).toBe("bao_tri");
    expect((await request(app).put("/api/systems/999999").send({ ma_he_thong: "Z", ten_he_thong: "Z", don_vi_quan_ly_id: dept.body.id })).status).toBe(404);
  });
});
