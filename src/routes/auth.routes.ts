import { Router } from "express";
import {
  callbackHandler,
  loginHandler,
  logoutHandler,
  meHandler,
} from "../controllers/auth.controller.js";

const router = Router();

router.get("/auth/login", loginHandler);
router.get("/auth/callback", callbackHandler);
router.get("/auth/me", meHandler);
router.get("/auth/logout", logoutHandler);

export default router;
