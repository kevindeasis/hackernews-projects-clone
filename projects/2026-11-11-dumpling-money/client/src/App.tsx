import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, money } from "./api";

const COLORS = ["#c2410c", "#0f766e", "#7c3aed", "#ca8a04", "#2563eb", "#be185d", "#4d7c0f", "#475569"];
const dollars = (c: number) => c / 100;
type Tab = "overview" | "transactions" | "accounts";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <>
      <header>
        <h1>🥟 Dumpling Money</h1>
        <nav>
          {(["overview", "transactions", "accounts"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
      </header>
      <main>{tab === "overview" ? <Overview /> : tab === "transactions" ? <Transactions /> : <Accounts />}</main>
    </>
  );
}

function Overview() {
  const nw = useQuery({ queryKey: ["networth"], queryFn: api.networth });
  const cf = useQuery({ queryKey: ["cashflow"], queryFn: api.cashflow });
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const latest = nw.data?.at(-1);
  return (
    <>
      <div className="card">
        <h2>Net worth</h2>
        <div className={`big ${latest && latest.netWorth < 0 ? "neg" : ""}`}>{latest ? money(latest.netWorth) : "—"}</div>
        {latest && <small>Assets {money(latest.assets)} · Liabilities {money(latest.liabilities)}</small>}
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={nw.data?.map((p) => ({ ...p, netWorth: dollars(p.netWorth) }))}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(v: number) => money(v * 100)} />
            <Line dataKey="netWorth" stroke="#c2410c" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid">
        <div className="card">
          <h2>Cash flow</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cf.data?.map((m) => ({ month: m.month, income: dollars(m.income), expenses: dollars(m.expenses) }))}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(v: number) => money(v * 100)} /><Legend />
              <Bar dataKey="income" fill="#15803d" /><Bar dataKey="expenses" fill="#b91c1c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h2>Spending by category</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={cats.data?.map((c) => ({ name: c.category, value: dollars(c.total) }))} dataKey="value" nameKey="name" outerRadius={90} label>
                {cats.data?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => money(v * 100)} /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

function Transactions() {
  const [q, setQ] = useState("");
  const refresh = useRefresh();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  const txs = useQuery({ queryKey: ["tx", q], queryFn: () => api.transactions(q) });
  const add = useMutation({ mutationFn: api.addTx, onSuccess: refresh });
  const del = useMutation({ mutationFn: api.deleteTx, onSuccess: refresh });
  const [f, setF] = useState({ account_id: 0, date: new Date().toISOString().slice(0, 10), amount: "", category: "", description: "" });
  const acct = f.account_id || accounts.data?.[0]?.id || 0;
  return (
    <>
      <div className="card">
        <h2>Add transaction</h2>
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ ...f, account_id: acct, amount: Number(f.amount), category: f.category || "Uncategorized" }); setF({ ...f, amount: "", description: "" }); }}>
          <select value={acct} onChange={(e) => setF({ ...f, account_id: Number(e.target.value) })}>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
          <input type="number" step="0.01" placeholder="Amount (− for expense)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
          <input placeholder="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <input placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <button>Add</button>
        </form>
        {add.error && <p className="err">{(add.error as Error).message}</p>}
      </div>
      <div className="card">
        <h2>Transactions</h2>
        <input placeholder="Search description or category…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8, width: "100%", boxSizing: "border-box" }} />
        <table>
          <thead><tr><th>Date</th><th>Account</th><th>Description</th><th>Category</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {txs.data?.map((t) => (
              <tr key={t.id}>
                <td>{t.date}</td><td>{t.account}</td><td>{t.description}</td><td>{t.category}</td>
                <td className={`num ${t.amount_cents < 0 ? "neg" : "pos"}`}>{money(t.amount_cents)}</td>
                <td><button className="link" onClick={() => del.mutate(t.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Accounts() {
  const refresh = useRefresh();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  const add = useMutation({ mutationFn: api.addAccount, onSuccess: refresh });
  const del = useMutation({ mutationFn: api.deleteAccount, onSuccess: refresh });
  const imp = useMutation({ mutationFn: ({ id, csv }: { id: number; csv: string }) => api.importCsv(id, csv), onSuccess: refresh });
  const [f, setF] = useState({ name: "", kind: "asset", opening: "0" });
  const [target, setTarget] = useState(0);
  return (
    <>
      <div className="card">
        <h2>Accounts</h2>
        <table>
          <thead><tr><th>Name</th><th>Type</th><th className="num">Balance</th><th /></tr></thead>
          <tbody>
            {accounts.data?.map((a) => (
              <tr key={a.id}><td>{a.name}</td><td>{a.kind}</td><td className={`num ${a.balance_cents < 0 ? "neg" : ""}`}>{money(a.balance_cents)}</td>
                <td><button className="link" onClick={() => confirm(`Delete ${a.name} and its transactions?`) && del.mutate(a.id)}>delete</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>New account</h2>
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ ...f, opening: Number(f.opening) }); setF({ name: "", kind: "asset", opening: "0" }); }}>
          <input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="asset">Asset</option><option value="liability">Liability</option></select>
          <input type="number" step="0.01" placeholder="Opening balance" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} />
          <button>Create</button>
        </form>
      </div>
      <div className="card">
        <h2>Import CSV</h2>
        <p><small>Columns: date (YYYY-MM-DD), description, and amount — or debit/credit. Optional category.</small></p>
        <select value={target || accounts.data?.[0]?.id || 0} onChange={(e) => setTarget(Number(e.target.value))}>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{" "}
        <input type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (file) imp.mutate({ id: target || accounts.data?.[0]?.id || 0, csv: await file.text() }); e.target.value = ""; }} />
        {imp.data && <p>Imported {imp.data.imported} transactions.</p>}
        {imp.error && <p className="err">{(imp.error as Error).message}</p>}
      </div>
    </>
  );
}
