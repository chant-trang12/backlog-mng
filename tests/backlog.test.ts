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

describe("Backlog CRUD", () => {
  it("creates a period, adds tasks per team, updates progress, and exports Excel", async () => {
    const app = createApp();

    const period = await request(app)
      .post("/api/periods")
      .send({ year: 2031, month: 8 });
    expect(period.status).toBe(201);
    expect(period.body.label).toBe("Tháng 8/2031");
    const periodId = period.body.id;

    const task = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Xây dựng quy trình CI/CD", tinh_chat: "NV tồn" });
    expect(task.status).toBe(201);
    expect(task.body.stt).toBe(1);
    expect(task.body.trang_thai).toBe("Chưa thực hiện");

    const updated = await request(app)
      .put(`/api/tasks/${task.body.id}`)
      .send({ phan_tram_hoan_thanh: 70, trang_thai: "Đang thực hiện" });
    expect(updated.status).toBe(200);
    expect(updated.body.phan_tram_hoan_thanh).toBe(70);
    expect(updated.body.trang_thai).toBe("Đang thực hiện");

    const list = await request(app).get(`/api/periods/${periodId}/tasks?team=CRM`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const exportRes = await request(app).get(`/api/periods/${periodId}/tasks/export`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers["content-type"]).toContain("spreadsheetml");

    const del = await request(app).delete(`/api/tasks/${task.body.id}`);
    expect(del.status).toBe(204);
  });

  it("clones selected tasks into the next month (keeping the originals) and tags Nhiệm vụ tồn", async () => {
    const app = createApp();

    const period = await request(app).post("/api/periods").send({ year: 2033, month: 6 });
    const periodId = period.body.id;

    const t1 = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Task A", tinh_chat: "NVKH" });
    const t2 = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Task B" });

    const move = await request(app)
      .post(`/api/periods/${periodId}/tasks/move-to-next-month`)
      .send({ ids: [t1.body.id, t2.body.id] });
    expect(move.status).toBe(200);
    expect(move.body.targetPeriod.year).toBe(2033);
    expect(move.body.targetPeriod.month).toBe(7);
    expect(move.body.moved).toHaveLength(2);
    expect(move.body.moved[0].tinh_chat).toContain("Nhiệm vụ tồn");
    expect(move.body.moved[1].tinh_chat).toBe("Nhiệm vụ tồn");
    // Nhiệm vụ tồn mặc định được đánh dấu Không tính điểm ở cột Tính chất.
    expect(move.body.moved[0].khong_tinh_diem).toBe("Không tính điểm");
    expect(move.body.moved[1].khong_tinh_diem).toBe("Không tính điểm");
    // Bản sao là task mới, không trùng id với bản gốc.
    expect(move.body.moved[0].id).not.toBe(t1.body.id);
    expect(move.body.moved[1].id).not.toBe(t2.body.id);

    // Bản ghi gốc ở tháng cũ vẫn còn nguyên, không bị đổi tính chất.
    const oldList = await request(app).get(`/api/periods/${periodId}/tasks`);
    expect(oldList.body).toHaveLength(2);
    expect(oldList.body.find((t: { id: number }) => t.id === t1.body.id).tinh_chat).toBe("NVKH");
    expect(oldList.body.find((t: { id: number }) => t.id === t2.body.id).tinh_chat).toBeNull();

    const newList = await request(app).get(`/api/periods/${move.body.targetPeriod.id}/tasks`);
    expect(newList.body).toHaveLength(2);
  });

  it("only tags Nhiệm vụ tồn when Deadline's month is earlier than the target month", async () => {
    const app = createApp();

    // Tháng 8 → chuyển sang tháng 9.
    const period = await request(app).post("/api/periods").send({ year: 2040, month: 8 });
    const periodId = period.body.id;

    // Deadline 31/11/2040 (tháng > tháng đích 9) → KHÔNG phải nhiệm vụ tồn.
    const notTon = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Deadline sau tháng đích", deadline: "2040-11-30" });
    // Deadline 20/8/2040 (tháng < tháng đích 9) → LÀ nhiệm vụ tồn.
    const isTon = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Deadline trước tháng đích", deadline: "2040-08-20" });
    // Không có deadline → mặc định vẫn là nhiệm vụ tồn (an toàn, giữ hành vi cũ).
    const noDeadline = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Không có deadline" });

    const move = await request(app)
      .post(`/api/periods/${periodId}/tasks/move-to-next-month`)
      .send({ ids: [notTon.body.id, isTon.body.id, noDeadline.body.id] });
    expect(move.status).toBe(200);

    const movedNotTon = move.body.moved.find((t: { nhiem_vu: string }) => t.nhiem_vu === "Deadline sau tháng đích");
    expect(movedNotTon.tinh_chat).toBeNull();
    expect(movedNotTon.khong_tinh_diem).toBeNull();

    const movedIsTon = move.body.moved.find((t: { nhiem_vu: string }) => t.nhiem_vu === "Deadline trước tháng đích");
    expect(movedIsTon.tinh_chat).toBe("Nhiệm vụ tồn");
    expect(movedIsTon.khong_tinh_diem).toBe("Không tính điểm");

    const movedNoDeadline = move.body.moved.find((t: { nhiem_vu: string }) => t.nhiem_vu === "Không có deadline");
    expect(movedNoDeadline.tinh_chat).toBe("Nhiệm vụ tồn");
    expect(movedNoDeadline.khong_tinh_diem).toBe("Không tính điểm");
  });

  it("blocks moving a task to next month a second time", async () => {
    const app = createApp();
    const period = await request(app).post("/api/periods").send({ year: 2041, month: 5 });
    const periodId = period.body.id;

    const task = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Task chuyển 1 lần" });

    const firstMove = await request(app)
      .post(`/api/periods/${periodId}/tasks/move-to-next-month`)
      .send({ ids: [task.body.id] });
    expect(firstMove.status).toBe(200);
    expect(firstMove.body.moved).toHaveLength(1);
    expect(firstMove.body.skippedAlreadyMoved).toHaveLength(0);

    // Task gốc đã được đánh dấu da_chuyen_thang, nhưng vẫn còn nguyên ở tháng cũ.
    const oldList = await request(app).get(`/api/periods/${periodId}/tasks`);
    expect(oldList.body.find((t: { id: number }) => t.id === task.body.id).da_chuyen_thang).toBe(1);

    // Thử chuyển lần 2 -> bị chặn, không tạo thêm bản sao mới.
    const secondMove = await request(app)
      .post(`/api/periods/${periodId}/tasks/move-to-next-month`)
      .send({ ids: [task.body.id] });
    expect(secondMove.status).toBe(200);
    expect(secondMove.body.moved).toHaveLength(0);
    expect(secondMove.body.skippedAlreadyMoved).toHaveLength(1);
    expect(secondMove.body.skippedAlreadyMoved[0].id).toBe(task.body.id);

    const newList = await request(app).get(`/api/periods/${firstMove.body.targetPeriod.id}/tasks`);
    expect(newList.body).toHaveLength(1);
  });

  it("marks selected tasks as Không tính điểm without touching Phân loại (tinh_chat)", async () => {
    const app = createApp();
    const period = await request(app).post("/api/periods").send({ year: 2037, month: 3 });
    const periodId = period.body.id;

    const t1 = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Score task A", tinh_chat: "NVKH" });
    const t2 = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Score task B" });

    const mark = await request(app)
      .post("/api/tasks/mark-no-score")
      .send({ ids: [t1.body.id, t2.body.id] });
    expect(mark.status).toBe(200);
    expect(mark.body.updated).toHaveLength(2);
    expect(mark.body.updated[0].khong_tinh_diem).toBe("Không tính điểm");

    const list = await request(app).get(`/api/periods/${periodId}/tasks`);
    const a = list.body.find((t: { id: number }) => t.id === t1.body.id);
    expect(a.khong_tinh_diem).toBe("Không tính điểm");
    expect(a.tinh_chat).toBe("NVKH"); // Phân loại không bị đụng tới

    const b = list.body.find((t: { id: number }) => t.id === t2.body.id);
    expect(b.khong_tinh_diem).toBe("Không tính điểm");
  });

  it("defaults Tính chất to Không tính điểm when Trạng thái = Hủy, on both create and update", async () => {
    const app = createApp();
    const period = await request(app).post("/api/periods").send({ year: 2038, month: 4 });
    const periodId = period.body.id;

    // Tạo task với trạng thái Hủy ngay từ đầu.
    const created = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Task cancelled from start", trang_thai: "Hủy" });
    expect(created.body.khong_tinh_diem).toBe("Không tính điểm");

    // Task khác tạo bình thường thì không bị gắn Không tính điểm.
    const normal = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Task normal" });
    expect(normal.body.khong_tinh_diem).toBeNull();

    // Cập nhật trạng thái sang Hủy cũng tự động gắn Không tính điểm.
    const updated = await request(app)
      .put(`/api/tasks/${normal.body.id}`)
      .send({ trang_thai: "Hủy" });
    expect(updated.body.khong_tinh_diem).toBe("Không tính điểm");
  });

  it("rejects mark-no-score with an empty ids array", async () => {
    const app = createApp();
    const res = await request(app).post("/api/tasks/mark-no-score").send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it("unmarks Không tính điểm for selected tasks without touching Tính chất", async () => {
    const app = createApp();
    const period = await request(app).post("/api/periods").send({ year: 2044, month: 7 });
    const periodId = period.body.id;

    const t1 = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Unmark A", tinh_chat: "NVKH" });
    const t2 = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Unmark B" });

    await request(app)
      .post("/api/tasks/mark-no-score")
      .send({ ids: [t1.body.id, t2.body.id] });

    const unmark = await request(app)
      .post("/api/tasks/unmark-no-score")
      .send({ ids: [t1.body.id, t2.body.id] });
    expect(unmark.status).toBe(200);
    expect(unmark.body.updated).toHaveLength(2);
    expect(unmark.body.updated[0].khong_tinh_diem).toBeNull();

    const list = await request(app).get(`/api/periods/${periodId}/tasks`);
    const a = list.body.find((t: { id: number }) => t.id === t1.body.id);
    expect(a.khong_tinh_diem).toBeNull();
    expect(a.tinh_chat).toBe("NVKH"); // Tính chất giữ nguyên
  });

  it("rejects unmark-no-score with an empty ids array", async () => {
    const app = createApp();
    const res = await request(app).post("/api/tasks/unmark-no-score").send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it("marks selected tasks as Nhiệm vụ tồn: adds to Tính chất and sets Không tính điểm", async () => {
    const app = createApp();
    const period = await request(app).post("/api/periods").send({ year: 2043, month: 6 });
    const periodId = period.body.id;

    // t1 đã có sẵn 1 giá trị Tính chất -> "Nhiệm vụ tồn" được thêm vào, không ghi đè.
    const t1 = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Tồn task A", tinh_chat: "NVKH" });
    const t2 = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Tồn task B" });

    const mark = await request(app)
      .post("/api/tasks/mark-ton")
      .send({ ids: [t1.body.id, t2.body.id] });
    expect(mark.status).toBe(200);
    expect(mark.body.updated).toHaveLength(2);

    const list = await request(app).get(`/api/periods/${periodId}/tasks`);
    const a = list.body.find((t: { id: number }) => t.id === t1.body.id);
    expect(a.tinh_chat).toBe("NVKH, Nhiệm vụ tồn");
    expect(a.khong_tinh_diem).toBe("Không tính điểm");

    const b = list.body.find((t: { id: number }) => t.id === t2.body.id);
    expect(b.tinh_chat).toBe("Nhiệm vụ tồn");
    expect(b.khong_tinh_diem).toBe("Không tính điểm");

    // Đánh dấu lần 2 không nhân đôi "Nhiệm vụ tồn".
    await request(app).post("/api/tasks/mark-ton").send({ ids: [t1.body.id] });
    const list2 = await request(app).get(`/api/periods/${periodId}/tasks`);
    expect(list2.body.find((t: { id: number }) => t.id === t1.body.id).tinh_chat).toBe(
      "NVKH, Nhiệm vụ tồn",
    );
  });

  it("rejects mark-ton with an empty ids array", async () => {
    const app = createApp();
    const res = await request(app).post("/api/tasks/mark-ton").send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it("rolls over December to January of the next year", async () => {
    const app = createApp();
    const period = await request(app).post("/api/periods").send({ year: 2035, month: 12 });
    const task = await request(app)
      .post(`/api/periods/${period.body.id}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Year rollover" });

    const move = await request(app)
      .post(`/api/periods/${period.body.id}/tasks/move-to-next-month`)
      .send({ ids: [task.body.id] });
    expect(move.body.targetPeriod.year).toBe(2036);
    expect(move.body.targetPeriod.month).toBe(1);
  });

  it("serves a task import template and imports tasks from an Excel file", async () => {
    const app = createApp();
    const period = await request(app).post("/api/periods").send({ year: 2045, month: 4 });
    const periodId = period.body.id;

    const tpl = await request(app)
      .get(`/api/periods/${periodId}/tasks/import-template`)
      .buffer(true);
    expect(tpl.status).toBe(200);
    expect(tpl.headers["content-type"]).toContain("spreadsheetml");

    const buf = await xlsxBuffer(
      ["Team", "Nhiệm vụ", "Tag", "Tính chất", "DoD", "Deadline", "% Hoàn thành", "Trạng thái", "Tiến độ"],
      [
        ["CRM", "Việc A", "Số hoá", "NVKH", "Xong", "15/03/2045", 30, "Đang thực hiện", "note"],
        ["CRM", "", "", "", "", "", "", "", ""], // thiếu nhiệm vụ -> bỏ qua
        ["", "Việc thiếu team", "", "", "", "", "", "", ""], // thiếu team -> bỏ qua
      ],
    );
    const res = await request(app)
      .post(`/api/periods/${periodId}/tasks/import?department_id=1`)
      .set("Content-Type", "application/octet-stream")
      .send(buf);
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toHaveLength(2);

    const list = await request(app).get(`/api/periods/${periodId}/tasks`);
    const a = list.body.find((t: { nhiem_vu: string }) => t.nhiem_vu === "Việc A");
    expect(a.deadline).toBe("2045-03-15");
    expect(a.phan_tram_hoan_thanh).toBe(30);
    expect(a.trang_thai).toBe("Đang thực hiện");
    expect(a.tag).toBe("Số hoá");
  });

  it("stamps cpo_graded_at khi chấm điểm; move sang tháng sau reset đánh giá và giữ snapshot tháng trước", async () => {
    const app = createApp();
    const period = await request(app).post("/api/periods").send({ year: 2047, month: 8 });
    const periodId = period.body.id;
    const task = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "CRM", nhiem_vu: "Chấm rồi kéo" });

    const graded = await request(app)
      .put(`/api/tasks/${task.body.id}`)
      .send({ cpo_danh_gia: 50, cpo_comment: "Ổn" });
    expect(graded.body.cpo_danh_gia).toBe(50);
    expect(graded.body.cpo_graded_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const move = await request(app)
      .post(`/api/periods/${periodId}/tasks/move-to-next-month`)
      .send({ ids: [task.body.id] });
    const clone = move.body.moved[0];
    expect(clone.cpo_danh_gia).toBeNull();
    expect(clone.cpo_comment).toBeNull();
    expect(clone.cpo_graded_at).toBeNull();
    expect(clone.prev_cpo_danh_gia).toBe(50);
    expect(clone.prev_cpo_comment).toBe("Ổn");
    expect(clone.prev_cpo_graded_at).toBe(graded.body.cpo_graded_at);

    // Bản gốc tháng cũ vẫn giữ nguyên đánh giá.
    const old = await request(app).get(`/api/periods/${periodId}/tasks`);
    const orig = old.body.find((t: { id: number }) => t.id === task.body.id);
    expect(orig.cpo_danh_gia).toBe(50);

    // grading_history có 1 entry cho tháng nguồn.
    const h1 = JSON.parse(clone.grading_history);
    expect(h1).toHaveLength(1);
    expect(h1[0].cpo_danh_gia).toBe(50);
    expect(h1[0].period_label).toBe("Tháng 8/2047");

    // Chấm lại 80% ở tháng 2 rồi kéo sang tháng 3 -> lịch sử có 2 entry.
    await request(app).put(`/api/tasks/${clone.id}`).send({ cpo_danh_gia: 80, cpo_comment: "lần 2" });
    const move2 = await request(app)
      .post(`/api/periods/${move.body.targetPeriod.id}/tasks/move-to-next-month`)
      .send({ ids: [clone.id] });
    const clone2 = move2.body.moved[0];
    expect(clone2.cpo_danh_gia).toBeNull();
    expect(clone2.prev_cpo_danh_gia).toBe(80);
    const h2 = JSON.parse(clone2.grading_history);
    expect(h2.map((e: { cpo_danh_gia: number }) => e.cpo_danh_gia)).toEqual([50, 80]);

    // Kéo tiếp mà KHÔNG chấm -> lịch sử vẫn 2 entry, không thêm entry rỗng.
    const move3 = await request(app)
      .post(`/api/periods/${move2.body.targetPeriod.id}/tasks/move-to-next-month`)
      .send({ ids: [clone2.id] });
    expect(JSON.parse(move3.body.moved[0].grading_history)).toHaveLength(2);
  });

  it("rejects a task import file missing the Nhiệm vụ column", async () => {
    const app = createApp();
    const period = await request(app).post("/api/periods").send({ year: 2045, month: 5 });
    const buf = await xlsxBuffer(["Team", "Ghi chú"], [["CRM", "x"]]);
    const res = await request(app)
      .post(`/api/periods/${period.body.id}/tasks/import`)
      .set("Content-Type", "application/octet-stream")
      .send(buf);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Nhiệm vụ");
  });
});
