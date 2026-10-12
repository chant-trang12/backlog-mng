import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";
import { db, initDatabase } from "../src/db/database.js";
import { DIGITAL_FEATURE_SCREEN_IMPORT_HEADERS } from "../src/services/digitalFeatureScreen-import.service.js";

// Mô tả Nhật ký hoạt động cho Tính năng số hoá + 4 đối tượng con phải là
// tiếng Việt đầy đủ (kèm tên tính năng cha), không hiện tên bảng kỹ thuật
// kiểu "Xóa digital-feature-integrations" — xem actionLog.middleware.ts.

async function xlsxBuffer(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// recordActionLog chạy SAU res "finish" (fire-and-forget) — chờ một nhịp
// rồi đọc trực tiếp bảng action_logs, lọc theo tên tính năng (marker).
async function latestLog(marker: string): Promise<{ description: string } | undefined> {
  const rows = await db("action_logs")
    .where("module", "Quản lý tính năng số hoá")
    .where("description", "like", `%${marker}%`)
    .orderBy("id", "desc")
    .limit(1);
  return rows[0];
}

describe("Nhật ký hoạt động — mô tả tiếng Việt đầy đủ (Tính năng số hoá)", () => {
  it("Tạo mới/xóa màn hình: đủ tên đối tượng con + tên tính năng cha, không còn tên bảng kỹ thuật", async () => {
    await initDatabase();
    const app = createApp();
    const marker = `AL màn hình ${Date.now()}`;

    const feature = await request(app).post("/api/digital-features").send({ module: marker });
    expect(feature.status).toBe(201);
    const featureId = feature.body.id as number;

    // Tạo màn hình (Mã nhập tay) qua route lồng — chi tiết = Mã + tên cha.
    const created = await request(app)
      .post(`/api/digital-features/${featureId}/screens`)
      .send({ ma_mh: "MH-LOG1", ten_man_hinh: "Màn hình log" });
    expect(created.status).toBe(201);
    await wait(150);
    expect((await latestLog(marker))?.description).toBe(
      `Tạo mới Màn hình, Tính năng & Phân quyền "MH-LOG1" — Tính năng số hoá "${marker}"`,
    );

    // Xóa 1 dòng qua route phẳng — tra tên bản ghi + tên cha qua DB.
    const screenId = created.body.id as number;
    const deleted = await request(app).delete(`/api/digital-feature-screens/${screenId}`);
    expect(deleted.status).toBe(204);
    await wait(150);
    expect((await latestLog(marker))?.description).toBe(
      `Xóa Màn hình, Tính năng & Phân quyền "MH-LOG1" — Tính năng số hoá "${marker}"`,
    );
  });

  it("Xóa hàng loạt màn hình: hiện số lượng mục + tên tính năng cha", async () => {
    await initDatabase();
    const app = createApp();
    const marker = `AL hàng loạt ${Date.now()}`;
    const featureId = (await request(app).post("/api/digital-features").send({ module: marker })).body.id as number;

    const ids: number[] = [];
    for (const ten of ["MH một", "MH hai"]) {
      const res = await request(app).post(`/api/digital-features/${featureId}/screens`).send({ ten_man_hinh: ten });
      expect(res.status).toBe(201);
      ids.push(res.body.id as number);
    }

    const res = await request(app)
      .post(`/api/digital-features/${featureId}/screens/delete-selected`)
      .send({ ids });
    expect(res.status).toBe(200);
    await wait(150);
    expect((await latestLog(marker))?.description).toBe(
      `Xóa hàng loạt Màn hình, Tính năng & Phân quyền (2 mục) — Tính năng số hoá "${marker}"`,
    );
  });

  it("Nhập Excel màn hình: mô tả kèm tên tính năng cha (body là Buffer nhị phân)", async () => {
    await initDatabase();
    const app = createApp();
    const marker = `AL import ${Date.now()}`;
    const featureId = (await request(app).post("/api/digital-features").send({ module: marker })).body.id as number;

    const buffer = await xlsxBuffer(DIGITAL_FEATURE_SCREEN_IMPORT_HEADERS, [
      ["", "MH-IMP1", "TN-01", "Màn import log", "Danh sách", "", "", "", "Xem", "", "", "", "", "", "", "", ""],
    ]);
    const res = await request(app)
      .post(`/api/digital-features/${featureId}/screens/import`)
      .set("Content-Type", "application/octet-stream")
      .send(buffer);
    expect(res.status).toBe(201);
    await wait(150);
    expect((await latestLog(marker))?.description).toBe(
      `Nhập Excel Màn hình, Tính năng & Phân quyền — Tính năng số hoá "${marker}"`,
    );
  });

  it("3 đối tượng con còn lại (Danh mục/Đối tượng dữ liệu/Tích hợp): đúng tên tiếng Việt từng tab", async () => {
    await initDatabase();
    const app = createApp();
    const marker = `AL danh mục ${Date.now()}`;
    const featureId = (await request(app).post("/api/digital-features").send({ module: marker })).body.id as number;

    const md = await request(app).post(`/api/digital-features/${featureId}/master-data`).send({ ten_danh_muc: "Danh mục log" });
    expect(md.status).toBe(201);
    await wait(150);
    expect((await latestLog(marker))?.description).toBe(
      `Tạo mới Danh mục của Module "${md.body.ten_danh_muc}" — Tính năng số hoá "${marker}"`,
    );

    const mdDeleted = await request(app).delete(`/api/digital-feature-master-data/${md.body.id}`);
    expect(mdDeleted.status).toBe(204);
    await wait(150);
    expect((await latestLog(marker))?.description).toBe(
      `Xóa Danh mục của Module "${md.body.ten_danh_muc}" — Tính năng số hoá "${marker}"`,
    );

    const dataObj = await request(app)
      .post(`/api/digital-features/${featureId}/data-objects`)
      .send({ ten_doi_tuong: "Hồ sơ dự thầu" });
    expect(dataObj.status).toBe(201);
    await wait(150);
    expect((await latestLog(marker))?.description).toBe(
      `Tạo mới Đối tượng dữ liệu & Vòng đời trạng thái "Hồ sơ dự thầu" — Tính năng số hoá "${marker}"`,
    );

    const integration = await request(app)
      .post(`/api/digital-features/${featureId}/integrations`)
      .send({ huong: "Nhận dữ liệu", module_he_thong: "Hệ thống log" });
    expect(integration.status).toBe(201);
    await wait(150);
    expect((await latestLog(marker))?.description).toBe(
      `Tạo mới Tích hợp & Sự kiện "Nhận dữ liệu" — Tính năng số hoá "${marker}"`,
    );
  });
});
