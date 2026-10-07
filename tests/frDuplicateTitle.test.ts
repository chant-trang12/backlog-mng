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

async function makeDept(app: ReturnType<typeof createApp>, name: string) {
  const res = await request(app).post("/api/departments").send({ name, code: name.slice(0, 4) });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

async function createFr(app: ReturnType<typeof createApp>, tieuDe: string, targetId: number, heThong = "HT") {
  return request(app)
    .post("/api/feature-requests")
    .send({ he_thong: heThong, tieu_de: tieuDe, target_department_id: targetId });
}

describe("Yêu cầu tính năng: không thêm trùng Tiêu đề (thêm mới + import)", () => {
  it("Thêm mới trùng Tiêu đề (cùng phòng đích) -> 400 với thông báo, không tạo bản ghi", async () => {
    const app = createApp();
    const deptId = await makeDept(app, "FR Dup phòng A");
    const first = await createFr(app, "Trình ký văn bản điện tử", deptId);
    expect(first.status).toBe(201);

    const dup = await createFr(app, "Trình ký văn bản điện tử", deptId);
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/đã tồn tại|không thêm trùng/);

    const list = await request(app).get(`/api/feature-requests?department_id=${deptId}`);
    const matches = list.body.filter((f: { tieu_de: string }) => f.tieu_de === "Trình ký văn bản điện tử");
    expect(matches).toHaveLength(1);
  });

  it("So khớp không phân biệt hoa/thường và khoảng trắng thừa", async () => {
    const app = createApp();
    const deptId = await makeDept(app, "FR Dup phòng B");
    await createFr(app, "Tiếp nhận CSKH trực tuyến", deptId);

    const dup = await createFr(app, "  tiếp nhận   cskh TRỰC TUYẾN  ", deptId);
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/đã tồn tại/);
  });

  it("Cùng tiêu đề nhưng phòng đích khác nhau -> vẫn thêm được (không cùng bảng hiển thị)", async () => {
    const app = createApp();
    const deptA = await makeDept(app, "FR Dup phòng C");
    const deptB = await makeDept(app, "FR Dup phòng D");
    await createFr(app, "Nâng cấp module văn bản", deptA);

    const other = await createFr(app, "Nâng cấp module văn bản", deptB);
    expect(other.status).toBe(201);
  });

  it("Import: dòng trùng Tiêu đề với dữ liệu đang hiển thị -> bỏ qua kèm lý do, dòng mới vẫn nhập", async () => {
    const app = createApp();
    const deptId = await makeDept(app, "FR Dup phòng E");
    await createFr(app, "Soạn thảo công văn online", deptId);

    const buffer = await xlsxBuffer(
      [
        "STT",
        "Tiêu đề",
        "Hệ thống cần cải tiến (nếu có)",
        "Hoạt động/nghiệp vụ",
        "Đơn vị đề xuất",
        "Phòng ban thực hiện",
        "Ưu tiên",
      ],
      [
        [1, "Soạn thảo công văn online", "HT", "Soạn thảo công văn", `FR Dup phòng E`, `FR Dup phòng E`, "Cao"],
        [2, "Lưu hồ sơ điện tử tập trung", "HT", "Lưu hồ sơ", `FR Dup phòng E`, `FR Dup phòng E`, "Trung bình"],
      ],
    );
    const res = await request(app)
      .post(`/api/feature-requests/import?department_id=${deptId}`)
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer);
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].row).toBe(2);
    expect(res.body.skipped[0].reason).toMatch(/Trùng Tiêu đề/);

    const list = await request(app).get(`/api/feature-requests?department_id=${deptId}`);
    const titles = list.body.map((f: { tieu_de: string }) => f.tieu_de);
    expect(titles.filter((t: string) => t === "Soạn thảo công văn online")).toHaveLength(1);
    expect(titles).toContain("Lưu hồ sơ điện tử tập trung");
  });

  it("Import: hai dòng trùng Tiêu đề nhau trong cùng file -> dòng sau bị bỏ qua", async () => {
    const app = createApp();
    const deptId = await makeDept(app, "FR Dup phòng F");
    const buffer = await xlsxBuffer(
      [
        "STT",
        "Tiêu đề",
        "Hệ thống cần cải tiến (nếu có)",
        "Hoạt động/nghiệp vụ",
        "Đơn vị đề xuất",
        "Phòng ban thực hiện",
        "Ưu tiên",
      ],
      [
        [1, "Trình ký điện tử nội bộ", "HT", "Trình ký", `FR Dup phòng F`, `FR Dup phòng F`, "Cao"],
        [2, "Trình ký điện tử nội bộ", "HT", "Trình ký", `FR Dup phòng F`, `FR Dup phòng F`, "Cao"],
        [3, "  trình ký  điện tử NỘI BỘ  ", "HT", "Trình ký", `FR Dup phòng F`, `FR Dup phòng F`, "Cao"],
      ],
    );
    const res = await request(app)
      .post(`/api/feature-requests/import?department_id=${deptId}`)
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer);
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toHaveLength(2);
    for (const s of res.body.skipped) {
      expect(s.reason).toMatch(/Trùng Tiêu đề/);
    }
  });
});
