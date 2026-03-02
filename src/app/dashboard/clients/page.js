"use client";

import { useState, useEffect } from "react";
import { useCoach } from "../layout";
import { useRouter, useSearchParams } from "next/navigation";

const statusEmojis = { active: "✅", new: "🌱", plateau: "🏔️", milestone: "🎉", lapsed: "💛", archived: "📦" };
const statusLabels = { active: "Active", new: "New Client", plateau: "Plateau", milestone: "Milestone!", lapsed: "Lapsed", archived: "Archived" };
const statusColors = { active: "#4a7c59", new: "#c9a84c", plateau: "#c4855c", milestone: "#8b6baf", lapsed: "#c25b50", archived: "#6b7280" };

export default function ClientsPage() {
  const { coach, supabase } = useCoach();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(searchParams.get("add") === "1");
  const [showCSV, setShowCSV] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", plan: "Optimal 5&1", weight_start: "", notes: "" });

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    const { data } = await supabase.from("clients").select("*").eq("coach_id", coach.id).order("created_at", { ascending: false });
    if (data) setClients(data);
    setLoading(false);
  };

  const addClient = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    setSaving(true);

    const newClient = {
      coach_id: coach.id,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      plan: form.plan || "Optimal 5&1",
      weight_start: form.weight_start ? Number(form.weight_start) : null,
      weight_current: form.weight_start ? Number(form.weight_start) : null,
      notes: form.notes.trim() || null,
      status: "new",
      start_date: new Date().toISOString().split("T")[0],
    };

    const { data, error } = await supabase.from("clients").insert(newClient).select().single();
    if (data) {
      setClients(prev => [data, ...prev]);
      await supabase.from("activities").insert({ coach_id: coach.id, client_id: data.id, action: "Added new client", details: data.full_name });
    }
    setForm({ full_name: "", email: "", phone: "", plan: "Optimal 5&1", weight_start: "", notes: "" });
    setShowAdd(false);
    setSaving(false);
  };

  const handleCSVImport = async (text) => {
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) return;

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes("name"));
    const emailIdx = headers.findIndex(h => h.includes("email"));
    const phoneIdx = headers.findIndex(h => h.includes("phone"));
    const planIdx = headers.findIndex(h => h.includes("plan"));
    const weightIdx = headers.findIndex(h => h.includes("weight"));

    const newClients = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim());
      const name = nameIdx >= 0 ? cols[nameIdx] : cols[0];
      if (!name) continue;

      newClients.push({
        coach_id: coach.id,
        full_name: name,
        email: emailIdx >= 0 ? cols[emailIdx] || null : null,
        phone: phoneIdx >= 0 ? cols[phoneIdx] || null : null,
        plan: planIdx >= 0 ? cols[planIdx] || "Optimal 5&1" : "Optimal 5&1",
        weight_start: weightIdx >= 0 ? Number(cols[weightIdx]) || null : null,
        weight_current: weightIdx >= 0 ? Number(cols[weightIdx]) || null : null,
        status: "new",
        start_date: new Date().toISOString().split("T")[0],
      });
    }

    if (newClients.length > 0) {
      const { data } = await supabase.from("clients").insert(newClients).select();
      if (data) {
        setClients(prev => [...data, ...prev]);
        await supabase.from("activities").insert({ coach_id: coach.id, action: "Imported " + data.length + " clients via CSV" });
      }
    }
    setShowCSV(false);
  };

  const filtered = clients.filter(c => {
    const matchSearch = c.full_name.toLowerCase().includes(search.toLowerCase()) || (c.email || "").toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || c.status === filter;
    return matchSearch && matchFilter;
  });

  if (loading) return <div className="text-center py-20 text-gray-400 font-semibold">Loading clients...</div>;

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <h1 className="font-display text-2xl md:text-3xl font-bold">My Clients</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowCSV(true)} className="px-4 py-2 bg-white border-2 border-gray-200 rounded-xl font-bold text-sm hover:bg-gray-50 transition">📂 Import CSV</button>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-brand-500 text-white rounded-xl font-bold text-sm hover:bg-brand-600 transition">➕ Add Client</button>
        </div>
      </div>

      {/* ADD FORM */}
      {showAdd && (
        <form onSubmit={addClient} className="bg-white rounded-2xl p-6 shadow-sm mb-5 animate-fade-up">
          <h3 className="font-bold text-lg mb-4">Add New Client</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { key: "full_name", label: "Full Name *", placeholder: "Jane Doe", type: "text" },
              { key: "email", label: "Email", placeholder: "jane@email.com", type: "email" },
              { key: "phone", label: "Phone", placeholder: "555-0100", type: "text" },
              { key: "plan", label: "Plan", placeholder: "Optimal 5&1", type: "text" },
              { key: "weight_start", label: "Starting Weight", placeholder: "e.g. 180", type: "number" },
              { key: "notes", label: "Notes", placeholder: "Any details...", type: "text" },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-xl focus:border-brand-500 focus:outline-none transition" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving} className="px-6 py-3 bg-brand-500 text-white rounded-xl font-bold text-sm disabled:opacity-50">{saving ? "Saving..." : "Save Client"}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-6 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* CSV MODAL */}
      {showCSV && <CSVModal onImport={handleCSVImport} onClose={() => setShowCSV(false)} />}

      {/* SEARCH + FILTER */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search clients..."
          className="flex-1 px-4 py-3 text-sm border-2 border-gray-200 rounded-xl bg-white focus:border-brand-500 focus:outline-none transition" />
        <div className="flex gap-1 bg-white rounded-xl p-1 border-2 border-gray-200">
          {[{ id: "all", label: "All" }, { id: "new", label: "🌱 New" }, { id: "active", label: "✅ Active" }, { id: "plateau", label: "🏔️ Plateau" }, { id: "lapsed", label: "💛 Lapsed" }].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={"px-3 py-1.5 rounded-lg text-xs font-bold transition " + (filter === f.id ? "bg-brand-100 text-brand-500" : "text-gray-400 hover:bg-gray-50")}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* CLIENT LIST */}
      <div className="space-y-2">
        {filtered.map(client => (
          <button key={client.id} onClick={() => router.push("/dashboard/clients/" + client.id)}
            className="w-full flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm hover:shadow-md transition text-left">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center text-xl">{statusEmojis[client.status] || "📋"}</div>
              <div>
                <div className="font-bold">{client.full_name}</div>
                <div className="text-xs text-gray-400">{client.email || "No email"} · {client.plan || "No plan"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs text-gray-400">Started {client.start_date ? new Date(client.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</div>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-lg" style={{ backgroundColor: statusColors[client.status] + "15", color: statusColors[client.status] }}>{statusLabels[client.status]}</span>
              <span className="text-gray-300 text-lg">→</span>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">👥</div>
          <p className="text-lg font-semibold">{clients.length === 0 ? "No clients yet. Add your first one!" : "No clients match your search."}</p>
        </div>
      )}
    </div>
  );
}

function CSVModal({ onImport, onClose }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result);
    reader.readAsText(f);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl animate-fade-up">
        <h3 className="font-bold text-lg mb-2">Import Clients from CSV</h3>
        <p className="text-sm text-gray-400 mb-4">Upload a CSV file with columns: name, email, phone, plan, weight. The first row should be headers.</p>

        <input type="file" accept=".csv,.txt" onChange={handleFile} className="mb-3 text-sm" />

        <textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder={"name,email,phone,plan,weight\nJane Doe,jane@email.com,555-0100,Optimal 5&1,180"}
          className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-xl mb-4 focus:border-brand-500 focus:outline-none font-mono" />

        <div className="flex gap-3">
          <button onClick={() => onImport(text)} disabled={!text.trim()} className="px-6 py-3 bg-brand-500 text-white rounded-xl font-bold text-sm disabled:opacity-50">Import Clients</button>
          <button onClick={onClose} className="px-6 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
