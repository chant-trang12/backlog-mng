import type { Request, Response } from "express";
import { createTicket, deleteTicket, listTickets, updateTicket } from "../services/ticket.service.js";
import { getTeam } from "../services/team.service.js";
import { getPeriod } from "../services/period.service.js";

export async function createTicketHandler(req: Request, res: Response) {
  const { tong_ticket, ticket_vuot, dung_han, team_id, period_id } = req.body ?? {};
  const teamId = Number(team_id);
  if (!getTeam(teamId)) {
    return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
  }
  const periodId = Number(period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const ticket = createTicket({
    period_id: periodId,
    team_id: teamId,
    tong_ticket: tong_ticket !== undefined ? Number(tong_ticket) : undefined,
    ticket_vuot: ticket_vuot !== undefined ? Number(ticket_vuot) : undefined,
    dung_han: dung_han !== undefined ? Number(dung_han) : undefined,
  });
  res.status(201).json(ticket);
}

export async function listTicketsHandler(_req: Request, res: Response) {
  res.json(listTickets());
}

export async function updateTicketHandler(req: Request, res: Response) {
  const { tong_ticket, ticket_vuot, dung_han, team_id, period_id } = req.body ?? {};
  if (team_id !== undefined && !getTeam(Number(team_id))) {
    return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
  }
  if (period_id !== undefined && !getPeriod(Number(period_id))) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const ticket = updateTicket(Number(req.params.id), {
    team_id: team_id !== undefined ? Number(team_id) : undefined,
    period_id: period_id !== undefined ? Number(period_id) : undefined,
    tong_ticket: tong_ticket !== undefined ? Number(tong_ticket) : undefined,
    ticket_vuot: ticket_vuot !== undefined ? Number(ticket_vuot) : undefined,
    dung_han: dung_han !== undefined ? Number(dung_han) : undefined,
  });
  if (!ticket) return res.status(404).json({ error: "Không tìm thấy ticket" });
  res.json(ticket);
}

export async function deleteTicketHandler(req: Request, res: Response) {
  const ok = deleteTicket(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy ticket" });
  res.status(204).send();
}
