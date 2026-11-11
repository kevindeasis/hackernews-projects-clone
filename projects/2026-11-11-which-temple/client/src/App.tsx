import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { fetchFacets, fetchRandom, fetchTemples, type Filter, type Temple } from "./api";

// Leaflet's default marker icons break under bundlers; use the CDN copies.
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function FlyTo({ t }: { t: Temple | null }) {
  const map = useMap();
  if (t) map.flyTo([t.lat, t.lng], 8);
  return null;
}

export function App() {
  const [filter, setFilter] = useState<Filter>({ q: "", state: "", tradition: "" });
  const [selected, setSelected] = useState<Temple | null>(null);
  const facets = useQuery({ queryKey: ["facets"], queryFn: fetchFacets });
  const temples = useQuery({ queryKey: ["temples", filter], queryFn: () => fetchTemples(filter) });
  const set = (k: keyof Filter) => (e: { target: { value: string } }) => setFilter({ ...filter, [k]: e.target.value });

  const surprise = async () => {
    try { setSelected(await fetchRandom(filter)); } catch { setSelected(null); }
  };

  return (
    <div className="layout">
      <aside>
        <h1>Which Temple?</h1>
        <button className="primary" onClick={surprise}>Show me a random temple</button>
        <input placeholder="Search name, deity, city…" value={filter.q} onChange={set("q")} />
        <select value={filter.state} onChange={set("state")}>
          <option value="">All states</option>
          {facets.data?.states.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filter.tradition} onChange={set("tradition")}>
          <option value="">All traditions</option>
          {facets.data?.traditions.map((s) => <option key={s}>{s}</option>)}
        </select>
        {selected && (
          <section className="detail">
            <h2>{selected.name}</h2>
            <p className="meta">{selected.deity} · {selected.city}, {selected.state} · {selected.tradition}</p>
            <p>{selected.description}</p>
          </section>
        )}
        <p className="count">{temples.data?.length ?? 0} temples</p>
        <ul>
          {temples.data?.map((t) => (
            <li key={t.id} className={t.id === selected?.id ? "active" : ""} onClick={() => setSelected(t)}>
              <strong>{t.name}</strong><span>{t.city}, {t.state}</span>
            </li>
          ))}
        </ul>
      </aside>
      <MapContainer center={[22.5, 79]} zoom={5} className="map">
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
        <FlyTo t={selected} />
        {temples.data?.map((t) => (
          <Marker key={t.id} position={[t.lat, t.lng]} eventHandlers={{ click: () => setSelected(t) }}>
            <Popup>{t.name}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
