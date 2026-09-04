import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Cấu hình: Tiêu chí", () => {
  it("creates, lists, updates, and deletes a tieu chi config", async () => {
    const app = createApp();
    const created = await request(app)
      .post("/api/tieu-chi")
      .send({ nhom: "Khách hàng", ten_tieu_chi: "Sprint Goal", cach_tinh_diem: "%HT Sprint goal * Điểm chuẩn" });
    expect(created.status).toBe(201);
    expect(created.body.nhom).toBe("Khách hàng");
    expect(created.body.co_chi_tieu).toBe(false);

    const list = await request(app).get("/api/tieu-chi");
    const found = list.body.find((c: { id: number }) => c.id === created.body.id);
    expect(found).toBeDefined();
    expect(found.diem_chuan).toEqual([]);

    const updated = await request(app)
      .put(`/api/tieu-chi/${created.body.id}`)
      .send({ ten_tieu_chi: "Sprint Goal (đã sửa)", co_chi_tieu: true });
    expect(updated.status).toBe(200);
    expect(updated.body.ten_tieu_chi).toBe("Sprint Goal (đã sửa)");
    expect(updated.body.co_chi_tieu).toBe(true);

    const del = await request(app).delete(`/api/tieu-chi/${created.body.id}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get("/api/tieu-chi");
    expect(listAfter.body.some((c: { id: number }) => c.id === created.body.id)).toBe(false);
  });

  it("upserts điểm chuẩn/chỉ tiêu theo team, không tạo trùng khi lưu lại", async () => {
    const app = createApp();
    const created = await request(app)
      .post("/api/tieu-chi")
      .send({ nhom: "Vận hành", ten_tieu_chi: "Test Tuân thủ" });
    const id = created.body.id;

    await request(app).put(`/api/tieu-chi/${id}/diem-chuan`).send({ team_name: "BSS", diem_chuan: "10" });
    await request(app)
      .put(`/api/tieu-chi/${id}/diem-chuan`)
      .send({ team_name: "BSS", diem_chuan: "20", chi_tieu: "98%" });

    const list = await request(app).get("/api/tieu-chi");
    const found = list.body.find((c: { id: number }) => c.id === id);
    expect(found.diem_chuan).toHaveLength(1);
    expect(found.diem_chuan[0]).toEqual({ team_name: "BSS", diem_chuan: "20", chi_tieu: "98%" });

    // tieu_chi_configs là cấu hình toàn cục (không theo period) — dọn dẹp để
    // không để lại dữ liệu test trong cấu hình thật.
    await request(app).delete(`/api/tieu-chi/${id}`);
  });

  it("deleting a tieu chi cascades its điểm chuẩn rows", async () => {
    const app = createApp();
    const created = await request(app).post("/api/tieu-chi").send({ nhom: "Vận hành", ten_tieu_chi: "Test X" });
    await request(app).put(`/api/tieu-chi/${created.body.id}/diem-chuan`).send({ team_name: "CRM", diem_chuan: "5" });

    await request(app).delete(`/api/tieu-chi/${created.body.id}`);

    const list = await request(app).get("/api/tieu-chi");
    expect(list.body.some((c: { id: number }) => c.id === created.body.id)).toBe(false);
  });

  it("cung cấp đủ điểm chuẩn từng tiêu chí để tính Tổng điểm (client tự cộng, không lưu tay)", async () => {
    const app = createApp();
    const c1 = await request(app).post("/api/tieu-chi").send({ nhom: "Khách hàng", ten_tieu_chi: "Test Sprint Goal" });
    const c2 = await request(app).post("/api/tieu-chi").send({ nhom: "Vận hành", ten_tieu_chi: "Test Tuân thủ" });

    await request(app).put(`/api/tieu-chi/${c1.body.id}/diem-chuan`).send({ team_name: "BSS", diem_chuan: "70" });
    await request(app).put(`/api/tieu-chi/${c2.body.id}/diem-chuan`).send({ team_name: "BSS", diem_chuan: "-1" });

    const list = await request(app).get("/api/tieu-chi");
    const bssDiemChuan = list.body
      .filter((c: { id: number }) => c.id === c1.body.id || c.id === c2.body.id)
      .flatMap((c: { diem_chuan: { team_name: string; diem_chuan: string }[] }) => c.diem_chuan)
      .filter((d: { team_name: string }) => d.team_name === "BSS")
      .reduce((sum: number, d: { diem_chuan: string }) => sum + Number(d.diem_chuan), 0);
    expect(bssDiemChuan).toBe(69);

    // tieu_chi_configs là cấu hình toàn cục (không theo period) — dọn dẹp để
    // không để lại dữ liệu test trong cấu hình thật.
    await request(app).delete(`/api/tieu-chi/${c1.body.id}`);
    await request(app).delete(`/api/tieu-chi/${c2.body.id}`);
  });

  it("rejects creating a tieu chi missing required fields", async () => {
    const app = createApp();
    const res = await request(app).post("/api/tieu-chi").send({ ten_tieu_chi: "X" });
    expect(res.status).toBe(400);
  });
});
