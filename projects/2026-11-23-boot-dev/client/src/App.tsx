import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { sql } from "@codemirror/lang-sql";
import { api, type Me, type RunResult } from "./api";

function Login({ onLogin }: { onLogin: () => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  return (
    <form className="card login" onSubmit={async (e) => {
      e.preventDefault();
      try { await api.login(name); localStorage.setItem("user", name.trim()); onLogin(); } catch (x) { setErr((x as Error).message); }
    }}>
      <h2>Pick a hero name</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. gopher42" autoFocus />
      <button>Start learning</button>
      {err && <p className="bad">{err}</p>}
    </form>
  );
}

function Header({ me }: { me: Me }) {
  return (
    <header>
      <b>⚔️ Bootcamp</b>
      <span>{me.name}</span>
      <span title="Level">Lv {me.level}</span>
      <span className="bar"><i style={{ width: `${Math.round(me.progress * 100)}%` }} /></span>
      <span>{me.xp} XP</span>
      <span title="Day streak">🔥 {me.streak}</span>
      <button className="link" onClick={() => { localStorage.removeItem("user"); location.reload(); }}>Log out</button>
    </header>
  );
}

function LessonView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: lesson } = useQuery({ queryKey: ["lesson", id], queryFn: () => api.lesson(id) });
  const [code, setCode] = useState("");
  const [res, setRes] = useState<RunResult | null>(null);
  useEffect(() => { if (lesson) { setCode(lesson.starter); setRes(null); } }, [lesson]);
  if (!lesson) return <p>Loading…</p>;
  return (
    <div className="lesson">
      <button className="link" onClick={onBack}>← Back</button>
      <h2>{lesson.title} <small>+{lesson.xp} XP</small></h2>
      <p>{lesson.instructions}</p>
      <CodeMirror value={code} height="260px" theme="dark" extensions={[lesson.kind === "sql" ? sql() : javascript()]} onChange={setCode} />
      <button onClick={async () => { const r = await api.run(id, code); setRes(r); qc.invalidateQueries({ queryKey: ["me"] }); qc.invalidateQueries({ queryKey: ["board"] }); }}>▶ Run &amp; submit</button>
      {res && (
        <div className="card">
          <h3 className={res.passed ? "ok" : "bad"}>{res.passed ? `All tests passed!${res.awarded ? ` +${res.awarded} XP` : ""}` : "Not quite yet"}</h3>
          <ul>{res.results.map((r, i) => <li key={i} className={r.passed ? "ok" : "bad"}><code>{r.name}</code> {r.passed ? "✓" : `✗ ${r.detail ?? ""}`}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("user"));
  const [lessonId, setLessonId] = useState<string | null>(null);
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, enabled: loggedIn, retry: false });
  const courses = useQuery({ queryKey: ["courses"], queryFn: api.courses });
  const board = useQuery({ queryKey: ["board"], queryFn: api.leaderboard });
  if (!loggedIn || me.isError) return <main><Login onLogin={() => { setLoggedIn(true); me.refetch(); }} /></main>;
  if (!me.data) return <main>Loading…</main>;
  return (
    <>
      <Header me={me.data} />
      <main>
        {lessonId ? <LessonView id={lessonId} onBack={() => setLessonId(null)} /> : (
          <>
            {courses.data?.map((c) => (
              <section key={c.id} className="card">
                <h2>{c.title}</h2>
                <p>{c.description}</p>
                <ol>{c.lessons.map((l) => (
                  <li key={l.id}><button className="link" onClick={() => setLessonId(l.id)}>{l.title}</button> <small>{l.xp} XP</small> {me.data.completed.includes(l.id) && <span className="ok">✓</span>}</li>
                ))}</ol>
              </section>
            ))}
            <section className="card">
              <h2>Leaderboard</h2>
              <ol>{board.data?.map((b) => <li key={b.name}>{b.name} — {b.xp} XP ({b.lessons} lessons)</li>)}</ol>
            </section>
          </>
        )}
      </main>
    </>
  );
}
