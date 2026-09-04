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

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const [created] = await db("tickets")
    .insert({
      period_id: input.period_id,
      team_id: input.team_id,
      tong_ticket: input.tong_ticket ?? 0,
      ticket_vuot: input.ticket_vuot ?? 0,
      dung_han: input.dung_han ?? 0,
    })
    .returning("*");
  return created as Ticket;
}

export async function getTicket(id: number): Promise<Ticket | undefined> {
  const row = await db("tickets").where({ id }).first();
  return row as Ticket | undefined;
}

export async function listTickets(): Promise<TicketWithTeam[]> {
  const rows = (await db("tickets")
    .join("teams", "teams.id", "tickets.team_id")
    .join("periods", "periods.id", "tickets.period_id")
    .select(
      "tickets.*",
      "teams.name as team_name",
      "periods.label as period_label",
    )
    .orderBy("periods.year", "desc")
    .orderBy("periods.month", "desc")
    .orderBy("teams.name", "asc")
    .orderBy("tickets.id", "desc")) as (Ticket & { team_name: string; period_label: string })[];

  return rows.map(withRate);
}

export async function updateTicket(id: number, input: UpdateTicketInput): Promise<Ticket | undefined> {
  const existing = await getTicket(id);
  if (!existing) return undefined;

  const merged = {
    period_id: input.period_id ?? existing.period_id,
    team_id: input.team_id ?? existing.team_id,
    tong_ticket: input.tong_ticket ?? existing.tong_ticket,
    ticket_vuot: input.ticket_vuot ?? existing.ticket_vuot,
    dung_han: input.dung_han ?? existing.dung_han,
  };

  const [updated] = await db("tickets")
    .where({ id })
    .update({
      ...merged,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated as Ticket;
}

export async function deleteTicket(id: number): Promise<boolean> {
  const count = await db("tickets").where({ id }).delete();
  return count > 0;
}
