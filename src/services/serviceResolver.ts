import { queryDb } from "../db.js";

export async function resolveServiceId(serviceId: string): Promise<string> {
  const result = await queryDb(
    `SELECT service_id FROM knowledge.services WHERE service_id = ? AND deleted_date IS NULL`,
    [serviceId]
  );
  if (result.recordset.length === 0) {
    throw new Error(`Service '${serviceId}' not found`);
  }
  return result.recordset[0].service_id as string;
}
