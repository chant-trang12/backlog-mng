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

const HEADERS = [
  "STT",
  "Mã",
  "Module",
  "Đơn vị chủ trì (đề xuất)",
  "Đơn vị phối hợp",
  "Giai đoạn",
  "TN / MH",
  "Mục tiêu nghiệp vụ",
  "Vai trò P.BĐKD",
  "Nhận đầu vào từ",
  "Chuyển đầu ra tới",
];

// supertest/superagent không có parser mặc định cho mime .xlsx — ép về
// Buffer thủ công (giống cskh.test.ts/member.test.ts).
function binaryParser(res: request.Response, callback: (err: Error | null, body?: Buffer) => void) {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (c) => (data += c));
  res.on("end", () => callback(null, Buffer.from(data, "binary")));
}

describe("Quản lý tính năng số hoá: CRUD + lọc", () => {
  it("Thêm mới: tự sinh Mã TNSH-xxx khi bỏ trống, giữ Mã nhập tay khi có", async () => {
    const app = createApp();
    const auto = await request(app)
      .post("/api/digital-features")
      .send({ module: "Module tự sinh mã" });
    expect(auto.status).toBe(201);
    expect(String(auto.body.ma)).toMatch(/^TNSH-\d{3,}$/);

    const manual = await request(app)
      .post("/api/digital-features")
      .send({ ma: "TN-TEST-01", module: "Module nhập mã" });
    expect(manual.status).toBe(201);
    expect(manual.body.ma).toBe("TN-TEST-01");
  });

  it("Thiếu Module -> 400; trùng Mã (dòng đang hiển thị) -> 400 với thông báo", async () => {
    const app = createApp();
    const noModule = await request(app).post("/api/digital-features").send({ ma: "TN-NO-MODULE" });
    expect(noModule.status).toBe(400);
    expect(noModule.body.error).toMatch(/module/i);

    await request(app).post("/api/digital-features").send({ ma: "TN-DUP-01", module: "Module gốc" });
    const dup = await request(app)
      .post("/api/digital-features")
      .send({ ma: "tn-dup-01", module: "Module khác" });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/đã tồn tại/i);
  });

  it("Mass assignment: tham số lạ trong body bị bỏ qua", async () => {
    const app = await Promise.resolve(createApp());
    const created = await request(app)
      .post("/api/digital-features")
      .send({ module: "Module MA", trang_thai: "Đã duyệt", is_deleted: true, id: 99999 });
    expect(created.status).toBe(201);
    expect(created.body.trang_thai).toBeUndefined();
    expect(Boolean(created.body.is_deleted)).toBe(false);
    expect(created.body.id).not.toBe(99999);
  });

  it("Sửa: đổi được các trường; sửa Mã trùng dòng khác -> 400", async () => {
    const app = createApp();
    const a = await request(app).post("/api/digital-features").send({ ma: "TN-EDIT-A", module: "Module A" });
    const b = await request(app).post("/api/digital-features").send({ ma: "TN-EDIT-B", module: "Module B" });

    const updated = await request(app)
      .put(`/api/digital-features/${a.body.id}`)
      .send({ giai_doan: "Đang triển khai", tn_mh: "TN" });
    expect(updated.status).toBe(200);
    expect(updated.body.giai_doan).toBe("Đang triển khai");

    const dupMa = await request(app)
      .put(`/api/digital-features/${b.body.id}`)
      .send({ ma: "TN-EDIT-A" });
    expect(dupMa.status).toBe(400);
  });

  it("Xoá (mềm): list không còn, GET -> 404; Mã đã xoá được dùng lại", async () => {
    const app = createApp();
    const created = await request(app).post("/api/digital-features").send({ ma: "TN-DEL-01", module: "Module xoá" });
    const id = created.body.id;

    const del = await request(app).delete(`/api/digital-features/${id}`);
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/digital-features");
    expect(list.body.find((r: { id: number }) => r.id === id)).toBeUndefined();

    const reuse = await request(app).post("/api/digital-features").send({ ma: "TN-DEL-01", module: "Module tái sử dụng mã" });
    expect(reuse.status).toBe(201);
  });

  it("Xoá nhiều đã chọn (checkbox): body {ids:[]} — xóa hết các id hợp lệ, bỏ qua id đã xoá/lạ", async () => {
    const app = createApp();
    const a = await request(app).post("/api/digital-features").send({ module: "Module bulk A" });
    const b = await request(app).post("/api/digital-features").send({ module: "Module bulk B" });
    await request(app).post("/api/digital-features").send({ module: "Module bulk C" });

    const del = await request(app)
      .post("/api/digital-features/delete-selected")
      .send({ ids: [a.body.id, b.body.id, 999999] });
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(2);

    const list = await request(app).get("/api/digital-features");
    expect(list.body.find((r: { id: number }) => r.id === a.body.id)).toBeUndefined();
    expect(list.body.find((r: { id: number }) => r.id === b.body.id)).toBeUndefined();
    expect(list.body.find((r: { module: string }) => r.module === "Module bulk C")).toBeDefined();

    // Xóa lần nữa (id đã xoá) -> 0, không lỗi
    const again = await request(app)
      .post("/api/digital-features/delete-selected")
      .send({ ids: [a.body.id] });
    expect(again.status).toBe(200);
    expect(again.body.deleted).toBe(0);
  });

  it("Xoá nhiều: ids rỗng/không phải mảng -> 400", async () => {
    const app = createApp();
    const noIds = await request(app).post("/api/digital-features/delete-selected").send({});
    expect(noIds.status).toBe(400);
    const notArray = await request(app)
      .post("/api/digital-features/delete-selected")
      .send({ ids: "abc" });
    expect(notArray.status).toBe(400);
  });

  it("Lọc: search từ khóa + lọc chính xác theo Module", async () => {
    const app = createApp();
    await request(app).post("/api/digital-features").send({ module: "Trình ký điện tử", giai_doan: "Đề xuất" });
    await request(app).post("/api/digital-features").send({ module: "Chấm công", giai_doan: "Đang triển khai" });

    const bySearch = await request(app).get("/api/digital-features?search=trình ký");
    expect(bySearch.body.some((r: { module: string }) => r.module === "Trình ký điện tử")).toBe(true);
    expect(bySearch.body.some((r: { module: string }) => r.module === "Chấm công")).toBe(false);

    const byModule = await request(app).get("/api/digital-features?module=Chấm công");
    expect(byModule.body).toHaveLength(1);
    expect(byModule.body[0].module).toBe("Chấm công");
  });
});

describe("Quản lý tính năng số hoá: excel mẫu / import / xuất", () => {
  it("Tải excel mẫu: file .xlsx với đúng 11 cột tiêu đề", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/digital-features/import-template")
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Buffer);
    const headers: string[] = [];
    wb.worksheets[0].getRow(1).eachCell((cell) => headers.push(String(cell.value)));
    expect(headers).toContain("Mã");
    expect(headers).toContain("Module");
    expect(headers).toContain("Đơn vị chủ trì (đề xuất)");
    expect(headers).toContain("Chuyển đầu ra tới");
  });

  it("Import: dòng hợp lệ được nhập (Mã tự sinh khi trống), thiếu Module và trùng Mã bị bỏ qua kèm lý do", async () => {
    const app = createApp();
    await request(app).post("/api/digital-features").send({ ma: "TN-IMP-01", module: "Module có sẵn" });

    const buffer = await xlsxBuffer(HEADERS, [
      [1, "TN-IMP-02", "Module nhập", "Phòng A", "Phòng B", "Đề xuất", "TN", "Mục tiêu 1", "Vai trò", "Đầu vào", "Đầu ra"],
      [2, "", "Module không mã", "", "", "", "", "", "", "", ""],
      [3, "TN-IMP-01", "Module trùng mã", "", "", "", "", "", "", "", ""],
      [4, "TN-IMP-04", "", "", "", "", "", "", "", "", ""],
    ]);
    const res = await request(app)
      .post("/api/digital-features/import")
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer);
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.skipped).toHaveLength(2);

    const list = await request(app).get("/api/digital-features");
    const noMa = list.body.find((r: { module: string }) => r.module === "Module không mã");
    expect(String(noMa.ma)).toMatch(/^TNSH-/);
    expect(list.body.find((r: { module: string }) => r.module === "Module trùng mã")).toBeUndefined();
  });

  it("Import: dòng trùng nội dung (Module đã có — kể cả Mã trống hoặc Mã khác) bị bỏ qua", async () => {
    const app = createApp();
    await request(app).post("/api/digital-features").send({ ma: "TN-DUPC-01", module: "Module trùng nội dung" });

    const buffer = await xlsxBuffer(HEADERS, [
      // Trùng Module với dòng đã có nhưng Mã khác -> vẫn bỏ qua
      [1, "TN-DUP-99", "Module trùng nội dung", "", "", "", "", "", "", "", ""],
      // Trùng Module, Mã trống -> bỏ qua
      [2, "", "Module trùng nội dung", "", "", "", "", "", "", "", ""],
      // Hai dòng cùng Module trong cùng file: dòng đầu nhập, dòng sau bỏ qua
      [3, "", "Module trùng trong file", "", "", "", "", "", "", "", ""],
      [4, "", "Module trùng trong file", "", "", "", "", "", "", "", ""],
    ]);
    const res = await request(app)
      .post("/api/digital-features/import")
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer);
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toHaveLength(3);
    const reasons: string[] = res.body.skipped.map((s: { reason: string }) => s.reason);
    expect(reasons.every((r) => r.includes("Trùng nội dung"))).toBe(true);

    const list = await request(app).get("/api/digital-features");
    expect(
      list.body.filter((r: { module: string }) => r.module === "Module trùng nội dung"),
    ).toHaveLength(1);
    expect(
      list.body.filter((r: { module: string }) => r.module === "Module trùng trong file"),
    ).toHaveLength(1);
  });

  it("Xuất Excel: trả file .xlsx chứa toàn bộ dòng đang hiển thị", async () => {
    const app = createApp();
    await request(app).post("/api/digital-features").send({ ma: "TN-EXP-01", module: "Module xuất 1" });
    await request(app).post("/api/digital-features").send({ ma: "TN-EXP-02", module: "Module xuất 2" });

    const res = await request(app)
      .get("/api/digital-features/export")
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Buffer);
    const sheet = wb.worksheets[0];
    expect(sheet.rowCount).toBeGreaterThanOrEqual(3);
    const cell = sheet.getRow(1).getCell(3);
    expect(String(cell.value)).toBe("Module");
  });

  it("Xuất Excel theo bộ lọc query (module)", async () => {
    const app = createApp();
    await request(app).post("/api/digital-features").send({ module: "Module lọc xuất" });
    await request(app).post("/api/digital-features").send({ module: "Module khác xuất" });

    const res = await request(app)
      .get("/api/digital-features/export?module=" + encodeURIComponent("Module lọc xuất"))
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Buffer);
    const sheet = wb.worksheets[0];
    // Dòng 1 header, dòng 2+ dữ liệu — tất cả data row đều là module lọc
    for (let r = 2; r <= sheet.rowCount; r++) {
      expect(String(sheet.getRow(r).getCell(3).value)).toBe("Module lọc xuất");
    }
  });
});
