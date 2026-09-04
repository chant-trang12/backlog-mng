import { Router } from "express";
import {
  createMemberHandler,
  deleteMemberHandler,
  deleteSelectedMembersHandler,
  listMembersHandler,
  updateMemberHandler,
} from "../controllers/member.controller.js";

const router = Router();

// Đặt trước "/members/:id" để tránh xung đột path.
router.post("/members/delete-selected", deleteSelectedMembersHandler);

router.post("/members", createMemberHandler);
router.get("/members", listMembersHandler);
router.put("/members/:id", updateMemberHandler);
router.delete("/members/:id", deleteMemberHandler);

export default router;
