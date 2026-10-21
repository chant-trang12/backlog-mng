import { Router } from "express";
import { listMenuVisibilityHandler, updateMenuVisibilityHandler } from "../controllers/menu.controller.js";

const router = Router();

// Chỉ Admin vào được — requireAdmin áp theo tiền tố "/api/menu-visibility"
// ở app.ts (cùng pattern /api/role-permissions), không lặp lại ở đây.
router.get("/menu-visibility", listMenuVisibilityHandler);
router.put("/menu-visibility", updateMenuVisibilityHandler);

export default router;
