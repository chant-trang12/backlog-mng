import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// "Xin Hủy nhiệm vụ" (menu Nhiệm vụ, popup "Cập nhật tiến độ") — hủy task
// bị phạt điểm theo % thời gian mục tiêu (từ ngày 01 tháng backlog tới
// Deadline task) đã trôi qua, xem computeElapsedFraction/cancelPenaltyTier
// ở task.service.ts. Vì fraction tính theo THỜI ĐIỂM THỰC (Date.now()),
// test này dùng đúng THÁNG HIỆN TẠI làm period (period.year/month = tháng
// backlog chứa "hôm nay") rồi chọn Deadline cách "hôm nay" X ngày để điều
// khiển % đã trôi qua một cách chủ động, không phụ thuộc đồng hồ hệ thống
// lúc chạy test (miễn chạy trong cùng tháng, không chạy đúng lúc giao
// thừa cuối tháng — rủi ro rất nhỏ, chấp nhận được).

function todayPeriodYm(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// Deadline cách đầu tháng backlog N ngày (tính từ ngày 01, UTC-safe bằng
// cách build lại Date từ y/m/d local).
function deadlineDaysFromPeriodStart(year: number, month: number, days: number): string {
  const d = new Date(year, month - 1, 1 + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Số ngày đã trôi qua từ đầu tháng backlog tới "hôm nay" — dùng để suy ra
// deadline cần đặt ở đâu để đạt đúng fraction mong muốn (elapsedDays / N).
function elapsedDaysSincePeriodStart(year: number, month: number): number {
  const start = new Date(year, month - 1, 1).getTime();
  return Math.max(1, Math.round((Date.now() - start) / 86_400_000));
}

async function makePeriod(app: ReturnType<typeof createApp>, year: number, month: number) {
  const res = await request(app).post("/api/periods").send({ year, month });
  // Period đã tồn tại từ test khác chạy trước trong cùng tháng -> service
  // trả về bản ghi đã có (idempotent theo year+month), vẫn lấy được id.
  return (res.body.id ?? res.body?.error) as number;
}

async function findOrMakePeriod(app: ReturnType<typeof createApp>, year: number, month: number) {
  const list = await request(app).get("/api/periods");
  const existing = (list.body as any[]).find((p) => p.year === year && p.month === month);
  if (existing) return existing.id as number;
  return makePeriod(app, year, month);
}

async function makeTeam(app: ReturnType<typeof createApp>, name: string, periodId: number) {
  const res = await request(app).post("/api/teams").send({ name, period_id: periodId });
  return res.body.id as number;
}

async function makeTask(
  app: ReturnType<typeof createApp>,
  periodId: number,
  team: string,
  nhiemVu: string,
  deadline?: string,
) {
  const res = await request(app)
    .post(`/api/periods/${periodId}/tasks`)
    .send({ team, nhiem_vu: nhiemVu, deadline });
  return res.body.id as number;
}

describe("Xin Hủy nhiệm vụ — phạt điểm theo % thời gian mục tiêu đã trôi qua", () => {
  it("hủy khi chưa trôi qua 1/4 thời gian: chặn nếu thiếu task thay thế, cho qua nếu có", async () => {
    const app = createApp();
    const { year, month } = todayPeriodYm();
    const periodId = await findOrMakePeriod(app, year, month);
    const teamName = `Huy som team ${Date.now()}`;
    const teamId = await makeTeam(app, teamName, periodId);
    // Deadline rất xa (gấp nhiều lần số ngày đã trôi qua) -> fraction gần 0.
    const farDeadline = deadlineDaysFromPeriodStart(year, month, elapsedDaysSincePeriodStart(year, month) * 50 + 365);
    const taskId = await makeTask(app, periodId, teamName, "Task huy som", farDeadline);

    const blocked = await request(app).put(`/api/tasks/${taskId}`).send({ trang_thai: "Hủy" });
    expect(blocked.status).toBe(400);

    const ok = await request(app)
      .put(`/api/tasks/${taskId}`)
      .send({ trang_thai: "Hủy", replacement_task: { team: teamName, nhiem_vu: "Task thay thế" } });
    expect(ok.status).toBe(200);
    expect(ok.body.trang_thai).toBe("Hủy");
    expect(ok.body.khong_tinh_diem).toBe("Không tính điểm");
    expect(ok.body.cpo_danh_gia).toBeNull();
    expect(ok.body.thay_the_task_id).toBeTypeOf("number");

    const replacement = await request(app).get(`/api/tasks/${ok.body.thay_the_task_id}`);
    expect(replacement.body.nhiem_vu).toBe("Task thay thế");
    expect(replacement.body.team).toBe(teamName);
    expect(replacement.body.period_id).toBe(periodId);
    // DoD tự ghi chú trỏ ngược lại task gốc đã hủy (vì không gửi dod khi
    // khai báo task thay thế ở request trên).
    expect(replacement.body.dod).toContain("Nhiệm vụ thay thế cho nhiệm vụ đã hủy");
    expect(replacement.body.dod).toContain("Task huy som");
    void teamId;
  });

  it("hủy khi đã trôi qua >= 3/4 thời gian: tự chấm % Đánh giá = 5", async () => {
    const app = createApp();
    const { year, month } = todayPeriodYm();
    const periodId = await findOrMakePeriod(app, year, month);
    const teamName = `Huy tre team ${Date.now()}`;
    await makeTeam(app, teamName, periodId);
    const elapsed = elapsedDaysSincePeriodStart(year, month);
    // total = elapsed / 0.9 -> fraction ~ 0.9 (>= 0.75).
    const deadline = deadlineDaysFromPeriodStart(year, month, Math.max(1, Math.round(elapsed / 0.9)));
    const taskId = await makeTask(app, periodId, teamName, "Task huy tre", deadline);

    const res = await request(app).put(`/api/tasks/${taskId}`).send({ trang_thai: "Hủy" });
    expect(res.status).toBe(200);
    expect(res.body.cpo_danh_gia).toBe(5);
    expect(res.body.khong_tinh_diem).toBeNull();
    // Note ghi rõ "xin hủy ngày bao nhiêu, ai xin hủy" — SSO tắt trong môi
    // trường test nên graderName là null, rơi vào nhánh "không rõ người
    // thực hiện".
    expect(res.body.cpo_comment).toContain("Xin hủy nhiệm vụ ngày");
    expect(res.body.cpo_comment).toContain("không rõ người thực hiện (SSO tắt)");
    expect(res.body.cpo_graded_at).toBeTruthy();
  });

  it("hủy khi đã trôi qua [2/3, 3/4): tự chấm % Đánh giá = 10", async () => {
    const app = createApp();
    const { year, month } = todayPeriodYm();
    const periodId = await findOrMakePeriod(app, year, month);
    const teamName = `Huy 23 team ${Date.now()}`;
    await makeTeam(app, teamName, periodId);
    const elapsed = elapsedDaysSincePeriodStart(year, month);
    // total = elapsed / 0.7 -> fraction ~ 0.7 (nằm trong [0.667, 0.75)).
    const deadline = deadlineDaysFromPeriodStart(year, month, Math.max(1, Math.round(elapsed / 0.7)));
    const taskId = await makeTask(app, periodId, teamName, "Task huy 2/3", deadline);

    const res = await request(app).put(`/api/tasks/${taskId}`).send({ trang_thai: "Hủy" });
    expect(res.status).toBe(200);
    expect(res.body.cpo_danh_gia).toBe(10);
  });

  it("hủy khi đã trôi qua [1/4, 2/3): tự chấm % Đánh giá = 50", async () => {
    const app = createApp();
    const { year, month } = todayPeriodYm();
    const periodId = await findOrMakePeriod(app, year, month);
    const teamName = `Huy 14 team ${Date.now()}`;
    await makeTeam(app, teamName, periodId);
    const elapsed = elapsedDaysSincePeriodStart(year, month);
    // total = elapsed / 0.4 -> fraction ~ 0.4 (nằm trong [0.25, 0.667)).
    const deadline = deadlineDaysFromPeriodStart(year, month, Math.max(1, Math.round(elapsed / 0.4)));
    const taskId = await makeTask(app, periodId, teamName, "Task huy 1/4", deadline);

    const res = await request(app).put(`/api/tasks/${taskId}`).send({ trang_thai: "Hủy" });
    expect(res.status).toBe(200);
    expect(res.body.cpo_danh_gia).toBe(50);
  });

  it("task không có Deadline: giữ hành vi cũ, không phạt điểm, không chặn", async () => {
    const app = createApp();
    const { year, month } = todayPeriodYm();
    const periodId = await findOrMakePeriod(app, year, month);
    const teamName = `Huy no deadline team ${Date.now()}`;
    await makeTeam(app, teamName, periodId);
    const taskId = await makeTask(app, periodId, teamName, "Task huy khong deadline");

    const res = await request(app).put(`/api/tasks/${taskId}`).send({ trang_thai: "Hủy" });
    expect(res.status).toBe(200);
    expect(res.body.trang_thai).toBe("Hủy");
    expect(res.body.khong_tinh_diem).toBe("Không tính điểm");
    expect(res.body.cpo_danh_gia).toBeNull();
  });

  it("chỉ xử lý ở lần đầu chuyển vào Hủy — lưu lại khi đã Hủy không ghi đè % Đánh giá đã sửa", async () => {
    const app = createApp();
    const { year, month } = todayPeriodYm();
    const periodId = await findOrMakePeriod(app, year, month);
    const teamName = `Huy giu diem team ${Date.now()}`;
    await makeTeam(app, teamName, periodId);
    const elapsed = elapsedDaysSincePeriodStart(year, month);
    const deadline = deadlineDaysFromPeriodStart(year, month, Math.max(1, Math.round(elapsed / 0.9)));
    const taskId = await makeTask(app, periodId, teamName, "Task huy giu diem", deadline);

    const cancelled = await request(app).put(`/api/tasks/${taskId}`).send({ trang_thai: "Hủy" });
    expect(cancelled.body.cpo_danh_gia).toBe(5);

    // CPO sửa lại điểm tay sau khi hệ thống tự chấm.
    await request(app).put(`/api/tasks/${taskId}`).send({ cpo_danh_gia: 30 });

    // Lưu lại tiến độ lần nữa trong lúc vẫn đang Hủy -> KHÔNG được ghi đè
    // lại % Đánh giá đã sửa (chỉ xử lý ở lần đầu chuyển vào Hủy).
    const resaved = await request(app).put(`/api/tasks/${taskId}`).send({ trang_thai: "Hủy", tien_do: "cập nhật" });
    expect(resaved.body.cpo_danh_gia).toBe(30);
  });
});
