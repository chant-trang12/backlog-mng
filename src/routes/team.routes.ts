import { Router } from "express";
import {
  createTeamHandler,
  deleteTeamHandler,
  listTeamsHandler,
} from "../controllers/team.controller.js";

const router = Router();

router.post("/teams", createTeamHandler);
router.get("/teams", listTeamsHandler);
router.delete("/teams/:id", deleteTeamHandler);

export default router;
