import type { DB } from "./db.js";

export interface ShowtimeQuery {
  area?: string;
  cinemaId?: number;
  filmId?: number;
  format?: string;
  date?: string; // YYYY-MM-DD
  after?: string; // HH:MM, only showtimes starting at or after this time
}

export interface ShowtimeRow {
  id: number;
  startsAt: string;
  format: string;
  cinema: string;
  area: string;
  film: string;
  runtimeMin: number | null;
}

/** Search showtimes by area / cinema / film / format / date / earliest time. */
export function searchShowtimes(db: DB, q: ShowtimeQuery): ShowtimeRow[] {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (q.area) { where.push("c.area = @area"); params.area = q.area; }
  if (q.cinemaId) { where.push("c.id = @cinemaId"); params.cinemaId = q.cinemaId; }
  if (q.filmId) { where.push("f.id = @filmId"); params.filmId = q.filmId; }
  if (q.format) { where.push("s.format = @format"); params.format = q.format; }
  if (q.date) { where.push("substr(s.starts_at, 1, 10) = @date"); params.date = q.date; }
  if (q.after) { where.push("substr(s.starts_at, 12, 5) >= @after"); params.after = q.after; }
  const sql = `
    SELECT s.id, s.starts_at AS startsAt, s.format, c.name AS cinema, c.area,
           f.title AS film, f.runtime_min AS runtimeMin
    FROM showtimes s
    JOIN cinemas c ON c.id = s.cinema_id
    JOIN films f ON f.id = s.film_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY s.starts_at, c.name
    LIMIT 500`;
  return db.prepare(sql).all(params) as ShowtimeRow[];
}

export function listAreas(db: DB): string[] {
  return (db.prepare("SELECT DISTINCT area FROM cinemas ORDER BY area").all() as { area: string }[]).map((r) => r.area);
}
export function listCinemas(db: DB, area?: string) {
  return area
    ? db.prepare("SELECT id, name, area FROM cinemas WHERE area = ? ORDER BY name").all(area)
    : db.prepare("SELECT id, name, area FROM cinemas ORDER BY area, name").all();
}
export function listFilms(db: DB) {
  return db.prepare("SELECT id, title, runtime_min AS runtimeMin FROM films ORDER BY title").all();
}
export function listFormats(db: DB): string[] {
  return (db.prepare("SELECT DISTINCT format FROM showtimes ORDER BY format").all() as { format: string }[]).map((r) => r.format);
}
