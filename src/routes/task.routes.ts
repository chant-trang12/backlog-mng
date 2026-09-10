import express, { Router } from "express";
import {
  createTaskHandler,
  deleteTaskHandler,
  downloadTaskTemplateHandler,
  exportBacklogHandler,
  getTaskHandler,
  importTasksHandler,
  listTasksHandler,
  markTasksNoScoreHandler,
  markTasksTonHandler,
  unmarkTasksNoScoreHandler,
  moveTasksToNextMonthHandler,
  updateTaskHandler,
} from "../controllers/task.controller.js";

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
router.post("/tasks/mark-no-score", markTasksNoScoreHandler);
router.post("/tasks/unmark-no-score", unmarkTasksNoScoreHandler);
router.post("/tasks/mark-ton", markTasksTonHandler);
router.post("/periods/:periodId/tasks", createTaskHandler);
router.get("/periods/:periodId/tasks", listTasksHandler);

router.get("/tasks/:id", getTaskHandler);
router.put("/tasks/:id", updateTaskHandler);
router.delete("/tasks/:id", deleteTaskHandler);

export default router;
