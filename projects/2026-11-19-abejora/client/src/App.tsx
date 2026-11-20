import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type HistoryItem } from "./api";
import Tracker from "./Tracker";
import Projects from "./Projects";
import Reports from "./Reports";

const TABS = ["Track", "Projects", "Reports", "History"] as const;

export default function App() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Track");
  const [error, setError] = useState("");
  const history = useQuery({ queryKey: ["history"], queryFn: () => api<HistoryItem[]>("/history") });
  const canUndo = history.data?.some((h) => !h.undone) ?? false;
  const canRedo = history.data?.some((h) => h.undone) ?? false;

  const refresh = () => qc.invalidateQueries();
  const run = async (path: "/undo" | "/redo") => {
    try { setError(""); await api(path, "POST"); refresh(); } catch (e) { setError((e as Error).message); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      void run(e.shiftKey ? "/redo" : "/undo");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="app">
      <header>
        <h1>🐝 Abejora</h1>
        <nav>{TABS.map((t) => <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}</nav>
        <div className="undo">
          <button disabled={!canUndo} onClick={() => run("/undo")} title="Ctrl/Cmd+Z">↶ Undo</button>
          <button disabled={!canRedo} onClick={() => run("/redo")} title="Ctrl/Cmd+Shift+Z">↷ Redo</button>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <main>
        {tab === "Track" && <Tracker />}
        {tab === "Projects" && <Projects />}
        {tab === "Reports" && <Reports />}
        {tab === "History" && (
          <section>
            <h2>Change history</h2>
            <p className="muted">Every change is recorded. Undo/redo steps through this list.</p>
            <ul className="history">
              {history.data?.map((h) => (
                <li key={h.seq} className={h.undone ? "undone" : ""}>
                  <span>{h.label}</span><small>{h.tbl} #{h.rowId} · {new Date(h.at).toLocaleString()}{h.undone ? " · undone" : ""}</small>
                </li>
              ))}
              {history.data?.length === 0 && <li className="muted">No changes yet.</li>}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
