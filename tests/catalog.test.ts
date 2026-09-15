import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Cấu hình: Tag & Phân loại", () => {
  it("creates, lists, updates, and deletes a tag", async () => {
    const app = createApp();
    const created = await request(app).post("/api/tags").send({ ten_tag: "Test Tag A" });
    expect(created.status).toBe(201);
    expect(created.body.ten_tag).toBe("Test Tag A");

    const list = await request(app).get("/api/tags");
    expect(list.body.some((t: { id: number }) => t.id === created.body.id)).toBe(true);

    const updated = await request(app).put(`/api/tags/${created.body.id}`).send({ ten_tag: "Test Tag A (sửa)" });
    expect(updated.status).toBe(200);
    expect(updated.body.ten_tag).toBe("Test Tag A (sửa)");

    const del = await request(app).delete(`/api/tags/${created.body.id}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get("/api/tags");
    expect(listAfter.body.some((t: { id: number }) => t.id === created.body.id)).toBe(false);
  });

  it("rejects creating a tag missing ten_tag", async () => {
    const app = createApp();
    const res = await request(app).post("/api/tags").send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 updating/deleting a nonexistent tag", async () => {
    const app = createApp();
    const upd = await request(app).put("/api/tags/999999").send({ ten_tag: "x" });
    expect(upd.status).toBe(404);
    const del = await request(app).delete("/api/tags/999999");
    expect(del.status).toBe(404);
  });

  it("creates, lists, updates, and deletes a phân loại option", async () => {
    const app = createApp();
    const created = await request(app).post("/api/phan-loai").send({ ten_phan_loai: "Test Phân loại A" });
    expect(created.status).toBe(201);
    expect(created.body.ten_phan_loai).toBe("Test Phân loại A");

    const list = await request(app).get("/api/phan-loai");
    expect(list.body.some((p: { id: number }) => p.id === created.body.id)).toBe(true);

    const updated = await request(app)
      .put(`/api/phan-loai/${created.body.id}`)
      .send({ ten_phan_loai: "Test Phân loại A (sửa)" });
    expect(updated.status).toBe(200);
    expect(updated.body.ten_phan_loai).toBe("Test Phân loại A (sửa)");

    const del = await request(app).delete(`/api/phan-loai/${created.body.id}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get("/api/phan-loai");
    expect(listAfter.body.some((p: { id: number }) => p.id === created.body.id)).toBe(false);
  });

  it("rejects creating a phân loại option missing ten_phan_loai", async () => {
    const app = createApp();
    const res = await request(app).post("/api/phan-loai").send({});
    expect(res.status).toBe(400);
  });

  it("mới tạo được gán thu_tu tăng dần, nối tiếp sau các mục sẵn có", async () => {
    const app = createApp();
    const before = await request(app).get("/api/tags");
    const maxThuTuBefore = Math.max(-1, ...before.body.map((t: { thu_tu: number }) => t.thu_tu));

    const created = await request(app).post("/api/tags").send({ ten_tag: "Test Tag B" });
    expect(created.body.thu_tu).toBe(maxThuTuBefore + 1);

    await request(app).delete(`/api/tags/${created.body.id}`);
  });

  it("creates, lists, updates, and deletes a nhóm option", async () => {
    const app = createApp();
    const created = await request(app).post("/api/nhom").send({ ten_nhom: "Test Nhóm A" });
    expect(created.status).toBe(201);
    expect(created.body.ten_nhom).toBe("Test Nhóm A");

    const list = await request(app).get("/api/nhom");
    expect(list.body.some((n: { id: number }) => n.id === created.body.id)).toBe(true);

    const updated = await request(app).put(`/api/nhom/${created.body.id}`).send({ ten_nhom: "Test Nhóm A (sửa)" });
    expect(updated.status).toBe(200);
    expect(updated.body.ten_nhom).toBe("Test Nhóm A (sửa)");

    const del = await request(app).delete(`/api/nhom/${created.body.id}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get("/api/nhom");
    expect(listAfter.body.some((n: { id: number }) => n.id === created.body.id)).toBe(false);
  });

  it("rejects creating a nhóm option missing ten_nhom", async () => {
    const app = createApp();
    const res = await request(app).post("/api/nhom").send({});
    expect(res.status).toBe(400);
  });

  it("creates, lists, updates, and deletes a chức vụ option", async () => {
    const app = createApp();
    const created = await request(app).post("/api/chuc-vu").send({ ten_chuc_vu: "Test Chức vụ A" });
    expect(created.status).toBe(201);
    expect(created.body.ten_chuc_vu).toBe("Test Chức vụ A");

    const list = await request(app).get("/api/chuc-vu");
    expect(list.body.some((c: { id: number }) => c.id === created.body.id)).toBe(true);

    const updated = await request(app)
      .put(`/api/chuc-vu/${created.body.id}`)
      .send({ ten_chuc_vu: "Test Chức vụ A (sửa)" });
    expect(updated.status).toBe(200);
    expect(updated.body.ten_chuc_vu).toBe("Test Chức vụ A (sửa)");

    const del = await request(app).delete(`/api/chuc-vu/${created.body.id}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get("/api/chuc-vu");
    expect(listAfter.body.some((c: { id: number }) => c.id === created.body.id)).toBe(false);
  });

  it("rejects creating a chức vụ option missing ten_chuc_vu", async () => {
    const app = createApp();
    const res = await request(app).post("/api/chuc-vu").send({});
    expect(res.status).toBe(400);
  });

  it("creates, lists, updates, and deletes a hệ thống option", async () => {
    const app = createApp();
    const created = await request(app).post("/api/he-thong").send({ ten_he_thong: "Test Hệ thống A" });
    expect(created.status).toBe(201);
    const list = await request(app).get("/api/he-thong");
    expect(list.body.some((h: { id: number }) => h.id === created.body.id)).toBe(true);
    const updated = await request(app)
      .put(`/api/he-thong/${created.body.id}`)
      .send({ ten_he_thong: "Test Hệ thống A (sửa)" });
    expect(updated.body.ten_he_thong).toBe("Test Hệ thống A (sửa)");
    expect((await request(app).delete(`/api/he-thong/${created.body.id}`)).status).toBe(204);
  });

  it("creates, lists, updates, and deletes a mục tiêu option", async () => {
    const app = createApp();
    const created = await request(app).post("/api/muc-tieu").send({ ten_muc_tieu: "Test Mục tiêu A" });
    expect(created.status).toBe(201);
    const list = await request(app).get("/api/muc-tieu");
    expect(list.body.some((m: { id: number }) => m.id === created.body.id)).toBe(true);
    const updated = await request(app)
      .put(`/api/muc-tieu/${created.body.id}`)
      .send({ ten_muc_tieu: "Test Mục tiêu A (sửa)" });
    expect(updated.body.ten_muc_tieu).toBe("Test Mục tiêu A (sửa)");
    expect((await request(app).delete(`/api/muc-tieu/${created.body.id}`)).status).toBe(204);
  });

  it("rejects hệ thống / mục tiêu missing name", async () => {
    const app = createApp();
    expect((await request(app).post("/api/he-thong").send({})).status).toBe(400);
    expect((await request(app).post("/api/muc-tieu").send({})).status).toBe(400);
  });

  it('bấm "+ Thêm nhóm" nhiều lần liên tiếp (tên mặc định trùng) không lỗi — tự thêm hậu tố', async () => {
    const app = createApp();
    const a = await request(app).post("/api/nhom").send({ ten_nhom: "Nhóm mới test" });
    const b = await request(app).post("/api/nhom").send({ ten_nhom: "Nhóm mới test" });
    const c = await request(app).post("/api/nhom").send({ ten_nhom: "Nhóm mới test" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(c.status).toBe(201);
    expect(a.body.ten_nhom).toBe("Nhóm mới test");
    expect(b.body.ten_nhom).toBe("Nhóm mới test 2");
    expect(c.body.ten_nhom).toBe("Nhóm mới test 3");
  });

  it("đổi tên trùng với 1 nhóm khác -> lỗi thân thiện (409), không lộ câu SQL thô", async () => {
    const app = createApp();
    const a = await request(app).post("/api/nhom").send({ ten_nhom: "Nhóm trùng A" });
    const b = await request(app).post("/api/nhom").send({ ten_nhom: "Nhóm trùng B" });
    const res = await request(app).put(`/api/nhom/${b.body.id}`).send({ ten_nhom: "Nhóm trùng A" });
    expect(res.status).toBe(409);
    expect(res.body.error).not.toMatch(/insert into|UNIQUE constraint/i);
    expect(res.body.error).toContain("đã tồn tại");
  });
});
