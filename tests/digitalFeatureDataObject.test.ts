import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";

// Test tab "Đối tượng dữ liệu & Vòng đời trạng thái" — bảng
// digital_feature_data_objects (CRUD + xóa nhiều + import/export).

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

describe("Đối tượng dữ liệu & Vòng đời trạng thái: CRUD", () => {
  it("Thêm mới: thiếu Đối tượng -> 400; module cha không tồn tại -> 404; mass assignment bị bỏ qua", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module đối tượng");

    const noName = await request(app)
      .post(`/api/digital-features/${featureId}/data-objects`)
      .send({ khoa_thuoc_tinh: "Thiếu tên" });
    expect(noName.status).toBe(400);
    expect(noName.body.error).toMatch(/ten_doi_tuong/i);

    const missing = await request(app)
      .post("/api/digital-features/99999/data-objects")
      .send({ ten_doi_tuong: "X" });
    expect(missing.status).toBe(404);

    const created = await request(app)
      .post(`/api/digital-features/${featureId}/data-objects`)
      .send({ ten_doi_tuong: "Gói thầu", khoa_thuoc_tinh: "Số TBMT (khóa)", id: 999, is_deleted: true });
    expect(created.status).toBe(201);
    expect(created.body.khoa_thuoc_tinh).toBe("Số TBMT (khóa)");
    expect(Boolean(created.body.is_deleted)).toBe(false);
    expect(created.body.id).not.toBe(999);
  });

  it("Sửa + xóa mềm + xóa nhiều {ids:[]}; list theo module", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module đối tượng sửa xoá");
    const a = await request(app)
      .post(`/api/digital-features/${featureId}/data-objects`)
      .send({ ten_doi_tuong: "Gói thầu", vong_doi_trang_thai: "Nháp → Đang thu thập" });
    const b = await request(app)
      .post(`/api/digital-features/${featureId}/data-objects`)
      .send({ ten_doi_tuong: "HSMT" });

    const updated = await request(app)
      .put(`/api/digital-feature-data-objects/${a.body.id}`)
      .send({ ten_doi_tuong: "Gói thầu sửa", vong_doi_trang_thai: "Nháp → Đóng" });
    expect(updated.status).toBe(200);
    expect(updated.body.ten_doi_tuong).toBe("Gói thầu sửa");
    expect(updated.body.vong_doi_trang_thai).toBe("Nháp → Đóng");

    const del = await request(app)
      .post(`/api/digital-features/${featureId}/data-objects/delete-selected`)
      .send({ ids: [a.body.id, b.body.id, 99999] });
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(2);

    const list = await request(app).get(`/api/digital-features/${featureId}/data-objects`);
    expect(list.body).toHaveLength(0);

    const empty = await request(app)
      .post(`/api/digital-features/${featureId}/data-objects/delete-selected`)
      .send({ ids: [] });
    expect(empty.status).toBe(400);
  });
});

describe("Đối tượng dữ liệu & Vòng đời: excel mẫu / import / xuất", () => {
  const DO_HEADERS = ["STT", "Đối tượng", "Khóa & thuộc tính chính", "Vòng đời trạng thái"];

  it("Tải excel mẫu: đúng 4 cột tiêu đề", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module DO template");
    const res = await request(app)
      .get(`/api/digital-features/${featureId}/data-objects/import-template`)
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const headers: string[] = [];
    wb.worksheets[0].getRow(1).eachCell((cell) => headers.push(String(cell.value)));
    expect(headers).toEqual(DO_HEADERS);
  });

  it("Import: hợp lệ được nhập, thiếu Đối tượng bị bỏ qua; Xuất Excel đủ dòng", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module DO import export");

    const buffer = await xlsxBuffer(DO_HEADERS, [
      ["", "Gói thầu", "Số TBMT (khóa)", "Nháp → Đóng"],
      ["", "", "Thiếu tên", ""],
    ]);
    const imp = await request(app)
      .post(`/api/digital-features/${featureId}/data-objects/import`)
      .set("Content-Type", "application/octet-stream")
      .send(buffer);
    expect(imp.status).toBe(201);
    expect(imp.body.imported).toBe(1);
    expect(imp.body.skipped).toHaveLength(1);
    expect(imp.body.skipped[0].reason).toMatch(/Thiếu Đối tượng/);

    const exp = await request(app)
      .get(`/api/digital-features/${featureId}/data-objects/export`)
      .buffer(true)
      .parse(binaryParser);
    expect(exp.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(exp.body as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    expect(sheet.rowCount).toBe(2); // tiêu đề + 1 dòng
    expect(String(sheet.getRow(2).getCell(2).value)).toBe("Gói thầu");
  });
});
