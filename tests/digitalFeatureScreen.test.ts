import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";

// Test tab "Màn hình, Tính năng & Phân quyền" trong chi tiết Tính năng số
// hoá — bảng digital_feature_screens (CRUD + xóa nhiều + import/export).

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

describe("Màn hình, Tính năng & Phân quyền: CRUD", () => {
  it("Thêm mới: tự sinh Mã MH-xxx khi bỏ trống, giữ Mã nhập tay khi có; thiếu Tên -> 400", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module màn hình");

    const auto = await request(app)
      .post(`/api/digital-features/${featureId}/screens`)
      .send({ ten_man_hinh: "Danh sách hồ sơ" });
    expect(auto.status).toBe(201);
    expect(String(auto.body.ma_mh)).toMatch(/^MH-\d{3}$/);
    expect(auto.body.digital_feature_id).toBe(featureId);

    const manual = await request(app)
      .post(`/api/digital-features/${featureId}/screens`)
      .send({ ma_mh: "MH-CUSTOM", ten_man_hinh: "Lập hồ sơ mời thầu", sales_am: "Xem" });
    expect(manual.status).toBe(201);
    expect(manual.body.ma_mh).toBe("MH-CUSTOM");
    expect(manual.body.sales_am).toBe("Xem");

    const noName = await request(app).post(`/api/digital-features/${featureId}/screens`).send({ loai: "Form" });
    expect(noName.status).toBe(400);
    expect(noName.body.error).toMatch(/ten_man_hinh/i);
  });

  it("Module cha không tồn tại -> 404; list theo module chỉ trả màn hình của module đó", async () => {
    const app = createApp();
    const missing = await request(app).post("/api/digital-features/99999/screens").send({ ten_man_hinh: "X" });
    expect(missing.status).toBe(404);

    const f1 = await createFeature(app, "Module A");
    const f2 = await createFeature(app, "Module B");
    await request(app).post(`/api/digital-features/${f1}/screens`).send({ ten_man_hinh: "MH của A" });
    await request(app).post(`/api/digital-features/${f2}/screens`).send({ ten_man_hinh: "MH của B" });

    const list = await request(app).get(`/api/digital-features/${f1}/screens`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].ten_man_hinh).toBe("MH của A");
  });

  it("Trùng Mã MH trong cùng module -> 400; khác module thì không chặn", async () => {
    const app = createApp();
    const f1 = await createFeature(app, "Module trùng mã A");
    const f2 = await createFeature(app, "Module trùng mã B");
    await request(app).post(`/api/digital-features/${f1}/screens`).send({ ma_mh: "MH-DUP", ten_man_hinh: "Gốc" });

    const dup = await request(app)
      .post(`/api/digital-features/${f1}/screens`)
      .send({ ma_mh: "mh-dup", ten_man_hinh: "Trùng" });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/đã tồn tại/i);

    const other = await request(app)
      .post(`/api/digital-features/${f2}/screens`)
      .send({ ma_mh: "MH-DUP", ten_man_hinh: "Module khác — hợp lệ" });
    expect(other.status).toBe(201);
  });

  it("Sửa: đổi được trường + Mã MH; Mã trùng dòng khác -> 400; mass assignment bị bỏ qua", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module sửa màn hình");
    const a = await request(app).post(`/api/digital-features/${featureId}/screens`).send({ ma_mh: "MH-A", ten_man_hinh: "Màn A" });
    const b = await request(app).post(`/api/digital-features/${featureId}/screens`).send({ ma_mh: "MH-B", ten_man_hinh: "Màn B" });

    const updated = await request(app)
      .put(`/api/digital-feature-screens/${a.body.id}`)
      .send({ ten_man_hinh: "Màn A sửa", loai: "Dashboard", id: 999, is_deleted: true });
    expect(updated.status).toBe(200);
    expect(updated.body.ten_man_hinh).toBe("Màn A sửa");
    expect(updated.body.loai).toBe("Dashboard");
    expect(Boolean(updated.body.is_deleted)).toBe(false);

    const dupMa = await request(app)
      .put(`/api/digital-feature-screens/${b.body.id}`)
      .send({ ma_mh: "MH-A" });
    expect(dupMa.status).toBe(400);
    expect(dupMa.body.error).toMatch(/đã tồn tại/i);

    const missing = await request(app).put("/api/digital-feature-screens/99999").send({ ten_man_hinh: "X" });
    expect(missing.status).toBe(404);
  });

  it("Xoá (mềm): list không còn, GET -> 404", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module xoá màn hình");
    const created = await request(app).post(`/api/digital-features/${featureId}/screens`).send({ ten_man_hinh: "Sẽ xoá" });

    const del = await request(app).delete(`/api/digital-feature-screens/${created.body.id}`);
    expect(del.status).toBe(204);

    const list = await request(app).get(`/api/digital-features/${featureId}/screens`);
    expect(list.body).toHaveLength(0);

    const get = await request(app).get(`/api/digital-feature-screens/${created.body.id}`);
    expect(get.status).toBe(404);
  });

  it("Xoá nhiều: {ids:[]} xóa hết id hợp lệ, bỏ id lạ; ids rỗng -> 400", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module xoá nhiều màn hình");
    const s1 = await request(app).post(`/api/digital-features/${featureId}/screens`).send({ ten_man_hinh: "S1" });
    const s2 = await request(app).post(`/api/digital-features/${featureId}/screens`).send({ ten_man_hinh: "S2" });

    const del = await request(app)
      .post(`/api/digital-features/${featureId}/screens/delete-selected`)
      .send({ ids: [s1.body.id, s2.body.id, 99999] });
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(2);

    const list = await request(app).get(`/api/digital-features/${featureId}/screens`);
    expect(list.body).toHaveLength(0);

    const empty = await request(app)
      .post(`/api/digital-features/${featureId}/screens/delete-selected`)
      .send({ ids: [] });
    expect(empty.status).toBe(400);
  });
});

describe("Màn hình, Tính năng & Phân quyền: excel mẫu / import / xuất", () => {
  const SCREEN_HEADERS = [
    "STT",
    "Mã MH",
    "TN",
    "Tên màn hình / chức năng",
    "Loại",
    "Thành phần chính / trường dữ liệu",
    "Hành động (nút / thao tác)",
    "Quy tắc nghiệp vụ & kiểm tra",
    "Sales / AM",
    "Trưởng đơn vị KD",
    "Presales / Sản phẩm",
    "NV BĐKD (thực thi)",
    "Kiểm soát / Lãnh đạo BĐKD",
    "Pháp chế",
    "TCKT",
    "Ban lãnh đạo",
    "Quản trị hệ thống",
  ];

  it("Tải excel mẫu: file .xlsx với đúng 17 cột tiêu đề", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module template màn hình");
    const res = await request(app)
      .get(`/api/digital-features/${featureId}/screens/import-template`)
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value)));
    expect(headers).toEqual(SCREEN_HEADERS);
  });

  it("Import: dòng hợp lệ được nhập (Mã tự sinh khi trống), thiếu Tên và trùng Mã MH bị bỏ qua kèm lý do", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module import màn hình");
    await request(app)
      .post(`/api/digital-features/${featureId}/screens`)
      .send({ ma_mh: "MH-OLD", ten_man_hinh: "Đã có" });

    const buffer = await xlsxBuffer(SCREEN_HEADERS, [
      ["", "", "TN-01", "Màn nhập mới", "Danh sách", "", "", "", "Xem", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "Thiếu tên", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "MH-OLD", "", "Trùng mã", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "MH-NEW", "", "Màn nhập mã", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ]);
    const res = await request(app)
      .post(`/api/digital-features/${featureId}/screens/import`)
      .set("Content-Type", "application/octet-stream")
      .send(buffer);
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.skipped).toHaveLength(2);
    expect(res.body.skipped[0].reason).toMatch(/Thiếu Tên màn hình/);
    expect(res.body.skipped[1].reason).toMatch(/Trùng Mã MH/);

    const list = await request(app).get(`/api/digital-features/${featureId}/screens`);
    expect(list.body).toHaveLength(3); // 1 cũ + 2 nhập mới
  });

  it("Xuất Excel: trả file .xlsx chứa toàn bộ màn hình của module", async () => {
    const app = createApp();
    const featureId = await createFeature(app, "Module export màn hình");
    await request(app)
      .post(`/api/digital-features/${featureId}/screens`)
      .send({ ma_mh: "MH-E1", ten_man_hinh: "Màn xuất 1", truong_dvkd: "Phê duyệt" });
    await request(app).post(`/api/digital-features/${featureId}/screens`).send({ ten_man_hinh: "Màn xuất 2" });

    const res = await request(app)
      .get(`/api/digital-features/${featureId}/screens/export`)
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    expect(sheet.rowCount).toBe(3); // tiêu đề + 2 dòng
    expect(String(sheet.getRow(2).getCell(2).value)).toBe("MH-E1");
    expect(String(sheet.getRow(2).getCell(10).value)).toBe("Phê duyệt");
  });
});
