import { Router } from "express";
import { deleteUserHandler, listUsersHandler, updateUserHandler } from "../controllers/user.controller.js";

const router = Router();

// Chỉ mount router này sau requireAdmin (app.ts) — không tạo user tay qua
// API (user cục bộ chỉ tự tạo khi đăng nhập SSO lần đầu, xem
// upsertUserFromSso), nên không có POST /api/users.
router.get("/users", listUsersHandler);
router.put("/users/:id", updateUserHandler);
router.delete("/users/:id", deleteUserHandler);

export default router;
