import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Circle, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import {
  addTree, fetchCities, fetchNextReview, fetchStats, fetchTrees, importCsv, patchTree,
  type Bbox, type City, type Status, type Tree,
} from "./api";

const COLORS: Record<Status, string> = { detected: "#e09f1f", confirmed: "#2e8b57", rejected: "#999" };

function MapEvents(props: { onBounds: (b: Bbox) => void; onClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  const report = () => {
    const b = map.getBounds();
    props.onBounds([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]);
  };
  useEffect(report, []); // eslint-disable-line react-hooks/exhaustive-deps
  useMapEvents({ moveend: report, click: (e) => props.onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FlyTo({ tree }: { tree: Tree | null }) {
  const map = useMap();
  useEffect(() => { if (tree) map.flyTo([tree.lat, tree.lng], Math.max(map.getZoom(), 19), { duration: 0.5 }); }, [tree?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function App() {
  const { data: cities } = useQuery({ queryKey: ["cities"], queryFn: fetchCities });
  const [slug, setSlug] = useState<string | null>(null);
  const city = cities?.find((c) => c.slug === (slug ?? cities[0]?.slug));
  if (!city) return <p className="loading">Loading…</p>;
  return <CityView key={city.slug} city={city} cities={cities!} onCity={setSlug} />;
}

function CityView({ city, cities, onCity }: { city: City; cities: City[]; onCity: (s: string) => void }) {
  const qc = useQueryClient();
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [minConf, setMinConf] = useState(0);
  const [selected, setSelected] = useState<Tree | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [msg, setMsg] = useState("");

  const trees = useQuery({
    queryKey: ["trees", city.slug, bbox, minConf], enabled: !!bbox,
    queryFn: () => fetchTrees(city.slug, bbox!, minConf), placeholderData: (p) => p,
  });
  const stats = useQuery({
    queryKey: ["stats", city.slug, bbox], enabled: !!bbox,
    queryFn: () => fetchStats(city.slug, bbox!), placeholderData: (p) => p,
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["trees"] }); qc.invalidateQueries({ queryKey: ["stats"] }); };

  const update = useMutation({
    mutationFn: (v: { id: number; patch: Parameters<typeof patchTree>[1] }) => patchTree(v.id, v.patch),
    onSuccess: (t) => { setSelected(t.status === "rejected" ? null : t); refresh(); },
  });
  const add = useMutation({
    mutationFn: (p: { lat: number; lng: number }) => addTree(city.slug, p),
    onSuccess: (t) => { setSelected(t); setAddMode(false); refresh(); },
  });
  const nextReview = async () => {
    try { setSelected(await fetchNextReview(city.slug)); setMsg(""); }
    catch { setMsg("Review queue is empty 🎉"); }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = await importCsv(city.slug, await f.text());
      setMsg(`Imported ${r.imported} trees (${r.skipped} skipped)`);
      refresh(); qc.invalidateQueries({ queryKey: ["cities"] });
    } catch (e) { setMsg(`Import failed: ${(e as Error).message}`); }
  };

  const s = stats.data;
  return (
    <div className="layout">
      <aside>
        <h1>🌳 Arborary</h1>
        <select value={city.slug} onChange={(e) => onCity(e.target.value)}>
          {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name} ({c.trees})</option>)}
        </select>

        <section>
          <h2>In view</h2>
          {s ? (
            <dl>
              <dt>Trees</dt><dd>{s.total.toLocaleString()}</dd>
              <dt>Density</dt><dd>{Math.round(s.treesPerKm2).toLocaleString()} / km²</dd>
              <dt>Canopy cover</dt><dd>{(s.canopyCover * 100).toFixed(1)}%</dd>
              <dt>Mean crown</dt><dd>{s.meanCanopyM.toFixed(1)} m</dd>
              <dt>Reviewed</dt><dd>{s.total ? Math.round((s.reviewed / s.total) * 100) : 0}%</dd>
            </dl>
          ) : <p>…</p>}
          {s?.topSpecies.map((t) => (
            <div key={t.species} className="bar">
              <span>{t.species}</span>
              <i style={{ width: `${(t.count / s.topSpecies[0].count) * 100}%` }} />
              <b>{t.count}</b>
            </div>
          ))}
        </section>

        <section>
          <h2>Filters</h2>
          <label>Min detector confidence: {minConf.toFixed(2)}
            <input type="range" min={0} max={1} step={0.05} value={minConf} onChange={(e) => setMinConf(+e.target.value)} />
          </label>
          <p className="legend">
            {(["detected", "confirmed"] as Status[]).map((k) => <span key={k}><u style={{ background: COLORS[k] }} />{k}</span>)}
          </p>
        </section>

        <section>
          <h2>Curate</h2>
          <button onClick={nextReview}>Review next uncertain tree</button>
          <button className={addMode ? "on" : ""} onClick={() => setAddMode(!addMode)}>
            {addMode ? "Click the map to place tree…" : "Add a tree"}
          </button>
          <label className="file">Import CSV (lat,lng,species,canopy_m,confidence)
            <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {msg && <p className="msg">{msg}</p>}
        </section>

        {selected && <TreeEditor tree={selected} onPatch={(patch) => update.mutate({ id: selected.id, patch })} onClose={() => setSelected(null)} onNext={nextReview} />}
      </aside>

      <MapContainer center={[city.lat, city.lng]} zoom={city.zoom} maxZoom={20} className={addMode ? "map adding" : "map"}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        <MapEvents onBounds={setBbox} onClick={(lat, lng) => addMode && add.mutate({ lat, lng })} />
        <FlyTo tree={selected} />
        {trees.data?.map((t) => (
          <Circle key={`${t.id}-${t.status}-${t.canopy_m}`} center={[t.lat, t.lng]} radius={t.canopy_m / 2}
            pathOptions={{ color: COLORS[t.status], weight: t.id === selected?.id ? 3 : 1, fillOpacity: 0.35 + 0.4 * t.confidence }}
            eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); setSelected(t); } }} />
        ))}
      </MapContainer>
    </div>
  );
}

function TreeEditor(props: { tree: Tree; onPatch: (p: { status?: Status; species?: string | null; canopy_m?: number }) => void; onClose: () => void; onNext: () => void }) {
  const t = props.tree;
  const [species, setSpecies] = useState(t.species ?? "");
  const [canopy, setCanopy] = useState(String(t.canopy_m));
  useEffect(() => { setSpecies(t.species ?? ""); setCanopy(String(t.canopy_m)); }, [t.id, t.species, t.canopy_m]);
  return (
    <section className="editor">
      <h2>Tree #{t.id} <button className="x" onClick={props.onClose}>×</button></h2>
      <p>{t.status} · {t.source} · confidence {t.confidence.toFixed(2)}</p>
      <label>Species <input value={species} onChange={(e) => setSpecies(e.target.value)} /></label>
      <label>Crown diameter (m) <input type="number" min={0.5} max={60} step={0.5} value={canopy} onChange={(e) => setCanopy(e.target.value)} /></label>
      <div className="row">
        <button onClick={() => props.onPatch({ status: "confirmed", species: species || null, canopy_m: Number(canopy) || t.canopy_m })}>✓ Confirm</button>
        <button onClick={() => props.onPatch({ status: "rejected" })}>✗ Not a tree</button>
        <button onClick={props.onNext}>Next →</button>
      </div>
    </section>
  );
}
