import express, { Router } from "express";
import {
  createTaskHandler,
  deleteSelectedTasksHandler,
  deleteTaskHandler,
  downloadTaskTemplateHandler,
  exportBacklogHandler,
  getTaskHandler,
  importTasksHandler,
  listTasksHandler,
  markTasksNoScoreHandler,
  markTasksTonHandler,
  unmarkTasksNoScoreHandler,
  unmarkTasksTonHandler,
  moveTasksToNextMonthHandler,
  updateTaskGradeHandler,
  updateTaskHandler,
} from "../controllers/task.controller.js";
import {
  createTaskMemberHandler,
  deleteTaskMemberHandler,
  listCanXuLyGapHandler,
  listKpiTheoTaskHandler,
  listTaskMembersHandler,
  updateTaskMemberHandler,
} from "../controllers/taskMember.controller.js";
import {
  createGradeDeductionHandler,
  listGradeDeductionsHandler,
} from "../controllers/gradeDeduction.controller.js";

const router = Router();

// Đặt trước "/tasks/:id" để tránh xung đột path.
router.get("/periods/:periodId/tasks/export", exportBacklogHandler);
router.get("/periods/:periodId/tasks/import-template", downloadTaskTemplateHandler);
// Body là bytes thô .xlsx (client gửi File trực tiếp) — express.raw() riêng.
router.post(
  "/periods/:periodId/tasks/import",
  express.raw({ type: () => true, limit: "20mb" }),
  importTasksHandler,
);
router.post("/periods/:periodId/tasks/move-to-next-month", moveTasksToNextMonthHandler);
router.post("/tasks/delete-selected", deleteSelectedTasksHandler);
router.post("/tasks/mark-no-score", markTasksNoScoreHandler);
router.post("/tasks/unmark-no-score", unmarkTasksNoScoreHandler);
router.post("/tasks/mark-ton", markTasksTonHandler);
router.post("/tasks/unmark-ton", unmarkTasksTonHandler);
router.post("/periods/:periodId/tasks", createTaskHandler);
router.get("/periods/:periodId/tasks", listTasksHandler);

router.get("/tasks/:id", getTaskHandler);
router.put("/tasks/:id", updateTaskHandler);
// Chấm điểm — route riêng, đặt TRƯỚC "/tasks/:id" chung không xung đột
// (Express match theo path đầy đủ) — chỉ admin/bgd, chặn ở requireWrite
// theo path "/tasks/:id/grade" (auth.middleware.ts).
router.put("/tasks/:id/grade", updateTaskGradeHandler);
router.delete("/tasks/:id", deleteTaskHandler);

// "Trừ điểm cá nhân" ở popup Chấm điểm — trừ vào "Điểm cá nhân (Mặc định)",
// dùng CHUNG quyền "nhiem_vu_cham_diem" với "/tasks/:id/grade" (cùng popup
// — xem TASK_GRADE_PATH, auth.middleware.ts).
router.get("/tasks/:taskId/grade-deductions", listGradeDeductionsHandler);
router.post("/tasks/:taskId/grade-deductions", createGradeDeductionHandler);

// Nhân sự tham gia task (VD 1 task dự án phần mềm có SM, PO, Dev, QA...).
router.get("/tasks/:taskId/members", listTaskMembersHandler);
router.post("/tasks/:taskId/members", createTaskMemberHandler);
// Đặt trước "/task-members/:id" (không khớp pattern :id vì có "/" sau nên
// không xung đột thật, nhưng đặt trước cho dễ đọc).
router.get("/task-members/can-xu-ly-gap", listCanXuLyGapHandler);
router.put("/task-members/:id", updateTaskMemberHandler);
router.delete("/task-members/:id", deleteTaskMemberHandler);

// KPI nhân sự tính trực tiếp theo task, không chia team (phòng ban bật
// departments.cach_tinh_kpi = "theo_task").
router.get("/kpi-theo-task", listKpiTheoTaskHandler);

export default router;
