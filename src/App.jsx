import { useState, useEffect, useRef } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid, AreaChart, Area, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, ZAxis
} from "recharts";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const STRAVA_CLIENT_ID = "238201"; // ← troca pelo teu Client ID em strava.com/settings/api
const REDIRECT_URI = typeof window !== "undefined"
  ? window.location.href.split("?")[0].split("#")[0] : "";
const STRAVA_AUTH_URL =
  `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}` +
  `&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&approval_prompt=force&scope=read,activity:read_all,profile:read_all`;

// ─── MOCK ─────────────────────────────────────────────────────────────────────
const MOCK_ATHLETE = {
  id: 1, firstname: "António", lastname: "Madureira", city: "Matosinhos",
  country: "Portugal", sex: "M", premium: true,
  ftp: 280, weight: 72, profile: null,
  stats: {
    recent_run_totals: { count: 12, distance: 156000, moving_time: 52800, elevation_gain: 820 },
    ytd_run_totals:    { count: 187, distance: 2340000, moving_time: 712800, elevation_gain: 14200 },
    all_run_totals:    { count: 1203, distance: 18200000, moving_time: 5980000 }
  }
};

const RACE_NAMES = ["Treino matinal","Long Run","Recuperação ativa","Intervalos 400m",
  "Volta de bike","Tempo Run","Fartlek","Trail Run","Progressivo","Rodagem fácil","Corrida noturna"];

function generateMockActivities() {
  const acts = []; const now = Date.now();
  const types = ["Run","Run","Run","Run","Run","Ride"];
  // Add some landmark runs (PRs)
  const landmarks = [
    { daysAgo: 8,  name: "Meia Maratona Porto", dist: 21097, pace: 247, hr: 168 },
    { daysAgo: 35, name: "10K Matosinhos", dist: 10000, pace: 238, hr: 172 },
    { daysAgo: 62, name: "Maratona Lisboa", dist: 42195, pace: 265, hr: 162 },
    { daysAgo: 80, name: "5K Parkrun", dist: 5000, pace: 233, hr: 175 },
  ];
  landmarks.forEach((l, idx) => {
    acts.push({
      id: 9000 + idx, name: l.name, type: "Run",
      distance: l.dist,
      moving_time: l.dist / 1000 * l.pace,
      start_date: new Date(now - l.daysAgo * 86400000).toISOString(),
      average_heartrate: l.hr, max_heartrate: l.hr + 12,
      average_speed: l.dist / (l.dist / 1000 * l.pace),
      total_elevation_gain: Math.random() * 80,
      suffer_score: Math.floor(80 + Math.random() * 60),
      weighted_average_watts: null, pr_rank: 1,
    });
  });
  for (let i = 89; i >= 0; i--) {
    if (Math.random() > 0.42) continue;
    const d = new Date(now - i * 86400000);
    const type = types[Math.floor(Math.random() * types.length)];
    const dist = type === "Run" ? (4000 + Math.random() * 16000) : (15000 + Math.random() * 60000);
    const pace = type === "Run" ? (275 + Math.random() * 65) : null;
    const dur  = type === "Run" ? dist / 1000 * pace : dist / 1000 * 125;
    const hr   = 125 + Math.random() * 48;
    acts.push({
      id: i, name: RACE_NAMES[Math.floor(Math.random() * RACE_NAMES.length)],
      type, distance: dist, moving_time: dur,
      start_date: d.toISOString(),
      average_heartrate: hr, max_heartrate: hr + 12 + Math.random() * 18,
      average_speed: dist / dur,
      total_elevation_gain: type === "Run" ? Math.random() * 110 : Math.random() * 380,
      suffer_score: Math.floor(25 + Math.random() * 110),
      weighted_average_watts: type === "Ride" ? 175 + Math.random() * 110 : null,
    });
  }
  return acts.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
}

// ─── TRAINING LOAD ────────────────────────────────────────────────────────────
function calcTrainingLoad(activities) {
  const byDay = {};
  activities.forEach(a => {
    const day = a.start_date.slice(0, 10);
    const load = a.suffer_score || ((a.moving_time / 3600) * 50);
    byDay[day] = (byDay[day] || 0) + load;
  });
  let ctl = 38, atl = 32;
  const days = [];
  for (let i = 55; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const load = byDay[d] || 0;
    ctl = ctl + (load - ctl) / 42;
    atl = atl + (load - atl) / 7;
    days.push({ date: d.slice(5), ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +(ctl - atl).toFixed(1), load: +load.toFixed(0) });
  }
  return days;
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmtPace  = s  => { if (!s || !isFinite(s)) return "—"; const m = Math.floor(s/60); return `${m}:${Math.round(s%60).toString().padStart(2,"0")}`; };
const fmtDist  = m  => m >= 1000 ? `${(m/1000).toFixed(1)}km` : `${Math.round(m)}m`;
const fmtTime  = s  => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=Math.round(s%60); return h>0?`${h}:${m.toString().padStart(2,"0")}:${ss.toString().padStart(2,"0")}`:`${m}:${ss.toString().padStart(2,"0")}`; };
const fmtDate  = iso => new Date(iso).toLocaleDateString("pt-PT",{day:"2-digit",month:"short"});
const fmtMonth = iso => new Date(iso).toLocaleDateString("pt-PT",{month:"short",year:"2-digit"});

function getZone(hr) {
  if (hr <= 108) return { z:1, label:"Z1", color:"#4fc3f7" };
  if (hr <= 133) return { z:2, label:"Z2", color:"#66bb6a" };
  if (hr <= 152) return { z:3, label:"Z3", color:"#ffa726" };
  if (hr <= 167) return { z:4, label:"Z4", color:"#ef5350" };
  return            { z:5, label:"Z5", color:"#b71c1c" };
}

function getWeeklyData(acts) {
  const weeks = {};
  acts.filter(a => a.type === "Run").forEach(a => {
    const d = new Date(a.start_date);
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay()+6)%7));
    const key = mon.toISOString().slice(0,10);
    if (!weeks[key]) weeks[key] = { week: key.slice(5), km:0, runs:0, time:0, elev:0 };
    weeks[key].km   += a.distance/1000;
    weeks[key].runs++;
    weeks[key].time += a.moving_time;
    weeks[key].elev += a.total_elevation_gain||0;
  });
  return Object.values(weeks).slice(-16).map(w => ({ ...w, km: +w.km.toFixed(1), elev: +w.elev.toFixed(0) }));
}

function getMonthlyData(acts) {
  const months = {};
  acts.filter(a => a.type === "Run").forEach(a => {
    const key = a.start_date.slice(0,7);
    if (!months[key]) months[key] = { month: fmtMonth(a.start_date), km:0, runs:0, elev:0 };
    months[key].km   += a.distance/1000;
    months[key].runs++;
    months[key].elev += a.total_elevation_gain||0;
  });
  return Object.values(months).slice(-12).map(m => ({ ...m, km: +m.km.toFixed(1) }));
}

function getPRs(acts) {
  const runs = acts.filter(a => a.type === "Run" && a.distance > 0);
  const brackets = [
    { label: "5K",   min: 4800,  max: 5500  },
    { label: "10K",  min: 9500,  max: 10600 },
    { label: "Meia", min: 20500, max: 22000 },
    { label: "Maratona", min: 41000, max: 43500 },
  ];
  return brackets.map(b => {
    const candidates = runs.filter(r => r.distance >= b.min && r.distance <= b.max);
    if (!candidates.length) return { label: b.label, pr: null, pace: null, date: null, count: 0 };
    const best = candidates.reduce((best, r) => (r.average_speed > best.average_speed ? r : best));
    return {
      label: b.label,
      pr: fmtTime(best.moving_time),
      pace: fmtPace(1000 / best.average_speed),
      date: fmtDate(best.start_date),
      name: best.name,
      count: candidates.length,
      hr: best.average_heartrate ? Math.round(best.average_heartrate) : null,
    };
  });
}

function getRadarData(acts, tsbData) {
  const runs = acts.filter(a => a.type === "Run").slice(0, 30);
  if (!runs.length) return [];
  const avgPace  = runs.reduce((s,r) => s + (r.average_speed > 0 ? 1000/r.average_speed : 0),0)/runs.length;
  const avgHR    = runs.filter(r=>r.average_heartrate).reduce((s,r)=>s+r.average_heartrate,0)/(runs.filter(r=>r.average_heartrate).length||1);
  const avgKmW   = getWeeklyData(acts).slice(-4).reduce((s,w)=>s+w.km,0)/4;
  const latest   = tsbData[tsbData.length-1]||{};
  // Normalize to 0-100
  const paceScore  = Math.max(0, Math.min(100, (420 - avgPace) / 1.4));   // 5:00/km = ~86
  const hrScore    = Math.max(0, Math.min(100, (185 - avgHR) / 0.7));     // low HR = good
  const volScore   = Math.min(100, avgKmW * 1.5);                          // 67km/w = 100
  const fitnessScore = Math.min(100, (latest.ctl||0) * 1.2);
  const freshScore = Math.max(0, Math.min(100, 50 + (latest.tsb||0) * 2));
  const elevScore  = Math.min(100, runs.reduce((s,r)=>s+(r.total_elevation_gain||0),0)/runs.length * 2);
  return [
    { subject: "Pace",     A: Math.round(paceScore)    },
    { subject: "FC Baixa", A: Math.round(hrScore)      },
    { subject: "Volume",   A: Math.round(volScore)      },
    { subject: "Fitness",  A: Math.round(fitnessScore)  },
    { subject: "Frescura", A: Math.round(freshScore)    },
    { subject: "Elevação", A: Math.round(elevScore)     },
  ];
}

// ─── SUB COMPONENTS ───────────────────────────────────────────────────────────

const C = { bg: "#0d0d14", surface: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", muted: "rgba(255,255,255,0.35)", faint: "rgba(255,255,255,0.12)", accent: "#FC4C02", text: "#f0f0f0" };

function Card({ children, style = {} }) {
  return <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, ...style }}>{children}</div>;
}

function CardHeader({ title, sub }) {
  return (
    <div style={{ padding: "16px 20px 0" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Stat({ label, value, sub, accent, icon, small }) {
  return (
    <div style={{
      background: accent ? "linear-gradient(135deg,#FC4C02,#c93700)" : C.surface,
      border: accent ? "none" : `1px solid ${C.border}`,
      borderRadius: 14, padding: small ? "14px 18px" : "18px 22px",
      display: "flex", flexDirection: "column", gap: 3,
      transition: "transform .18s,box-shadow .18s", cursor: "default",
    }}
    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 10px 32px rgba(252,76,2,.18)";}}
    onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
      {icon && <span style={{ fontSize: 18, marginBottom: 2 }}>{icon}</span>}
      <span style={{ fontSize: small ? 22 : 26, fontWeight: 800, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:"-.5px", color: accent?"#fff":C.text }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing:"0.09em", textTransform:"uppercase", color: accent?"rgba(255,255,255,.8)":C.muted }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color: accent?"rgba(255,255,255,.6)":"rgba(255,255,255,.3)", marginTop: 1 }}>{sub}</span>}
    </div>
  );
}

function TT({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#1a1a2e", border:`1px solid ${C.faint}`, borderRadius:10, padding:"9px 13px", fontSize:12 }}>
      <div style={{ color: C.muted, marginBottom: 5, fontSize: 11 }}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{ color: p.color||"#fff", fontWeight:600 }}>{p.name}: {p.value}</div>)}
    </div>
  );
}

function TSBGauge({ tsb, ctl, atl }) {
  const clamp = Math.max(-30, Math.min(25, tsb));
  const pct   = ((clamp + 30) / 55) * 100;
  const { status, color, emoji } = tsb < -15 ? { status:"Overreaching", color:"#e53935", emoji:"🔴" }
    : tsb < -5  ? { status:"Em carga",    color:"#ff7043", emoji:"🟠" }
    : tsb <  5  ? { status:"Neutro",      color:"#ffd54f", emoji:"🟡" }
    : tsb <  15 ? { status:"Fresco",      color:"#66bb6a", emoji:"🟢" }
    :             { status:"Descansado",  color:"#4fc3f7", emoji:"🔵" };
  return (
    <Card style={{ padding: 22, textAlign:"center" }}>
      <div style={{ fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:C.muted, marginBottom:10 }}>Estado de Forma · TSB</div>
      <div style={{ fontSize:54, fontWeight:900, fontFamily:"'Barlow Condensed',sans-serif", color, lineHeight:1 }}>{tsb>0?"+":""}{tsb.toFixed(1)}</div>
      <div style={{ fontSize:14, fontWeight:700, color, marginTop:6 }}>{emoji} {status}</div>
      <div style={{ margin:"14px 0 4px", height:7, background:"rgba(255,255,255,.08)", borderRadius:4, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:4, transition:"width 1s ease" }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"rgba(255,255,255,.25)", marginBottom:14 }}>
        <span>Overreach</span><span>Óptimo</span><span>Fresco</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {[["CTL", ctl?.toFixed(1), "#FC4C02"], ["ATL", atl?.toFixed(1), "#ffa726"]].map(([l,v,c]) => (
          <div key={l} style={{ background:"rgba(255,255,255,.05)", borderRadius:8, padding:"8px 10px" }}>
            <div style={{ fontSize:18, fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", color:c }}>{v}</div>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase" }}>{l}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function HeatMap({ activities }) {
  const byDay = {};
  activities.forEach(a => { const d = a.start_date.slice(0,10); byDay[d] = (byDay[d]||0) + a.distance/1000; });
  const weeks = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(today); start.setDate(today.getDate()-363); start.setDate(start.getDate()-start.getDay());
  for (let w=0; w<52; w++) {
    const week = [];
    for (let d=0; d<7; d++) {
      const dt = new Date(start); dt.setDate(start.getDate()+w*7+d);
      const key = dt.toISOString().slice(0,10);
      week.push({ date:key, km: byDay[key]||0, future: dt>today });
    }
    weeks.push(week);
  }
  const maxKm = Math.max(...Object.values(byDay), 1);
  const col = (km, future) => {
    if (future) return "transparent";
    if (!km) return "rgba(255,255,255,.05)";
    const t = Math.min(km/maxKm, 1);
    return t<.25?"#7B2D0B":t<.5?"#B84200":t<.75?"#E05000":"#FC4C02";
  };
  return (
    <div style={{ overflowX:"auto" }}>
      <div style={{ display:"flex", gap:2, minWidth:700 }}>
        {weeks.map((week,wi) => (
          <div key={wi} style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {week.map((day,di) => (
              <div key={di} title={`${day.date}: ${day.km.toFixed(1)}km`}
                style={{ width:12, height:12, borderRadius:2, background:col(day.km,day.future), transition:"transform .1s", cursor:day.km?"pointer":"default" }}
                onMouseEnter={e=>e.currentTarget.style.transform="scale(1.5)"}
                onMouseLeave={e=>e.currentTarget.style.transform=""}/>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:5, marginTop:8, alignItems:"center" }}>
        <span style={{ fontSize:9, color:"rgba(255,255,255,.3)" }}>Menos</span>
        {[0,.25,.5,.75,1].map(i=><div key={i} style={{ width:11, height:11, borderRadius:2, background:col(i*maxKm,false) }}/>)}
        <span style={{ fontSize:9, color:"rgba(255,255,255,.3)" }}>Mais</span>
      </div>
    </div>
  );
}

function ActivityRow({ act }) {
  const speed = act.average_speed || 0;
  const pace  = speed > 0 ? 1000/speed : 0;
  const hrZ   = act.average_heartrate ? getZone(act.average_heartrate) : null;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 70px 70px 80px 60px", gap:8, alignItems:"center", padding:"11px 16px", borderBottom:`1px solid rgba(255,255,255,.04)`, transition:"background .12s" }}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.025)"}
      onMouseLeave={e=>e.currentTarget.style.background=""}>
      <div>
        <div style={{ fontSize:13, fontWeight:600, color:C.text, display:"flex", alignItems:"center", gap:6 }}>
          {act.pr_rank===1 && <span style={{ fontSize:10, background:"rgba(252,76,2,.2)", color:"#FC4C02", borderRadius:3, padding:"1px 5px", fontWeight:700 }}>PR</span>}
          {act.name}
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,.3)", marginTop:1 }}>{fmtDate(act.start_date)} · {act.type}</div>
      </div>
      <span style={{ fontSize:12, color:"#FC4C02", fontWeight:700 }}>{fmtDist(act.distance)}</span>
      <span style={{ fontSize:12, color:"rgba(255,255,255,.55)" }}>{fmtTime(act.moving_time)}</span>
      {act.type==="Run"
        ? <span style={{ fontSize:12, color:"rgba(255,255,255,.55)" }}>{fmtPace(pace)}/km</span>
        : <span style={{ fontSize:12, color:"rgba(255,255,255,.3)" }}>—</span>}
      {hrZ
        ? <span style={{ fontSize:11, fontWeight:700, color:hrZ.color, background:`${hrZ.color}22`, borderRadius:4, padding:"2px 6px", textAlign:"center" }}>{hrZ.label} {Math.round(act.average_heartrate)}</span>
        : <span/>}
      <span style={{ fontSize:11, color:"rgba(255,255,255,.3)" }}>↑{Math.round(act.total_elevation_gain||0)}m</span>
    </div>
  );
}

// ─── AI COACH with conversation history ──────────────────────────────────────
function AICoach({ activities, athlete, tsbData }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const bottomRef = useRef(null);
  const latest = tsbData[tsbData.length-1] || {};
  const runs   = activities.filter(a=>a.type==="Run").slice(0,15);
  const weekKm = runs.slice(0,6).reduce((s,r)=>s+r.distance/1000,0);
  const avgHR  = runs.filter(r=>r.average_heartrate).reduce((s,r)=>s+r.average_heartrate,0)/(runs.filter(r=>r.average_heartrate).length||1);
  const prs    = getPRs(activities);

  const SYSTEM = `És um treinador de corrida de elite. Responde sempre em português de Portugal, de forma direta e baseada em dados. Usa emojis para estruturar. Contexto do atleta:
- Nome: ${athlete.firstname} ${athlete.lastname}, Matosinhos PT, corredor competitivo
- TSB: ${latest.tsb?.toFixed(1)} | CTL: ${latest.ctl?.toFixed(1)} | ATL: ${latest.atl?.toFixed(1)}
- Volume semanal estimado: ${weekKm.toFixed(1)}km
- FC média recente: ${avgHR.toFixed(0)}bpm
- PRs: ${prs.filter(p=>p.pr).map(p=>`${p.label}=${p.pr} (${p.pace}/km)`).join(", ")||"sem dados"}
- Zonas Garmin: Z1≤108 Z2≤133 Z3≤152 Z4≤167 Z5≥168`;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const quick = ["Posso fazer long run amanhã?","Estou em overtraining?","Que treino fazer esta semana?","Analisa a minha forma atual","Como melhorar o meu pace?","Plano para próxima semana"];

  const send = async (q) => {
    const text = q || input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg = { role:"user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          system: SYSTEM,
          messages: history.map(m => ({ role:m.role, content:m.content }))
        })
      });
      const data = await r.json();
      const reply = data.content?.[0]?.text || "Erro ao obter resposta.";
      setMessages(prev => [...prev, { role:"assistant", content:reply }]);
    } catch { setMessages(prev => [...prev, { role:"assistant", content:"Erro de ligação." }]); }
    setLoading(false);
  };

  return (
    <Card>
      <div style={{ padding:"18px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:38, height:38, borderRadius:"50%", background:"linear-gradient(135deg,#FC4C02,#c93700)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🤖</div>
        <div>
          <div style={{ fontSize:15, fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".04em" }}>AI Coach</div>
          <div style={{ fontSize:11, color:C.muted }}>Powered by Claude · dados em tempo real</div>
        </div>
        {messages.length > 0 && (
          <button onClick={()=>setMessages([])} style={{ marginLeft:"auto", background:"rgba(255,255,255,.06)", border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 12px", fontSize:11, color:C.muted, cursor:"pointer" }}>
            Limpar
          </button>
        )}
      </div>

      {/* Quick questions */}
      {messages.length === 0 && (
        <div style={{ padding:"16px 20px 0" }}>
          <div style={{ fontSize:10, letterSpacing:"0.08em", textTransform:"uppercase", color:"rgba(255,255,255,.3)", marginBottom:10 }}>Perguntas rápidas</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {quick.map(q => (
              <button key={q} onClick={()=>send(q)}
                style={{ background:"rgba(252,76,2,.08)", border:"1px solid rgba(252,76,2,.25)", borderRadius:20, padding:"6px 13px", fontSize:12, color:"#FC4C02", cursor:"pointer", transition:"all .15s" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(252,76,2,.18)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(252,76,2,.08)"}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat history */}
      <div style={{ minHeight: messages.length ? 280 : 0, maxHeight: 400, overflowY:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", justifyContent: m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{
              maxWidth:"82%", padding:"10px 14px", borderRadius: m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",
              background: m.role==="user" ? "rgba(252,76,2,.18)" : "rgba(255,255,255,.06)",
              border: m.role==="user" ? "1px solid rgba(252,76,2,.3)" : `1px solid ${C.border}`,
              fontSize:13, lineHeight:1.65, color: m.role==="user"?"#ffd0bb":C.text,
              whiteSpace:"pre-wrap",
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", gap:5, padding:"8px 4px" }}>
            {[0,1,2].map(i=><div key={i} style={{ width:7,height:7,borderRadius:"50%",background:"#FC4C02",opacity:.7,animation:`bounce .9s ease-in-out ${i*.15}s infinite alternate` }}/>)}
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      <style>{`@keyframes bounce{from{transform:translateY(0)}to{transform:translateY(-6px)}}`}</style>

      {/* Input */}
      <div style={{ padding:"12px 16px 16px", display:"flex", gap:8 }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
          placeholder="Faz uma pergunta ao teu coach..."
          style={{ flex:1, background:"rgba(255,255,255,.06)", border:`1px solid ${C.faint}`, borderRadius:10, padding:"10px 14px", color:C.text, fontSize:13, outline:"none" }}/>
        <button onClick={()=>send()} disabled={loading||!input.trim()}
          style={{ background: (loading||!input.trim())?"rgba(252,76,2,.3)":"#FC4C02", border:"none", borderRadius:10, padding:"10px 18px", color:"#fff", fontWeight:700, cursor:(loading||!input.trim())?"default":"pointer", fontSize:14, transition:"background .15s" }}>
          →
        </button>
      </div>
    </Card>
  );
}

// ─── PR CARD ──────────────────────────────────────────────────────────────────
function PRCard({ pr }) {
  return (
    <div style={{
      background: pr.pr ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.02)",
      border: pr.pr ? `1px solid rgba(252,76,2,.25)` : `1px solid ${C.border}`,
      borderRadius: 14, padding: "18px 20px",
      transition: "transform .18s, box-shadow .18s", cursor: pr.pr ? "default" : "default",
    }}
    onMouseEnter={e=>{ if(pr.pr){e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 28px rgba(252,76,2,.18)";} }}
    onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:C.muted }}>{pr.label}</span>
        {pr.pr && <span style={{ fontSize:10, background:"rgba(252,76,2,.15)", color:"#FC4C02", borderRadius:4, padding:"2px 8px", fontWeight:700 }}>PR</span>}
      </div>
      {pr.pr ? (
        <>
          <div style={{ fontSize:34, fontWeight:900, fontFamily:"'Barlow Condensed',sans-serif", color:C.text, letterSpacing:"-0.5px" }}>{pr.pr}</div>
          <div style={{ fontSize:12, color:"#FC4C02", fontWeight:600, marginTop:3 }}>{pr.pace}/km</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.3)", marginTop:8 }}>{pr.name}</div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
            <span style={{ fontSize:10, color:"rgba(255,255,255,.25)" }}>{pr.date}</span>
            {pr.hr && <span style={{ fontSize:10, color:"rgba(255,255,255,.25)" }}>❤️ {pr.hr}bpm</span>}
          </div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,.25)", marginTop:4 }}>{pr.count} corrida{pr.count!==1?"s":""} nesta distância</div>
        </>
      ) : (
        <div style={{ fontSize:22, fontWeight:700, color:"rgba(255,255,255,.2)", fontFamily:"'Barlow Condensed',sans-serif" }}>Sem dados</div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function StravaIntelligence() {
  const [token,      setToken]      = useState(null);
  const [athlete,    setAthlete]    = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("overview");
  const [useMock,    setUseMock]    = useState(false);
  const [error,      setError]      = useState(null);
  const [code,       setCode]       = useState(null);
  const [secret,     setSecret]     = useState("");
  const [secretMode, setSecretMode] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get("code");
    if (c) { setCode(c); setSecretMode(true); window.history.replaceState({},  "", window.location.pathname); }
  }, []);

  const exchangeCode = async () => {
    setLoading(true); setError(null);
    try {
      // Em vez de ir ao Strava, vai à nossa própria Serverless Function
      const r = await fetch("/api/auth", {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }) // Enviamos apenas o código recebido no URL
      });
      
      const d = await r.json();
      
      if (d.access_token) { 
        setToken(d.access_token); 
        setSecretMode(false); 
      } else {
        setError("Autenticação falhou: " + (d.error || "Verifica as credenciais."));
      }
    } catch { 
      setError("Erro de rede ao contactar o servidor."); 
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const [ath, stats] = await Promise.all([
          fetch("https://www.strava.com/api/v3/athlete",            { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json()),
          fetch("https://www.strava.com/api/v3/athletes/me/stats",  { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json()),
        ]);
        ath.stats = stats; setAthlete(ath);
        const pages = await Promise.all([1,2,3].map(p =>
          fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${p}`,
            { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json())
        ));
        setActivities(pages.flat().filter(a=>a.id));
      } catch { setError("Erro a carregar dados."); }
      setLoading(false);
    })();
  }, [token]);

  const loadMock = () => { setAthlete(MOCK_ATHLETE); setActivities(generateMockActivities()); setUseMock(true); };

  // Derived data
  const runs       = activities.filter(a=>a.type==="Run");
  const tsbData    = activities.length ? calcTrainingLoad(activities) : [];
  const weeklyData = activities.length ? getWeeklyData(activities) : [];
  const monthlyData= activities.length ? getMonthlyData(activities) : [];
  const latest     = tsbData[tsbData.length-1] || { ctl:0, atl:0, tsb:0 };
  const prs        = activities.length ? getPRs(activities) : [];
  const radarData  = activities.length ? getRadarData(activities, tsbData) : [];

  const hrZoneData = (() => {
    const z = {Z1:0,Z2:0,Z3:0,Z4:0,Z5:0};
    runs.forEach(r=>{ if(r.average_heartrate){ const l=getZone(r.average_heartrate).label; z[l]++; } });
    return [
      { zone:"Z1", count:z.Z1, fill:"#4fc3f7" },
      { zone:"Z2", count:z.Z2, fill:"#66bb6a" },
      { zone:"Z3", count:z.Z3, fill:"#ffa726" },
      { zone:"Z4", count:z.Z4, fill:"#ef5350" },
      { zone:"Z5", count:z.Z5, fill:"#b71c1c" },
    ];
  })();

  const paceTrend = runs.slice(0,25).reverse().map(r => ({
    date: fmtDate(r.start_date),
    pace: r.average_speed>0 ? Math.round(1000/r.average_speed) : null,
    paceLabel: r.average_speed>0 ? fmtPace(1000/r.average_speed) : "—",
    hr: Math.round(r.average_heartrate||0),
    dist: +(r.distance/1000).toFixed(1),
  })).filter(r=>r.pace);

  const scatterData = paceTrend.map(r => ({ x: r.dist, y: r.pace, hr: r.hr }));

  const tabs = [
    { id:"overview", label:"Visão Geral",    icon:"⚡" },
    { id:"load",     label:"Training Load",  icon:"📈" },
    { id:"volume",   label:"Volume",         icon:"📊" },
    { id:"pace",     label:"Pace & FC",      icon:"❤️" },
    { id:"prs",      label:"Recordes",       icon:"🏆" },
    { id:"heatmap",  label:"Mapa de Calor",  icon:"🗓️" },
    { id:"coach",    label:"AI Coach",       icon:"🤖" },
  ];

  // ─── LOGIN SCREEN ──────────────────────────────────────────────────────────
  if (!athlete && !loading) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", padding:24 }}>
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet"/>
        <div style={{ maxWidth:400, width:"100%", textAlign:"center" }}>
          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:14, marginBottom:32 }}>
            <div style={{ width:56, height:56, borderRadius:16, background:"linear-gradient(135deg,#FC4C02,#c93700)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>🏃</div>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, fontWeight:900, letterSpacing:"-1px", color:"#fff", lineHeight:1 }}>STRAVA<span style={{color:"#FC4C02"}}>.</span>INTEL</div>
              <div style={{ fontSize:12, color:C.muted, letterSpacing:"0.08em" }}>TRAINING INTELLIGENCE DASHBOARD</div>
            </div>
          </div>

          {secretMode ? (
            <Card style={{ padding:24, textAlign:"left" }}>
              <div style={{ fontSize:13, color:"rgba(255,255,255,.6)", marginBottom:16, lineHeight:1.6 }}>
                ✅ Código recebido! Insere o teu <strong style={{color:"#FC4C02"}}>Client Secret</strong> do Strava para completar:
              </div>
              <input value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Client Secret do Strava..."
                style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,.07)", border:`1px solid ${C.faint}`, borderRadius:10, padding:"11px 14px", color:C.text, fontSize:13, outline:"none", marginBottom:10 }}/>
              <button onClick={exchangeCode}
                style={{ width:"100%", background:"#FC4C02", border:"none", borderRadius:10, padding:13, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }}>
                Autenticar →
              </button>
            </Card>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ background:"rgba(255,255,255,.03)", border:`1px solid ${C.border}`, borderRadius:12, padding:"11px 14px", fontSize:12, color:"rgba(255,255,255,.4)", textAlign:"left" }}>
                ⚙️ Para OAuth: substitui <code style={{color:"#FC4C02"}}>YOUR_CLIENT_ID</code> e define o Callback Domain em strava.com/settings/api
              </div>
              {STRAVA_CLIENT_ID !== "YOUR_CLIENT_ID"
                ? <a href={STRAVA_AUTH_URL} style={{ display:"block", background:"#FC4C02", color:"#fff", textDecoration:"none", borderRadius:12, padding:"14px 24px", fontWeight:700, fontSize:15 }}>
                    Conectar com Strava →
                  </a>
                : <div style={{ background:"rgba(252,76,2,.08)", border:"1px solid rgba(252,76,2,.25)", borderRadius:12, padding:"12px 16px", fontSize:12, color:"rgba(252,76,2,.8)", textAlign:"left" }}>
                    OAuth desativado · substitui YOUR_CLIENT_ID primeiro
                  </div>
              }
              <button onClick={loadMock}
                style={{ background:"rgba(255,255,255,.05)", border:`1px solid ${C.border}`, borderRadius:12, padding:"13px 24px", color:"rgba(255,255,255,.65)", fontWeight:600, fontSize:14, cursor:"pointer" }}>
                👁️ Ver demo com dados simulados
              </button>
            </div>
          )}
          {error && <p style={{ color:"#e53935", fontSize:13, marginTop:12 }}>{error}</p>}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, fontFamily:"'DM Sans',sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width:42, height:42, border:"3px solid rgba(252,76,2,.25)", borderTop:"3px solid #FC4C02", borderRadius:"50%", animation:"spin .7s linear infinite" }}/>
        <p style={{ color:C.muted, fontSize:14 }}>A carregar dados do Strava…</p>
      </div>
    );
  }

  // ─── MAIN DASHBOARD ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:rgba(252,76,2,.35);border-radius:2px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .page{animation:fadeUp .35s ease forwards}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* ── Header ── */}
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"0 24px" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:58 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:20 }}>🏃</span>
            <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:900, letterSpacing:".04em" }}>
              STRAVA<span style={{color:"#FC4C02"}}>.</span>INTEL
            </span>
            {useMock && <span style={{ fontSize:10, background:"rgba(255,183,0,.12)", color:"#ffb300", border:"1px solid rgba(255,183,0,.25)", borderRadius:4, padding:"2px 8px", letterSpacing:".06em" }}>DEMO</span>}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:13, color:C.muted }}>{athlete?.firstname} {athlete?.lastname}</span>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#4caf50" }}/>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ borderBottom:`1px solid rgba(255,255,255,.05)`, padding:"0 24px", overflowX:"auto" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"flex" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{ background:"none", border:"none", borderBottom:`2px solid ${tab===t.id?"#FC4C02":"transparent"}`, padding:"13px 16px", color:tab===t.id?"#FC4C02":"rgba(255,255,255,.38)", cursor:"pointer", fontSize:12, fontWeight:700, whiteSpace:"nowrap", transition:"color .18s", display:"flex", alignItems:"center", gap:5, letterSpacing:".02em" }}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Page content ── */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"22px 24px 48px" }} key={tab} className="page">

        {/* ══ OVERVIEW ══════════════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            {/* KPI row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10 }}>
              <Stat icon="🏅" label="Corridas (90d)"      value={runs.length}                      accent/>
              <Stat icon="📏" label="Distância total"     value={fmtDist(runs.reduce((s,r)=>s+r.distance,0))}/>
              <Stat icon="⏱️" label="Tempo total"         value={fmtTime(runs.reduce((s,r)=>s+r.moving_time,0))}/>
              <Stat icon="⛰️" label="Elevação total"      value={`${Math.round(runs.reduce((s,r)=>s+(r.total_elevation_gain||0),0))}m`}/>
              <Stat icon="❤️" label="FC média"            value={`${Math.round(runs.filter(r=>r.average_heartrate).reduce((s,r)=>s+r.average_heartrate,0)/(runs.filter(r=>r.average_heartrate).length||1))}bpm`}/>
              <Stat icon="🚀" label="Pace médio (10)"     value={fmtPace(runs.slice(0,10).filter(r=>r.average_speed>0).reduce((s,r)=>s+1000/r.average_speed,0)/(runs.slice(0,10).filter(r=>r.average_speed>0).length||1))} sub="/km"/>
            </div>

            {/* TSB + Radar */}
            <div style={{ display:"grid", gridTemplateColumns:"260px 1fr 1fr", gap:14 }}>
              <TSBGauge tsb={latest.tsb} ctl={latest.ctl} atl={latest.atl}/>
              {/* CTL/ATL/TSB mini chart */}
              <Card>
                <CardHeader title="CTL / ATL / TSB · 8 semanas"/>
                <div style={{ padding:"12px 8px 8px" }}>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={tsbData.slice(-28)}>
                      <XAxis dataKey="date" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}} interval={6}/>
                      <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                      <Tooltip content={<TT/>}/>
                      <Line dataKey="ctl" name="CTL" stroke="#FC4C02" strokeWidth={2} dot={false}/>
                      <Line dataKey="atl" name="ATL" stroke="#ffa726" strokeWidth={2} dot={false}/>
                      <Line dataKey="tsb" name="TSB" stroke="#66bb6a" strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              {/* Radar */}
              <Card>
                <CardHeader title="Performance Radar"/>
                <div style={{ padding:"8px" }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="rgba(255,255,255,.08)"/>
                      <PolarAngleAxis dataKey="subject" tick={{fontSize:10,fill:"rgba(255,255,255,.5)"}}/>
                      <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false}/>
                      <Radar dataKey="A" stroke="#FC4C02" fill="#FC4C02" fillOpacity={0.18} strokeWidth={2}/>
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {/* Recent activities */}
            <Card>
              <CardHeader title="Atividades Recentes"/>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 70px 70px 80px 60px", gap:8, padding:"8px 16px", borderBottom:`1px solid rgba(255,255,255,.04)` }}>
                {["Atividade","Dist","Tempo","Pace","FC","Elev"].map(h=>(
                  <span key={h} style={{ fontSize:9, color:"rgba(255,255,255,.22)", fontWeight:700, letterSpacing:".09em", textTransform:"uppercase" }}>{h}</span>
                ))}
              </div>
              {activities.slice(0,16).map(a=><ActivityRow key={a.id} act={a}/>)}
            </Card>
          </div>
        )}

        {/* ══ TRAINING LOAD ══════════════════════════════════════════════════════ */}
        {tab === "load" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10 }}>
              <Stat icon="🔵" label="CTL · Fitness crónico"  value={latest.ctl.toFixed(1)} sub="Média ponderada 42 dias"/>
              <Stat icon="🟠" label="ATL · Fadiga aguda"     value={latest.atl.toFixed(1)} sub="Média ponderada 7 dias"/>
              <Stat icon="🟢" label="TSB · Forma"            value={`${latest.tsb>0?"+":""}${latest.tsb.toFixed(1)}`} accent={latest.tsb>2} sub={latest.tsb>5?"Pronto para competir":latest.tsb<-12?"Cuidado: sobrecarga":"Equilíbrio de treino"}/>
            </div>
            {/* Full TSB chart */}
            <Card>
              <CardHeader title="CTL / ATL / TSB — 55 dias" sub="CTL = fitness crónico (42d) · ATL = fadiga aguda (7d) · TSB = forma = CTL − ATL"/>
              <div style={{ padding:"16px 8px 12px" }}>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={tsbData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                    <XAxis dataKey="date" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}} interval={7}/>
                    <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <Tooltip content={<TT/>}/>
                    <Legend wrapperStyle={{fontSize:11,color:"rgba(255,255,255,.45)"}}/>
                    <Line dataKey="ctl" name="CTL (Fitness)" stroke="#FC4C02" strokeWidth={2.5} dot={false}/>
                    <Line dataKey="atl" name="ATL (Fadiga)"  stroke="#ffa726" strokeWidth={2}   dot={false}/>
                    <Line dataKey="tsb" name="TSB (Forma)"   stroke="#66bb6a" strokeWidth={2}   dot={false} strokeDasharray="5 3"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            {/* Load bars */}
            <Card>
              <CardHeader title="Carga diária de treino" sub="Suffer Score ou estimativa baseada em duração"/>
              <div style={{ padding:"16px 8px 12px" }}>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={tsbData.slice(-28)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                    <XAxis dataKey="date" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}} interval={3}/>
                    <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <Tooltip content={<TT/>}/>
                    <Bar dataKey="load" name="Carga" fill="#FC4C02" opacity={0.75} radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            {/* HR zones */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <Card>
                <CardHeader title="Distribuição por zonas FC" sub="Zonas Garmin de António"/>
                <div style={{ padding:"16px 8px 12px" }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={hrZoneData}>
                      <XAxis dataKey="zone" tick={{fontSize:11,fill:"rgba(255,255,255,.5)",fontWeight:700}}/>
                      <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                      <Tooltip content={<TT/>}/>
                      {hrZoneData.map((e,i)=>(
                        <Bar key={i} dataKey="count" name="Corridas" fill={e.fill} radius={[4,4,0,0]}/>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", padding:"0 16px 16px" }}>
                  {[{z:"Z1",label:"Recuperação",bpm:"≤108",c:"#4fc3f7"},{z:"Z2",label:"Aeróbico",bpm:"109-133",c:"#66bb6a"},{z:"Z3",label:"Tempo",bpm:"134-152",c:"#ffa726"},{z:"Z4",label:"Limiar",bpm:"153-167",c:"#ef5350"},{z:"Z5",label:"VO₂max",bpm:"≥168",c:"#b71c1c"}].map(z=>(
                    <div key={z.z} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"rgba(255,255,255,.45)" }}>
                      <div style={{ width:9,height:9,borderRadius:2,background:z.c }}/>
                      <span style={{ color:z.c,fontWeight:700 }}>{z.z}</span> {z.label} <span style={{ color:"rgba(255,255,255,.25)" }}>{z.bpm}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title="Rácio Aeróbico vs Anaeróbico"/>
                <div style={{ padding:"20px 24px" }}>
                  {(() => {
                    const total = hrZoneData.reduce((s,z)=>s+z.count,0)||1;
                    const aero = (hrZoneData[0].count+hrZoneData[1].count+hrZoneData[2].count)/total*100;
                    const ana  = 100-aero;
                    return (
                      <>
                        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                          <Stat small label="Aeróbico (Z1-3)" value={`${aero.toFixed(0)}%`}/>
                          <Stat small label="Intenso (Z4-5)"  value={`${ana.toFixed(0)}%`} accent={ana>30}/>
                        </div>
                        <div style={{ height:12, background:"rgba(255,255,255,.07)", borderRadius:6, overflow:"hidden", display:"flex" }}>
                          <div style={{ width:`${aero}%`, background:"linear-gradient(90deg,#4fc3f7,#66bb6a)", transition:"width 1s" }}/>
                          <div style={{ width:`${ana}%`,  background:"linear-gradient(90deg,#ffa726,#b71c1c)", transition:"width 1s" }}/>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"rgba(255,255,255,.3)", marginTop:6 }}>
                          <span>← Aeróbico</span><span>Anaeróbico →</span>
                        </div>
                        <div style={{ marginTop:16, fontSize:12, color:"rgba(255,255,255,.4)", lineHeight:1.6 }}>
                          {aero >= 80
                            ? "✅ Boa distribuição aeróbica. Mantém a base de saúde cardiovascular."
                            : aero >= 65
                            ? "⚠️ Volume intenso ligeiramente elevado. Considera mais Z1/Z2."
                            : "🔴 Distribuição desequilibrada. Reduz intensidade para evitar fadiga crónica."}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ══ VOLUME ═══════════════════════════════════════════════════════════ */}
        {tab === "volume" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10 }}>
              <Stat icon="📅" label="Esta semana"     value={`${weeklyData[weeklyData.length-1]?.km?.toFixed(0)||0}km`}/>
              <Stat icon="📆" label="Semana anterior" value={`${weeklyData[weeklyData.length-2]?.km?.toFixed(0)||0}km`}/>
              <Stat icon="📊" label="Média semanal"   value={`${(weeklyData.reduce((s,w)=>s+w.km,0)/(weeklyData.length||1)).toFixed(0)}km`}/>
              <Stat icon="🏆" label="Melhor semana"   value={`${Math.max(...weeklyData.map(w=>w.km),0).toFixed(0)}km`} accent/>
              <Stat icon="📈" label="Total YTD"       value={fmtDist(athlete?.stats?.ytd_run_totals?.distance||0)}/>
              <Stat icon="🌍" label="Total histórico" value={fmtDist(athlete?.stats?.all_run_totals?.distance||0)}/>
            </div>
            <Card>
              <CardHeader title="Volume semanal · 16 semanas" sub="km de corrida por semana"/>
              <div style={{ padding:"16px 8px 12px" }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                    <XAxis dataKey="week" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <Tooltip content={<TT/>}/>
                    <Bar dataKey="km" name="km" fill="#FC4C02" radius={[4,4,0,0]} opacity={0.85}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <Card>
                <CardHeader title="Volume mensal (km)"/>
                <div style={{ padding:"12px 8px 12px" }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={monthlyData}>
                      <XAxis dataKey="month" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                      <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                      <Tooltip content={<TT/>}/>
                      <Area dataKey="km" name="km" stroke="#FC4C02" fill="rgba(252,76,2,.12)" strokeWidth={2}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <CardHeader title="Corridas por semana"/>
                <div style={{ padding:"12px 8px 12px" }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={weeklyData}>
                      <XAxis dataKey="week" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                      <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                      <Tooltip content={<TT/>}/>
                      <Bar dataKey="runs" name="Corridas" fill="#ffa726" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
            <Card>
              <CardHeader title="Elevação acumulada semanal (m)"/>
              <div style={{ padding:"12px 8px 12px" }}>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={weeklyData}>
                    <XAxis dataKey="week" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <Tooltip content={<TT/>}/>
                    <Area dataKey="elev" name="Elevação (m)" stroke="#66bb6a" fill="rgba(102,187,106,.1)" strokeWidth={2}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}

        {/* ══ PACE & FC ═════════════════════════════════════════════════════════ */}
        {tab === "pace" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10 }}>
              <Stat icon="⚡" label="Pace médio (20)" value={fmtPace(paceTrend.reduce((s,r)=>s+r.pace,0)/(paceTrend.length||1))} sub="/km"/>
              <Stat icon="🔥" label="Pace mais rápido" value={fmtPace(Math.min(...paceTrend.map(r=>r.pace).filter(Boolean)))} accent/>
              <Stat icon="❤️" label="FC média"         value={`${Math.round(paceTrend.reduce((s,r)=>s+r.hr,0)/(paceTrend.length||1))}bpm`}/>
              <Stat icon="📐" label="Eficiência aerób." value={paceTrend.length?`${(paceTrend.reduce((s,r)=>s+r.pace/r.hr,0)/paceTrend.length*100).toFixed(1)}`:"—"} sub="pace/bpm ×100"/>
            </div>
            <Card>
              <CardHeader title="Evolução de pace" sub="seg/km por corrida · valores mais baixos = mais rápido"/>
              <div style={{ padding:"16px 8px 12px" }}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={paceTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                    <XAxis dataKey="date" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <YAxis reversed domain={["auto","auto"]} tickFormatter={v=>fmtPace(v)} tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <Tooltip content={<TT/>}/>
                    <Line dataKey="pace" name="Pace (s/km)" stroke="#FC4C02" strokeWidth={2.5} dot={{r:3,fill:"#FC4C02"}}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <CardHeader title="Frequência cardíaca por corrida" sub="FC média em bpm"/>
              <div style={{ padding:"16px 8px 12px" }}>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={paceTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                    <XAxis dataKey="date" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <YAxis domain={[100,200]} tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <Tooltip content={<TT/>}/>
                    <Area dataKey="hr" name="FC média (bpm)" stroke="#ef5350" fill="rgba(229,57,53,.1)" strokeWidth={2}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <CardHeader title="Pace vs Distância" sub="Cada ponto = 1 corrida · verifica se pace sobe com distância"/>
              <div style={{ padding:"16px 8px 12px" }}>
                <ResponsiveContainer width="100%" height={180}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                    <XAxis type="number" dataKey="x" name="Distância" unit="km" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <YAxis type="number" dataKey="y" name="Pace" reversed tickFormatter={v=>fmtPace(v)} tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <ZAxis range={[40,40]}/>
                    <Tooltip cursor={{strokeDasharray:"3 3"}} content={({active,payload})=>{
                      if(!active||!payload?.length) return null;
                      const d = payload[0]?.payload;
                      return <div style={{background:"#1a1a2e",border:`1px solid ${C.faint}`,borderRadius:9,padding:"8px 12px",fontSize:12}}>
                        <div style={{color:C.muted,marginBottom:4}}>Distância: {d?.x}km</div>
                        <div style={{color:"#FC4C02",fontWeight:600}}>Pace: {fmtPace(d?.y)}/km</div>
                        <div style={{color:"#ef5350"}}>FC: {d?.hr}bpm</div>
                      </div>;
                    }}/>
                    <Scatter data={scatterData} fill="#ffa726" opacity={0.8}/>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}

        {/* ══ RECORDES / PRs ════════════════════════════════════════════════════ */}
        {tab === "prs" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:14 }}>
              {prs.map(pr => <PRCard key={pr.label} pr={pr}/>)}
            </div>
            {/* Race pace comparison */}
            <Card>
              <CardHeader title="Comparação de pace entre distâncias" sub="Pace médio dos teus melhores resultados"/>
              <div style={{ padding:"16px 8px 12px" }}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={prs.filter(p=>p.pace).map(p=>({ dist:p.label, pace:p.pace ? parseInt(p.pace.split(":")[0])*60+parseInt(p.pace.split(":")[1]) : null, label:p.pace }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                    <XAxis dataKey="dist" tick={{fontSize:11,fill:"rgba(255,255,255,.5)",fontWeight:700}}/>
                    <YAxis reversed domain={["auto","auto"]} tickFormatter={v=>fmtPace(v)} tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <Tooltip content={({active,payload,label})=>{
                      if(!active||!payload?.length)return null;
                      return <div style={{background:"#1a1a2e",border:`1px solid ${C.faint}`,borderRadius:9,padding:"8px 12px",fontSize:12}}>
                        <div style={{color:C.muted,marginBottom:4}}>{label}</div>
                        <div style={{color:"#FC4C02",fontWeight:600}}>Pace PR: {fmtPace(payload[0].value)}/km</div>
                      </div>;
                    }}/>
                    <Bar dataKey="pace" name="Pace PR" fill="#FC4C02" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            {/* Top 10 races */}
            <Card>
              <CardHeader title="Melhores corridas por distância"/>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 70px 70px 80px 60px", gap:8, padding:"8px 16px", borderBottom:`1px solid rgba(255,255,255,.04)` }}>
                {["Corrida","Dist","Tempo","Pace","FC","Data"].map(h=>(
                  <span key={h} style={{ fontSize:9,color:"rgba(255,255,255,.22)",fontWeight:700,letterSpacing:".09em",textTransform:"uppercase" }}>{h}</span>
                ))}
              </div>
              {runs.filter(r=>r.distance>4000).sort((a,b)=>b.average_speed-a.average_speed).slice(0,12).map(a=><ActivityRow key={a.id} act={a}/>)}
            </Card>
          </div>
        )}

        {/* ══ HEATMAP ════════════════════════════════════════════════════════════ */}
        {tab === "heatmap" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10 }}>
              <Stat icon="📅" label="Dias ativos (90d)" value={new Set(activities.map(a=>a.start_date.slice(0,10))).size}/>
              <Stat icon="🔥" label="Streak atual" accent value={(() => {
                let s=0; const today=new Date();
                for(let i=0;i<30;i++){
                  const d=new Date(today); d.setDate(today.getDate()-i);
                  const key=d.toISOString().slice(0,10);
                  if(activities.some(a=>a.start_date.slice(0,10)===key)) s++; else break;
                } return `${s}d`;
              })()}/>
              <Stat icon="🏃" label="Total atividades" value={activities.length}/>
              <Stat icon="📊" label="Freq. semanal média" value={`${(runs.length/Math.max(weeklyData.length,1)).toFixed(1)}x`}/>
              <Stat icon="🌙" label="Corridas noturnas (após 19h)" value={runs.filter(r=>new Date(r.start_date).getHours()>=19).length}/>
              <Stat icon="🌅" label="Corridas matinais (antes 9h)" value={runs.filter(r=>new Date(r.start_date).getHours()<9).length}/>
            </div>
            <Card>
              <CardHeader title="Mapa de calor de treino · 12 meses" sub="Cada quadrado = 1 dia · cor = volume em km"/>
              <div style={{ padding:"16px 20px 20px", overflowX:"auto" }}>
                <HeatMap activities={activities}/>
              </div>
            </Card>
            {/* Monthly volume chart */}
            <Card>
              <CardHeader title="Volume mensal (últimos 12 meses)"/>
              <div style={{ padding:"12px 8px 12px" }}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                    <XAxis dataKey="month" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <Tooltip content={<TT/>}/>
                    <Bar dataKey="km" name="km" fill="#FC4C02" radius={[4,4,0,0]} opacity={0.8}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            {/* Day of week distribution */}
            <Card>
              <CardHeader title="Distribuição por dia da semana"/>
              <div style={{ padding:"20px 24px" }}>
                {(() => {
                  const days=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
                  const counts=new Array(7).fill(0);
                  const km=new Array(7).fill(0);
                  runs.forEach(r=>{ const i=new Date(r.start_date).getDay(); counts[i]++; km[i]+=r.distance/1000; });
                  const maxC=Math.max(...counts,1);
                  return (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:10 }}>
                      {days.map((d,i)=>(
                        <div key={d} style={{ textAlign:"center" }}>
                          <div style={{ fontSize:11,color:"rgba(255,255,255,.45)",marginBottom:8,fontWeight:600 }}>{d}</div>
                          <div style={{ height:90,display:"flex",alignItems:"flex-end",justifyContent:"center",marginBottom:6 }}>
                            <div style={{ width:"65%",background:`rgba(252,76,2,${.15+.85*counts[i]/(maxC||1)})`,borderRadius:"4px 4px 0 0",height:`${(counts[i]/(maxC||1))*100}%`,minHeight:4,transition:"height .6s ease" }}/>
                          </div>
                          <div style={{ fontSize:16,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",color:"#FC4C02" }}>{counts[i]}</div>
                          <div style={{ fontSize:9,color:"rgba(255,255,255,.3)",marginTop:2 }}>{km[i].toFixed(0)}km</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </Card>
            {/* Time of day */}
            <Card>
              <CardHeader title="Horário das corridas"/>
              <div style={{ padding:"20px 24px" }}>
                {(() => {
                  const slots=[{label:"Manhã cedo\n5h-8h",range:[5,8]},{label:"Manhã\n8h-12h",range:[8,12]},{label:"Tarde\n12h-17h",range:[12,17]},{label:"Final de tarde\n17h-20h",range:[17,20]},{label:"Noite\n20h-24h",range:[20,24]}];
                  const counts=slots.map(s=>runs.filter(r=>{const h=new Date(r.start_date).getHours();return h>=s.range[0]&&h<s.range[1];}).length);
                  const maxC=Math.max(...counts,1);
                  return (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
                      {slots.map((s,i)=>(
                        <div key={i} style={{ textAlign:"center" }}>
                          <div style={{ fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:10,lineHeight:1.4,whiteSpace:"pre-line" }}>{s.label}</div>
                          <div style={{ height:80,display:"flex",alignItems:"flex-end",justifyContent:"center",marginBottom:6 }}>
                            <div style={{ width:"55%",background:`rgba(252,76,2,${.15+.85*counts[i]/(maxC||1)})`,borderRadius:"4px 4px 0 0",height:`${(counts[i]/(maxC||1))*100}%`,minHeight:4 }}/>
                          </div>
                          <div style={{ fontSize:18,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",color:"#FC4C02" }}>{counts[i]}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </Card>
          </div>
        )}

        {/* ══ AI COACH ══════════════════════════════════════════════════════════ */}
        {tab === "coach" && athlete && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:14 }}>
              <TSBGauge tsb={latest.tsb} ctl={latest.ctl} atl={latest.atl}/>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <Stat small icon="📈" label="Tendência CTL" value={tsbData.length>8?(latest.ctl>tsbData[tsbData.length-8]?.ctl?"↑ A melhorar":"↓ A descer"):"—"} sub="vs semana anterior"/>
                  <Stat small icon="🏃" label="Volume última semana" value={`${weeklyData[weeklyData.length-1]?.km?.toFixed(0)||0}km`}/>
                  <Stat small icon="🏆" label="PR mais recente" value={prs.find(p=>p.pr)?.label||"—"} sub={prs.find(p=>p.pr)?.pr}/>
                  <Stat small icon="❤️" label="FC média recente" value={`${Math.round(runs.slice(0,10).filter(r=>r.average_heartrate).reduce((s,r)=>s+r.average_heartrate,0)/(runs.slice(0,10).filter(r=>r.average_heartrate).length||1))}bpm`}/>
                </div>
              </div>
            </div>
            <AICoach activities={activities} athlete={athlete} tsbData={tsbData}/>
          </div>
        )}

      </div>
    </div>
  );
}