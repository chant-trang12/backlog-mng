import { Router } from "express";
import {
  addTaskItemMemberHandler,
  createTaskItemHandler,
  deleteTaskItemHandler,
  listTaskItemsHandler,
  listTreoViecHandler,
  removeTaskItemMemberHandler,
  updateTaskItemHandler,
  updateTaskItemMemberHandler,
} from "../controllers/taskItem.controller.js";

const router = Router();

// Đặt trước "/tasks/:taskId/items" không xung đột (path khác hẳn), nhưng
// đặt gần nhau cho dễ đọc — "Việc đang Treo" cho Trang chủ.
router.get("/task-items/treo", listTreoViecHandler);

router.get("/tasks/:taskId/items", listTaskItemsHandler);
router.post("/tasks/:taskId/items", createTaskItemHandler);
router.put("/task-items/:id", updateTaskItemHandler);
router.delete("/task-items/:id", deleteTaskItemHandler);

router.post("/task-items/:id/members", addTaskItemMemberHandler);
router.put("/task-item-members/:id", updateTaskItemMemberHandler);
router.delete("/task-item-members/:id", removeTaskItemMemberHandler);

export default router;
