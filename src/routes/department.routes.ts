import { Router } from "express";
import {
  createDepartmentHandler,
  deleteDepartmentHandler,
  listDepartmentsHandler,
  updateDepartmentHandler,
} from "../controllers/department.controller.js";

const router = Router();

router.get("/departments", listDepartmentsHandler);
router.post("/departments", createDepartmentHandler);
router.put("/departments/:id", updateDepartmentHandler);
router.delete("/departments/:id", deleteDepartmentHandler);

export default router;
