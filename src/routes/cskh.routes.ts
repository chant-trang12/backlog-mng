import { Router } from "express";
import express from "express";
import {
  createIncidentHandler,
  deleteIncidentHandler,
  downloadIncidentTemplateHandler,
  importIncidentsHandler,
  listIncidentsHandler,
  updateIncidentHandler,
} from "../controllers/incident.controller.js";
import {
  addIncidentMemberHandler,
  deleteIncidentMemberHandler,
  haKiIncidentMemberHandler,
  listIncidentMembersHandler,
  tangKiIncidentMemberHandler,
  truDiemIncidentMemberHandler,
} from "../controllers/incident.controller.js";
import {
  createTicketHandler,
  deleteTicketHandler,
  listTicketsHandler,
  updateTicketHandler,
} from "../controllers/ticket.controller.js";
import {
  createCreationRateHandler,
  deleteCreationRateHandler,
  listCreationRatesHandler,
  updateCreationRateHandler,
} from "../controllers/creationRate.controller.js";

const router = Router();

// Route import đặt TRƯỚC "/incidents/:id" để không bị ":id" bắt hết
router.get("/incidents/import-template", downloadIncidentTemplateHandler);
router.post(
  "/incidents/import",
  express.raw({ type: () => true, limit: "20mb" }),
  importIncidentsHandler,
);
router.post("/incidents", createIncidentHandler);
router.get("/incidents", listIncidentsHandler);
router.put("/incidents/:id", updateIncidentHandler);
router.delete("/incidents/:id", deleteIncidentHandler);

// Nhân sự liên quan sự cố (popup "Nhân sự liên quan")
router.get("/incidents/:id/members", listIncidentMembersHandler);
router.post("/incidents/:id/members", addIncidentMemberHandler);
router.delete("/incident-members/:id", deleteIncidentMemberHandler);
router.post("/incident-members/:id/ha-ki", haKiIncidentMemberHandler);
router.post("/incident-members/:id/tang-ki", tangKiIncidentMemberHandler);
router.post("/incident-members/:id/tru-diem", truDiemIncidentMemberHandler);

router.post("/tickets", createTicketHandler);
router.get("/tickets", listTicketsHandler);
router.put("/tickets/:id", updateTicketHandler);
router.delete("/tickets/:id", deleteTicketHandler);

router.post("/creation-rates", createCreationRateHandler);
router.get("/creation-rates", listCreationRatesHandler);
router.put("/creation-rates/:id", updateCreationRateHandler);
router.delete("/creation-rates/:id", deleteCreationRateHandler);

export default router;
