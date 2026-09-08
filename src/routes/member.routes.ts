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

const router = Router();

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
