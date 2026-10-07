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

router.post("/tickets", createTicketHandler);
router.get("/tickets", listTicketsHandler);
router.put("/tickets/:id", updateTicketHandler);
router.delete("/tickets/:id", deleteTicketHandler);

router.post("/creation-rates", createCreationRateHandler);
router.get("/creation-rates", listCreationRatesHandler);
router.put("/creation-rates/:id", updateCreationRateHandler);
router.delete("/creation-rates/:id", deleteCreationRateHandler);

export default router;
