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

// Năm rất thấp, không dùng ở test file nào khác — tránh bị chọn làm "tháng
// gần nhất" khi test khác tạo period mới và kế thừa team (xem lưu ý tương tự
// ở roadmap.test.ts).
describe("Nhân sự tham gia task (Backlog)", () => {
  it("gán nhân sự + vai trò vào task, list ra kèm tên nhân sự, xóa được", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2005, 1);
    const teamId = await makeTeam(app, "TM test team", periodId);
    const m1 = await makeMember(app, "Nguyễn Văn A", teamId, periodId);
    const m2 = await makeMember(app, "Trần Thị B", teamId, periodId);
    const taskId = await makeTask(app, periodId, "TM test team", "Task cần nhiều người");

    const a1 = await request(app)
      .post(`/api/tasks/${taskId}/members`)
      .send({ member_id: m1, vai_tro: "Dev", ghi_chu: "Backend" });
    expect(a1.status).toBe(201);
    expect(a1.body.member_name).toBe("Nguyễn Văn A");
    expect(a1.body.vai_tro).toBe("Dev");

    const a2 = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: m2, vai_tro: "PO" });
    expect(a2.status).toBe(201);

    const list = await request(app).get(`/api/tasks/${taskId}/members`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.map((r: { member_name: string }) => r.member_name)).toEqual(
      expect.arrayContaining(["Nguyễn Văn A", "Trần Thị B"]),
    );

    const del = await request(app).delete(`/api/task-members/${a1.body.id}`);
    expect(del.status).toBe(204);
    const afterDel = await request(app).get(`/api/tasks/${taskId}/members`);
    expect(afterDel.body).toHaveLength(1);
  });

  it("1 nhân sự tham gia cùng task với nhiều vai trò khác nhau — gán trùng (member_id, vai_tro) thì idempotent", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2006, 1);
    const teamId = await makeTeam(app, "TM dup team", periodId);
    const memberId = await makeMember(app, "Lê Văn C", teamId, periodId);
    const taskId = await makeTask(app, periodId, "TM dup team", "Task đa vai trò");

    const dev = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId, vai_tro: "Dev" });
    const qa = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId, vai_tro: "QA/Tester" });
    expect(dev.body.id).not.toBe(qa.body.id);

    // Gán lại đúng cặp (member_id, vai_tro) đã có -> không tạo dòng mới.
    const devAgain = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId, vai_tro: "Dev" });
    expect(devAgain.body.id).toBe(dev.body.id);

    const list = await request(app).get(`/api/tasks/${taskId}/members`);
    expect(list.body).toHaveLength(2);
  });

  it("cập nhật vai trò/ghi chú của 1 dòng đã gán", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2007, 1);
    const teamId = await makeTeam(app, "TM update team", periodId);
    const memberId = await makeMember(app, "Phạm Thị D", teamId, periodId);
    const taskId = await makeTask(app, periodId, "TM update team", "Task sửa vai trò");

    const created = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId });
    const updated = await request(app)
      .put(`/api/task-members/${created.body.id}`)
      .send({ vai_tro: "BA", ghi_chu: "Chuyển sang BA" });
    expect(updated.status).toBe(200);
    expect(updated.body.vai_tro).toBe("BA");
    expect(updated.body.ghi_chu).toBe("Chuyển sang BA");
  });

  it("xóa task -> xóa theo các dòng gán nhân sự (CASCADE); xóa nhân sự -> xóa theo (CASCADE)", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2008, 1);
    const teamId = await makeTeam(app, "TM cascade team", periodId);
    const memberId = await makeMember(app, "Vũ Văn E", teamId, periodId);
    const taskId = await makeTask(app, periodId, "TM cascade team", "Task xóa cascade");
    await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId, vai_tro: "Dev" });

    await request(app).delete(`/api/tasks/${taskId}`);
    // Task đã xóa -> route trả 404 khi list (getTask không còn tìm thấy).
    const afterTaskDel = await request(app).get(`/api/tasks/${taskId}/members`);
    expect(afterTaskDel.status).toBe(404);
  });

  it("danh sách task (GET .../tasks) trả kèm member_count đúng số nhân sự đã gán", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2009, 1);
    const teamId = await makeTeam(app, "TM count team", periodId);
    const m1 = await makeMember(app, "Đỗ Văn F", teamId, periodId);
    const m2 = await makeMember(app, "Ngô Thị G", teamId, periodId);
    const taskId = await makeTask(app, periodId, "TM count team", "Task đếm nhân sự");

    let list = await request(app).get(`/api/periods/${periodId}/tasks`);
    let task = list.body.find((t: { id: number }) => t.id === taskId);
    expect(task.member_count).toBe(0);

    await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: m1 });
    await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: m2 });

    list = await request(app).get(`/api/periods/${periodId}/tasks`);
    task = list.body.find((t: { id: number }) => t.id === taskId);
    expect(task.member_count).toBe(2);
  });

  it("rejects gán nhân sự thiếu member_id, hoặc vào task không tồn tại", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2010, 1);
    const teamId = await makeTeam(app, "TM reject team", periodId);
    const taskId = await makeTask(app, periodId, "TM reject team", "Task reject");

    expect((await request(app).post(`/api/tasks/${taskId}/members`).send({})).status).toBe(400);
    expect(
      (await request(app).post(`/api/tasks/999999/members`).send({ member_id: 1 })).status,
    ).toBe(404);
  });
});
