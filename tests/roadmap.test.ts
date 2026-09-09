import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Roadmap năm", () => {
  it("creates, lists (theo year + department_id), updates, and deletes a roadmap item", async () => {
    const app = createApp();

    const created = await request(app)
      .post("/api/roadmap-items")
      .send({
        year: 2099,
        department_id: 1,
        team: "CRM",
        he_thong: "Website",
        muc_tieu: "Tính năng mới",
        nhiem_vu: "Xây trang Roadmap",
        dod: "Chạy được",
        dieu_kien_dam_bao: "Có kiểm thử",
        phan_loai: "NVKH",
        thoi_gian_bat_dau: "2099-02-01",
        thoi_gian_ket_thuc: "2099-05-20",
        trang_thai: "Đang thực hiện",
        ghi_chu: "note",
      });
    expect(created.status).toBe(201);
    expect(created.body.year).toBe(2099);
    expect(created.body.trang_thai).toBe("Đang thực hiện");

    const list = await request(app).get("/api/roadmap-items?year=2099&department_id=1");
    expect(list.status).toBe(200);
    expect(list.body.some((r: { id: number }) => r.id === created.body.id)).toBe(true);

    // Lọc theo phòng khác -> không thấy.
    const otherDept = await request(app).get("/api/roadmap-items?year=2099&department_id=2");
    expect(otherDept.body.some((r: { id: number }) => r.id === created.body.id)).toBe(false);

    // Lọc theo năm khác -> không thấy.
    const otherYear = await request(app).get("/api/roadmap-items?year=2098&department_id=1");
    expect(otherYear.body.some((r: { id: number }) => r.id === created.body.id)).toBe(false);

    const updated = await request(app)
      .put(`/api/roadmap-items/${created.body.id}`)
      .send({ trang_thai: "Hoàn thành", ghi_chu: "" });
    expect(updated.status).toBe(200);
    expect(updated.body.trang_thai).toBe("Hoàn thành");
    expect(updated.body.ghi_chu).toBeNull(); // chuỗi rỗng -> null

    const del = await request(app).delete(`/api/roadmap-items/${created.body.id}`);
    expect(del.status).toBe(204);
    const after = await request(app).get("/api/roadmap-items?year=2099&department_id=1");
    expect(after.body.some((r: { id: number }) => r.id === created.body.id)).toBe(false);
  });

  it("rejects create without year / team / nhiem_vu", async () => {
    const app = createApp();
    expect((await request(app).post("/api/roadmap-items").send({ team: "X", nhiem_vu: "Y" })).status).toBe(400);
    expect(
      (await request(app).post("/api/roadmap-items").send({ year: 2099, nhiem_vu: "Y" })).status,
    ).toBe(400);
    expect(
      (await request(app).post("/api/roadmap-items").send({ year: 2099, team: "X" })).status,
    ).toBe(400);
  });

  it("rejects list with an invalid year", async () => {
    const app = createApp();
    expect((await request(app).get("/api/roadmap-items?year=abc")).status).toBe(400);
  });
});
