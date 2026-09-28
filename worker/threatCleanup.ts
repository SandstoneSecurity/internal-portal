/**
 * Statements that remove threat-modelling records for a whole client or a
 * single site (`where` is "client_id = ?" or "id = ?" on client_sites, with
 * the matching id). Children go first so nothing is left orphaned.
 */
export function deleteThreatModel(db: D1Database, where: "client_id = ?" | "site_id = ?", id: number): D1PreparedStatement[] {
  const sites = where === "client_id = ?" ? `SELECT id FROM client_sites WHERE client_id = ?` : `SELECT ?`;
  const rows = where === "client_id = ?" ? `client_id = ?` : `site_id = ?`;
  return [
    db.prepare(`DELETE FROM site_file_chunks WHERE file_id IN (SELECT id FROM site_files WHERE site_id IN (${sites}))`).bind(id),
    db.prepare(`UPDATE site_levels SET plan_file_id = NULL WHERE site_id IN (${sites})`).bind(id),
    db.prepare(`DELETE FROM site_files WHERE site_id IN (${sites})`).bind(id),
    db.prepare(`DELETE FROM tm_scenarios WHERE ${rows}`).bind(id),
    db.prepare(`DELETE FROM tm_controls WHERE ${rows}`).bind(id),
    db.prepare(`DELETE FROM tm_incidents WHERE ${rows}`).bind(id),
    db.prepare(`UPDATE tm_elements SET zone_id = NULL, level_id = NULL WHERE site_id IN (${sites})`).bind(id),
    db.prepare(`DELETE FROM tm_elements WHERE site_id IN (${sites})`).bind(id),
    db.prepare(`DELETE FROM site_levels WHERE site_id IN (${sites})`).bind(id),
    db.prepare(`DELETE FROM client_sites WHERE id IN (${sites})`).bind(id),
  ];
}
