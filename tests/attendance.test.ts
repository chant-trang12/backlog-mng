import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";

async function makePeriod(app: ReturnType<typeof createApp>, year: number, month: number) {
  const res = await request(app).post("/api/periods").send({ year, month });
  return res.body.id as number;
}

async function buildWorkbookBuffer(headers: string[], rows: (string | number)[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Chấm công");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("Team & Nhân sự: Chấm công (import Excel)", () => {
  it("imports an Excel file and lists rows with dynamic columns from the file", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2051, 1);
    const buffer = await buildWorkbookBuffer(
      ["Họ tên", "Ngày công", "Ghi chú"],
      [
        ["Nguyễn Văn A", 22, "Đủ công"],
        ["Trần Thị B", 20, "Nghỉ 2 ngày"],
      ],
    );

    const imported = await request(app)
      .post(`/api/attendance-records/import?period_id=${periodId}`)
      .set("Content-Type", "application/octet-stream")
      .send(buffer);
    expect(imported.status).toBe(201);
    expect(imported.body.headers).toEqual(["Họ tên", "Ngày công", "Ghi chú"]);
    expect(imported.body.rows).toHaveLength(2);
    expect(imported.body.rows[0].row_data).toEqual({
      "Họ tên": "Nguyễn Văn A",
      "Ngày công": "22",
      "Ghi chú": "Đủ công",
    });

    const list = await request(app).get(`/api/attendance-records?period_id=${periodId}`);
    expect(list.status).toBe(200);
    expect(list.body.headers).toEqual(["Họ tên", "Ngày công", "Ghi chú"]);
    expect(list.body.rows).toHaveLength(2);
  });

  it("re-importing replaces all previous rows for that Tháng theo dõi", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2051, 2);

    const first = await buildWorkbookBuffer(["Tên"], [["A"], ["B"], ["C"]]);
    await request(app)
      .post(`/api/attendance-records/import?period_id=${periodId}`)
      .set("Content-Type", "application/octet-stream")
      .send(first);

    const second = await buildWorkbookBuffer(["Tên", "Team"], [["X", "CRM"]]);
    const imported = await request(app)
      .post(`/api/attendance-records/import?period_id=${periodId}`)
      .set("Content-Type", "application/octet-stream")
      .send(second);
    expect(imported.status).toBe(201);
    expect(imported.body.headers).toEqual(["Tên", "Team"]);
    expect(imported.body.rows).toHaveLength(1);

    const list = await request(app).get(`/api/attendance-records?period_id=${periodId}`);
    expect(list.body.rows).toHaveLength(1);
    expect(list.body.rows[0].row_data).toEqual({ Tên: "X", Team: "CRM" });
  });

  it("only lists rows for the requested Tháng theo dõi, not other months", async () => {
    const app = createApp();
    const augId = await makePeriod(app, 2052, 8);
    const sepId = await makePeriod(app, 2052, 9);
    const buffer = await buildWorkbookBuffer(["Tên"], [["A"]]);

    await request(app)
      .post(`/api/attendance-records/import?period_id=${augId}`)
      .set("Content-Type", "application/octet-stream")
      .send(buffer);

    const augList = await request(app).get(`/api/attendance-records?period_id=${augId}`);
    expect(augList.body.rows).toHaveLength(1);

    const sepList = await request(app).get(`/api/attendance-records?period_id=${sepId}`);
    expect(sepList.body.rows).toHaveLength(0);
  });

  it("deletes a single row and bulk-deletes selected rows via checkbox", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2051, 3);
    const buffer = await buildWorkbookBuffer(["Tên"], [["A"], ["B"], ["C"]]);
    const imported = await request(app)
      .post(`/api/attendance-records/import?period_id=${periodId}`)
      .set("Content-Type", "application/octet-stream")
      .send(buffer);
    const [rowA, rowB, rowC] = imported.body.rows;

    const del = await request(app).delete(`/api/attendance-records/${rowA.id}`);
    expect(del.status).toBe(204);

    const bulk = await request(app)
      .post("/api/attendance-records/delete-selected")
      .send({ ids: [rowB.id, rowC.id] });
    expect(bulk.status).toBe(200);
    expect(bulk.body.deleted).toBe(2);

    const list = await request(app).get(`/api/attendance-records?period_id=${periodId}`);
    expect(list.body.rows).toHaveLength(0);
  });

  it("rejects import with an invalid period_id", async () => {
    const app = createApp();
    const buffer = await buildWorkbookBuffer(["Tên"], [["A"]]);
    const res = await request(app)
      .post("/api/attendance-records/import?period_id=999999")
      .set("Content-Type", "application/octet-stream")
      .send(buffer);
    expect(res.status).toBe(400);
  });

  it("cascades deletion when the parent period is deleted", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2051, 4);
    const buffer = await buildWorkbookBuffer(["Tên"], [["A"]]);
    await request(app)
      .post(`/api/attendance-records/import?period_id=${periodId}`)
      .set("Content-Type", "application/octet-stream")
      .send(buffer);

    await request(app).delete(`/api/periods/${periodId}`);

    const list = await request(app).get(`/api/attendance-records?period_id=${periodId}`);
    expect(list.status).toBe(400); // period không còn tồn tại
  });
});
