import { db } from "../db/database.js";
import type {
  CreateTicketInput,
  Ticket,
  TicketWithTeam,
  UpdateTicketInput,
} from "../types/cskh.js";

function withRate(row: Ticket & { team_name: string; period_label: string }): TicketWithTeam {
  return {
    ...row,
    ty_le: row.tong_ticket > 0 ? row.dung_han / row.tong_ticket : 0,
  };
}

export function createTicket(input: CreateTicketInput): Ticket {
  return db
    .prepare(
      `INSERT INTO tickets (period_id, team_id, tong_ticket, ticket_vuot, dung_han) VALUES (?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(
      input.period_id,
      input.team_id,
      input.tong_ticket ?? 0,
      input.ticket_vuot ?? 0,
      input.dung_han ?? 0,
    ) as Ticket;
}

export function getTicket(id: number): Ticket | undefined {
  return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as Ticket | undefined;
}

export function listTickets(): TicketWithTeam[] {
  const rows = db
    .prepare(
      `SELECT tickets.*, teams.name AS team_name, periods.label AS period_label
       FROM tickets
       JOIN teams ON teams.id = tickets.team_id
       JOIN periods ON periods.id = tickets.period_id
       ORDER BY periods.year DESC, periods.month DESC, teams.name ASC, tickets.id DESC`,
    )
    .all() as (Ticket & { team_name: string; period_label: string })[];
  return rows.map(withRate);
}

export function updateTicket(id: number, input: UpdateTicketInput): Ticket | undefined {
  const existing = getTicket(id);
  if (!existing) return undefined;

  const merged = {
    period_id: input.period_id ?? existing.period_id,
    team_id: input.team_id ?? existing.team_id,
    tong_ticket: input.tong_ticket ?? existing.tong_ticket,
    ticket_vuot: input.ticket_vuot ?? existing.ticket_vuot,
    dung_han: input.dung_han ?? existing.dung_han,
  };

  return db
    .prepare(
      `UPDATE tickets SET period_id = ?, team_id = ?, tong_ticket = ?, ticket_vuot = ?, dung_han = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *`,
    )
    .get(
      merged.period_id,
      merged.team_id,
      merged.tong_ticket,
      merged.ticket_vuot,
      merged.dung_han,
      id,
    ) as Ticket;
}

export function deleteTicket(id: number): boolean {
  const result = db.prepare(`DELETE FROM tickets WHERE id = ?`).run(id);
  return result.changes > 0;
}
