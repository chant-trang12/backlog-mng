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

function binaryParser(res: NodeJS.ReadableStream & { setEncoding: (enc: string) => void }, callback: (err: Error | null, body: Buffer) => void) {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => callback(null, Buffer.from(data, "binary")));
}

async function makePeriod(app: ReturnType<typeof createApp>, year: number, month: number) {
  const res = await request(app).post("/api/periods").send({ year, month });
  return res.body.id as number;
}

async function makeTeam(app: ReturnType<typeof createApp>, name: string, periodId: number) {
  const res = await request(app).post("/api/teams").send({ name, period_id: periodId });
  return res.body.id as number;
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

  it("file mẫu roadmap có dropdown Team/Hệ thống/Mục tiêu/Phân loại theo danh mục đang quản lý", async () => {
    const app = createApp();
    // Dùng năm rất nhỏ (không phải năm cao nhất trong toàn bộ DB test) để
    // tránh bị chọn làm "tháng gần nhất" khi các test khác tạo period mới
    // và kế thừa team (xem team.service.ts#cloneTeamsFromPeriod).
    const periodId = await makePeriod(app, 2011, 1);
    await makeTeam(app, "Template Team A", periodId);
    await makeTeam(app, "Template Team B", periodId);
    await request(app).post("/api/he-thong").send({ ten_he_thong: "Hệ thống mẫu" });
    await request(app).post("/api/muc-tieu").send({ ten_muc_tieu: "Mục tiêu mẫu" });
    await request(app).post("/api/phan-loai").send({ ten_phan_loai: "Phân loại mẫu" });

    const res = await request(app)
      .get(`/api/roadmap-items/import-template?period_id=${periodId}`)
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Buffer);
    const sheet = wb.worksheets[0];
    // Cột 1 Team, 2 Hệ thống, 3 Mục tiêu, 7 Phân loại — dòng 2 (dòng dữ liệu đầu).
    expect(sheet.getCell("A2").dataValidation?.type).toBe("list");
    expect(sheet.getCell("B2").dataValidation?.type).toBe("list");
    expect(sheet.getCell("C2").dataValidation?.type).toBe("list");
    expect(sheet.getCell("G2").dataValidation?.type).toBe("list");

    const lookup = wb.getWorksheet("Danh mục");
    const allValues = lookup?.getRows(1, 500)?.flatMap((r) => r.values as unknown[]) ?? [];
    expect(allValues).toEqual(
      expect.arrayContaining(["Template Team A", "Template Team B", "Hệ thống mẫu", "Mục tiêu mẫu", "Phân loại mẫu"]),
    );
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

  describe("Tự động đưa nhiệm vụ roadmap vào backlog theo tháng bắt đầu", () => {
    it("đưa ngay vào backlog nếu tháng bắt đầu đã có period sẵn — chỉ Team/Nhiệm vụ/DOD/Phân loại/Deadline", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 2012, 9); // tháng 9/2012 đã quản lý sẵn

      const created = await request(app).post("/api/roadmap-items").send({
        year: 2012,
        department_id: 1,
        team: "CRM",
        he_thong: "Website",
        muc_tieu: "Tính năng mới",
        nhiem_vu: "RM sync A",
        dod: "Chạy trên prod",
        dieu_kien_dam_bao: "Có kiểm thử",
        phan_loai: "NVKH",
        thoi_gian_bat_dau: "2012-09-23",
        thoi_gian_ket_thuc: "2012-11-30",
      });
      expect(created.status).toBe(201);
      expect(created.body.synced_task_id).toBeTruthy();

      const tasks = await request(app).get(`/api/periods/${periodId}/tasks`);
      const t = tasks.body.find((x: { id: number }) => x.id === created.body.synced_task_id);
      expect(t).toBeTruthy();
      expect(t.team).toBe("CRM");
      expect(t.nhiem_vu).toBe("RM sync A");
      expect(t.dod).toBe("Chạy trên prod");
      expect(t.tinh_chat).toBe("NVKH"); // Phân loại roadmap -> Tính chất task
      expect(t.deadline).toBe("2012-11-30"); // Ngày kết thúc roadmap -> Deadline task
    });

    it("chưa có tháng quản lý thì chưa đưa vào — thêm tháng sau đó thì tự động đưa vào đúng 1 lần", async () => {
      const app = createApp();
      // Chỉ có tháng 8/2013 được quản lý trước — chưa khớp tháng bắt đầu (9).
      await makePeriod(app, 2013, 8);

      const created = await request(app).post("/api/roadmap-items").send({
        year: 2013,
        department_id: 1,
        team: "NVKH",
        nhiem_vu: "RM sync B",
        thoi_gian_bat_dau: "2013-09-23",
        thoi_gian_ket_thuc: "2013-11-30",
      });
      expect(created.body.synced_task_id).toBeFalsy();

      // Thêm tháng 9 — nhiệm vụ trên phải tự động được đưa vào tháng 9.
      const sepId = await makePeriod(app, 2013, 9);
      const afterSep = await request(app).get(`/api/roadmap-items?year=2013&department_id=1`);
      const item = afterSep.body.find((r: { nhiem_vu: string }) => r.nhiem_vu === "RM sync B");
      expect(item.synced_task_id).toBeTruthy();
      const sepTasks = await request(app).get(`/api/periods/${sepId}/tasks`);
      expect(sepTasks.body.some((t: { id: number }) => t.id === item.synced_task_id)).toBe(true);

      // Thêm tiếp tháng 10 — KHÔNG được đưa thêm lần nữa (đã vào tháng 9 rồi,
      // việc kéo sang tháng sau nếu chưa xong là nghiệp vụ riêng của Backlog).
      const octId = await makePeriod(app, 2013, 10);
      const octTasks = await request(app).get(`/api/periods/${octId}/tasks`);
      expect(octTasks.body.some((t: { nhiem_vu: string }) => t.nhiem_vu === "RM sync B")).toBe(false);

      const afterOct = await request(app).get(`/api/roadmap-items?year=2013&department_id=1`);
      const itemAfterOct = afterOct.body.find((r: { nhiem_vu: string }) => r.nhiem_vu === "RM sync B");
      expect(itemAfterOct.synced_task_id).toBe(item.synced_task_id); // vẫn task cũ, không tạo thêm
    });

    it("nhập từ Excel cũng tự động đưa vào backlog nếu tháng bắt đầu đã có period", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 2014, 4);

      const buf = await xlsxBuffer(
        ["Team", "Nhiệm vụ", "Phân loại", "Thời gian bắt đầu", "Thời gian kết thúc"],
        [["CRM", "RM import sync", "NVPS", "05/04/2014", "20/06/2014"]],
      );
      const res = await request(app)
        .post("/api/roadmap-items/import?year=2014&department_id=1")
        .set("Content-Type", "application/octet-stream")
        .send(buf);
      expect(res.status).toBe(201);
      expect(res.body.imported).toBe(1);

      const tasks = await request(app).get(`/api/periods/${periodId}/tasks`);
      const t = tasks.body.find((x: { nhiem_vu: string }) => x.nhiem_vu === "RM import sync");
      expect(t).toBeTruthy();
      expect(t.tinh_chat).toBe("NVPS");
      expect(t.deadline).toBe("2014-06-20");
    });
  });
});
