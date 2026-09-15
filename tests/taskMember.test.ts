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

async function makeMember(
  app: ReturnType<typeof createApp>,
  name: string,
  teamId: number,
  periodId: number,
  chucVu?: string,
) {
  const res = await request(app)
    .post("/api/members")
    .send({ name, team_id: teamId, period_id: periodId, chuc_vu: chucVu });
  return res.body.id as number;
}

async function makeTask(app: ReturnType<typeof createApp>, periodId: number, team: string, nhiemVu: string) {
  const res = await request(app).post(`/api/periods/${periodId}/tasks`).send({ team, nhiem_vu: nhiemVu });
  return res.body.id as number;
}

// Năm rất thấp, không dùng ở test file nào khác — tránh bị chọn làm "tháng
// gần nhất" khi test khác tạo period mới và kế thừa team (xem lưu ý tương tự
// ở roadmap.test.ts).
describe("Nhân sự tham gia task (Backlog) — vai trò lấy theo Chức vụ có sẵn", () => {
  it("gán nhân sự vào task, list ra kèm tên + chức vụ (vai trò), xóa được", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2005, 1);
    const teamId = await makeTeam(app, "TM test team", periodId);
    const m1 = await makeMember(app, "Nguyễn Văn A", teamId, periodId, "Dev");
    const m2 = await makeMember(app, "Trần Thị B", teamId, periodId, "PO");
    const taskId = await makeTask(app, periodId, "TM test team", "Task cần nhiều người");

    const a1 = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: m1, ghi_chu: "Backend" });
    expect(a1.status).toBe(201);
    expect(a1.body.member_name).toBe("Nguyễn Văn A");
    expect(a1.body.member_chuc_vu).toBe("Dev"); // "vai trò" = chức vụ có sẵn của nhân sự

    const a2 = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: m2 });
    expect(a2.status).toBe(201);
    expect(a2.body.member_chuc_vu).toBe("PO");

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

  it("1 nhân sự chỉ gán được 1 lần / task — gán lại (idempotent) trả về đúng dòng cũ, cập nhật ghi chú nếu gửi kèm", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2006, 1);
    const teamId = await makeTeam(app, "TM dup team", periodId);
    const memberId = await makeMember(app, "Lê Văn C", teamId, periodId, "QA/Tester");
    const taskId = await makeTask(app, periodId, "TM dup team", "Task chỉ 1 vai trò / người");

    const first = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId, ghi_chu: "v1" });
    const again = await request(app)
      .post(`/api/tasks/${taskId}/members`)
      .send({ member_id: memberId, ghi_chu: "v2" });
    expect(again.body.id).toBe(first.body.id);
    expect(again.body.ghi_chu).toBe("v2"); // ghi chú được cập nhật theo lần gán sau

    const list = await request(app).get(`/api/tasks/${taskId}/members`);
    expect(list.body).toHaveLength(1);
  });

  it("cập nhật ghi chú của 1 dòng đã gán", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2007, 1);
    const teamId = await makeTeam(app, "TM update team", periodId);
    const memberId = await makeMember(app, "Phạm Thị D", teamId, periodId, "BA");
    const taskId = await makeTask(app, periodId, "TM update team", "Task sửa ghi chú");

    const created = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId });
    const updated = await request(app)
      .put(`/api/task-members/${created.body.id}`)
      .send({ ghi_chu: "Cập nhật ghi chú" });
    expect(updated.status).toBe(200);
    expect(updated.body.ghi_chu).toBe("Cập nhật ghi chú");
    expect(updated.body.member_chuc_vu).toBe("BA"); // vai trò không đổi — vẫn theo chức vụ nhân sự
  });

  it("xóa task -> mất luôn các dòng gán nhân sự (CASCADE)", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2008, 1);
    const teamId = await makeTeam(app, "TM cascade team", periodId);
    const memberId = await makeMember(app, "Vũ Văn E", teamId, periodId, "Dev");
    const taskId = await makeTask(app, periodId, "TM cascade team", "Task xóa cascade");
    await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId });

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

  describe("Phân bổ tỷ lệ đóng góp (%) và điểm cá nhân", () => {
    it("tổng tỷ lệ đóng góp trong 1 task không được vượt 100%", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 2003, 1);
      const teamId = await makeTeam(app, "TM contrib team", periodId);
      const m1 = await makeMember(app, "Bùi Văn H", teamId, periodId, "Dev");
      const m2 = await makeMember(app, "Cao Thị I", teamId, periodId, "QA/Tester");
      const taskId = await makeTask(app, periodId, "TM contrib team", "Task chia tỷ lệ");

      const a1 = await request(app)
        .post(`/api/tasks/${taskId}/members`)
        .send({ member_id: m1, ty_le_dong_gop: 60 });
      expect(a1.status).toBe(201);
      expect(a1.body.ty_le_dong_gop).toBe(60);

      const a2ok = await request(app)
        .post(`/api/tasks/${taskId}/members`)
        .send({ member_id: m2, ty_le_dong_gop: 40 });
      expect(a2ok.status).toBe(201);

      // Sửa m2 lên 41% -> tổng 101% -> phải bị từ chối.
      const overLimit = await request(app)
        .put(`/api/task-members/${a2ok.body.id}`)
        .send({ ty_le_dong_gop: 41 });
      expect(overLimit.status).toBe(400);

      // Giá trị cũ (40%) phải còn nguyên, không bị đổi bởi request lỗi ở trên.
      const list = await request(app).get(`/api/tasks/${taskId}/members`);
      const m2Row = list.body.find((r: { member_id: number }) => r.member_id === m2);
      expect(m2Row.ty_le_dong_gop).toBe(40);
    });

    it("sửa lại tỷ lệ của chính dòng đó (không đổi) vẫn hợp lệ dù tổng đã ở mức 100%", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 2004, 1);
      const teamId = await makeTeam(app, "TM self team", periodId);
      const memberId = await makeMember(app, "Dương Văn K", teamId, periodId, "PM/SM");
      const taskId = await makeTask(app, periodId, "TM self team", "Task tự sửa");

      const created = await request(app)
        .post(`/api/tasks/${taskId}/members`)
        .send({ member_id: memberId, ty_le_dong_gop: 100 });
      expect(created.status).toBe(201);

      // Loại trừ chính dòng đang sửa khi tính tổng — không được coi là "cộng dồn".
      const resaved = await request(app)
        .put(`/api/task-members/${created.body.id}`)
        .send({ ty_le_dong_gop: 100 });
      expect(resaved.status).toBe(200);
    });

    it("điểm cá nhân: nhập tay để ghi đè, gửi null để xóa (về tự tính theo %)", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 2002, 1);
      const teamId = await makeTeam(app, "TM score team", periodId);
      const memberId = await makeMember(app, "Giang Thị L", teamId, periodId, "Dev");
      const taskId = await makeTask(app, periodId, "TM score team", "Task điểm cá nhân");

      const created = await request(app)
        .post(`/api/tasks/${taskId}/members`)
        .send({ member_id: memberId, ty_le_dong_gop: 50 });
      expect(created.body.diem_ca_nhan).toBeNull();

      const withScore = await request(app)
        .put(`/api/task-members/${created.body.id}`)
        .send({ diem_ca_nhan: 92.5 });
      expect(withScore.status).toBe(200);
      expect(withScore.body.diem_ca_nhan).toBe(92.5);

      const cleared = await request(app)
        .put(`/api/task-members/${created.body.id}`)
        .send({ diem_ca_nhan: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.diem_ca_nhan).toBeNull();
    });

    it("rejects tỷ lệ đóng góp ngoài khoảng 0-100 hoặc không phải số", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 2001, 1);
      const teamId = await makeTeam(app, "TM invalid team", periodId);
      const memberId = await makeMember(app, "Hồ Văn M", teamId, periodId);
      const taskId = await makeTask(app, periodId, "TM invalid team", "Task invalid");

      expect(
        (await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId, ty_le_dong_gop: 150 }))
          .status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post(`/api/tasks/${taskId}/members`)
            .send({ member_id: memberId, ty_le_dong_gop: "abc" })
        ).status,
      ).toBe(400);
    });
  });

  describe("Phân loại nhân sự tham gia (Thực hiện chính / Hỗ trợ...)", () => {
    it("gán kèm phân loại, sửa lại, xóa về '— Không —' (null)", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 2000, 1);
      const teamId = await makeTeam(app, "TM phanloai team", periodId);
      const memberId = await makeMember(app, "Kiều Văn N", teamId, periodId, "Dev");
      const taskId = await makeTask(app, periodId, "TM phanloai team", "Task phân loại nhân sự");

      const created = await request(app)
        .post(`/api/tasks/${taskId}/members`)
        .send({ member_id: memberId, phan_loai: "Hỗ trợ" });
      expect(created.status).toBe(201);
      expect(created.body.phan_loai).toBe("Hỗ trợ");

      const updated = await request(app)
        .put(`/api/task-members/${created.body.id}`)
        .send({ phan_loai: "Thực hiện chính" });
      expect(updated.body.phan_loai).toBe("Thực hiện chính");

      const cleared = await request(app).put(`/api/task-members/${created.body.id}`).send({ phan_loai: null });
      expect(cleared.status).toBe(200); // không được crash khi gửi null tường minh
      expect(cleared.body.phan_loai).toBeNull();
    });

    it("không gán phân loại -> mặc định null, không bắt buộc", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1999, 1);
      const teamId = await makeTeam(app, "TM no phanloai team", periodId);
      const memberId = await makeMember(app, "Lý Thị O", teamId, periodId);
      const taskId = await makeTask(app, periodId, "TM no phanloai team", "Task không phân loại");

      const created = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId });
      expect(created.status).toBe(201);
      expect(created.body.phan_loai).toBeNull();
    });
  });
});
