import { useEffect, useRef, useState } from 'react';
import { api, inr } from './api.js';
import { Btn, Field, Panel, Stat, Err } from './ui.jsx';

const NAV = { Company: ['dashboard', 'analyze', 'inventory', 'requests'], Buyer: ['marketplace', 'requests'], Recycler: ['marketplace', 'requests'], Admin: ['dashboard', 'users'] };
const LABEL = { dashboard: 'Dashboard', analyze: 'Scan material', inventory: 'Inventory', requests: 'Requests', marketplace: 'Marketplace', users: 'Users' };

export default function App() {
  const [user, setUser] = useState(null); const [page, setPage] = useState(null); const [boot, setBoot] = useState(true);
  useEffect(() => { localStorage.getItem('rv_token') ? api('/auth/me').then((r) => enter(r.user)).catch(() => localStorage.removeItem('rv_token')).finally(() => setBoot(false)) : setBoot(false); }, []);
  const enter = (u) => { setUser(u); setPage(NAV[u.role][0]); };
  const logout = () => { localStorage.removeItem('rv_token'); setUser(null); };
  if (boot) return null;
  if (!user) return <Auth onAuth={(r) => { localStorage.setItem('rv_token', r.token); enter(r.user); }} />;
  const View = { dashboard: Dashboard, analyze: Analyze, inventory: Inventory, requests: Requests, marketplace: Marketplace, users: Users }[page];
  return (
    <div className="min-h-screen">
      <header className="bg-ink text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
          <span className="font-display text-2xl tracking-wide">RECLAIM <span className="text-hivis">VALUE</span></span>
          <nav className="flex gap-1 flex-1">{NAV[user.role].map((p) => <button key={p} onClick={() => setPage(p)} aria-current={p === page} className={`px-3 py-1 text-sm ${p === page ? 'bg-hivis text-ink font-semibold' : 'hover:bg-white/10'}`}>{LABEL[p]}</button>)}</nav>
          <span className="text-sm text-white/70">{user.name} · {user.role}</span><button onClick={logout} className="text-sm underline">Sign out</button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4 space-y-4"><View user={user} /></main>
    </div>
  );
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login'); const [f, setF] = useState({ role: 'Company' }); const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => { try { setErr(''); onAuth(await api(`/auth/${mode}`, { method: 'POST', body: f })); } catch (e) { setErr(e.message); } };
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="bg-ink text-white p-10 flex flex-col justify-end">
        <h1 className="font-display text-6xl md:text-7xl leading-[0.9]">What is it,<br />what is it worth,<br /><span className="text-hivis">what should you do with it?</span></h1>
        <p className="mt-6 max-w-md text-white/70">Photograph demolition and site leftovers. Reclaim Value identifies the material, prices it, and routes it to a buyer instead of the landfill.</p>
      </div>
      <div className="p-10 flex items-center"><div className="w-full max-w-sm space-y-3">
        <h2 className="font-display text-3xl">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
        {mode === 'register' && <><Field label="Name" onChange={set('name')} />
          <label className="block text-sm font-medium">I am a<select value={f.role} onChange={set('role')} className="mt-1 w-full border-2 border-ink/30 bg-white px-3 py-2"><option value="Company">Construction company (selling)</option><option value="Buyer">Buyer / contractor</option><option value="Recycler">Recycler</option></select></label></>}
        <Field label="Email" type="email" onChange={set('email')} /><Field label="Password" type="password" onChange={set('password')} />
        <Err msg={err} /><Btn onClick={submit} className="w-full">{mode === 'login' ? 'Sign in' : 'Create account'}</Btn>
        <button className="text-sm underline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}</button>
      </div></div>
    </div>
  );
}

function Dashboard({ user }) {
  const [s, setS] = useState(null);
  const load = () => api('/analytics/summary').then(setS).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!s) return <p>Loading…</p>;
  const max = Math.max(1, ...Object.values(s.valueByType || {}));
  return (<>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {user.role === 'Admin' ? <><Stat label="Users" value={s.users} /><Stat label="Active listings" value={s.activeListings} /><Stat label="Waste diverted (kg)" value={s.wasteDivertedKg} /><Stat label="CO₂ avoided (t)" value={s.co2SavedTons} /></>
        : <><Stat label="Items in inventory" value={s.inventoryCount} /><Stat label="Listed value" value={inr(s.listedValue)} /><Stat label="Revenue" value={inr(s.revenue)} /><Stat label="CO₂ avoided (t)" value={s.co2SavedTons} /></>}
    </div>
    {s.valueByType && <Panel title="Inventory value by material">{Object.entries(s.valueByType).length === 0 ? <p className="text-rebar">Nothing yet. Scan a material to start.</p> :
      Object.entries(s.valueByType).map(([k, v]) => <div key={k} className="flex items-center gap-3 my-1 text-sm"><span className="w-20 capitalize">{k}</span><div className="h-4 bg-hivis" style={{ width: `${(v / max) * 100}%` }} /><span>{inr(v)}</span></div>)}</Panel>}
    {user.role === 'Company' && <Agent onDone={load} />}
  </>);
}

function Agent({ onDone }) {
  const [log, setLog] = useState([]); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [log, busy]);
  const send = async (text = msg) => {
    if (!text.trim() || busy) return;
    const m = text.trim();
    const history = log.slice(-10).map((entry) => ({ role: entry.me ? 'user' : 'assistant', text: entry.t }));
    setMsg(''); setBusy(true); setLog((l) => [...l, { me: true, t: m }]);
    try {
      const r = await api('/ai/agent', { method: 'POST', body: { message: m, history } });
      setLog((l) => [...l, { t: r.reply, source: r.source }]);
      if (r.source === 'action') onDone();
    } catch (e) { setLog((l) => [...l, { t: e.message }]); }
    finally { setBusy(false); }
  };
  const suggestions = [
    { label: 'How does the marketplace work?', text: 'How does the marketplace work?' },
    { label: 'Explain price estimates', text: 'How are material prices estimated?' },
    { label: 'Explain CO₂ estimates', text: 'How is CO2 avoided estimated?' },
    { label: 'Explain photo scans', text: 'How does the material photo scan work?' },
    { label: 'Show my inventory', text: 'Show my inventory' },
    { label: 'Summarize my value', text: 'What is my total inventory value?' },
  ];
  return (<Panel title="Inventory assistant">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <p className="text-sm text-rebar">Ask about the app, scanning, listings, pricing, or CO₂. Inventory actions run through your signed-in account.</p>
      {log.length > 0 && <button className="shrink-0 text-xs underline" onClick={() => setLog([])} disabled={busy}>New chat</button>}
    </div>
    <div aria-live="polite" aria-relevant="additions" className="mb-3 max-h-72 space-y-2 overflow-y-auto overscroll-contain">
      {log.length === 0 && <p className="text-sm text-rebar">Choose a suggested question or type your own. Follow-up questions use recent chat context.</p>}
      {log.map((l, i) => <div key={i} className={`max-w-[90%] p-3 text-sm whitespace-pre-line ${l.me ? 'ml-auto bg-slab' : 'mr-auto bg-hivis/30'}`}>
        {!l.me && l.source && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rebar">
          {l.source === 'guide' ? 'Reclaim Value quick guide'
            : l.source === 'action' ? 'Account action' : 'Gemini AI'}
        </p>}
        {l.t}
      </div>)}
      {busy && <p role="status" className="mr-auto bg-hivis/30 p-3 text-sm text-rebar">Thinking…</p>}
      <div ref={endRef} />
    </div>
    <div className="mb-3 flex flex-wrap gap-2">
      {suggestions.map((item) => <button key={item.label} type="button" disabled={busy}
        onClick={() => send(item.text)}
        className="border border-ink/25 bg-white px-3 py-1.5 text-left text-xs hover:bg-slab disabled:opacity-50">{item.label}</button>)}
      <button type="button" disabled={busy} onClick={() => send('Create a listing for my highest-value unused material')}
        className="border border-ink/25 bg-white px-3 py-1.5 text-left text-xs hover:bg-slab disabled:opacity-50">List highest-value available item</button>
    </div>
    <div className="flex gap-2">
      <input value={msg} maxLength={1000} onChange={(e) => setMsg(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
        aria-label="Message the assistant" className="min-w-0 flex-1 border-2 border-ink/30 px-3 py-2"
        placeholder="Ask a question or request an inventory action…" />
      <Btn onClick={() => send()} disabled={busy || !msg.trim()}>{busy ? 'Thinking…' : 'Send'}</Btn>
    </div>
  </Panel>);
}

function Analyze() {
  const [file, setFile] = useState(null); const [preview, setPreview] = useState(''); const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false); const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(''); const [saved, setSaved] = useState('');
  const [site, setSite] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const chooseFile = (nextFile) => {
    setErr(''); setSaved(''); setRes(null);
    if (!nextFile) { setFile(null); return; }
    if (!nextFile.type.startsWith('image/')) { setFile(null); setErr('Choose an image file.'); return; }
    if (nextFile.size > 8 * 1024 * 1024) { setFile(null); setErr('Image must be 8 MB or smaller.'); return; }
    setFile(nextFile);
  };
  const run = async () => {
    if (!file || busy) return;
    setBusy(true); setErr(''); setSaved(''); setRes(null);
    try {
      const form = new FormData(); form.append('image', file);
      setRes(await api('/ai/analyze', { method: 'POST', form }));
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const save = async (publish) => {
    if (!res || saving) return;
    const { detection: d, recommendation: r, price: p, imageUrl } = res;
    setSaving(true); setErr(''); setSaved('');
    try {
      const m = await api('/materials', { method: 'POST', body: { materialType: d.material, conditionScore: d.condition, quantity: d.quantity_kg, estimatedValue: r.estimated_value || p.total_price, images: [imageUrl], siteName: site,
        recommendation: { action: r.action, matchScore: r.match_score, avoidedCo2Tons: r.avoided_co2_tons, justification: r.justification } } });
      if (publish) await api('/listings', { method: 'POST', body: { materialId: m._id } });
      setSaved(publish ? 'Saved and published to the marketplace.' : 'Saved to inventory.');
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };
  const d = res?.detection, r = res?.recommendation, p = res?.price;
  return (<Panel title="Scan a material">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
      <div className="space-y-3">
        <label className="block text-sm font-semibold">Material photo
          <input type="file" accept="image/*" capture="environment" onChange={(e) => chooseFile(e.target.files?.[0])}
            className="mt-1 block w-full cursor-pointer border-2 border-dashed border-ink/30 bg-slab p-3 text-sm file:mr-3 file:border-0 file:bg-ink file:px-3 file:py-2 file:font-semibold file:text-white" />
        </label>
        <p className="text-xs text-rebar">Use a clear, close-up photo with one main material in focus. Maximum size: 8 MB.</p>
        {preview
          ? <img src={preview} alt="Selected material preview" className="max-h-80 w-full bg-slab object-contain" />
          : <div className="flex min-h-48 items-center justify-center bg-slab p-6 text-center text-sm text-rebar">Your photo preview will appear here.</div>}
      </div>
      <div className="space-y-3">
        <Field label="Site / location (optional)" value={site} onChange={(e) => setSite(e.target.value)} placeholder="Industrial Zone, Site A" />
        <div className="border-l-4 border-hivis bg-slab p-3 text-sm">
          <p className="font-semibold">For a better scan</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-rebar">
            <li>Focus on one material instead of a whole site.</li>
            <li>Use good lighting and avoid motion blur.</li>
            <li>Keep the material unobstructed where possible.</li>
          </ul>
        </div>
        <Btn onClick={run} disabled={!file || busy} aria-live="polite" className="w-full">
          {busy ? 'Analysing photo…' : res ? 'Analyse again' : 'Analyse photo'}
        </Btn>
        {busy && <p role="status" className="text-sm text-rebar">The image is being checked. This can take a few seconds.</p>}
      </div>
    </div>
    <Err msg={err} />
    {res && <div className="grid grid-cols-1 gap-4 mt-5">
      <div className="space-y-2">
        <div className={`p-3 text-sm ${d.demo_mode ? 'border-l-4 border-amber-500 bg-amber-50' : 'border-l-4 border-green-700 bg-green-50'}`}>
          <p className="font-semibold">{d.demo_mode ? 'Heuristic estimate — please verify' : 'AI model detection'}</p>
          <p>{d.demo_mode
            ? (d.model_loaded
              ? 'The model loaded but did not detect a material in this photo; the displayed material is a rough colour-based guess.'
              : `The AI model was unavailable${d.fallback_reason ? ` (${d.fallback_reason})` : ''}; the displayed material is a rough colour-based guess.`)
            : 'A material was detected by the trained model. Check that the result matches the photo.'}</p>
          {d.demo_mode && <p className="mt-1">Check the AI service at <a className="underline" href="http://localhost:8000/health" target="_blank" rel="noreferrer">localhost:8000/health</a>.</p>}
        </div>
        <p><b>Material:</b> <span className="capitalize">{d.material}</span>{d.demo_mode ? ' (confidence not measured)' : ` (${Math.round(d.confidence * 100)}% confidence)`}</p>
        <p><b>Condition:</b> Grade {d.condition} · <b>Quantity:</b> ~{d.quantity_kg} kg</p>
        <p className="font-display text-3xl">{r.action} <span className="text-rebar text-xl">({r.match_score}% match)</span></p>
        <p><b>Estimated value:</b> {inr(r.estimated_value)} · <b>Avoided CO₂:</b> {r.avoided_co2_tons} t</p>
        <p className="text-sm text-rebar italic">{r.justification}</p>
        <p className="text-sm">Market price range: {inr(p.range[0])} to {inr(p.range[1])}</p>
        <p className="border-t border-ink/10 pt-2 text-xs text-rebar">Condition, weight, recommendation and price are estimates. Confirm details and weight before listing or making a sale.</p>
        <div className="flex flex-wrap gap-2 pt-1"><Btn kind="hivis" onClick={() => save(true)} disabled={saving}>{saving ? 'Saving…' : 'Save and publish'}</Btn><Btn kind="ghost" onClick={() => save(false)} disabled={saving}>{saving ? 'Saving…' : 'Save to inventory'}</Btn></div>
        {saved && <p role="status" className="text-sm font-medium text-green-800">{saved}</p>}
      </div></div>}
  </Panel>);
}

function Inventory() {
  const [items, setItems] = useState([]); const [err, setErr] = useState('');
  const load = () => api('/materials').then(setItems).catch((e) => setErr(e.message)); useEffect(() => { load(); }, []);
  const act = (fn) => async () => { try { await fn(); load(); } catch (e) { setErr(e.message); } };
  return (<Panel title="Inventory"><Err msg={err} />
    {items.length === 0 ? <p className="text-rebar">No materials yet. Use “Scan material” to add your first one.</p> :
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b-2 border-ink"><th>Material</th><th>Grade</th><th>Qty (kg)</th><th>Value</th><th>Advice</th><th>Status</th><th /></tr></thead>
        <tbody>{items.map((m) => <tr key={m._id} className="border-b border-ink/10 align-top"><td className="py-2 capitalize">{m.materialType}</td><td>{m.conditionScore}</td><td>{m.quantity}</td><td>{inr(m.estimatedValue)}</td><td>{m.recommendation?.action}</td><td>{m.status}</td>
          <td className="space-x-2 whitespace-nowrap">{m.status === 'Available' && <button className="underline" onClick={act(() => api('/listings', { method: 'POST', body: { materialId: m._id } }))}>Publish</button>}
            {m.status !== 'Listed' && <button className="underline text-red-700" onClick={act(() => api(`/materials/${m._id}`, { method: 'DELETE' }))}>Delete</button>}</td></tr>)}</tbody></table></div>}
  </Panel>);
}

function Marketplace() {
  const [nl, setNl] = useState(''); const [data, setData] = useState({ results: [] }); const [msg, setMsg] = useState('');
  const search = () => api(`/listings?${nl ? 'nl=' + encodeURIComponent(nl) : ''}`).then(setData).catch((e) => setMsg(e.message));
  useEffect(() => { search(); }, []);
  const buy = async (l) => { try { await api('/requests', { method: 'POST', body: { listingId: l._id, offeredPrice: l.price, quantity: l.askingQty } }); setMsg('Purchase request sent. Track it under Requests.'); } catch (e) { setMsg(e.message); } };
  return (<>
    <Panel title="Find materials"><div className="flex gap-2"><input value={nl} onChange={(e) => setNl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} aria-label="Search" className="flex-1 border-2 border-ink/30 px-3 py-2" placeholder="Find good quality steel under ₹30,000 near me" /><Btn onClick={search}>Search</Btn></div>
      {data.parsedFilters && <p className="text-xs mt-2 font-mono bg-slab p-2">Understood as: {JSON.stringify(data.parsedFilters)}</p>}{msg && <p className="text-sm mt-2 font-medium">{msg}</p>}</Panel>
    <div className="grid md:grid-cols-2 gap-3">{data.results.length === 0 && <p className="text-rebar">No listings match. Widen the price or distance.</p>}
      {data.results.map((l) => <article key={l._id} className="bg-white flex">
        {l.materialId.images?.[0] && <img src={l.materialId.images[0]} alt="" className="w-32 object-cover" />}
        <div className="p-4 flex-1">
          {l.materialId.siteName?.startsWith('DEMO-') && <p className="mb-1 inline-block bg-hivis px-2 py-1 text-xs font-bold">DEMO LISTING · SAMPLE PRICE</p>}
          <h3 className="font-display text-2xl capitalize">{l.materialId.materialType} <span className="text-rebar text-lg">Grade {l.materialId.conditionScore}</span></h3>
          <p className="text-sm">{l.askingQty} kg · {inr(l.price)}{l.materialId.siteName?.startsWith('DEMO-') ? ' sample asking price' : ''} · {l.distanceKm} km · {l.sellerId.name} ({l.sellerId.rating}★)</p>
          {l.materialId.siteName?.startsWith('DEMO-') && <p className="mt-1 text-xs text-rebar">Illustrative data for trying the marketplace; this is not a real offer.</p>}
          <p className="text-xs text-rebar">Match index {l.matchRankScore}</p><Btn className="mt-2" kind="hivis" onClick={() => buy(l)}>Request to buy</Btn></div></article>)}</div>
  </>);
}

function Requests({ user }) {
  const [rows, setRows] = useState([]); const [err, setErr] = useState('');
  const load = () => api('/requests').then(setRows).catch((e) => setErr(e.message)); useEffect(() => { load(); }, []);
  const decide = (id, decision) => async () => { try { await api(`/requests/${id}`, { method: 'PATCH', body: { decision } }); load(); } catch (e) { setErr(e.message); } };
  return (<Panel title={user.role === 'Company' ? 'Incoming purchase requests' : 'My purchase requests'}><Err msg={err} />
    {rows.length === 0 ? <p className="text-rebar">No requests yet.</p> : rows.map((r) => <div key={r._id} className="flex flex-wrap items-center gap-3 border-b border-ink/10 py-2 text-sm">
      <span className="capitalize font-medium w-24">{r.listingId?.materialId?.materialType}</span><span>{r.quantity} kg at {inr(r.offeredPrice)}</span>{r.buyerId?.name && <span>from {r.buyerId.name}</span>}
      <span className="px-2 bg-slab">{r.requestStatus}</span>
      {user.role === 'Company' && r.requestStatus === 'Pending' && <span className="space-x-2"><Btn kind="hivis" onClick={decide(r._id, 'Accepted')}>Accept</Btn><Btn kind="ghost" onClick={decide(r._id, 'Rejected')}>Reject</Btn></span>}</div>)}
  </Panel>);
}

function Users() {
  const [u, setU] = useState([]); const load = () => api('/admin/users').then(setU); useEffect(() => { load(); }, []);
  const patch = (id, body) => async () => { await api(`/admin/users/${id}`, { method: 'PATCH', body }); load(); };
  return (<Panel title="User verification and moderation"><table className="w-full text-sm"><tbody>{u.map((x) => <tr key={x._id} className="border-b border-ink/10"><td className="py-2">{x.name}</td><td>{x.email}</td><td>{x.role}</td>
    <td className="space-x-3"><button className="underline" onClick={patch(x._id, { verified: !x.verified })}>{x.verified ? 'Unverify' : 'Verify'}</button><button className="underline text-red-700" onClick={patch(x._id, { suspended: !x.suspended })}>{x.suspended ? 'Reinstate' : 'Suspend'}</button></td></tr>)}</tbody></table></Panel>);
}
