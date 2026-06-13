import { useState, useEffect, useRef } from "react";
import React from "react";
import "./index.css";
import "./App.css";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid, AreaChart, Area, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, ZAxis
} from "recharts";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Client ID do Strava (não é segredo — pode ficar no código)
const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID || "238201";
const REDIRECT_URI = typeof window !== "undefined"
  ? window.location.href.split("?")[0].split("#")[0] : "";
const STRAVA_AUTH_URL =
  `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}` +
  `&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&approval_prompt=auto&scope=read,activity:read_all,profile:read_all`;

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
  // Garante que a semana actual existe mesmo sem corridas
  const now = new Date();
  const monNow = new Date(now); monNow.setDate(now.getDate() - ((now.getDay()+6)%7));
  const curKey = monNow.toISOString().slice(0,10);
  if (!weeks[curKey]) weeks[curKey] = { week: curKey.slice(5), km:0, runs:0, time:0, elev:0 };

  // Ordena cronologicamente (mais antigo → mais recente) e pega as últimas 16 semanas
  return Object.entries(weeks)
    .sort(([a],[b]) => a.localeCompare(b))
    .slice(-16)
    .map(([,w]) => ({ ...w, km: +w.km.toFixed(1), elev: +w.elev.toFixed(0) }));
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
  return Object.entries(months)
    .sort(([a],[b]) => a.localeCompare(b))
    .slice(-12)
    .map(([,m]) => ({ ...m, km: +m.km.toFixed(1) }));
}

function getPRs(acts) {
  const runs = acts.filter(a => a.type === "Run" && a.distance > 0);
  const brackets = [
    { label: "10K",      min: 9800,  max: 10200 },
    { label: "Meia",     min: 20900, max: 21500 },
    { label: "Maratona", min: 41800, max: 42800 },
  ];
  const makePR = (candidates) => {
    if (!candidates.length) return null;
    const best = candidates.reduce((b, r) => r.average_speed > b.average_speed ? r : b);
    return {
      pr: fmtTime(best.moving_time),
      pace: fmtPace(1000 / best.average_speed),
      date: fmtDate(best.start_date),
      name: best.name,
      hr: best.average_heartrate ? Math.round(best.average_heartrate) : null,
      id: best.id,
    };
  };
  return brackets.map(b => {
    const all   = runs.filter(r => r.distance >= b.min && r.distance <= b.max);
    const races = all.filter(r => r.workout_type === 1);
    return {
      label: b.label,
      count: all.length,
      raceCount: races.length,
      record: makePR(all),    // melhor tempo real (treino ou prova)
      race:   makePR(races),  // melhor tempo em prova oficial
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

function InfoIcon({ text }) {
  const [show, setShow] = React.useState(false);
  return (
    <div style={{ position:"relative", display:"inline-flex", alignItems:"center" }}
      onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="2" style={{cursor:"help",flexShrink:0}}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      {show && (
        <div style={{
          position:"absolute", bottom:"calc(100% + 8px)", left:"50%", transform:"translateX(-50%)",
          background:"#1a1a2e", border:"1px solid rgba(255,255,255,.12)", borderRadius:9,
          padding:"8px 12px", fontSize:11, color:"rgba(255,255,255,.65)", lineHeight:1.55,
          whiteSpace:"pre-wrap", minWidth:180, maxWidth:260, zIndex:99,
          boxShadow:"0 8px 24px rgba(0,0,0,.5)",
          pointerEvents:"none",
        }}>
          {text}
          <div style={{ position:"absolute", top:"100%", left:"50%", transform:"translateX(-50%)",
            borderLeft:"5px solid transparent", borderRight:"5px solid transparent",
            borderTop:"5px solid rgba(255,255,255,.12)" }}/>
        </div>
      )}
    </div>
  );
}

function CardHeader({ title, info }) {
  return (
    <div style={{ padding:"16px 20px 0", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
      <div style={{ fontSize:11, fontWeight:500, letterSpacing:"0.04em", color:"rgba(255,255,255,.5)", textTransform:"uppercase" }}>{title}</div>
      {info && <InfoIcon text={info}/>}
    </div>
  );
}

function Stat({ label, value, sub, accent, icon, small, color, info }) {
  const ac = color || "#00C4B4";
  return (
    <div style={{
      background: accent ? "linear-gradient(135deg,#FC4C02,#c93700)" : C.surface,
      border: accent ? "none" : `1px solid ${C.border}`,
      borderRadius: 14, padding: small ? "14px 18px" : "18px 22px",
      display: "flex", flexDirection: "column", gap: 3, position: "relative",
      transition: "transform .18s,box-shadow .18s", cursor: "default",
    }}
    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 10px 32px rgba(0,0,0,.25)";}}
    onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
      {info && <div style={{ position:"absolute", top:10, right:10 }}><InfoIcon text={info}/></div>}
      {icon && <span style={{ fontSize: 18, marginBottom: 2 }}>{icon}</span>}
      <span style={{ fontSize: small ? 22 : 26, fontWeight: 700, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:"-.5px", color: accent?"#fff":ac }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing:"0.06em", textTransform:"uppercase", color: accent?"rgba(255,255,255,.8)":C.muted }}>{label}</span>
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
    <Card style={{ padding: 22, textAlign:"center", position:"relative" }}>
      <div style={{ position:"absolute", top:12, right:14 }}>
        <InfoIcon text={"TSB (Training Stress Balance) = CTL − ATL.\n> +15: descansado (possível perda de fitness)\n+5 a +15: zona de forma óptima — ideal para competir\n−5 a +5: neutro\n< −15: overreaching — risco de lesão"}/>
      </div>
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
  // Recua até à segunda-feira mais próxima (0=Dom,1=Seg,...,6=Sab → offset para segunda)
  const start = new Date(today);
  start.setDate(today.getDate() - 363);
  const dow = start.getDay(); // 0=Dom
  const offsetToMonday = dow === 0 ? 1 : dow === 1 ? 0 : -(dow - 1);
  start.setDate(start.getDate() + offsetToMonday);
  const DOW_LABELS = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
  for (let w=0; w<52; w++) {
    const week = [];
    for (let d=0; d<7; d++) {
      const dt = new Date(start); dt.setDate(start.getDate()+w*7+d);
      const key = dt.toISOString().slice(0,10);
      week.push({ date:key, km: byDay[key]||0, future: dt>today, dow: DOW_LABELS[d] });
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
    <div className="heatmap-scroll">
      <div className="heatmap-grid">
        {weeks.map((week,wi) => (
          <div key={wi} className="heatmap-week">
            {week.map((day,di) => (
              <div key={di} title={`${day.date}: ${day.km.toFixed(1)}km`}
                className="heatmap-day"
                style={{ background:col(day.km,day.future), cursor:day.km?"pointer":"default" }}
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

function ActivityRow({ act, onClick }) {
  const speed = act.average_speed || 0;
  const pace  = speed > 0 ? 1000/speed : 0;
  const hrZ   = act.average_heartrate ? getZone(act.average_heartrate) : null;
  return (
    <div className="act-row" onClick={onClick}>
      <div>
        <div style={{ fontSize:13, fontWeight:600, color:C.text, display:"flex", alignItems:"center", gap:6 }}>
          {act.pr_rank===1 && <span style={{ fontSize:10, background:"rgba(252,76,2,.2)", color:"#FC4C02", borderRadius:3, padding:"1px 5px", fontWeight:700 }}>PR</span>}
          {act.name}
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,.3)", marginTop:1 }}>{fmtDate(act.start_date)} · {act.type}</div>
      </div>
      <span style={{ fontSize:12, color:"#FC4C02", fontWeight:600 }}>{fmtDist(act.distance)}</span>
      <span className="act-col-time" style={{ fontSize:12, color:"rgba(255,255,255,.55)" }}>{fmtTime(act.moving_time)}</span>
      {act.type==="Run"
        ? <span style={{ fontSize:12, color:"rgba(255,255,255,.55)" }}>{fmtPace(pace)}/km</span>
        : <span style={{ fontSize:12, color:"rgba(255,255,255,.3)" }}>—</span>}
      {hrZ
        ? <span style={{ fontSize:11, fontWeight:600, color:hrZ.color, background:`${hrZ.color}22`, borderRadius:4, padding:"2px 6px", textAlign:"center" }}>{hrZ.label} {Math.round(act.average_heartrate)}</span>
        : <span/>}
      <span className="act-col-elev" style={{ fontSize:11, color:"rgba(255,255,255,.3)" }}>↑{Math.round(act.total_elevation_gain||0)}m</span>
    </div>
  );
}

// ─── ACTIVITY DETAIL MODAL ────────────────────────────────────────────────────
function ActivityDetail({ act, token, onClose }) {
  const [detail,   setDetail]   = useState(null);
  const [streams,  setStreams]  = useState(null);
  const [kudos,    setKudos]   = useState([]);
  const [comments, setComments]= useState([]);
  const [loading,  setLoading] = useState(true);
  const [activeStream, setActiveStream] = useState("heartrate");
  const mapRef = useRef(null);
  const mapInst = useRef(null);

  useEffect(() => {
    if (!token || !act) return;
    setLoading(true);
    Promise.all([
      fetch(`https://www.strava.com/api/v3/activities/${act.id}`, { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json()),
      fetch(`https://www.strava.com/api/v3/activities/${act.id}/streams?keys=latlng,heartrate,altitude,velocity_smooth,cadence,distance&key_by_type=true`, { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json()),
      fetch(`https://www.strava.com/api/v3/activities/${act.id}/kudos`, { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json()),
      fetch(`https://www.strava.com/api/v3/activities/${act.id}/comments`, { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json()),
    ]).then(([d, s, k, c]) => {
      setDetail(d);
      setStreams(s);
      setKudos(Array.isArray(k) ? k : []);
      setComments(Array.isArray(c) ? c : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [act, token]);

  // Mount Leaflet map once detail loads
  useEffect(() => {
    if (!mapRef.current || !streams?.latlng?.data?.length) return;
    if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; }

    // Dynamically load Leaflet
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = window.L;
      const coords = streams.latlng.data;
      const map = L.map(mapRef.current, { zoomControl:true, scrollWheelZoom:false });
      mapInst.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution:"© OpenStreetMap © CARTO", maxZoom:19
      }).addTo(map);

      // Draw route
      const polyline = L.polyline(coords, { color:"#FC4C02", weight:3, opacity:.9 }).addTo(map);
      map.fitBounds(polyline.getBounds(), { padding:[20,20] });

      // Start/end markers
      const startIcon = L.divIcon({ html:`<div style="width:12px;height:12px;background:#00C4B4;border-radius:50%;border:2px solid #fff"></div>`, iconSize:[12,12], iconAnchor:[6,6], className:"" });
      const endIcon   = L.divIcon({ html:`<div style="width:12px;height:12px;background:#FC4C02;border-radius:50%;border:2px solid #fff"></div>`, iconSize:[12,12], iconAnchor:[6,6], className:"" });
      L.marker(coords[0], { icon:startIcon }).bindTooltip("Início").addTo(map);
      L.marker(coords[coords.length-1], { icon:endIcon }).bindTooltip("Fim").addTo(map);
    };
    document.head.appendChild(script);
    return () => { if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; } };
  }, [streams]);

  // Build stream chart data
  const streamData = React.useMemo(() => {
    if (!streams?.distance?.data) return [];
    return streams.distance.data.map((d, i) => ({
      dist: +(d/1000).toFixed(2),
      hr:   streams.heartrate?.data?.[i] || null,
      alt:  streams.altitude?.data?.[i]  || null,
      pace: streams.velocity_smooth?.data?.[i] > 0 ? +(1000/streams.velocity_smooth.data[i]).toFixed(0) : null,
      cad:  streams.cadence?.data?.[i]   || null,
    })).filter((_,i) => i % 5 === 0); // sample every 5 points for perf
  }, [streams]);

  const streamConfig = {
    heartrate: { key:"hr",   color:"#FC4C02", label:"FC (bpm)",     unit:"bpm" },
    altitude:  { key:"alt",  color:"#00C4B4", label:"Altitude (m)", unit:"m" },
    pace:      { key:"pace", color:"#ffd54f", label:"Pace (min/km)", unit:"min/km", reversed:true },
    cadence:   { key:"cad",  color:"#ab47bc", label:"Cadência (spm)",unit:"spm" },
  };

  const sc = streamConfig[activeStream];

  const laps = detail?.laps || [];

  return (
    <div className="modal-overlay" style={{
      position:"fixed", inset:0, zIndex:1000,
      background:"rgba(0,0,0,.75)", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"flex-end", justifyContent:"center",
      padding:"0 16px 0",
    }} onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal-panel" style={{
        background:"#0f0f1a", border:`1px solid ${C.border}`, borderRadius:"18px 18px 0 0",
        width:"100%", maxWidth:900, maxHeight:"92vh", overflow:"auto",
        display:"flex", flexDirection:"column",
      }}>
        {/* Header */}
        <div style={{ padding:"18px 22px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:600, color:C.text }}>{act.name}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{fmtDate(act.start_date)} · {act.type} · {fmtDist(act.distance)}</div>
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <a href={`https://www.strava.com/activities/${act.id}`} target="_blank" rel="noreferrer"
              style={{ fontSize:11, color:"#FC4C02", textDecoration:"none", border:"1px solid rgba(252,76,2,.3)", borderRadius:7, padding:"5px 10px" }}>
              Ver no Strava ↗
            </a>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,.08)", border:"none", borderRadius:8, color:C.text, width:32, height:32, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>
        </div>

        {/* KPIs — disponíveis imediatamente da act */}
        <div style={{ padding:"18px 22px", display:"flex", flexDirection:"column", gap:16 }}>
            {/* KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:8 }}>
              {[
                { label:"Distância",  value:fmtDist(act.distance),          color:"#00C4B4" },
                { label:"Tempo",      value:fmtTime(act.moving_time),        color:"#00C4B4" },
                { label:"Pace médio", value:act.average_speed>0?`${fmtPace(1000/act.average_speed)}/km`:"—", color:"#ffd54f" },
                { label:"FC média",   value:act.average_heartrate?`${Math.round(act.average_heartrate)}bpm`:"—", color:"#FC4C02" },
                { label:"FC máx",     value:act.max_heartrate?`${Math.round(act.max_heartrate)}bpm`:"—",     color:"#ef5350" },
                { label:"Elevação",   value:`↑${Math.round(act.total_elevation_gain||0)}m`,                  color:"#66bb6a" },
                { label:"Kudos",      value:`👏 ${detail?.kudos_count||kudos.length||0}`,                    color:"#ffd54f" },
                { label:"Calorias",   value:detail?.calories?`${detail.calories}kcal`:"—",                   color:"#ab47bc" },
              ].map(k=>(
                <div key={k.label} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:16, fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:".06em", marginTop:2 }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Map — carrega progressivamente */}
            {streams?.latlng?.data?.length ? (
              <div style={{ borderRadius:12, overflow:"hidden", border:`1px solid ${C.border}` }}>
                <div ref={mapRef} style={{ height:300, width:"100%", background:"#111" }}/>
              </div>
            ) : loading ? (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, height:160, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <div style={{ display:"flex", gap:5 }}>
                  {[0,1,2].map(i=><div key={i} style={{ width:7,height:7,borderRadius:"50%",background:"#FC4C02",opacity:.6,animation:`bounce .9s ease-in-out ${i*.15}s infinite alternate` }}/>)}
                </div>
              </div>
            ) : (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:24, textAlign:"center", color:C.muted, fontSize:13 }}>
                GPS não disponível para esta atividade
              </div>
            )}

            {/* Stream chart */}
            {streamData.length > 0 && (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 18px" }}>
                <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
                  {Object.entries(streamConfig).map(([k,v]) => (
                    streams?.[k === "pace" ? "velocity_smooth" : k === "hr" ? "heartrate" : k]?.data &&
                    <button key={k} onClick={()=>setActiveStream(k)}
                      style={{ background: activeStream===k ? v.color+"22" : "transparent", border:`1px solid ${activeStream===k?v.color:C.border}`, borderRadius:6, padding:"4px 10px", color: activeStream===k ? v.color : C.muted, fontSize:11, cursor:"pointer", transition:"all .15s" }}>
                      {v.label}
                    </button>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={streamData}>
                    <defs>
                      <linearGradient id="sgrd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={sc.color} stopOpacity={0.25}/>
                        <stop offset="95%" stopColor={sc.color} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                    <XAxis dataKey="dist" tick={{fontSize:9,fill:C.muted}} tickFormatter={v=>`${v}km`}/>
                    <YAxis reversed={sc.reversed} tick={{fontSize:9,fill:C.muted}} tickFormatter={v=>sc.key==="pace"?fmtPace(v):v} domain={["auto","auto"]}/>
                    <Tooltip content={({active,payload})=>{
                      if(!active||!payload?.length)return null;
                      const v = payload[0]?.value;
                      return <div style={{background:"#1a1a2e",border:`1px solid ${C.faint}`,borderRadius:8,padding:"6px 10px",fontSize:11}}>
                        <span style={{color:sc.color}}>{sc.key==="pace"?`${fmtPace(v)}/km`:v ? `${v} ${sc.unit}` : "—"}</span>
                      </div>;
                    }}/>
                    <Area type="monotone" dataKey={sc.key} stroke={sc.color} strokeWidth={1.5} fill="url(#sgrd)" dot={false} connectNulls/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Laps */}
            {laps.length > 1 && (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"10px 16px", borderBottom:`1px solid ${C.border}`, fontSize:11, fontWeight:500, letterSpacing:".06em", textTransform:"uppercase", color:C.muted }}>
                  Splits / Laps
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ color:"rgba(255,255,255,.3)", fontSize:10, textTransform:"uppercase", letterSpacing:".06em" }}>
                        {["#","Distância","Tempo","Pace","FC avg","FC máx","Elev"].map(h=>(
                          <td key={h} style={{ padding:"7px 14px", textAlign:h==="#"?"center":"right" }}>{h}</td>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {laps.map((lap,i)=>{
                        const lapPace = lap.average_speed > 0 ? 1000/lap.average_speed : 0;
                        return (
                          <tr key={lap.id} style={{ borderTop:`1px solid rgba(255,255,255,.04)` }}>
                            <td style={{ padding:"7px 14px", textAlign:"center", color:C.muted }}>{i+1}</td>
                            <td style={{ padding:"7px 14px", textAlign:"right", color:"#00C4B4" }}>{fmtDist(lap.distance)}</td>
                            <td style={{ padding:"7px 14px", textAlign:"right", color:C.text }}>{fmtTime(lap.moving_time)}</td>
                            <td style={{ padding:"7px 14px", textAlign:"right", color:"#ffd54f" }}>{lapPace?`${fmtPace(lapPace)}/km`:"—"}</td>
                            <td style={{ padding:"7px 14px", textAlign:"right", color:"#FC4C02" }}>{lap.average_heartrate?`${Math.round(lap.average_heartrate)}bpm`:"—"}</td>
                            <td style={{ padding:"7px 14px", textAlign:"right", color:"#ef5350" }}>{lap.max_heartrate?`${Math.round(lap.max_heartrate)}bpm`:"—"}</td>
                            <td style={{ padding:"7px 14px", textAlign:"right", color:"#66bb6a" }}>↑{Math.round(lap.total_elevation_gain||0)}m</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Kudos + Comments */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 16px" }}>
                <div style={{ fontSize:11, fontWeight:500, letterSpacing:".06em", textTransform:"uppercase", color:C.muted, marginBottom:8 }}>
                  👏 Kudos ({kudos.length})
                </div>
                {kudos.length === 0
                  ? <div style={{ fontSize:12, color:"rgba(255,255,255,.25)" }}>Sem kudos ainda</div>
                  : <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {kudos.map(k=>(
                        <span key={k.athlete_id} style={{ fontSize:11, color:"rgba(255,255,255,.55)", background:"rgba(255,255,255,.05)", borderRadius:6, padding:"3px 8px" }}>
                          {k.firstname} {k.lastname?.charAt(0)}.
                        </span>
                      ))}
                    </div>
                }
              </div>
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 16px" }}>
                <div style={{ fontSize:11, fontWeight:500, letterSpacing:".06em", textTransform:"uppercase", color:C.muted, marginBottom:8 }}>
                  💬 Comentários ({comments.length})
                </div>
                {comments.length === 0
                  ? <div style={{ fontSize:12, color:"rgba(255,255,255,.25)" }}>Sem comentários</div>
                  : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {comments.map(c=>(
                        <div key={c.id} style={{ fontSize:12 }}>
                          <span style={{ color:"#00C4B4", fontWeight:600 }}>{c.athlete?.firstname}: </span>
                          <span style={{ color:"rgba(255,255,255,.6)" }}>{c.text}</span>
                        </div>
                      ))}
                    </div>
                }
              </div>
            </div>

          </div>
      </div>
    </div>
  );
}

// ─── ATHLETE STATUS PANEL ─────────────────────────────────────────────────────
function AthleteStatus({ tsbData, activities, athlete }) {
  const latest  = tsbData[tsbData.length-1] || {};
  const runs    = activities.filter(a=>a.type==="Run");
  const now     = new Date();
  const monNow  = new Date(now); monNow.setDate(now.getDate()-((now.getDay()+6)%7));
  const weekKm  = runs.filter(r=>new Date(r.start_date)>=monNow).reduce((s,r)=>s+r.distance/1000,0);
  const lastWk  = (() => { const d=new Date(monNow); d.setDate(d.getDate()-7); return d; })();
  const lastKm  = runs.filter(r=>{ const d=new Date(r.start_date); return d>=lastWk&&d<monNow; }).reduce((s,r)=>s+r.distance/1000,0);
  const avgHR   = Math.round(runs.slice(0,10).filter(r=>r.average_heartrate).reduce((s,r)=>s+r.average_heartrate,0)/(runs.slice(0,10).filter(r=>r.average_heartrate).length||1));
  const tsb     = latest.tsb || 0;
  const ctl     = latest.ctl || 0;
  const atl     = latest.atl || 0;

  const form    = tsb > 10 ? { label:"Fresco", color:"#66bb6a", icon:"✅" }
                : tsb > 2  ? { label:"Óptimo", color:"#00C4B4", icon:"🎯" }
                : tsb > -5 ? { label:"Neutro",  color:"#ffa726", icon:"⚖️" }
                : tsb > -15? { label:"Fatigado", color:"#FC4C02", icon:"⚠️" }
                :             { label:"Overreaching", color:"#ef5350", icon:"🚨" };

  const rec     = tsb > 8  ? "Dia ideal para corrida de qualidade ou prova."
                : tsb > 2  ? "Boas condições para treino moderado a intenso."
                : tsb > -5 ? "Mantém volume mas evita intensidade máxima."
                : tsb > -15? "Prioriza recuperação. Corrida leve ou descanso."
                :             "Descanso obrigatório. Risco elevado de lesão.";

  const items = [
    { label:"Forma (TSB)", value:`${tsb>0?"+":""}${tsb.toFixed(1)}`, color:form.color },
    { label:"Fitness (CTL)", value:ctl.toFixed(1), color:"#00C4B4" },
    { label:"Fadiga (ATL)", value:atl.toFixed(1), color:"#FC4C02" },
    { label:"Esta semana", value:`${weekKm.toFixed(0)}km`, color:"#00C4B4" },
    { label:"Semana anterior", value:`${lastKm.toFixed(0)}km`, color:"rgba(255,255,255,.5)" },
    { label:"FC média (10 corr.)", value:`${avgHR}bpm`, color:"#ef5350" },
  ];

  return (
    <div style={{ margin:"16px 20px 0", background:"rgba(255,255,255,.03)", border:`1px solid rgba(255,255,255,.07)`, borderRadius:12, padding:"16px 18px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
        <span style={{ fontSize:16 }}>{form.icon}</span>
        <span style={{ fontSize:12, fontWeight:600, color:form.color, letterSpacing:".04em", textTransform:"uppercase" }}>Estado actual: {form.label}</span>
        <div style={{ marginLeft:"auto" }}><InfoIcon text={"Análise automática baseada nos dados actuais:\nTSB = CTL − ATL (Training Stress Balance)\nCTL = fitness crónico (42d) · ATL = fadiga aguda (7d)"}/></div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:8, marginBottom:12 }}>
        {items.map(it=>(
          <div key={it.label} style={{ textAlign:"center", background:"rgba(255,255,255,.03)", borderRadius:8, padding:"8px 10px" }}>
            <div style={{ fontSize:16, fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", color:it.color }}>{it.value}</div>
            <div style={{ fontSize:9, color:"rgba(255,255,255,.35)", textTransform:"uppercase", letterSpacing:".06em", marginTop:2 }}>{it.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:12, color:"rgba(255,255,255,.5)", background:"rgba(255,255,255,.03)", borderRadius:8, padding:"8px 12px", borderLeft:`3px solid ${form.color}` }}>
        💡 {rec}
      </div>
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
      const r = await fetch("/api/coach", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          system: SYSTEM,
          messages: history.map(m => ({ role:m.role, content:m.content }))
        })
      });
      const data = await r.json();
      const reply = data.reply || data.error || "Erro ao obter resposta.";
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

      {/* Auto-analysis — estado actual do atleta */}
      <AthleteStatus tsbData={tsbData} activities={activities} athlete={athlete}/>

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
      <div style={{ minHeight: messages.length ? 280 : 0, maxHeight: 600, overflowY:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:12 }}>
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
      borderRadius: 14, padding: "18px 20px", position:"relative",
      transition: "transform .18s, box-shadow .18s",
    }}
    onMouseEnter={e=>{ if(pr.pr){e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 28px rgba(252,76,2,.18)";} }}
    onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
      <div style={{ position:"absolute", top:12, right:14 }}>
        <InfoIcon text={pr.pr
          ? `Melhor resultado em ${pr.label}.\nPace: ${pr.pace}/km · FC: ${pr.hr||"—"}bpm\nBaseado em ${pr.count} corrida${pr.count!==1?"s":""} nesta distância nas últimas 300 atividades.`
          : `Sem corridas registadas na distância ${pr.label} nas últimas 300 atividades carregadas.`}/>
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, paddingRight:20 }}>
        <span style={{ fontSize:11, fontWeight:500, letterSpacing:"0.06em", textTransform:"uppercase", color:C.muted }}>{pr.label}</span>
        {pr.pr && <span style={{ fontSize:10, background:"rgba(0,196,180,.12)", color:"#00C4B4", borderRadius:4, padding:"2px 8px", fontWeight:600 }}>Melhor tempo</span>}
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
  const [selectedAct, setSelectedAct] = useState(null);

  // ── OAuth callback: apanha o ?code= que o Strava devolve e troca por token ──
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const code = p.get("code");
    const denied = p.get("error"); // utilizador clicou "Negar" na página do Strava
    window.history.replaceState({}, "", window.location.pathname); // limpa a URL
    if (denied) { setError("Acesso negado pelo utilizador."); return; }
    if (!code) return;

    setLoading(true);
    setError(null);
    fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.access_token) {
          setToken(d.access_token);
        } else {
          setError("Autenticação falhou: " + (d.error || "verifica as variáveis de ambiente na Vercel."));
        }
      })
      .catch(() => setError("Erro de rede ao contactar o servidor."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const ath = await fetch("https://www.strava.com/api/v3/athlete", { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json());
        const stats = await fetch(`https://www.strava.com/api/v3/athletes/${ath.id}/stats`, { headers:{Authorization:`Bearer ${token}`} }).then(r=>r.json());
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
    { id:"overview", label:"Visão Geral",   icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>, color:"#FC4C02" },
    { id:"load",     label:"Training Load", icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, color:"#ff7043" },
    { id:"volume",   label:"Volume",        icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="14" width="4" height="7" rx="1"/><rect x="9" y="9" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="17" rx="1"/></svg>, color:"#42a5f5" },
    { id:"pace",     label:"Pace & FC",     icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>, color:"#ef5350" },
    { id:"prs",      label:"Recordes",      icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, color:"#ffd54f" },
    { id:"heatmap",  label:"Mapa de Calor", icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="4" height="4" rx="1"/><rect x="10" y="3" width="4" height="4" rx="1"/><rect x="18" y="3" width="4" height="4" rx="1"/><rect x="2" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/><rect x="18" y="10" width="4" height="4" rx="1"/><rect x="2" y="17" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/><rect x="18" y="17" width="4" height="4" rx="1"/></svg>, color:"#66bb6a" },
    { id:"coach",    label:"AI Coach",      icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/><path d="M20 2v4h4"/></svg>, color:"#ab47bc" },
  ];

  // ─── LOGIN SCREEN ──────────────────────────────────────────────────────────
  if (!athlete && !loading) {
    return (
      <div className="login-screen">
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet"/>
        <div className="login-box">

          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:14, marginBottom:40 }}>
            <div style={{ width:56, height:56, borderRadius:16, background:"linear-gradient(135deg,#FC4C02,#c93700)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>⚡</div>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, fontWeight:700, letterSpacing:"0px", color:"#fff", lineHeight:1 }}>
                STRAVA <span style={{color:"#FC4C02", fontWeight:300}}>⚡</span>LAB
              </div>
              <div style={{ fontSize:12, color:C.muted, letterSpacing:"0.08em" }}>TRAINING INTELLIGENCE DASHBOARD</div>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {STRAVA_CLIENT_ID && STRAVA_CLIENT_ID !== "SEU_CLIENT_ID"
              ? <a href={STRAVA_AUTH_URL}
                  style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, background:"#FC4C02", color:"#fff", textDecoration:"none", borderRadius:12, padding:"15px 24px", fontWeight:700, fontSize:15, transition:"filter .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.1)"}
                  onMouseLeave={e=>e.currentTarget.style.filter=""}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
                  </svg>
                  Ligar com Strava
                </a>
              : <div style={{ background:"rgba(252,76,2,.08)", border:"1px solid rgba(252,76,2,.3)", borderRadius:12, padding:"16px 18px", fontSize:13, color:"rgba(252,76,2,.9)", textAlign:"left", lineHeight:1.7 }}>
                  <strong>⚙️ Configuração necessária</strong><br/>
                  Em <code>App.jsx</code>, substitui o valor de <code style={{color:"#FC4C02"}}>STRAVA_CLIENT_ID</code> pelo teu Client ID em{" "}
                  <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer" style={{color:"#FC4C02"}}>strava.com/settings/api</a>.<br/>
                  Na Vercel, define a variável de ambiente <code>STRAVA_CLIENT_SECRET</code>.
                </div>
            }
          </div>

          {error && (
            <div style={{ marginTop:16, background:"rgba(229,57,53,.1)", border:"1px solid rgba(229,57,53,.3)", borderRadius:10, padding:"11px 14px", fontSize:13, color:"#ef9a9a", lineHeight:1.6 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Rodapé de ajuda */}
          <p style={{ marginTop:28, fontSize:11, color:"rgba(255,255,255,.22)", lineHeight:1.8 }}>
            Os teus dados ficam apenas no browser durante a sessão.<br/>
            Nenhum dado é armazenado nos nossos servidores.
          </p>
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
    <div className="app-shell">
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet"/>

      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-logo">
            <span style={{ fontSize:18 }}>⚡</span>
            <span className="app-logo-text">
              STRAVA <span style={{color:"#FC4C02", fontWeight:300}}>⚡</span>LAB
            </span>
            {useMock && <span style={{ fontSize:10, background:"rgba(255,183,0,.12)", color:"#ffb300", border:"1px solid rgba(255,183,0,.25)", borderRadius:4, padding:"2px 8px", letterSpacing:".06em", flexShrink:0 }}>DEMO</span>}
          </div>
          <div className="app-user">
            <span className="app-user-name">{athlete?.firstname} {athlete?.lastname}</span>
            <div className="app-online-dot"/>
          </div>
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav className="tab-bar">
        <div className="tab-bar-inner">
          {tabs.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`tab-btn${tab===t.id?" active":""}`}
              style={tab===t.id ? { color:t.color, borderBottomColor:t.color } : {}}>
              <span className="tab-icon" style={tab===t.id?{color:t.color}:{}}>{t.icon}</span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── Activity Detail Modal ── */}
      {selectedAct && (
        <ActivityDetail act={selectedAct} token={token} onClose={()=>setSelectedAct(null)}/>
      )}

      {/* ── Page content ── */}
      <div key={tab} className="page-content page">

        {/* ══ OVERVIEW ══════════════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

            {/* ── Totais ano atual em destaque ── */}
            {(() => {
              const thisYear = new Date().getFullYear();
              const lastYear = thisYear - 1;
              const yearRuns = runs.filter(r => new Date(r.start_date).getFullYear() === thisYear);
              const prevRuns = runs.filter(r => new Date(r.start_date).getFullYear() === lastYear);
              const stats = [
                {
                  label: "Corridas",
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="2"/><path d="M10.2 8.2L7 14h3l1 5h2l1-5h3l-3.2-5.8"/></svg>,
                  color: "#00C4B4",
                  info: `Corridas registadas no Strava em ${thisYear} vs ${lastYear}.`,
                  year:  yearRuns.length,
                  prev:  prevRuns.length,
                  fmt:   v => v,
                },
                {
                  label: "Distância",
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6l9-3 9 3M3 18l9 3 9-3"/></svg>,
                  color: "#00C4B4",
                  info: `Distância total em ${thisYear} vs ${lastYear}. Baseado nas últimas 300 atividades carregadas.`,
                  year:  yearRuns.reduce((s,r)=>s+r.distance,0),
                  prev:  prevRuns.reduce((s,r)=>s+r.distance,0),
                  fmt:   v => fmtDist(v),
                },
                {
                  label: "Tempo",
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                  color: "#00C4B4",
                  info: `Tempo em movimento em ${thisYear} vs ${lastYear}.`,
                  year:  yearRuns.reduce((s,r)=>s+r.moving_time,0),
                  prev:  prevRuns.reduce((s,r)=>s+r.moving_time,0),
                  fmt:   v => fmtTime(v),
                },
                {
                  label: "Elevação",
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 4 12 14 8 8 2 18"/></svg>,
                  color: "#00C4B4",
                  info: `Elevação acumulada em ${thisYear} vs ${lastYear}.`,
                  year:  yearRuns.reduce((s,r)=>s+(r.total_elevation_gain||0),0),
                  prev:  prevRuns.reduce((s,r)=>s+(r.total_elevation_gain||0),0),
                  fmt:   v => `${Math.round(v)}m`,
                },
                {
                  label: "FC Média",
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
                  color: "#FC4C02",
                  info: `FC média de todas as corridas com dados de FC em ${thisYear}. Zonas Garmin: Z1≤108 Z2≤133 Z3≤152 Z4≤167 Z5≥168.`,
                  year:  Math.round(yearRuns.filter(r=>r.average_heartrate).reduce((s,r)=>s+r.average_heartrate,0)/(yearRuns.filter(r=>r.average_heartrate).length||1)),
                  prev:  Math.round(prevRuns.filter(r=>r.average_heartrate).reduce((s,r)=>s+r.average_heartrate,0)/(prevRuns.filter(r=>r.average_heartrate).length||1)),
                  fmt:   v => `${v||"—"}${v?"bpm":""}`,
                  noBar: true,
                },
              ];
              return (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
                  {stats.map(s => {
                    const pct  = s.noBar ? null : Math.min(100, Math.round((s.year / (s.prev||1)) * 100));
                    const diff = s.noBar ? null : s.prev ? ((s.year - s.prev) / s.prev * 100).toFixed(0) : null;
                    const up   = diff > 0;
                    const ac   = s.color || "#00C4B4";
                    return (
                      <div key={s.label} style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:14, padding:"16px 18px", display:"flex", flexDirection:"column", gap:4, position:"relative" }}>
                        <div style={{ position:"absolute", top:10, right:12 }}>
                          <InfoIcon text={s.info}/>
                        </div>
                        <div style={{ color:ac, marginBottom:2 }}>{s.icon}</div>
                        <div style={{ fontSize:10, color:"rgba(255,255,255,.35)", fontWeight:500, letterSpacing:".06em", textTransform:"uppercase" }}>
                          {s.label}
                        </div>
                        <div style={{ fontSize:28, fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", color:ac, lineHeight:1 }}>
                          {s.fmt(s.year)}
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:10, color:`${ac}99`, fontWeight:500, letterSpacing:".04em" }}>{thisYear}</span>
                          {diff !== null && (
                            <span style={{ fontSize:10, fontWeight:600, color: up?"#66bb6a":"#ef5350" }}>
                              {up?"↑":"↓"}{Math.abs(diff)}%
                            </span>
                          )}
                        </div>
                        {pct !== null && (
                          <div style={{ margin:"6px 0 4px", height:2, background:"rgba(255,255,255,.07)", borderRadius:2, overflow:"hidden" }}>
                            <div style={{ width:`${Math.min(pct,100)}%`, height:"100%", background: pct>=100?"#66bb6a":ac, borderRadius:2 }}/>
                          </div>
                        )}
                        <div style={{ fontSize:11, color:"rgba(255,255,255,.28)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span>{lastYear}: <strong style={{color:"rgba(255,255,255,.4)", fontWeight:500}}>{s.fmt(s.prev)}</strong></span>
                          {pct !== null && <span style={{ fontSize:10, color:"rgba(255,255,255,.18)" }}>{pct}%</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── AI Daily Recommendation Banner ── */}
            {(() => {
              const tsb  = latest.tsb || 0;
              const ctl  = latest.ctl || 0;
              const atl  = latest.atl || 0;
              const form = tsb > 10  ? { label:"Fresco",       color:"#66bb6a", bg:"rgba(102,187,106,.08)", border:"rgba(102,187,106,.25)", icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> }
                         : tsb > 2   ? { label:"Forma Óptima", color:"#00C4B4", bg:"rgba(0,196,180,.08)",   border:"rgba(0,196,180,.25)",   icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00C4B4" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> }
                         : tsb > -5  ? { label:"Neutro",       color:"#ffa726", bg:"rgba(255,167,38,.08)",  border:"rgba(255,167,38,.25)",  icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffa726" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg> }
                         : tsb > -15 ? { label:"Fatigado",     color:"#FC4C02", bg:"rgba(252,76,2,.08)",    border:"rgba(252,76,2,.3)",     icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FC4C02" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> }
                         :             { label:"Overreaching", color:"#ef5350", bg:"rgba(239,83,80,.08)",   border:"rgba(239,83,80,.3)",    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> };

              const rec  = tsb > 10  ? { title:"Dia ideal para qualidade", detail:"Estás fresco e com boa forma. Faz um treino de intervalos, tempo run ou prova. Aproveita esta janela." }
                         : tsb > 2   ? { title:"Boas condições para treinar", detail:"Forma óptima. Podes correr a intensidade moderada a alta. Evita apenas volume excessivo." }
                         : tsb > -5  ? { title:"Mantém volume, evita intensidade máxima", detail:"Estado neutro. Rodagem fácil a moderada. Guarda a energia para quando o TSB subir." }
                         : tsb > -15 ? { title:"Prioriza recuperação hoje", detail:"Fadiga acumulada elevada. Corrida leve (Z1/Z2) ou descanso activo. Não forces qualidade." }
                         :             { title:"Descanso obrigatório", detail:"Overreaching. Risco real de lesão. Descanso completo ou actividade muito leve. Não corras hoje." };

              const monNow = new Date(); monNow.setDate(monNow.getDate()-((monNow.getDay()+6)%7));
              const weekKm = runs.filter(r=>new Date(r.start_date)>=monNow).reduce((s,r)=>s+r.distance/1000,0);

              return (
                <div style={{ background:form.bg, border:`1px solid ${form.border}`, borderRadius:16, padding:"18px 22px", display:"flex", alignItems:"center", gap:18 }}>
                  {/* Status icon */}
                  <div style={{ width:48, height:48, borderRadius:12, background:`rgba(${form.color === "#66bb6a" ? "102,187,106" : form.color === "#00C4B4" ? "0,196,180" : form.color === "#ffa726" ? "255,167,38" : form.color === "#FC4C02" ? "252,76,2" : "239,83,80"},.15)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {form.icon}
                  </div>

                  {/* Main message */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:11, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:form.color }}>{form.label}</span>
                      <span style={{ fontSize:10, color:"rgba(255,255,255,.2)" }}>·</span>
                      <span style={{ fontSize:11, color:"rgba(255,255,255,.35)" }}>TSB {tsb>0?"+":""}{tsb.toFixed(1)}</span>
                    </div>
                    <div style={{ fontSize:15, fontWeight:600, color:"rgba(255,255,255,.9)", marginBottom:3, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".02em" }}>{rec.title}</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,.45)", lineHeight:1.5 }}>{rec.detail}</div>
                  </div>

                  {/* Mini stats */}
                  <div style={{ display:"flex", gap:12, flexShrink:0 }}>
                    {[
                      { label:"CTL", value:ctl.toFixed(0), color:"#FC4C02" },
                      { label:"ATL", value:atl.toFixed(0), color:"#ffa726" },
                      { label:"Semana", value:`${weekKm.toFixed(0)}km`, color:"#00C4B4" },
                    ].map(s=>(
                      <div key={s.label} style={{ textAlign:"center", background:"rgba(255,255,255,.05)", borderRadius:10, padding:"8px 14px" }}>
                        <div style={{ fontSize:18, fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", color:s.color, lineHeight:1 }}>{s.value}</div>
                        <div style={{ fontSize:9, color:"rgba(255,255,255,.3)", textTransform:"uppercase", letterSpacing:".07em", marginTop:3 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* TSB + Radar */}
            <div className="overview-charts" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:14 }}>
              <TSBGauge tsb={latest.tsb} ctl={latest.ctl} atl={latest.atl}/>
              {/* CTL/ATL/TSB mini chart */}
              <Card>
                <CardHeader title="CTL / ATL / TSB · 8 semanas" info={"CTL (Fitness Crónico): média ponderada a 42 dias do treino.\nATL (Fadiga Aguda): média ponderada a 7 dias.\nTSB (Forma): CTL − ATL. Positivo = fresco, negativo = cansado."}/>
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
                <CardHeader title="Performance Radar" info={"Comparação normalizada de 5 dimensões:\nPace (velocidade média), Volume (km totais), FC Baixa (eficiência aeróbica), Elevação e Frescura (TSB actual)."}/>
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
              <CardHeader title="Atividades Recentes" info={"Últimas 16 atividades registadas no Strava.\nPR = Personal Record nessa distância.\nZonas de FC baseadas nas configurações Garmin."}/>
              <div className="act-table-header">
                {["Atividade","Dist","Tempo","Pace","FC","Elev"].map(h=>(
                  <span key={h} style={{ fontSize:9, color:"rgba(255,255,255,.28)", fontWeight:500, letterSpacing:".07em", textTransform:"uppercase" }}>{h}</span>
                ))}
              </div>
              {activities.slice(0,16).map(a=><ActivityRow key={a.id} act={a} onClick={()=>setSelectedAct(a)}/>)}
            </Card>
          </div>
        )}

        {/* ══ TRAINING LOAD ══════════════════════════════════════════════════════ */}
        {tab === "load" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div className="kpi-grid">
              {[
                { icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00C4B4" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, color:"#00C4B4", label:"CTL · Fitness crónico",  value:latest.ctl.toFixed(1), sub:"Média ponderada 42 dias",
                  info:"Chronic Training Load: representa o teu nível de fitness acumulado.\nCalculado como média exponencial ponderada (constante de tempo 42 dias).\nValor mais alto = mais apto, mas também mais fatigado." },
                { icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FC4C02" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>, color:"#FC4C02", label:"ATL · Fadiga aguda",     value:latest.atl.toFixed(1), sub:"Média ponderada 7 dias",
                  info:"Acute Training Load: representa a fadiga acumulada recentemente.\nCalculado com constante de tempo 7 dias.\nValor alto após semana intensa é normal — requer recuperação." },
                { icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>, color:"#66bb6a", label:"TSB · Forma",
                  value:`${latest.tsb>0?"+":""}${latest.tsb.toFixed(1)}`,
                  accent:latest.tsb>2,
                  sub:latest.tsb>5?"Pronto para competir":latest.tsb<-12?"Cuidado: sobrecarga":"Equilíbrio de treino",
                  info:"Training Stress Balance = CTL − ATL.\nZona óptima de performance: +5 a +15.\nAbaixo de −15: overtraining. Acima de +20: possível destreino." },
              ].map(s => (
                <div key={s.label} style={{
                  background: s.accent ? "rgba(102,187,106,.15)" : C.surface,
                  border: s.accent ? "1px solid rgba(102,187,106,.35)" : `1px solid ${C.border}`,
                  borderRadius:14, padding:"18px 22px", display:"flex", flexDirection:"column", gap:3,
                  position:"relative",
                }}>
                  <div style={{ position:"absolute", top:10, right:12 }}><InfoIcon text={s.info}/></div>
                  {s.icon && <span style={{ marginBottom:2 }}>{s.icon}</span>}
                  <span style={{ fontSize:26, fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:"-.5px", color: s.accent?"#66bb6a":(s.color||C.text) }}>{s.value}</span>
                  <span style={{ fontSize:10, fontWeight:500, letterSpacing:"0.06em", textTransform:"uppercase", color: s.accent?"rgba(255,255,255,.8)":C.muted }}>{s.label}</span>
                  {s.sub && <span style={{ fontSize:11, color: s.accent?"rgba(255,255,255,.7)":"rgba(255,255,255,.3)", marginTop:1 }}>{s.sub}</span>}
                </div>
              ))}
            </div>
            {/* Full TSB chart */}
            <Card>
              <CardHeader title="CTL / ATL / TSB — histórico" info={"CTL: fitness acumulado (decaimento 42 dias).\nATL: fadiga acumulada (decaimento 7 dias).\nTSB = CTL − ATL.\n+5 a +15: zona de forma óptima para competir.\n< −15: risco de overtraining."}/>
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
              <CardHeader title="Carga diária de treino" info={"Estimativa de carga por sessão baseada no Suffer Score do Strava.\nSe não disponível, usa duração × fator de intensidade estimado pela FC."}/>
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
            <div className="load-two-col">
              <Card>
                <CardHeader title="Distribuição por zonas FC" info={"Zonas Garmin configuradas:\nZ1 ≤108bpm · Z2 109-133 · Z3 134-152 · Z4 153-167 · Z5 ≥168\nÁrea abaixo de Z3 = treino aeróbico base (ideal: >80%)."}/>
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
                      <span style={{ color:z.c,fontWeight:600 }}>{z.z}</span> {z.label} <span style={{ color:"rgba(255,255,255,.25)" }}>{z.bpm}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title="Rácio Aeróbico vs Anaeróbico" info={"Método 80/20: a evidência científica sugere que 80% do volume deve ser em Z1-Z2 e apenas 20% em Z4-Z5.\nRácio atual baseado na contagem de corridas por zona."}/>
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
            {/* KPI row com SVG icons */}
            {(() => {
              const lastWeek = weeklyData[weeklyData.length-2];
              const thisWeek = weeklyData[weeklyData.length-1];
              const avg = weeklyData.reduce((s,w)=>s+w.km,0)/(weeklyData.length||1);
              const best = Math.max(...weeklyData.map(w=>w.km),0);
              const svgProps = { width:18, height:18, viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", strokeWidth:2 };
              const kpis = [
                {
                  label:"Esta semana", value:`${thisWeek?.km?.toFixed(0)||0}km`,
                  info:"Km de corrida acumulados desde segunda-feira desta semana.",
                  icon:<svg {...svgProps}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                  color:"#FC4C02",
                },
                {
                  label:"Semana anterior", value:`${lastWeek?.km?.toFixed(0)||0}km`,
                  info:"Km totais da semana passada (segunda a domingo).",
                  icon:<svg {...svgProps}><polyline points="15 18 9 12 15 6"/></svg>,
                  color:"#ffa726",
                },
                {
                  label:"Média semanal", value:`${avg.toFixed(0)}km`,
                  info:"Média de km por semana nas últimas 16 semanas com atividade.",
                  icon:<svg {...svgProps}><line x1="4" y1="12" x2="20" y2="12"/><polyline points="9 7 4 12 9 17"/></svg>,
                  color:"#42a5f5",
                },
                {
                  label:"Melhor semana", value:`${best.toFixed(0)}km`,
                  info:"Volume máximo numa só semana no histórico carregado (últimas 300 atividades).",
                  icon:<svg {...svgProps}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
                  color:"#ffd54f",
                  accent:true,
                },
                {
                  label:"Total YTD", value:fmtDist(athlete?.stats?.ytd_run_totals?.distance||0),
                  info:"Distância total de corrida no ano actual, segundo as estatísticas do Strava (inclui todas as atividades, não só as 300 carregadas).",
                  icon:<svg {...svgProps}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
                  color:"#66bb6a",
                },
                {
                  label:"Total histórico", value:fmtDist(athlete?.stats?.all_run_totals?.distance||0),
                  info:"Distância total acumulada em toda a tua história no Strava.",
                  icon:<svg {...svgProps}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
                  color:"#ab47bc",
                },
              ];
              return (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10 }}>
                  {kpis.map(k => (
                    <div key={k.label} style={{
                      background: k.accent ? "linear-gradient(135deg,#FC4C02,#c93700)" : C.surface,
                      border: k.accent ? "none" : `1px solid ${C.border}`,
                      borderRadius:14, padding:"16px 18px", display:"flex", flexDirection:"column", gap:5,
                      position:"relative",
                      transition:"transform .18s", cursor:"default",
                    }}
                    onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
                    onMouseLeave={e=>e.currentTarget.style.transform=""}>
                      <div style={{ position:"absolute", top:10, right:12 }}><InfoIcon text={k.info}/></div>
                      <div style={{ color: k.accent?"rgba(255,255,255,.7)":k.color }}>{k.icon}</div>
                      <div style={{ fontSize:24, fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", color: k.accent?"#fff":"#f0f0f0", lineHeight:1 }}>{k.value}</div>
                      <div style={{ fontSize:10, fontWeight:500, letterSpacing:".06em", textTransform:"uppercase", color: k.accent?"rgba(255,255,255,.75)":"rgba(255,255,255,.4)" }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <Card>
              <CardHeader title="Volume semanal · 16 semanas" info={"Quilómetros de corrida por semana civil (segunda a domingo).\nA semana começa na segunda-feira."}/>
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
            <div className="volume-two-col">
              <Card>
                <CardHeader title="Volume mensal" info={"Total de km de corrida por mês calendário.\nBaseado nas atividades carregadas (máx. 300)."}/>
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
                <CardHeader title="Corridas por semana" info={"Número de sessões de corrida por semana.\nMeta habitual de corredores de competição: 5-7 sessões/semana."}/>
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
              <CardHeader title="Elevação acumulada semanal" info={"Ganho de elevação total por semana em metros.\nUtil para perceber semanas de carga montanha vs planície."}/>
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
              <Stat
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00C4B4" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                label="Pace médio (20)" value={fmtPace(paceTrend.reduce((s,r)=>s+r.pace,0)/(paceTrend.length||1))} sub="/km"
                info={"Pace médio das últimas 20 corridas.\nCalculado a partir da velocidade média registada no Strava.\nInclui treinos fáceis e rodagens — não é o pace de competição."}/>
              <Stat
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
                label="Pace mais rápido" value={fmtPace(Math.min(...paceTrend.map(r=>r.pace).filter(Boolean)))} accent
                info={"Pace mais rápido registado nas últimas 20 corridas.\nCorresponde à corrida com maior velocidade média.\nPode ser um treino de intervalos ou corrida de competição."}/>
              <Stat
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>}
                label="FC média" value={`${Math.round(paceTrend.reduce((s,r)=>s+r.hr,0)/(paceTrend.length||1))}bpm`}
                info={"FC média das últimas 20 corridas com dados de FC.\nZonas Garmin: Z1≤108 · Z2≤133 · Z3≤152 · Z4≤167 · Z5≥168\nFC elevada com pace lento pode indicar fadiga acumulada."}/>
              <Stat
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00C4B4" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg>}
                label="Eficiência aerób." value={paceTrend.length?`${(paceTrend.reduce((s,r)=>s+r.pace/r.hr,0)/paceTrend.length*100).toFixed(1)}`:"—"} sub="pace/bpm ×100"
                info={"Índice de eficiência aeróbica = (pace ÷ FC) × 100.\nValores mais altos = melhor eficiência (mais rápido com menos esforço).\nMelhoria progressiva indica adaptação aeróbica ao treino."}/>
            </div>
            <Card>
              <CardHeader title="Evolução de pace" info={"Pace médio (min/km) das últimas 25 corridas.\nValores mais baixos = mais rápido.\nTendência descendente indica melhoria de desempenho."}/>
              <div style={{ padding:"16px 8px 12px" }}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={paceTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                    <XAxis dataKey="date" tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <YAxis reversed domain={["auto","auto"]} tickFormatter={v=>fmtPace(v)} tick={{fontSize:9,fill:"rgba(255,255,255,.28)"}}/>
                    <Tooltip content={({active,payload,label})=>{
                      if(!active||!payload?.length) return null;
                      return <div style={{background:"#1a1a2e",border:`1px solid ${C.faint}`,borderRadius:10,padding:"9px 13px",fontSize:12}}>
                        <div style={{color:C.muted,marginBottom:5,fontSize:11}}>{label}</div>
                        {payload.map((p,i)=><div key={i} style={{color:p.color||"#fff",fontWeight:600}}>{p.name}: {fmtPace(p.value)}/km</div>)}
                      </div>;
                    }}/>
                    <Line dataKey="pace" name="Pace" stroke="#FC4C02" strokeWidth={2.5} dot={{r:3,fill:"#FC4C02"}}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <CardHeader title="Frequência cardíaca por corrida" info={"FC média de cada corrida ao longo do tempo.\nFC estável com pace a melhorar = ganho de eficiência aeróbica."}/>
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
              <CardHeader title="Pace vs Distância" info={"Cada ponto = 1 corrida.\nEsperado: pace aumenta (mais lento) com a distância.\nPontos fora da tendência = corridas de qualidade ou muito fáceis."}/>
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
        {tab === "prs" && (() => {
          const [prsSubTab, setPrsSubTab] = React.useState("records");
          const paceBar = (paceStr, col) => {
            if (!paceStr) return null;
            const secs = parseInt(paceStr.split(":")[0])*60 + parseInt(paceStr.split(":")[1]);
            const pct  = Math.max(8, Math.min(100, Math.round((390 - secs) / (390 - 180) * 100)));
            return <div style={{ height:6, background:"rgba(255,255,255,.06)", borderRadius:3, overflow:"hidden", marginTop:6 }}>
              <div style={{ width:`${pct}%`, height:"100%", background:col, borderRadius:3, transition:"width .7s ease" }}/>
            </div>;
          };
          const PRSection = ({ data, type }) => (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {data.map(d => {
                const entry = type === "race" ? d.race : d.record;
                const secs  = entry?.pace ? parseInt(entry.pace.split(":")[0])*60+parseInt(entry.pace.split(":")[1]) : 0;
                const col   = secs < 270 ? "#FC4C02" : secs < 330 ? "#ffa726" : "#00C4B4";
                return (
                  <div key={d.label} style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:16, padding:"20px 24px" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                      <div>
                        <div style={{ fontSize:10, color:"rgba(255,255,255,.35)", letterSpacing:".1em", textTransform:"uppercase", marginBottom:6 }}>
                          {d.label} {type === "race" ? `· ${d.raceCount} prova${d.raceCount!==1?"s":""}` : `· ${d.count} corrida${d.count!==1?"s":""}`}
                        </div>
                        {entry ? <>
                          <div style={{ fontSize:42, fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:"-.5px", color:"#fff", lineHeight:1 }}>{entry.pr}</div>
                          <div style={{ fontSize:16, fontWeight:700, color:col, marginTop:4 }}>{entry.pace}/km</div>
                        </> : (
                          <div style={{ fontSize:14, color:"rgba(255,255,255,.25)", marginTop:8 }}>
                            {type === "race" ? "Sem provas classificadas nesta distância" : "Sem corridas nesta distância"}
                          </div>
                        )}
                      </div>
                      {entry && (
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          {entry.hr && <div style={{ fontSize:13, color:"#ef5350", marginBottom:4 }}>♥ {entry.hr}bpm</div>}
                          <div style={{ fontSize:11, color:"rgba(255,255,255,.3)" }}>{entry.date}</div>
                          <div style={{ fontSize:11, color:"rgba(255,255,255,.22)", maxWidth:160, marginTop:2 }}>{entry.name}</div>
                        </div>
                      )}
                    </div>
                    {entry && paceBar(entry.pace, col)}
                  </div>
                );
              })}
            </div>
          );
          return (
            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
              {/* Sub-tab switcher */}
              <div style={{ display:"flex", gap:8 }}>
                {[{id:"records",label:"⏱ Recordes pessoais"},{id:"races",label:"🏅 Provas oficiais"}].map(t=>(
                  <button key={t.id} onClick={()=>setPrsSubTab(t.id)} style={{
                    padding:"8px 18px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                    background: prsSubTab===t.id ? "#FC4C02" : "rgba(255,255,255,.06)",
                    color: prsSubTab===t.id ? "#fff" : "rgba(255,255,255,.5)",
                    transition:"all .2s",
                  }}>{t.label}</button>
                ))}
              </div>

              {prsSubTab === "records" && <>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.3)", paddingLeft:2 }}>
                  Melhor tempo real por distância — treinos e provas. Gama exacta: 10K ±200m · Meia ±300m · Maratona ±500m.
                </div>
                <PRSection data={prs} type="record"/>
              </>}

              {prsSubTab === "races" && <>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.3)", paddingLeft:2 }}>
                  Apenas corridas marcadas como <strong style={{color:"rgba(255,255,255,.45)"}}>Prova</strong> no Strava (workout_type = Race).
                </div>
                <PRSection data={prs} type="race"/>
              </>}

              {/* All-time fastest runs table */}
              <Card>
                <CardHeader title="Corridas mais rápidas" info={"Corridas com distância > 8km ordenadas por pace médio.\nClica para ver detalhe."}/>
                <div className="race-table-header">
                  {["Corrida","Dist","Tempo","Pace","FC","Data"].map(h=>(
                    <span key={h} style={{ fontSize:9,color:"rgba(255,255,255,.22)",fontWeight:700,letterSpacing:".09em",textTransform:"uppercase" }}>{h}</span>
                  ))}
                </div>
                {runs.filter(r=>r.distance>8000).sort((a,b)=>b.average_speed-a.average_speed).slice(0,15).map(a=><ActivityRow key={a.id} act={a} onClick={()=>setSelectedAct(a)}/>)}
              </Card>
            </div>
          );
        })()}

        {/* ══ HEATMAP ════════════════════════════════════════════════════════════ */}
        {tab === "heatmap" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div className="heatmap-stats">
              <Stat icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00C4B4" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} label="Dias ativos (90d)" value={new Set(activities.map(a=>a.start_date.slice(0,10))).size}/>
              <Stat icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 2C8 2 4 5 4 9c0 5 8 13 8 13s8-8 8-13c0-4-4-7-8-7z"/><circle cx="12" cy="9" r="2.5" fill="rgba(255,255,255,.4)"/></svg>} label="Streak atual" accent value={(() => {
                let s=0; const today=new Date();
                for(let i=0;i<30;i++){
                  const d=new Date(today); d.setDate(today.getDate()-i);
                  const key=d.toISOString().slice(0,10);
                  if(activities.some(a=>a.start_date.slice(0,10)===key)) s++; else break;
                } return `${s}d`;
              })()}/>
              <Stat icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00C4B4" strokeWidth="2"><circle cx="12" cy="5" r="2"/><path d="M10.2 8.2L7 14h3l1 5h2l1-5h3l-3.2-5.8"/></svg>} label="Total atividades" value={activities.length}/>
              <Stat icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00C4B4" strokeWidth="2"><rect x="2" y="14" width="4" height="7" rx="1"/><rect x="9" y="9" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="17" rx="1"/></svg>} label="Freq. semanal média" value={`${(runs.length/Math.max(weeklyData.length,1)).toFixed(1)}x`}/>
              <Stat icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00C4B4" strokeWidth="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>} label="Corridas noturnas (após 19h)" value={runs.filter(r=>new Date(r.start_date).getHours()>=19).length}/>
              <Stat icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>} label="Corridas matinais (antes 9h)" value={runs.filter(r=>new Date(r.start_date).getHours()<9).length}/>
            </div>
            <Card>
              <CardHeader title="Mapa de calor · 12 meses" info={"Cada quadrado = 1 dia. Cor = volume em km nesse dia.\nSemanas começam na segunda-feira.\nPermite identificar padrões de consistência e períodos de descanso."}/>
              <div style={{ padding:"16px 20px 20px", overflowX:"auto" }}>
                <HeatMap activities={activities}/>
              </div>
            </Card>
            {/* Monthly volume chart */}
            <Card>
              <CardHeader title="Volume mensal · 12 meses" info={"Total de km de todas as atividades por mês.\nOs últimos 12 meses a contar de hoje."}/>
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
              <CardHeader title="Distribuição por dia da semana" info={"Frequência e volume de corridas por dia da semana.\nPermite identificar os dias preferidos de treino e distribuição da carga semanal."}/>
              <div style={{ padding:"20px 24px" }}>
                {(() => {
                  // Ordem Seg→Dom: getDay() devolve 0=Dom,1=Seg,...,6=Sáb
                  // Remapeia para índice 0=Seg,...,6=Dom
                  const days = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
                  const dayIndex = [1,2,3,4,5,6,0]; // getDay() correspondente a cada posição
                  const counts = new Array(7).fill(0);
                  const km     = new Array(7).fill(0);
                  runs.forEach(r => {
                    const dow = new Date(r.start_date).getDay(); // 0=Dom
                    const pos = dayIndex.indexOf(dow);           // posição Seg-based
                    if (pos !== -1) { counts[pos]++; km[pos] += r.distance/1000; }
                  });
                  const maxC = Math.max(...counts, 1);
                  return (
                    <div className="dow-grid">
                      {days.map((d,i)=>(
                        <div key={d} style={{ textAlign:"center" }}>
                          <div style={{ fontSize:11,color:"rgba(255,255,255,.45)",marginBottom:8,fontWeight:600 }}>{d}</div>
                          <div style={{ height:90,display:"flex",alignItems:"flex-end",justifyContent:"center",marginBottom:6 }}>
                            <div style={{ width:"65%",background:`rgba(252,76,2,${.15+.85*counts[i]/(maxC||1)})`,borderRadius:"4px 4px 0 0",height:`${(counts[i]/(maxC||1))*100}%`,minHeight:4,transition:"height .6s ease" }}/>
                          </div>
                          <div style={{ fontSize:16,fontWeight:700,fontFamily:"'Barlow Condensed',sans-serif",color:"#00C4B4" }}>{counts[i]}</div>
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
              <CardHeader title="Horário das corridas" info={"Distribuição das sessões por período do dia.\nBaseado na hora de início registada no Strava (hora local)."}/>
              <div style={{ padding:"20px 24px" }}>
                {(() => {
                  const slots=[{label:"Manhã cedo\n5h-8h",range:[5,8]},{label:"Manhã\n8h-12h",range:[8,12]},{label:"Tarde\n12h-17h",range:[12,17]},{label:"Final de tarde\n17h-20h",range:[17,20]},{label:"Noite\n20h-24h",range:[20,24]}];
                  const counts=slots.map(s=>runs.filter(r=>{const h=new Date(r.start_date).getHours();return h>=s.range[0]&&h<s.range[1];}).length);
                  const maxC=Math.max(...counts,1);
                  return (
                    <div className="tod-grid">
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
          <div className="col-gap-18">
            <div className="coach-top">
              <TSBGauge tsb={latest.tsb} ctl={latest.ctl} atl={latest.atl}/>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div className="coach-stats-grid">
                  <Stat small icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00C4B4" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>} label="Tendência CTL" value={tsbData.length>8?(latest.ctl>tsbData[tsbData.length-8]?.ctl?"↑ A melhorar":"↓ A descer"):"—"} sub="vs semana anterior"/>
                  <Stat small icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00C4B4" strokeWidth="2"><rect x="2" y="14" width="4" height="7" rx="1"/><rect x="9" y="9" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="17" rx="1"/></svg>} label="Volume última semana" value={`${weeklyData[weeklyData.length-1]?.km?.toFixed(0)||0}km`}/>
                  <Stat small icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>} label="PR mais recente" value={prs.find(p=>p.pr)?.label||"—"} sub={prs.find(p=>p.pr)?.pr}/>
                  <Stat small icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FC4C02" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>} label="FC média recente" value={`${Math.round(runs.slice(0,10).filter(r=>r.average_heartrate).reduce((s,r)=>s+r.average_heartrate,0)/(runs.slice(0,10).filter(r=>r.average_heartrate).length||1))}bpm`}/>
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