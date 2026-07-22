import type { Request, Response } from "express";

import { pool } from "../db/pool";
import { PublicAdvisorRepository } from "../repositories/publicAdvisor.repository";

export async function listPublicAdvisors(_req: Request, res: Response) {
  const rows = await PublicAdvisorRepository.list(pool);
  res.status(200).json({
    data: rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      titleCode: row.title_code,
      department: row.department,
      isDirector: row.is_director,
    })),
  });
}
