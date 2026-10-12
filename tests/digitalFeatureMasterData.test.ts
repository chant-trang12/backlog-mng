import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";

// Test tab "Danh mục (Master Data) của Module" — bảng digital_feature_master_data
// (CRUD + xóa nhiều + import/export), cùng cấu trúc test tab Màn hình.

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

describe("Danh mục (Master Data) của Module: CRUD", () => {
  it("Thêm mới: tự sinh Mã DM-xxx khi bỏ trống, giữ Mã nhập tay; thiếu Tên -> 400", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module danh mục");

    const auto = await request(app)
      .post(`/api/digital-features/${featureId}/master-data`)
      .send({ ten_danh_muc: "Danh mục gói thầu" });
    expect(auto.status).toBe(201);
    expect(String(auto.body.ma_danh_muc)).toMatch(/^DM-\d{3}$/);
    expect(auto.body.digital_feature_id).toBe(featureId);

    const manual = await request(app)
      .post(`/api/digital-features/${featureId}/master-data`)
      .send({ ma_danh_muc: "DM-KH", ten_danh_muc: "Danh mục khách hàng", quan_tri_boi: "P.BĐKD" });
    expect(manual.status).toBe(201);
    expect(manual.body.ma_danh_muc).toBe("DM-KH");
    expect(manual.body.quan_tri_boi).toBe("P.BĐKD");

    const noName = await request(app)
      .post(`/api/digital-features/${featureId}/master-data`)
      .send({ noi_dung_thuoc_tinh: "Thiếu tên" });
    expect(noName.status).toBe(400);
    expect(noName.body.error).toMatch(/ten_danh_muc/i);
  });

  it("Module cha không tồn tại -> 404; trùng Mã trong cùng module -> 400, khác module hợp lệ", async () => {
    const app = createApp();
    const missing = await request(app)
      .post("/api/digital-features/99999/master-data")
      .send({ ten_danh_muc: "X" });
    expect(missing.status).toBe(404);

    const f1 = await createFeature(app, "Module DM A");
    const f2 = await createFeature(app, "Module DM B");
    await request(app).post(`/api/digital-features/${f1}/master-data`).send({ ma_danh_muc: "DM-DUP", ten_danh_muc: "Gốc" });

    const dup = await request(app)
      .post(`/api/digital-features/${f1}/master-data`)
      .send({ ma_danh_muc: "dm-dup", ten_danh_muc: "Trùng" });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/đã tồn tại/i);

    const other = await request(app)
      .post(`/api/digital-features/${f2}/master-data`)
      .send({ ma_danh_muc: "DM-DUP", ten_danh_muc: "Khác module" });
    expect(other.status).toBe(201);
  });

  it("Sửa + mass assignment; Xoá (mềm) + Xoá nhiều {ids:[]}; list theo module", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module DM sửa xoá");
    const a = await request(app)
      .post(`/api/digital-features/${featureId}/master-data`)
      .send({ ma_danh_muc: "DM-A", ten_danh_muc: "Danh mục A" });
    const b = await request(app)
      .post(`/api/digital-features/${featureId}/master-data`)
      .send({ ten_danh_muc: "Danh mục B" });

    const updated = await request(app)
      .put(`/api/digital-feature-master-data/${a.body.id}`)
      .send({ ten_danh_muc: "Danh mục A sửa", quan_tri_boi: "TCKT", id: 999, is_deleted: true });
    expect(updated.status).toBe(200);
    expect(updated.body.ten_danh_muc).toBe("Danh mục A sửa");
    expect(updated.body.quan_tri_boi).toBe("TCKT");
    expect(Boolean(updated.body.is_deleted)).toBe(false);

    const del = await request(app)
      .post(`/api/digital-features/${featureId}/master-data/delete-selected`)
      .send({ ids: [a.body.id, b.body.id, 99999] });
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(2);

    const list = await request(app).get(`/api/digital-features/${featureId}/master-data`);
    expect(list.body).toHaveLength(0);

    const empty = await request(app)
      .post(`/api/digital-features/${featureId}/master-data/delete-selected`)
      .send({ ids: [] });
    expect(empty.status).toBe(400);
  });
});

describe("Danh mục (Master Data): excel mẫu / import / xuất", () => {
  const MD_HEADERS = ["STT", "Mã danh mục", "Tên danh mục", "Nội dung / thuộc tính", "Quản trị bởi"];

  it("Tải excel mẫu: đúng 5 cột tiêu đề", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module DM template");
    const res = await request(app)
      .get(`/api/digital-features/${featureId}/master-data/import-template`)
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const headers: string[] = [];
    wb.worksheets[0].getRow(1).eachCell((cell) => headers.push(String(cell.value)));
    expect(headers).toEqual(MD_HEADERS);
  });

  it("Import: hợp lệ được nhập, thiếu Tên và trùng Mã bị bỏ qua kèm lý do; Xuất Excel đủ dòng", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module DM import export");
    await request(app)
      .post(`/api/digital-features/${featureId}/master-data`)
      .send({ ma_danh_muc: "DM-OLD", ten_danh_muc: "Đã có" });

    const buffer = await xlsxBuffer(MD_HEADERS, [
      ["", "", "Danh mục mới", "Trường: Mã, Tên, Trạng thái", "P.BĐKD"],
      ["", "", "", "Thiếu tên", ""],
      ["", "DM-OLD", "Trùng mã", "", ""],
    ]);
    const imp = await request(app)
      .post(`/api/digital-features/${featureId}/master-data/import`)
      .set("Content-Type", "application/octet-stream")
      .send(buffer);
    expect(imp.status).toBe(201);
    expect(imp.body.imported).toBe(1);
    expect(imp.body.skipped).toHaveLength(2);
    expect(imp.body.skipped[0].reason).toMatch(/Thiếu Tên danh mục/);
    expect(imp.body.skipped[1].reason).toMatch(/Trùng Mã danh mục/);

    await request(app)
      .post(`/api/digital-features/${featureId}/master-data`)
      .send({ ten_danh_muc: "Danh mục xuất" });

    const exp = await request(app)
      .get(`/api/digital-features/${featureId}/master-data/export`)
      .buffer(true)
      .parse(binaryParser);
    expect(exp.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(exp.body as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    expect(sheet.rowCount).toBe(4); // tiêu đề + 1 cũ + 1 import + 1 thêm tay
    expect(String(sheet.getRow(2).getCell(2).value)).toBe("DM-OLD");
  });
});
