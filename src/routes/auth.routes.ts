import { Router } from "express";
import {
  callbackHandler,
  loginHandler,
  logoutHandler,
  meHandler,
} from "../controllers/auth.controller.js";

const router = Router();

// Mọi route /auth/* phụ thuộc phiên đăng nhập hiện tại — TUYỆT ĐỐI không được
// để trình duyệt cache. Trước đây /auth/me không có Cache-Control (chỉ ETag), nên
// sau khi đăng nhập xong trình duyệt vẫn dùng lại bản trả lời "chưa đăng nhập" cũ
// -> giao diện lại chuyển về /auth/login, rồi /auth/login (đã đăng nhập) trả về
// trang chủ -> lặp vô hạn.
router.use("/auth", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

router.get("/auth/login", loginHandler);
router.get("/auth/callback", callbackHandler);
router.get("/auth/me", meHandler);
router.get("/auth/logout", logoutHandler);

export default router;
