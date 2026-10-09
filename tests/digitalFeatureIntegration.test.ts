import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";

// Test tab "Tích hợp & Sự kiện" — bảng digital_feature_integrations
// (CRUD + xóa nhiều + import/export), cùng cấu trúc test tab Đối tượng.

async function xlsxBuffer(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function binaryParser(res: request.Response, callback: (err: Error | null, body?: Buffer) => void) {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (c) => (data += c));
  res.on("end", () => callback(null, Buffer.from(data, "binary")));
}

async function createFeature(app: Express, module: string): Promise<number> {
  const res = await request(app).post("/api/digital-features").send({ module });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("Tích hợp & Sự kiện: CRUD", () => {
  it("Thêm mới: thiếu Hướng -> 400; module cha không tồn tại -> 404; mass assignment bị bỏ qua", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module tích hợp");

    const noHuong = await request(app)
      .post(`/api/digital-features/${featureId}/integrations`)
      .send({ module_he_thong: "CRM" });
    expect(noHuong.status).toBe(400);
    expect(noHuong.body.error).toMatch(/huong/i);

    const missing = await request(app)
      .post("/api/digital-features/99999/integrations")
      .send({ huong: "Đẩy ra" });
    expect(missing.status).toBe(404);

    const created = await request(app)
      .post(`/api/digital-features/${featureId}/integrations`)
      .send({ huong: "Nhận vào", module_he_thong: "CRM", id: 999, is_deleted: true });
    expect(created.status).toBe(201);
    expect(created.body.module_he_thong).toBe("CRM");
    expect(Boolean(created.body.is_deleted)).toBe(false);
    expect(created.body.id).not.toBe(999);
  });

  it("Sửa + xóa mềm + xóa nhiều {ids:[]}; list theo module", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module tích hợp sửa xoá");
    const a = await request(app)
      .post(`/api/digital-features/${featureId}/integrations`)
      .send({ huong: "Nhận vào", module_he_thong: "CRM", du_lieu_trao_doi: "Deal thắng" });
    const b = await request(app)
      .post(`/api/digital-features/${featureId}/integrations`)
      .send({ huong: "Đẩy ra", module_he_thong: "ERP" });

    const updated = await request(app)
      .put(`/api/digital-feature-integrations/${a.body.id}`)
      .send({ huong: "2 chiều", co_che_tan_suat: "Webhook realtime" });
    expect(updated.status).toBe(200);
    expect(updated.body.huong).toBe("2 chiều");
    expect(updated.body.co_che_tan_suat).toBe("Webhook realtime");

    const del = await request(app)
      .post(`/api/digital-features/${featureId}/integrations/delete-selected`)
      .send({ ids: [a.body.id, b.body.id, 99999] });
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(2);

    const list = await request(app).get(`/api/digital-features/${featureId}/integrations`);
    expect(list.body).toHaveLength(0);

    const empty = await request(app)
      .post(`/api/digital-features/${featureId}/integrations/delete-selected`)
      .send({ ids: [] });
    expect(empty.status).toBe(400);
  });
});

describe("Tích hợp & Sự kiện: excel mẫu / import / xuất", () => {
  const INT_HEADERS = ["STT", "Hướng", "Module / hệ thống", "Dữ liệu trao đổi", "Cơ chế & tần suất"];

  it("Tải excel mẫu: đúng 5 cột tiêu đề", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module INT template");
    const res = await request(app)
      .get(`/api/digital-features/${featureId}/integrations/import-template`)
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const headers: string[] = [];
    wb.worksheets[0].getRow(1).eachCell((cell) => headers.push(String(cell.value)));
    expect(headers).toEqual(INT_HEADERS);
  });

  it("Import: hợp lệ được nhập, thiếu Hướng bị bỏ qua; Xuất Excel đủ dòng", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module INT import export");

    const buffer = await xlsxBuffer(INT_HEADERS, [
      ["", "Nhận vào", "CRM", "Deal thắng", "Webhook realtime"],
      ["", "", "Thiếu hướng", "", ""],
    ]);
    const imp = await request(app)
      .post(`/api/digital-features/${featureId}/integrations/import`)
      .set("Content-Type", "application/octet-stream")
      .send(buffer);
    expect(imp.status).toBe(201);
    expect(imp.body.imported).toBe(1);
    expect(imp.body.skipped).toHaveLength(1);
    expect(imp.body.skipped[0].reason).toMatch(/Thiếu Hướng/);

    const exp = await request(app)
      .get(`/api/digital-features/${featureId}/integrations/export`)
      .buffer(true)
      .parse(binaryParser);
    expect(exp.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(exp.body as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    expect(sheet.rowCount).toBe(2); // tiêu đề + 1 dòng
    expect(String(sheet.getRow(2).getCell(3).value)).toBe("CRM");
  });
});
