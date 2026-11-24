import express from "express";
import cors from "cors";
import { z } from "zod";
import type Database from "better-sqlite3";
import { courses, lessons, getLesson } from "./lessons.js";
import { judge } from "./judge.js";
import { levelForXp, streak } from "./xp.js";

const nameSchema = z.string().trim().min(1).max(30).regex(/^[\w .-]+$/);

export function createApp(db: Database.Database, today = () => new Date().toISOString().slice(0, 10)) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "50kb" }));

  const profile = (name: string) => {
    const rows = db.prepare("SELECT lesson_id, xp, day FROM completions WHERE user = ?").all(name) as { lesson_id: string; xp: number; day: string }[];
    const xp = rows.reduce((s, r) => s + r.xp, 0);
    return { name, xp, ...levelForXp(xp), streak: streak(rows.map((r) => r.day), today()), completed: rows.map((r) => r.lesson_id) };
  };

  app.post("/api/login", (req, res) => {
    const p = nameSchema.safeParse(req.body?.name);
    if (!p.success) return res.status(400).json({ error: "Invalid name" });
    db.prepare("INSERT OR IGNORE INTO users (name) VALUES (?)").run(p.data);
    res.json(profile(p.data));
  });

  const userOf = (req: express.Request) => {
    const p = nameSchema.safeParse(req.header("x-user"));
    if (!p.success) return null;
    const exists = db.prepare("SELECT 1 FROM users WHERE name = ?").get(p.data);
    return exists ? p.data : null;
  };

  app.get("/api/me", (req, res) => {
    const u = userOf(req);
    u ? res.json(profile(u)) : res.status(401).json({ error: "Not logged in" });
  });

  app.get("/api/courses", (_req, res) =>
    res.json(courses.map((c) => ({ ...c, lessons: lessons.filter((l) => l.course === c.id).map(({ id, title, xp }) => ({ id, title, xp })) }))));

  app.get("/api/lessons/:id", (req, res) => {
    const l = getLesson(req.params.id);
    if (!l) return res.status(404).json({ error: "Not found" });
    res.json({ id: l.id, course: l.course, title: l.title, xp: l.xp, kind: l.kind, instructions: l.instructions, starter: l.starter });
  });

  app.post("/api/lessons/:id/run", (req, res) => {
    const l = getLesson(req.params.id);
    if (!l) return res.status(404).json({ error: "Not found" });
    const code = z.string().max(10000).safeParse(req.body?.code);
    if (!code.success) return res.status(400).json({ error: "Invalid code" });
    const result = judge(l, code.data);
    let awarded = 0;
    const u = userOf(req);
    if (result.passed && u) {
      const r = db.prepare("INSERT OR IGNORE INTO completions (user, lesson_id, xp, day) VALUES (?,?,?,?)").run(u, l.id, l.xp, today());
      if (r.changes) awarded = l.xp;
    }
    res.json({ ...result, awarded, me: u ? profile(u) : null });
  });

  app.get("/api/leaderboard", (_req, res) => {
    const rows = db.prepare("SELECT user AS name, SUM(xp) AS xp, COUNT(*) AS lessons FROM completions GROUP BY user ORDER BY xp DESC, name LIMIT 20").all();
    res.json(rows);
  });

  return app;
}
