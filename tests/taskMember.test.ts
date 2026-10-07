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

  it("can_xu_ly_gap (\"Việc cần xử lý gấp\"): bắt buộc lý do, tự ghi/xóa ngày đánh dấu", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2007, 4);
    const teamId = await makeTeam(app, "TM gap team", periodId);
    const memberId = await makeMember(app, "Ngô Văn G", teamId, periodId, "Dev");
    const taskId = await makeTask(app, periodId, "TM gap team", "Task gap");
    const created = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId });
    expect(created.body.can_xu_ly_gap).toBe(false);

    const missingReason = await request(app)
      .put(`/api/task-members/${created.body.id}`)
      .send({ can_xu_ly_gap: true });
    expect(missingReason.status).toBe(400);

    const marked = await request(app)
      .put(`/api/task-members/${created.body.id}`)
      .send({ can_xu_ly_gap: true, can_xu_ly_gap_ly_do: "Khách hàng gấp" });
    expect(marked.status).toBe(200);
    expect(marked.body.can_xu_ly_gap).toBe(true);
    expect(marked.body.can_xu_ly_gap_ly_do).toBe("Khách hàng gấp");
    expect(marked.body.can_xu_ly_gap_tu_ngay).toBeTruthy();

    const list = await request(app).get(`/api/tasks/${taskId}/members`);
    expect(list.body.find((m: { id: number }) => m.id === created.body.id).can_xu_ly_gap).toBe(true);

    const unmarked = await request(app)
      .put(`/api/task-members/${created.body.id}`)
      .send({ can_xu_ly_gap: false });
    expect(unmarked.body.can_xu_ly_gap).toBe(false);
    expect(unmarked.body.can_xu_ly_gap_ly_do).toBeNull();
    expect(unmarked.body.can_xu_ly_gap_tu_ngay).toBeNull();
  });

  it('"Đã xử lý" (mark_can_xu_ly_gap_resolved): tắt can_xu_ly_gap + ghi da_xu_ly_gap_luc (không đụng ghi_chu), biến mất khỏi danh sách đôn đốc', async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2007, 5);
    const teamId = await makeTeam(app, "TM resolve team", periodId);
    const memberId = await makeMember(app, "Trần Văn H", teamId, periodId, "Dev");
    const taskId = await makeTask(app, periodId, "TM resolve team", "Task resolve");
    const created = await request(app)
      .post(`/api/tasks/${taskId}/members`)
      .send({ member_id: memberId, ghi_chu: "Ghi chú cũ" });

    await request(app)
      .put(`/api/task-members/${created.body.id}`)
      .send({ can_xu_ly_gap: true, can_xu_ly_gap_ly_do: "Trễ deadline" });

    const beforeList = await request(app).get(`/api/task-members/can-xu-ly-gap?period_id=${periodId}`);
    expect(beforeList.body.some((r: { id: number }) => r.id === created.body.id)).toBe(true);

    const resolved = await request(app)
      .put(`/api/task-members/${created.body.id}`)
      .send({ mark_can_xu_ly_gap_resolved: true });
    expect(resolved.status).toBe(200);
    expect(resolved.body.can_xu_ly_gap).toBe(false);
    expect(resolved.body.can_xu_ly_gap_ly_do).toBeNull();
    expect(resolved.body.can_xu_ly_gap_tu_ngay).toBeNull();
    expect(resolved.body.da_xu_ly_gap_luc).toBeTruthy();
    expect(resolved.body.ghi_chu).toBe("Ghi chú cũ"); // ghi_chu không bị đụng vào

    const afterList = await request(app).get(`/api/task-members/can-xu-ly-gap?period_id=${periodId}`);
    expect(afterList.body.some((r: { id: number }) => r.id === created.body.id)).toBe(false);
  });

  it("co_viec_xu_ly_gap ở Danh sách nhiệm vụ (GET /periods/:id/tasks): true khi có ≥1 nhân sự đang bị đánh dấu, tự tắt khi gỡ hết", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2007, 6);
    const teamId = await makeTeam(app, "TM task-list urgent team", periodId);
    const memberId = await makeMember(app, "Phạm Văn K", teamId, periodId, "Dev");
    const taskId = await makeTask(app, periodId, "TM task-list urgent team", "Task list urgent");
    const otherTaskId = await makeTask(app, periodId, "TM task-list urgent team", "Task list binh thuong");

    const listBefore = await request(app).get(`/api/periods/${periodId}/tasks`);
    const beforeRow = listBefore.body.find((t: { id: number }) => t.id === taskId);
    expect(beforeRow.co_viec_xu_ly_gap).toBe(false);

    const created = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId });
    await request(app)
      .put(`/api/task-members/${created.body.id}`)
      .send({ can_xu_ly_gap: true, can_xu_ly_gap_ly_do: "Trễ hạn" });

    const listAfter = await request(app).get(`/api/periods/${periodId}/tasks`);
    const afterRow = listAfter.body.find((t: { id: number }) => t.id === taskId);
    const otherRow = listAfter.body.find((t: { id: number }) => t.id === otherTaskId);
    expect(afterRow.co_viec_xu_ly_gap).toBe(true);
    expect(otherRow.co_viec_xu_ly_gap).toBe(false); // task khác không bị ảnh hưởng

    await request(app).put(`/api/task-members/${created.body.id}`).send({ can_xu_ly_gap: false });
    const listCleared = await request(app).get(`/api/periods/${periodId}/tasks`);
    expect(listCleared.body.find((t: { id: number }) => t.id === taskId).co_viec_xu_ly_gap).toBe(false);
  });

  it("noi_dung_cong_viec: nhập lúc gán, hiển thị ở list, sửa được sau (độc lập với ghi_chu)", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2007, 2);
    const teamId = await makeTeam(app, "TM noi dung team", periodId);
    const memberId = await makeMember(app, "Lê Văn E", teamId, periodId, "Dev");
    const taskId = await makeTask(app, periodId, "TM noi dung team", "Task noi dung cong viec");

    const created = await request(app)
      .post(`/api/tasks/${taskId}/members`)
      .send({ member_id: memberId, noi_dung_cong_viec: "Code module A", ghi_chu: "Ghi chu rieng" });
    expect(created.status).toBe(201);
    expect(created.body.noi_dung_cong_viec).toBe("Code module A");
    expect(created.body.ghi_chu).toBe("Ghi chu rieng");

    const list = await request(app).get(`/api/tasks/${taskId}/members`);
    expect(list.body.find((tm: { id: number }) => tm.id === created.body.id).noi_dung_cong_viec).toBe(
      "Code module A",
    );

    const updated = await request(app)
      .put(`/api/task-members/${created.body.id}`)
      .send({ noi_dung_cong_viec: "Code module B" });
    expect(updated.status).toBe(200);
    expect(updated.body.noi_dung_cong_viec).toBe("Code module B");
    expect(updated.body.ghi_chu).toBe("Ghi chu rieng"); // không bị ảnh hưởng
  });

  it("xóa nội dung Nội dung công việc/Ghi chú (gửi null — ô nhập trên bảng khi xóa trắng) phải lưu về rỗng, không lỗi", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2007, 3);
    const teamId = await makeTeam(app, "TM xoa noi dung team", periodId);
    const memberId = await makeMember(app, "Trần Văn F", teamId, periodId, "QA");
    const taskId = await makeTask(app, periodId, "TM xoa noi dung team", "Task xoa noi dung");

    const created = await request(app)
      .post(`/api/tasks/${taskId}/members`)
      .send({ member_id: memberId, noi_dung_cong_viec: "Có nội dung", ghi_chu: "Có ghi chú" });

    // Ô input trên bảng khi xóa trắng rồi blur gửi value="" -> input.value.trim()
    // || null -> null. Backend trước đây gọi .trim() thẳng lên null -> crash.
    const cleared = await request(app)
      .put(`/api/task-members/${created.body.id}`)
      .send({ noi_dung_cong_viec: null, ghi_chu: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.noi_dung_cong_viec).toBeNull();
    expect(cleared.body.ghi_chu).toBeNull();
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

  describe("KPI theo Task (GET /api/kpi-theo-task) — phòng ban cach_tinh_kpi=theo_task", () => {
    it("cộng dồn điểm 1 nhân sự từ nhiều task: ưu tiên diem_ca_nhan ghi đè, không thì thẳng % Đánh giá (KHÔNG nhân ty_le_dong_gop); task chưa chấm điểm không cộng điểm nhưng vẫn tính vào so_task", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1998, 1);
      const teamId = await makeTeam(app, "KPI task team", periodId);
      const memberId = await makeMember(app, "Phan Văn P", teamId, periodId, "Dev");

      const task1 = await makeTask(app, periodId, "KPI task team", "Task 1 - tự tính theo %");
      await request(app).put(`/api/tasks/${task1}`).send({ cpo_danh_gia: 80 });
      await request(app).post(`/api/tasks/${task1}/members`).send({ member_id: memberId, ty_le_dong_gop: 50 });

      const task2 = await makeTask(app, periodId, "KPI task team", "Task 2 - ghi đè điểm cá nhân");
      await request(app).put(`/api/tasks/${task2}`).send({ cpo_danh_gia: 60 });
      const tm2 = await request(app)
        .post(`/api/tasks/${task2}/members`)
        .send({ member_id: memberId, ty_le_dong_gop: 100 });
      await request(app).put(`/api/task-members/${tm2.body.id}`).send({ diem_ca_nhan: 95 });

      const task3 = await makeTask(app, periodId, "KPI task team", "Task 3 - chưa chấm điểm");
      await request(app).post(`/api/tasks/${task3}/members`).send({ member_id: memberId, ty_le_dong_gop: 100 });

      const res = await request(app).get(`/api/kpi-theo-task?period_id=${periodId}`);
      expect(res.status).toBe(200);
      const row = res.body.find((r: { member_id: number }) => r.member_id === memberId);
      expect(row.so_task).toBe(3);
      // Task 1: thẳng % Đánh giá = 80 (ty_le_dong_gop 50% không còn nhân vào
      // nữa) + 95 (ghi đè) = 175; task3 chưa chấm điểm không cộng.
      expect(row.tong_diem).toBe(175);
      expect(row.member_name).toBe("Phan Văn P");
      expect(row.team_name).toBe("KPI task team");
      const t1Entry = row.tasks.find((t: { task_id: number }) => t.task_id === task1);
      expect(t1Entry.diem).toBe(80); // không bị nhân ty_le_dong_gop
      const t3Entry = row.tasks.find((t: { task_id: number }) => t.task_id === task3);
      expect(t3Entry.diem).toBeNull();
    });

    it("task phân loại 'Hỗ trợ' vẫn nhân Tỷ lệ đóng góp (khác task Thực hiện chính)", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1995, 1);
      const teamId = await makeTeam(app, "KPI hotro team", periodId);
      const memberId = await makeMember(app, "Hồ Thị R", teamId, periodId, "Dev");

      const mainTask = await makeTask(app, periodId, "KPI hotro team", "Task chính");
      await request(app).put(`/api/tasks/${mainTask}`).send({ cpo_danh_gia: 80 });
      await request(app)
        .post(`/api/tasks/${mainTask}/members`)
        .send({ member_id: memberId, ty_le_dong_gop: 50, phan_loai: "Thực hiện chính" });

      const supportTask = await makeTask(app, periodId, "KPI hotro team", "Task hỗ trợ");
      await request(app).put(`/api/tasks/${supportTask}`).send({ cpo_danh_gia: 80 });
      await request(app)
        .post(`/api/tasks/${supportTask}/members`)
        .send({ member_id: memberId, ty_le_dong_gop: 50, phan_loai: "Hỗ trợ" });

      const res = await request(app).get(`/api/kpi-theo-task?period_id=${periodId}`);
      const row = res.body.find((r: { member_id: number }) => r.member_id === memberId);
      const mainEntry = row.tasks.find((t: { task_id: number }) => t.task_id === mainTask);
      const supportEntry = row.tasks.find((t: { task_id: number }) => t.task_id === supportTask);
      expect(mainEntry.diem).toBe(80); // Thực hiện chính: thẳng % Đánh giá, không nhân tỷ lệ
      expect(supportEntry.diem).toBe(40); // Hỗ trợ: 50% x 80 = 40, VẪN nhân tỷ lệ
      expect(row.tong_diem).toBe(120);
    });

    it("lọc theo department_id — chỉ cộng điểm từ task thuộc đúng phòng ban", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1997, 1);
      const teamId = await makeTeam(app, "KPI dept team", periodId);
      const memberId = await makeMember(app, "Quách Thị Q", teamId, periodId, "QA/Tester");

      const deptA = (await request(app).post("/api/departments").send({ name: "KPI Dept A" })).body.id;
      const deptB = (await request(app).post("/api/departments").send({ name: "KPI Dept B" })).body.id;

      const taskA = (
        await request(app)
          .post(`/api/periods/${periodId}/tasks`)
          .send({ team: "KPI dept team", nhiem_vu: "Task dept A", department_id: deptA })
      ).body.id;
      await request(app).put(`/api/tasks/${taskA}`).send({ cpo_danh_gia: 100 });
      await request(app).post(`/api/tasks/${taskA}/members`).send({ member_id: memberId, ty_le_dong_gop: 100 });

      const taskB = (
        await request(app)
          .post(`/api/periods/${periodId}/tasks`)
          .send({ team: "KPI dept team", nhiem_vu: "Task dept B", department_id: deptB })
      ).body.id;
      await request(app).put(`/api/tasks/${taskB}`).send({ cpo_danh_gia: 50 });
      await request(app).post(`/api/tasks/${taskB}/members`).send({ member_id: memberId, ty_le_dong_gop: 100 });

      const resA = await request(app).get(`/api/kpi-theo-task?period_id=${periodId}&department_id=${deptA}`);
      const rowA = resA.body.find((r: { member_id: number }) => r.member_id === memberId);
      expect(rowA.so_task).toBe(1);
      expect(rowA.tong_diem).toBe(100);

      const resB = await request(app).get(`/api/kpi-theo-task?period_id=${periodId}&department_id=${deptB}`);
      const rowB = resB.body.find((r: { member_id: number }) => r.member_id === memberId);
      expect(rowB.so_task).toBe(1);
      expect(rowB.tong_diem).toBe(50);
    });

    it('"Trừ điểm cá nhân" ở Sự cố (incident_members) trừ thẳng vào tong_diem — khoản trừ độc lập, không đụng điểm của bất kỳ task nào', async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1994, 1);
      const teamId = await makeTeam(app, "KPI incident team", periodId);
      const memberId = await makeMember(app, "Vũ Văn S", teamId, periodId, "Dev");

      const taskId = await makeTask(app, periodId, "KPI incident team", "Task cho nhân sự bị trừ điểm sự cố");
      await request(app).put(`/api/tasks/${taskId}`).send({ cpo_danh_gia: 90 });
      await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId, ty_le_dong_gop: 100 });

      const before = await request(app).get(`/api/kpi-theo-task?period_id=${periodId}`);
      const rowBefore = before.body.find((r: { member_id: number }) => r.member_id === memberId);
      expect(rowBefore.tong_diem).toBe(90);
      expect(rowBefore.diem_tru_su_co).toBe(0);
      // Điểm từng task KHÔNG bị đụng vào bởi khoản trừ sự cố.
      expect(rowBefore.tasks[0].diem).toBe(90);

      const incident = await request(app)
        .post("/api/incidents")
        .send({ team_id: teamId, period_id: periodId, ten_su_co: "Su co KPI test" });
      const im = await request(app)
        .post(`/api/incidents/${incident.body.id}/members`)
        .send({ member_id: memberId });
      await request(app).post(`/api/incident-members/${im.body.id}/tru-diem`);

      const after = await request(app).get(`/api/kpi-theo-task?period_id=${periodId}`);
      const rowAfter = after.body.find((r: { member_id: number }) => r.member_id === memberId);
      expect(rowAfter.tong_diem).toBe(40); // 90 - 50
      expect(rowAfter.diem_tru_su_co).toBe(50);
      expect(rowAfter.tasks[0].diem).toBe(90); // vẫn nguyên, không bị ghi đè
    });

    it('nhân sự có "Trừ điểm cá nhân" từ Sự cố nhưng KHÔNG tham gia task nào trong tháng vẫn xuất hiện với điểm âm', async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1994, 2);
      const teamId = await makeTeam(app, "KPI incident only team", periodId);
      const memberId = await makeMember(app, "Đặng Thị T", teamId, periodId, "BA");

      const incident = await request(app)
        .post("/api/incidents")
        .send({ team_id: teamId, period_id: periodId, ten_su_co: "Su co khong co task" });
      const im = await request(app)
        .post(`/api/incidents/${incident.body.id}/members`)
        .send({ member_id: memberId });
      await request(app).post(`/api/incident-members/${im.body.id}/tru-diem`);

      const res = await request(app).get(`/api/kpi-theo-task?period_id=${periodId}`);
      const row = res.body.find((r: { member_id: number }) => r.member_id === memberId);
      expect(row).toBeDefined();
      expect(row.so_task).toBe(0);
      expect(row.tong_diem).toBe(-50);
      expect(row.diem_tru_su_co).toBe(50);
      expect(row.member_name).toBe("Đặng Thị T");
    });

    it("không có nhân sự nào tham gia task trong tháng -> trả mảng rỗng", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1996, 1);
      const res = await request(app).get(`/api/kpi-theo-task?period_id=${periodId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("rejects period_id không hợp lệ", async () => {
      const app = createApp();
      const res = await request(app).get(`/api/kpi-theo-task?period_id=abc`);
      expect(res.status).toBe(400);
    });

    it("PUT /api/departments/:id cập nhật được cach_tinh_kpi, rejects giá trị không hợp lệ", async () => {
      const app = createApp();
      const dept = (await request(app).post("/api/departments").send({ name: "KPI mode dept" })).body;
      expect(dept.cach_tinh_kpi).toBe("theo_team"); // mặc định

      const updated = await request(app)
        .put(`/api/departments/${dept.id}`)
        .send({ cach_tinh_kpi: "theo_task" });
      expect(updated.status).toBe(200);
      expect(updated.body.cach_tinh_kpi).toBe("theo_task");

      const rejected = await request(app)
        .put(`/api/departments/${dept.id}`)
        .send({ cach_tinh_kpi: "khong_hop_le" });
      expect(rejected.status).toBe(400);
    });
  });

  describe("Trừ điểm cá nhân (nút 1 lần/dòng) + tự động Hạ KI", () => {
    it("trừ 10 điểm khỏi điểm đang hiển thị (tự tính 5 -> -5 như ảnh user gửi), ghi tru_diem_luc, chặn trừ lần 2", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1994, 1);
      const teamId = await makeTeam(app, "Tru diem team", periodId);
      const memberId = await makeMember(app, "Trần Văn Trừ Điểm", teamId, periodId, "Dev");

      // Task "Thực hiện chính" (chưa phân loại) chấm 5 điểm — điểm tự tính = 5.
      const taskId = await makeTask(app, periodId, "Tru diem team", "Task tru diem");
      await request(app).put(`/api/tasks/${taskId}`).send({ cpo_danh_gia: 5 });
      const tm = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId });
      expect(tm.body.tru_diem_luc).toBeNull();

      const deducted = await request(app)
        .put(`/api/task-members/${tm.body.id}`)
        .send({ tru_diem_ca_nhan: true });
      expect(deducted.status).toBe(200);
      expect(deducted.body.diem_ca_nhan).toBe(-5); // 5 - 10
      expect(deducted.body.tru_diem_luc).toBeTruthy();
      expect(deducted.body.tru_diem_so_diem).toBe(10);

      // Bấm lần 2 -> bị chặn (mỗi dòng chỉ trừ 1 lần), điểm giữ nguyên.
      const again = await request(app)
        .put(`/api/task-members/${tm.body.id}`)
        .send({ tru_diem_ca_nhan: true });
      expect(again.status).toBe(400);
      const list = await request(app).get(`/api/tasks/${taskId}/members`);
      const row = list.body.find((r: { id: number }) => r.id === tm.body.id);
      expect(row.diem_ca_nhan).toBe(-5);
    });

    it("↺ reset (diem_ca_nhan = null) chỉ về điểm mặc định (tự tính - điểm trừ), KHÔNG xóa được điểm trừ", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1994, 3);
      const teamId = await makeTeam(app, "Tru diem reset team", periodId);
      const memberId = await makeMember(app, "Trần Văn Không Reset", teamId, periodId, "Dev");

      // Task chính 5 điểm — trừ 10 -> -5; ↺ reset -> điểm mặc định = 5 - 10 = -5
      // (điểm trừ là lớp riêng tru_diem_so_diem, không bị ↺ xóa — yêu cầu user).
      const taskId = await makeTask(app, periodId, "Tru diem reset team", "Task reset không xóa điểm trừ");
      await request(app).put(`/api/tasks/${taskId}`).send({ cpo_danh_gia: 5 });
      const tm = await request(app).post(`/api/tasks/${taskId}/members`).send({ member_id: memberId });
      await request(app).put(`/api/task-members/${tm.body.id}`).send({ tru_diem_ca_nhan: true });
      const reset = await request(app).put(`/api/task-members/${tm.body.id}`).send({ diem_ca_nhan: null });
      expect(reset.status).toBe(200);
      expect(reset.body.diem_ca_nhan).toBeNull();
      expect(reset.body.tru_diem_luc).toBeTruthy(); // dấu "đã trừ" còn nguyên
      expect(reset.body.tru_diem_so_diem).toBe(10); // điểm trừ KHÔNG bị xóa

      // Điểm theo task (KPI) vẫn = 5 - 10 = -5 sau khi reset (không về 5).
      const kpi = await request(app).get(`/api/kpi-theo-task?period_id=${periodId}`);
      const kpiRow = kpi.body.find((r: { member_id: number }) => r.member_id === memberId);
      const entry = kpiRow.tasks.find((t: { task_id: number }) => t.task_id === taskId);
      expect(entry.diem).toBe(-5);

      // Đổi % Đánh giá của task lên 50 -> điểm mặc định mới = 50 - 10 = 40
      // (điểm trừ vẫn áp dụng trên điểm tự tính hiện tại).
      await request(app).put(`/api/tasks/${taskId}`).send({ cpo_danh_gia: 50 });
      const kpi2 = await request(app).get(`/api/kpi-theo-task?period_id=${periodId}`);
      const entry2 = kpi2.body
        .find((r: { member_id: number }) => r.member_id === memberId)
        .tasks.find((t: { task_id: number }) => t.task_id === taskId);
      expect(entry2.diem).toBe(40);
    });

    it("dòng đã ghi đè tay thì trừ trên giá trị tay (8 -> -2); task 'Hỗ trợ' trừ trên điểm tự tính theo tỷ lệ", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1994, 2);
      const teamId = await makeTeam(app, "Tru diem tay team", periodId);
      const m1 = await makeMember(app, "Nguyễn Văn Trừ Tay", teamId, periodId, "Dev");
      const m2 = await makeMember(app, "Lê Thị Hỗ Trợ", teamId, periodId, "Dev");

      const taskId = await makeTask(app, periodId, "Tru diem tay team", "Task trừ điểm hỗn hợp");
      await request(app).put(`/api/tasks/${taskId}`).send({ cpo_danh_gia: 80 });

      const tm1 = await request(app)
        .post(`/api/tasks/${taskId}/members`)
        .send({ member_id: m1, diem_ca_nhan: 8 });
      const deducted1 = await request(app).put(`/api/task-members/${tm1.body.id}`).send({ tru_diem_ca_nhan: true });
      expect(deducted1.body.diem_ca_nhan).toBe(-2); // 8 - 10

      // Hỗ trợ 50% x 80 = 40 (tự tính) -> trừ 10 còn 30.
      const tm2 = await request(app)
        .post(`/api/tasks/${taskId}/members`)
        .send({ member_id: m2, ty_le_dong_gop: 50, phan_loai: "Hỗ trợ" });
      const deducted2 = await request(app).put(`/api/task-members/${tm2.body.id}`).send({ tru_diem_ca_nhan: true });
      expect(deducted2.body.diem_ca_nhan).toBe(30);
    });

    it("tổng 'Điểm cá nhân (Tính theo task)' <= 0 sau khi trừ -> tự động Hạ KI với lý do cố định; > 0 thì không hạ", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1993, 1);
      const teamId = await makeTeam(app, "Tru diem ha ki team", periodId);
      const mBad = await makeMember(app, "Nguyễn Văn Bị Hạ", teamId, periodId, "Dev");
      const mOk = await makeMember(app, "Trần Thị Vẫn Đủ Điểm", teamId, periodId, "Dev");

      // mBad: 1 task chính 5 điểm — trừ 10 -> -5 (điểm duy nhất = trung bình)
      // -> tổng "Điểm cá nhân (Tính theo task)" <= 0 -> tự động Hạ KI.
      const taskBad = await makeTask(app, periodId, "Tru diem ha ki team", "Task hạ KI");
      await request(app).put(`/api/tasks/${taskBad}`).send({ cpo_danh_gia: 5 });
      const tmBad = await request(app).post(`/api/tasks/${taskBad}/members`).send({ member_id: mBad });
      const resBad = await request(app).put(`/api/task-members/${tmBad.body.id}`).send({ tru_diem_ca_nhan: true });
      expect(resBad.body.diem_ca_nhan).toBe(-5);

      // mOk: 1 task chính 80 điểm — trừ 10 còn 70 > 0 -> không bị Hạ KI.
      const taskOk = await makeTask(app, periodId, "Tru diem ha ki team", "Task đủ điểm");
      await request(app).put(`/api/tasks/${taskOk}`).send({ cpo_danh_gia: 80 });
      const tmOk = await request(app).post(`/api/tasks/${taskOk}/members`).send({ member_id: mOk });
      const resOk = await request(app).put(`/api/task-members/${tmOk.body.id}`).send({ tru_diem_ca_nhan: true });
      expect(resOk.body.diem_ca_nhan).toBe(70);

      const members = await request(app).get(`/api/members?period_id=${periodId}`);
      const badAfter = members.body.find((m: { id: number }) => m.id === mBad);
      const okAfter = members.body.find((m: { id: number }) => m.id === mOk);
      expect(badAfter.ha_ki).toBe(true);
      expect(badAfter.ki_ly_do).toBe("Tự động trừ KI do điểm cá nhân <= 0");
      expect(okAfter.ha_ki).toBe(false);
      expect(okAfter.ki_ly_do).toBeNull();
    });

    it("đã Hạ KI trước đó thì giữ nguyên lý do cũ; Hạ KI tự động cũng tắt Tăng KI đang bật", async () => {
      const app = createApp();
      const periodId = await makePeriod(app, 1993, 2);
      const teamId = await makeTeam(app, "Tru diem ha ki cu team", periodId);
      const m1 = await makeMember(app, "Bùi Văn Đã Hạ", teamId, periodId, "Dev");
      const m2 = await makeMember(app, "Đỗ Thị Đang Tăng", teamId, periodId, "Dev");

      // m1 đã Hạ KI tay với lý do riêng — trừ điểm không được ghi đè lý do.
      await request(app).put(`/api/members/${m1}`).send({ ha_ki: true, ki_ly_do: "Vi phạm deadline" });
      const task1 = await makeTask(app, periodId, "Tru diem ha ki cu team", "Task hạ sẵn");
      await request(app).put(`/api/tasks/${task1}`).send({ cpo_danh_gia: 5 });
      const tm1 = await request(app).post(`/api/tasks/${task1}/members`).send({ member_id: m1 });
      await request(app).put(`/api/task-members/${tm1.body.id}`).send({ tru_diem_ca_nhan: true });

      // m2 đang Tăng KI — tổng điểm rơi <= 0 -> tự động chuyển sang Hạ KI
      // (2 cờ loại trừ nhau, khớp updateMember ở member.service.ts).
      await request(app).put(`/api/members/${m2}`).send({ tang_ki: true, ki_ly_do: "Xuất sắc quý trước" });
      const task2 = await makeTask(app, periodId, "Tru diem ha ki cu team", "Task tăng ki");
      await request(app).put(`/api/tasks/${task2}`).send({ cpo_danh_gia: 5 });
      const tm2 = await request(app).post(`/api/tasks/${task2}/members`).send({ member_id: m2 });
      await request(app).put(`/api/task-members/${tm2.body.id}`).send({ tru_diem_ca_nhan: true });

      const members = await request(app).get(`/api/members?period_id=${periodId}`);
      const m1After = members.body.find((m: { id: number }) => m.id === m1);
      const m2After = members.body.find((m: { id: number }) => m.id === m2);
      expect(m1After.ha_ki).toBe(true);
      expect(m1After.ki_ly_do).toBe("Vi phạm deadline");
      expect(m2After.ha_ki).toBe(true);
      expect(m2After.tang_ki).toBe(false);
      expect(m2After.ki_ly_do).toBe("Tự động trừ KI do điểm cá nhân <= 0");
    });
  });
});
