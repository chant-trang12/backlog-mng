import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";

// "Nhân sự đầu mối" (nguoi_de_xuat) bắt buộc khi THÊM yêu cầu tính năng: form Thêm yêu cầu (POST) + Import Excel.
async function xlsxBuffer(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("Yêu cầu tính năng: Nhân sự đầu mối bắt buộc", () => {
  it("Thêm mới thiếu / để trống Nhân sự đầu mối -> 400, không tạo bản ghi", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "FR Đầu mối phòng A" });
    const base = { he_thong: "HT", target_department_id: dept.body.id };

    const missing = await request(app).post("/api/feature-requests").send({ ...base, tieu_de: "Thiếu đầu mối" });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/Nhân sự đầu mối/);

    const blank = await request(app).post("/api/feature-requests").send({ ...base, tieu_de: "Đầu mối trống", nguoi_de_xuat: "   " });
    expect(blank.status).toBe(400);

    const ok = await request(app).post("/api/feature-requests").send({ ...base, tieu_de: "Có đầu mối", nguoi_de_xuat: "Nguyễn Văn A" });
    expect(ok.status).toBe(201);
    expect(ok.body.nguoi_de_xuat).toBe("Nguyễn Văn A");

    const list = await request(app).get(`/api/feature-requests?department_id=${dept.body.id}`);
    const titles = list.body.map((f: { tieu_de: string }) => f.tieu_de);
    expect(titles).toContain("Có đầu mối");
    expect(titles).not.toContain("Thiếu đầu mối");
    expect(titles).not.toContain("Đầu mối trống");
  });

  it("Import Excel: dòng thiếu Nhân sự đầu mối bị bỏ qua kèm lý do, dòng có thì nhập", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "FR Đầu mối phòng B" });
    const buffer = await xlsxBuffer(
      ["STT", "Tiêu đề", "Hệ thống cần cải tiến (nếu có)", "Hoạt động/nghiệp vụ", "Đơn vị đề xuất", "Đơn vị thực hiện số hoá", "Ưu tiên", "Nhân sự đầu mối"],
      [
        [1, "Có người đầu mối", "HT", "Việc A", "FR Đầu mối phòng B", "FR Đầu mối phòng B", "Cao", "Trần Thị B"],
        [2, "Không có người đầu mối", "HT", "Việc B", "FR Đầu mối phòng B", "FR Đầu mối phòng B", "Cao", ""],
      ],
    );
    const res = await request(app)
      .post(`/api/feature-requests/import?department_id=${dept.body.id}`)
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer);
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].row).toBe(3);
    expect(res.body.skipped[0].reason).toMatch(/Nhân sự đầu mối/);
  });

  it("Sửa yêu cầu cũ vẫn không ép Nhân sự đầu mối", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "FR Đầu mối phòng C" });
    const fr = await request(app)
      .post("/api/feature-requests")
      .send({ he_thong: "HT", tieu_de: "Sửa không ép đầu mối", target_department_id: dept.body.id, nguoi_de_xuat: "Lê Văn C" });
    expect(fr.status).toBe(201);
    const upd = await request(app).put(`/api/feature-requests/${fr.body.id}`).send({ tieu_de: "Sửa không ép đầu mối (đã sửa)" });
    expect(upd.status).toBe(200);
  });
});
