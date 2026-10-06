import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

async function makePeriod(app: ReturnType<typeof createApp>, year: number, month: number) {
  const res = await request(app).post("/api/periods").send({ year, month });
  return res.body.id as number;
}
async function makeTeam(app: ReturnType<typeof createApp>, name: string, periodId: number) {
  const res = await request(app).post("/api/teams").send({ name, period_id: periodId });
  return res.body.id as number;
}
async function makeMember(app: ReturnType<typeof createApp>, name: string, teamId: number, periodId: number) {
  const res = await request(app).post("/api/members").send({ name, team_id: teamId, period_id: periodId });
  return res.body.id as number;
}
async function makeTask(app: ReturnType<typeof createApp>, periodId: number, team: string, nhiemVu: string) {
  const res = await request(app).post(`/api/periods/${periodId}/tasks`).send({ team, nhiem_vu: nhiemVu });
  return res.body.id as number;
}

describe("Việc (task_items) — khối lượng, đánh giá, Treo việc", () => {
  it("tạo Việc, gán nhiều nhân sự kèm giờ công, tổng Hours/MD tính đúng (8h=1MD)", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2050, 1);
    const teamId = await makeTeam(app, "Viec team A", periodId);
    const m1 = await makeMember(app, "Nhân sự 1", teamId, periodId);
    const m2 = await makeMember(app, "Nhân sự 2", teamId, periodId);
    const taskId = await makeTask(app, periodId, "Viec team A", "Task A");

    const created = await request(app).post(`/api/tasks/${taskId}/items`).send({ ten_viec: "Việc 1" });
    expect(created.status).toBe(201);
    const itemId = created.body.id;

    await request(app).post(`/api/task-items/${itemId}/members`).send({ member_id: m1, gio_cong: 16 });
    const after2 = await request(app)
      .post(`/api/task-items/${itemId}/members`)
      .send({ member_id: m2, gio_cong: 8 });
    expect(after2.body.tong_gio_cong).toBe(24);
    expect(after2.body.tong_md).toBe(3); // 24/8
    expect(after2.body.assignees).toHaveLength(2);
  });

  it("rejects tạo Việc thiếu tên", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2050, 2);
    const teamId = await makeTeam(app, "Viec team B", periodId);
    const taskId = await makeTask(app, periodId, "Viec team B", "Task B");
    const res = await request(app).post(`/api/tasks/${taskId}/items`).send({ ten_viec: "   " });
    expect(res.status).toBe(400);
  });

  it("Treo việc bắt buộc lý do, tự ghi ngày bắt đầu treo, gỡ treo thì xóa lý do/ngày", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2050, 3);
    const teamId = await makeTeam(app, "Viec team C", periodId);
    const taskId = await makeTask(app, periodId, "Viec team C", "Task C");
    const item = await request(app).post(`/api/tasks/${taskId}/items`).send({ ten_viec: "Việc treo" });
    const itemId = item.body.id;

    const missingReason = await request(app).put(`/api/task-items/${itemId}`).send({ treo_viec: true });
    expect(missingReason.status).toBe(400);

    const treo = await request(app)
      .put(`/api/task-items/${itemId}`)
      .send({ treo_viec: true, treo_viec_ly_do: "Chờ duyệt mua sắm" });
    expect(treo.status).toBe(200);
    expect(treo.body.treo_viec).toBe(true);
    expect(treo.body.treo_viec_ly_do).toBe("Chờ duyệt mua sắm");
    expect(treo.body.treo_viec_tu_ngay).toBeTruthy();

    const treoList = await request(app).get(`/api/task-items/treo?period_id=${periodId}`);
    expect(treoList.body.some((r: { id: number }) => r.id === itemId)).toBe(true);

    const goTreo = await request(app).put(`/api/task-items/${itemId}`).send({ treo_viec: false });
    expect(goTreo.body.treo_viec).toBe(false);
    expect(goTreo.body.treo_viec_ly_do).toBeNull();
    expect(goTreo.body.treo_viec_tu_ngay).toBeNull();

    const treoListAfter = await request(app).get(`/api/task-items/treo?period_id=${periodId}`);
    expect(treoListAfter.body.some((r: { id: number }) => r.id === itemId)).toBe(false);
  });

  it("% Đánh giá của Task tự = trung bình các Việc con ĐÃ CHẤM, bỏ qua Việc chưa chấm", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2050, 4);
    const teamId = await makeTeam(app, "Viec team D", periodId);
    const taskId = await makeTask(app, periodId, "Viec team D", "Task D");

    const item1 = await request(app).post(`/api/tasks/${taskId}/items`).send({ ten_viec: "Việc D1" });
    const item2 = await request(app).post(`/api/tasks/${taskId}/items`).send({ ten_viec: "Việc D2" });

    await request(app).put(`/api/task-items/${item1.body.id}`).send({ diem_danh_gia: 80 });
    const taskAfter1 = await request(app).get(`/api/tasks/${taskId}`);
    expect(taskAfter1.body.cpo_danh_gia).toBe(80); // chỉ 1 việc chấm -> = chính nó

    // item2 chưa chấm -> không kéo điểm xuống, vẫn = 80.
    const taskStillOne = await request(app).get(`/api/tasks/${taskId}`);
    expect(taskStillOne.body.cpo_danh_gia).toBe(80);

    await request(app).put(`/api/task-items/${item2.body.id}`).send({ diem_danh_gia: 60 });
    const taskAfter2 = await request(app).get(`/api/tasks/${taskId}`);
    expect(taskAfter2.body.cpo_danh_gia).toBe(70); // (80+60)/2
  });

  it("gỡ phân công nhân sự khỏi Việc (xóa mềm) -> không còn trong assignees, tổng giờ giảm", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2050, 5);
    const teamId = await makeTeam(app, "Viec team E", periodId);
    const m1 = await makeMember(app, "NS E1", teamId, periodId);
    const taskId = await makeTask(app, periodId, "Viec team E", "Task E");
    const item = await request(app).post(`/api/tasks/${taskId}/items`).send({ ten_viec: "Việc E" });
    const assign = await request(app)
      .post(`/api/task-items/${item.body.id}/members`)
      .send({ member_id: m1, gio_cong: 8 });
    const assigneeId = assign.body.assignees[0].id;

    const del = await request(app).delete(`/api/task-item-members/${assigneeId}`);
    expect(del.status).toBe(204);

    const list = await request(app).get(`/api/tasks/${taskId}/items`);
    const found = list.body.find((i: { id: number }) => i.id === item.body.id);
    expect(found.assignees).toHaveLength(0);
    expect(found.tong_gio_cong).toBe(0);
  });

  it("xóa Việc (có điểm) -> Task tính lại % Đánh giá chỉ theo các Việc còn lại", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2050, 6);
    const teamId = await makeTeam(app, "Viec team F", periodId);
    const taskId = await makeTask(app, periodId, "Viec team F", "Task F");
    const item1 = await request(app).post(`/api/tasks/${taskId}/items`).send({ ten_viec: "Việc F1" });
    const item2 = await request(app).post(`/api/tasks/${taskId}/items`).send({ ten_viec: "Việc F2" });
    await request(app).put(`/api/task-items/${item1.body.id}`).send({ diem_danh_gia: 100 });
    await request(app).put(`/api/task-items/${item2.body.id}`).send({ diem_danh_gia: 0 });
    const before = await request(app).get(`/api/tasks/${taskId}`);
    expect(before.body.cpo_danh_gia).toBe(50);

    const del = await request(app).delete(`/api/task-items/${item2.body.id}`);
    expect(del.status).toBe(204);
    const after = await request(app).get(`/api/tasks/${taskId}`);
    expect(after.body.cpo_danh_gia).toBe(100); // chỉ còn item1 (100)
  });
});
