import express, { Router } from "express";
import {
  createMemberHandler,
  deleteMemberHandler,
  deleteSelectedMembersHandler,
  downloadMemberTemplateHandler,
  importMembersHandler,
  listMembersHandler,
  updateMemberHandler,
} from "../controllers/member.controller.js";

import { listUserCodes } from "../services/user.service.js";

const router = Router();

// Tên -> Mã nhân viên (khai báo ở Quản lý User) — mọi tài khoản đã đăng nhập đọc được,
// dùng tự điền Mã NV ở form Làm thêm giờ / KQ xếp loại CBNV.
router.get("/user-codes", async (_req, res) => {
  res.json(await listUserCodes());
});

// Đặt trước "/members/:id" để tránh xung đột path.
router.post("/members/delete-selected", deleteSelectedMembersHandler);
router.get("/members/import-template", downloadMemberTemplateHandler);
// Body là bytes thô của file .xlsx (client gửi File trực tiếp, không qua
// multipart) — express.raw() riêng cho route này, không đụng express.json().
router.post(
  "/members/import",
  express.raw({ type: () => true, limit: "20mb" }),
  importMembersHandler,
);

router.post("/members", createMemberHandler);
router.get("/members", listMembersHandler);
router.put("/members/:id", updateMemberHandler);
router.delete("/members/:id", deleteMemberHandler);

export default router;
