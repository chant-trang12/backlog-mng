import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";

async function xlsxBuffer(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

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

  it("manages chi tiết công việc theo tháng: add / list / update / delete, cascades on item delete", async () => {
    const app = createApp();
    const item = await request(app)
      .post("/api/roadmap-items")
      .send({
        year: 2097,
        department_id: 1,
        team: "CRM",
        nhiem_vu: "Detail CRUD",
        thoi_gian_bat_dau: "2097-01-02",
        thoi_gian_ket_thuc: "2097-03-15",
      });
    const itemId = item.body.id;

    const d1 = await request(app)
      .post(`/api/roadmap-items/${itemId}/details`)
      .send({ month: 1, noi_dung: "Phân tích", trang_thai: "Hoàn thành" });
    expect(d1.status).toBe(201);
    expect(d1.body.month).toBe(1);

    await request(app)
      .post(`/api/roadmap-items/${itemId}/details`)
      .send({ month: 2, noi_dung: "Code", ghi_chu: "2 sprint" });

    const list = await request(app).get(`/api/roadmap-items/${itemId}/details`);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].month).toBe(1);

    const upd = await request(app)
      .put(`/api/roadmap-details/${d1.body.id}`)
      .send({ trang_thai: "Đang thực hiện" });
    expect(upd.body.trang_thai).toBe("Đang thực hiện");
    expect(upd.body.noi_dung).toBe("Phân tích"); // giữ nguyên field không gửi

    expect((await request(app).delete(`/api/roadmap-details/${d1.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/roadmap-items/${itemId}/details`)).body).toHaveLength(1);

    // Xóa dòng roadmap -> chi tiết cũng bị xóa (CASCADE).
    await request(app).delete(`/api/roadmap-items/${itemId}`);
    expect((await request(app).get(`/api/roadmap-items/${itemId}/details`)).body).toHaveLength(0);
  });

  it("rejects a detail with month out of 1..12 or missing noi_dung", async () => {
    const app = createApp();
    const item = await request(app)
      .post("/api/roadmap-items")
      .send({ year: 2096, department_id: 1, team: "CRM", nhiem_vu: "x" });
    const itemId = item.body.id;
    expect(
      (await request(app).post(`/api/roadmap-items/${itemId}/details`).send({ month: 0, noi_dung: "a" }))
        .status,
    ).toBe(400);
    expect(
      (await request(app).post(`/api/roadmap-items/${itemId}/details`).send({ month: 13, noi_dung: "a" }))
        .status,
    ).toBe(400);
    expect(
      (await request(app).post(`/api/roadmap-items/${itemId}/details`).send({ month: 3 })).status,
    ).toBe(400);
  });

  it("serves a roadmap import template and imports rows from an Excel file", async () => {
    const app = createApp();
    const tpl = await request(app).get("/api/roadmap-items/import-template").buffer(true);
    expect(tpl.status).toBe(200);
    expect(tpl.headers["content-type"]).toContain("spreadsheetml");

    const buf = await xlsxBuffer(
      [
        "Team",
        "Hệ thống",
        "Mục tiêu",
        "Nhiệm vụ",
        "DOD",
        "Điều kiện đảm bảo",
        "Phân loại",
        "Thời gian bắt đầu",
        "Thời gian kết thúc",
        "Trạng thái",
        "Ghi chú",
      ],
      [
        ["CRM", "Website", "Tính năng mới", "RM import A", "prod", "test", "NVKH", "02/01/2095", "15/03/2095", "Đang thực hiện", "n"],
        ["", "", "", "Thiếu team", "", "", "", "", "", "", ""],
        ["CRM", "", "", "", "", "", "", "", "", "", ""],
      ],
    );
    const res = await request(app)
      .post("/api/roadmap-items/import?year=2095&department_id=1")
      .set("Content-Type", "application/octet-stream")
      .send(buf);
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toHaveLength(2);

    const list = await request(app).get("/api/roadmap-items?year=2095&department_id=1");
    const a = list.body.find((r: { nhiem_vu: string }) => r.nhiem_vu === "RM import A");
    expect(a.thoi_gian_bat_dau).toBe("2095-01-02");
    expect(a.thoi_gian_ket_thuc).toBe("2095-03-15");
    expect(a.trang_thai).toBe("Đang thực hiện");
    expect(a.he_thong).toBe("Website");
  });

  it("rejects a roadmap import file missing the Nhiệm vụ column, and import with bad year", async () => {
    const app = createApp();
    const buf = await xlsxBuffer(["Team", "Ghi chú"], [["CRM", "x"]]);
    expect(
      (
        await request(app)
          .post("/api/roadmap-items/import?year=2095&department_id=1")
          .set("Content-Type", "application/octet-stream")
          .send(buf)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/roadmap-items/import?year=abc")
          .set("Content-Type", "application/octet-stream")
          .send(buf)
      ).status,
    ).toBe(400);
  });

  it("gộp ô dọc trong Excel (nhiều dòng cùng 1 việc, VD Điều kiện đảm bảo liệt kê riêng từng dòng) -> import đúng số bản ghi, không tách dòng", async () => {
    const app = createApp();

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Sheet1");
    sheet.addRow([
      "Team",
      "Hệ thống",
      "Mục tiêu",
      "Nhiệm vụ",
      "DOD",
      "Điều kiện đảm bảo",
      "Phân loại",
      "Thời gian bắt đầu",
      "Thời gian kết thúc",
      "Trạng thái",
      "Ghi chú",
    ]);
    // Dòng 2: CRM — 1 bản ghi độc lập, không gộp ô.
    sheet.addRow(["CRM", "CRM", "Tính năng mới", "Hoàn thiện giao diện CRM", "Nâng cấp NextJS", "", "Tập đoàn", "06/01/2026", "30/11/2026", "", ""]);
    // Dòng 3-5: DMP — gộp dọc cột A,B,C,D,E,G,H,I (1 việc), cột F (Điều kiện
    // đảm bảo) liệt kê riêng 3 dòng khác nhau -> phải gộp lại thành 1 bản ghi.
    sheet.addRow(["DMP", "DMP", "Tính năng mới", "Tính toán tự động KPI", "", "Bước 1: xây dựng bộ dữ liệu (Tháng 5)", "", "05/01/2026", "30/06/2026", "", ""]);
    sheet.addRow(["", "", "", "", "", "Bước 2: thiết lập API (Tháng 5)", "", "", "", "", ""]);
    sheet.addRow(["", "", "", "", "", "Bước 3: dashboard (Tháng 6)", "", "", "", "", ""]);
    sheet.mergeCells("A3:A5");
    sheet.mergeCells("B3:B5");
    sheet.mergeCells("C3:C5");
    sheet.mergeCells("D3:D5");
    sheet.mergeCells("E3:E5");
    sheet.mergeCells("G3:G5");
    sheet.mergeCells("H3:H5");
    sheet.mergeCells("I3:I5");
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await request(app)
      .post("/api/roadmap-items/import?year=2093&department_id=1")
      .set("Content-Type", "application/octet-stream")
      .send(buf);
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2); // KHÔNG phải 4
    expect(res.body.skipped).toHaveLength(0);

    const list = await request(app).get("/api/roadmap-items?year=2093&department_id=1");
    expect(list.body).toHaveLength(2);

    const dmp = list.body.find((r: { team: string }) => r.team === "DMP");
    expect(dmp.nhiem_vu).toBe("Tính toán tự động KPI");
    expect(dmp.dieu_kien_dam_bao).toBe(
      "Bước 1: xây dựng bộ dữ liệu (Tháng 5)\nBước 2: thiết lập API (Tháng 5)\nBước 3: dashboard (Tháng 6)",
    );
    expect(dmp.thoi_gian_bat_dau).toBe("2026-01-05");
    expect(dmp.thoi_gian_ket_thuc).toBe("2026-06-30");

    const crm = list.body.find((r: { team: string }) => r.team === "CRM");
    expect(crm.nhiem_vu).toBe("Hoàn thiện giao diện CRM");
  });

  it("bulk-deletes selected roadmap items via checkbox delete-selected (xóa cả chi tiết theo tháng)", async () => {
    const app = createApp();
    const mk = (nhiem_vu: string) =>
      request(app)
        .post("/api/roadmap-items")
        .send({ year: 2092, department_id: 1, team: "CRM", nhiem_vu });

    const r1 = await mk("Bulk RM del 1");
    const r2 = await mk("Bulk RM del 2");
    const r3 = await mk("Bulk RM del 3");
    await request(app)
      .post(`/api/roadmap-items/${r1.body.id}/details`)
      .send({ month: 1, noi_dung: "chi tiết r1" });

    const res = await request(app)
      .post("/api/roadmap-items/delete-selected")
      .send({ ids: [r1.body.id, r2.body.id] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);

    const list = await request(app).get("/api/roadmap-items?year=2092&department_id=1");
    const ids = list.body.map((r: { id: number }) => r.id);
    expect(ids).not.toContain(r1.body.id);
    expect(ids).not.toContain(r2.body.id);
    expect(ids).toContain(r3.body.id);

    const detailsAfter = await request(app).get(`/api/roadmap-items/${r1.body.id}/details`);
    expect(detailsAfter.body).toHaveLength(0); // CASCADE
  });

  it("rejects delete-selected roadmap items with an empty ids array", async () => {
    const app = createApp();
    const res = await request(app).post("/api/roadmap-items/delete-selected").send({ ids: [] });
    expect(res.status).toBe(400);
  });
});
