import { useState, useEffect } from "react";
import { useUser, useClerk, SignIn } from "@clerk/react";
import { supabase } from "./supabaseClient";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function AIAnalysisStream({ checkin, onDone }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const response = await fetch("/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are an expert fitness coach AI assistant. Analyze client weekly check-ins and provide structured, actionable feedback for the coach. Be concise, specific, and empathetic. Format your response in clear sections:

🔍 KEY OBSERVATIONS (2-3 bullet points)
⚠️ FLAGS (concerns to address, or "None" if all good)  
🎯 SUGGESTED ADJUSTMENTS (specific changes to programming/nutrition)
💬 COACH MESSAGE DRAFT (a short, motivating message the coach can send)`,
          messages: [{
            role: "user",
            content: `Analyze this client check-in:

Client: ${checkin.clientName}
Goal: ${checkin.goal}
Week: ${checkin.week}

Check-in Data:
- Weight: ${checkin.weight} lbs (last week: ${checkin.last_weight} lbs)
- Sleep quality: ${checkin.sleep}/10
- Stress level: ${checkin.stress}/10
- Training adherence: ${checkin.adherence}%
- Energy levels: ${checkin.energy}/10
- Hunger levels: ${checkin.hunger}/10
- Client notes: "${checkin.notes}"
- Biggest challenge this week: "${checkin.challenge}"

Provide coaching analysis and recommendations.`
          }]
        })
      });

      const data = await response.json();
      if (cancelled) return;

      const full = data.content?.[0]?.text || "Unable to generate analysis.";
      for (let i = 0; i <= full.length; i += 3) {
        if (cancelled) return;
        setText(full.slice(0, i));
        await sleep(15);
      }
      setText(full);
      setDone(true);
      onDone(full);
    }
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ fontFamily: "'Courier New', monospace", fontSize: 13, lineHeight: 1.7, color: "#e8e0d5", whiteSpace: "pre-wrap", minHeight: 120 }}>
      {text}
      {!done && <span style={{ animation: "blink 1s infinite", color: "#f5a623" }}>▋</span>}
    </div>
  );
}

export default function App() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const [upgrading, setUpgrading] = useState(false);
  const [view, setView] = useState("dashboard");

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          email: user.emailAddresses[0]?.emailAddress
        })
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) { console.error(e); }
    setUpgrading(false);
  }
  const [clients, setClients] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [selectedCheckin, setSelectedCheckin] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisText, setAnalysisText] = useState("");
  const [coachNote, setCoachNote] = useState("");
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientGoal, setNewClientGoal] = useState("Fat loss");
  const [clientForm, setClientForm] = useState({
    name: "", weight: "", lastWeight: "", sleep: 7, stress: 5,
    adherence: 100, energy: 7, hunger: 5, notes: "", challenge: "", goal: "Fat loss", week: 1
  });
  const [formSubmitted, setFormSubmitted] = useState(false);

  const bg = "#0d0d0d";
  const card = { background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12 };
  const accent = "#f5a623";
  const green = "#4ade80";
  const red = "#f87171";

  // Load data from Supabase
  useEffect(() => {
    if (!isSignedIn || !user) return;
    loadData();
  }, [isSignedIn, user]);

  async function loadData() {
    setLoading(true);
    const coachId = user.id;

    const { data: clientsData } = await supabase
      .from("clients")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });

    const { data: checkinsData } = await supabase
      .from("checkins")
      .select("*, clients(name, goal)")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });

    setClients(clientsData || []);
    setCheckins((checkinsData || []).map(c => ({
      ...c,
      clientName: c.clients?.name || "Unknown",
      goal: c.clients?.goal || "",
      week: c.week_number || 1,
      lastWeight: c.last_weight,
      avatar: (c.clients?.name || "??").split(" ").map(n => n[0]).join("").slice(0, 2)
    })));
    setLoading(false);
  }

  async function addClient() {
    if (!newClientName.trim()) return;
    const { data } = await supabase.from("clients").insert({
      coach_id: user.id,
      name: newClientName.trim(),
      goal: newClientGoal
    }).select().single();
    if (data) {
      setClients(prev => [data, ...prev]);
      setNewClientName("");
      setNewClientGoal("Fat loss");
      setShowAddClient(false);
    }
  }

  async function handleClientSubmit() {
    // Find or create client by name
    let clientId = null;
    const existing = clients.find(c => c.name.toLowerCase() === clientForm.name.toLowerCase());
    if (existing) {
      clientId = existing.id;
    } else {
      const { data } = await supabase.from("clients").insert({
        coach_id: user?.id || "public",
        name: clientForm.name,
        goal: clientForm.goal
      }).select().single();
      if (data) clientId = data.id;
    }

    const { data } = await supabase.from("checkins").insert({
      client_id: clientId,
      coach_id: user?.id || "public",
      weight: parseFloat(clientForm.weight),
      last_weight: parseFloat(clientForm.lastWeight),
      sleep: clientForm.sleep,
      stress: clientForm.stress,
      adherence: clientForm.adherence,
      energy: clientForm.energy,
      hunger: clientForm.hunger,
      notes: clientForm.notes,
      challenge: clientForm.challenge,
      week_number: parseInt(clientForm.week),
      status: "pending"
    }).select("*, clients(name, goal)").single();

    if (data) {
      setCheckins(prev => [{
        ...data,
        clientName: data.clients?.name || clientForm.name,
        goal: data.clients?.goal || clientForm.goal,
        week: data.week_number || 1,
        lastWeight: data.last_weight,
        avatar: clientForm.name.split(" ").map(n => n[0]).join("").slice(0, 2),
        submittedAt: "Just now"
      }, ...prev]);
      setFormSubmitted(true);
    }
  }

  function openReview(checkin) {
    setSelectedCheckin(checkin);
    setAnalyzing(true);
    setAnalysisText("");
    setCoachNote("");
    setApproved(false);
    setView("review");
  }

  function handleAnalysisDone(text) {
    setAnalyzing(false);
    setAnalysisText(text);
  }

  async function handleApprove() {
    await supabase.from("checkins").update({
      status: "approved",
      analysis: analysisText,
      coach_note: coachNote
    }).eq("id", selectedCheckin.id);

    setCheckins(prev => prev.map(c =>
      c.id === selectedCheckin.id ? { ...c, status: "approved", analysis: analysisText, coachNote } : c
    ));
    setApproved(true);
  }

  const SliderInput = ({ label, value, onChange, min = 1, max = 10, color = "#f5a623" }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ fontSize: 12, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>{label}</label>
        <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}{max === 10 ? "/10" : "%"}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: color, height: 4 }} />
    </div>
  );

  // Loading state
  if (!isLoaded) {
    return (
      <div style={{ background: bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#555", fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  // Sign in page
  if (!isSignedIn) {
    return (
      <div style={{ background: "#0d0d0d", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Serif+Display&display=swap');
          * { box-sizing: border-box; }
          .cl-rootBox, .cl-card { background: #161616 !important; }
          .cl-headerTitle, .cl-headerSubtitle { color: #fff !important; }
          .cl-formFieldLabel { color: #999 !important; }
          .cl-formButtonPrimary { background: #f5a623 !important; color: #000 !important; }
        `}</style>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
          <div style={{ width: 40, height: 40, background: accent, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚡</div>
          <span style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 26 }}>CheckIn AI</span>
        </div>
        <SignIn appearance={{ variables: { colorPrimary: "#f5a623", colorBackground: "#161616", colorText: "#ffffff", colorInputBackground: "#1e1e1e", colorInputText: "#ffffff" } }} />
      </div>
    );
  }

  // Client check-in form
  if (view === "checkin") {
    return (
      <div style={{ background: bg, minHeight: "100vh", padding: "40px 20px", fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Serif+Display&display=swap');
          * { box-sizing: border-box; }
          @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
          @keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } }
          input[type=range] { cursor: pointer; }
          textarea:focus, input:focus { outline: 2px solid #f5a623 !important; }
        `}</style>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {formSubmitted ? (
            <div style={{ textAlign: "center", animation: "fadeUp .5s ease", ...card, padding: 60 }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
              <h2 style={{ color: "#fff", fontFamily: "'DM Serif Display'", fontSize: 28, margin: "0 0 12px" }}>Check-in submitted!</h2>
              <p style={{ color: "#666", fontSize: 15 }}>Your coach will review and respond shortly.</p>
              <button onClick={() => { setFormSubmitted(false); setView("dashboard"); }}
                style={{ marginTop: 32, background: accent, color: "#000", border: "none", borderRadius: 8, padding: "12px 28px", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
                Back to Dashboard
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 32 }}>
                <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 24 }}>← Back</button>
                <h1 style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 32, margin: "0 0 6px" }}>Weekly Check-in</h1>
                <p style={{ color: "#666", fontSize: 14, margin: 0 }}>Be honest — your coach uses this to help you.</p>
              </div>

              <div style={{ ...card, padding: 28, marginBottom: 16 }}>
                <h3 style={{ color: accent, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 20px" }}>Your Info</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  {[["Name", "name", "text"], ["Goal", "goal", "text"], ["Week #", "week", "number"]].map(([lbl, key, type]) => (
                    <div key={key} style={key === "name" ? { gridColumn: "1/-1" } : {}}>
                      <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{lbl}</label>
                      <input type={type} value={clientForm[key]} onChange={e => setClientForm(p => ({ ...p, [key]: e.target.value }))}
                        style={{ width: "100%", background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[["Current Weight (lbs)", "weight"], ["Last Week Weight (lbs)", "lastWeight"]].map(([lbl, key]) => (
                    <div key={key}>
                      <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{lbl}</label>
                      <input type="number" value={clientForm[key]} onChange={e => setClientForm(p => ({ ...p, [key]: e.target.value }))}
                        style={{ width: "100%", background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14 }} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ ...card, padding: 28, marginBottom: 16 }}>
                <h3 style={{ color: accent, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 24px" }}>Rate Your Week</h3>
                <SliderInput label="Sleep Quality" value={clientForm.sleep} onChange={v => setClientForm(p => ({ ...p, sleep: v }))} color="#818cf8" />
                <SliderInput label="Stress Level" value={clientForm.stress} onChange={v => setClientForm(p => ({ ...p, stress: v }))} color={red} />
                <SliderInput label="Energy Levels" value={clientForm.energy} onChange={v => setClientForm(p => ({ ...p, energy: v }))} color={green} />
                <SliderInput label="Hunger Levels" value={clientForm.hunger} onChange={v => setClientForm(p => ({ ...p, hunger: v }))} color="#fb923c" />
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <label style={{ fontSize: 12, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>Training Adherence</label>
                    <span style={{ fontSize: 14, fontWeight: 700, color: accent }}>{clientForm.adherence}%</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                    {[0, 25, 50, 75, 100].map(val => (
                      <button key={val} type="button" onClick={() => setClientForm(p => ({ ...p, adherence: val }))}
                        style={{ padding: "10px 0", borderRadius: 8, border: `1px solid ${clientForm.adherence === val ? accent : "#333"}`, background: clientForm.adherence === val ? "#1e1200" : "#1a1a1a", color: clientForm.adherence === val ? accent : "#666", fontWeight: clientForm.adherence === val ? 700 : 400, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                        {val}%
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 }}>
                    {[10, 33, 60, 90].map(val => (
                      <button key={val} type="button" onClick={() => setClientForm(p => ({ ...p, adherence: val }))}
                        style={{ padding: "8px 0", borderRadius: 8, border: `1px solid ${clientForm.adherence === val ? accent : "#2a2a2a"}`, background: clientForm.adherence === val ? "#1e1200" : "transparent", color: clientForm.adherence === val ? accent : "#555", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ ...card, padding: 28, marginBottom: 24 }}>
                <h3 style={{ color: accent, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 20px" }}>In Your Own Words</h3>
                {[["How did the week go?", "notes", "Give your coach context..."], ["Biggest challenge this week?", "challenge", "What got in the way?"]].map(([lbl, key, ph]) => (
                  <div key={key} style={{ marginBottom: 20 }}>
                    <label style={{ display: "block", fontSize: 12, color: "#999", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{lbl}</label>
                    <textarea rows={3} placeholder={ph} value={clientForm[key]} onChange={e => setClientForm(p => ({ ...p, [key]: e.target.value }))}
                      style={{ width: "100%", background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 14, resize: "vertical", fontFamily: "inherit" }} />
                  </div>
                ))}
              </div>

              <button onClick={handleClientSubmit}
                style={{ width: "100%", background: accent, color: "#000", border: "none", borderRadius: 10, padding: "16px", fontWeight: 700, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>
                Submit Check-in →
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Review page
  if (view === "review" && selectedCheckin) {
    const c = selectedCheckin;
    const weightChange = c.weight - (c.lastWeight || c.last_weight || 0);
    return (
      <div style={{ background: bg, minHeight: "100vh", padding: "40px 20px", fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Serif+Display&display=swap');
          * { box-sizing: border-box; }
          @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
          @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
          @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        `}</style>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 28 }}>← Back to dashboard</button>

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, ${accent}, #e07b00)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#000" }}>{c.avatar}</div>
            <div>
              <h1 style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 26, margin: "0 0 2px" }}>{c.clientName}</h1>
              <p style={{ color: "#666", fontSize: 13, margin: 0 }}>Week {c.week} · {c.goal}</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Weight Change", value: `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} lbs`, color: weightChange < 0 && c.goal === "Fat loss" ? green : weightChange > 0 && c.goal === "Fat loss" ? red : "#fff" },
              { label: "Sleep", value: `${c.sleep}/10`, color: c.sleep >= 7 ? green : c.sleep >= 5 ? accent : red },
              { label: "Stress", value: `${c.stress}/10`, color: c.stress <= 4 ? green : c.stress <= 7 ? accent : red },
              { label: "Adherence", value: `${c.adherence}%`, color: c.adherence >= 85 ? green : c.adherence >= 65 ? accent : red },
              { label: "Energy", value: `${c.energy}/10`, color: c.energy >= 7 ? green : c.energy >= 5 ? accent : red },
              { label: "Hunger", value: `${c.hunger}/10`, color: c.hunger <= 5 ? green : c.hunger <= 7 ? accent : red },
            ].map(m => (
              <div key={m.label} style={{ ...card, padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div style={{ ...card, padding: 24, marginBottom: 20 }}>
            <h3 style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 16px" }}>Client Notes</h3>
            <p style={{ color: "#ccc", fontSize: 14, lineHeight: 1.7, margin: "0 0 12px" }}>"{c.notes}"</p>
            <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6, margin: 0 }}>Challenge: <span style={{ color: "#bbb" }}>{c.challenge}</span></p>
          </div>

          <div style={{ ...card, padding: 24, marginBottom: 20, borderColor: analyzing ? "#2a2218" : "#2a2a2a", background: analyzing ? "#121008" : "#161616" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: analyzing ? accent : green, animation: analyzing ? "pulse 1.5s infinite" : "none" }} />
              <h3 style={{ color: analyzing ? accent : green, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: 0 }}>
                {analyzing ? "AI Analyzing Check-in..." : "AI Analysis Complete"}
              </h3>
            </div>
            <AIAnalysisStream checkin={c} onDone={handleAnalysisDone} />
          </div>

          {!analyzing && !approved && (
            <div style={{ ...card, padding: 24, marginBottom: 20, animation: "fadeUp .4s ease" }}>
              <h3 style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 12px" }}>Add Your Note (Optional)</h3>
              <textarea rows={3} placeholder="Add anything before sending..." value={coachNote}
                onChange={e => setCoachNote(e.target.value)}
                style={{ width: "100%", background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 14, resize: "vertical", fontFamily: "inherit", outline: "none" }} />
              <button onClick={handleApprove}
                style={{ marginTop: 16, width: "100%", background: green, color: "#000", border: "none", borderRadius: 10, padding: "14px", fontWeight: 700, cursor: "pointer", fontSize: 15, fontFamily: "inherit" }}>
                ✓ Approve & Send Feedback
              </button>
            </div>
          )}

          {approved && (
            <div style={{ ...card, padding: 24, borderColor: "#1a3a1a", background: "#0d1f0d", animation: "fadeUp .4s ease", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
              <p style={{ color: green, fontWeight: 700, fontSize: 16, margin: "0 0 4px" }}>Feedback saved for {c.clientName}</p>
              <p style={{ color: "#555", fontSize: 13, margin: 0 }}>Check-in marked complete</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Dashboard
  const pendingCheckins = checkins.filter(c => c.status === "pending");
  const approvedCheckins = checkins.filter(c => c.status === "approved");

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Serif+Display&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
        .hover-card:hover { border-color: #3a3a3a !important; transform: translateY(-1px); transition: all .15s ease; }
        .cta-btn:hover { background: #e09920 !important; }
      `}</style>

      <div style={{ borderBottom: "1px solid #1e1e1e", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
          <span style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 20 }}>CheckIn AI</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: "#555", fontSize: 13 }}>{user.firstName || user.emailAddresses[0]?.emailAddress}</span>
          <button onClick={() => signOut()} style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 8, padding: "6px 14px", color: "#666", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Sign out</button>
        </div>
      </div>

      <div style={{ padding: "40px", width: "100%" }}>
        {loading ? (
          <div style={{ color: "#555", fontSize: 14, textAlign: "center", paddingTop: 60 }}>Loading your dashboard...</div>
        ) : (
          <>
            {/* Trial Banner */}
            <div style={{ background: "linear-gradient(135deg, #1a1200, #1a0d00)", border: "1px solid #3a2800", borderRadius: 12, padding: "16px 24px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <span style={{ color: accent, fontWeight: 700, fontSize: 14 }}>🎉 7-day free trial active</span>
                <span style={{ color: "#666", fontSize: 13, marginLeft: 12 }}>Upgrade anytime to keep full access at $99/month</span>
              </div>
              <button onClick={handleUpgrade} disabled={upgrading}
                style={{ background: accent, color: "#000", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit", opacity: upgrading ? 0.7 : 1 }}>
                {upgrading ? "Redirecting..." : "Upgrade to Pro →"}
              </button>
            </div>

            <div style={{ marginBottom: 40, animation: "fadeUp .4s ease" }}>
              <h1 style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 36, margin: "0 0 6px" }}>
                Good morning, {user.firstName || "Coach"} 👋
              </h1>
              <p style={{ color: "#555", fontSize: 15, margin: 0 }}>
                {pendingCheckins.length > 0
                  ? <><span style={{ color: accent, fontWeight: 700 }}>{pendingCheckins.length} check-in{pendingCheckins.length > 1 ? "s" : ""}</span> waiting for your review</>
                  : "All caught up! No pending check-ins."}
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 40 }}>
              {[
                { label: "Active Clients", value: clients.length, icon: "👥" },
                { label: "Pending Reviews", value: pendingCheckins.length, icon: "⏳", highlight: pendingCheckins.length > 0 },
                { label: "Approved This Week", value: approvedCheckins.length, icon: "✅" },
                { label: "Total Check-ins", value: checkins.length, icon: "📈" },
              ].map(s => (
                <div key={s.label} style={{ ...card, padding: "20px 24px", borderColor: s.highlight ? "#3a2800" : "#2a2a2a", background: s.highlight ? "#1a1200" : "#161616" }}>
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.highlight ? accent : "#fff", marginBottom: 2 }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
              <div>
                <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  Pending Check-ins
                  {pendingCheckins.length > 0 && <span style={{ background: accent, color: "#000", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{pendingCheckins.length}</span>}
                </h2>

                {pendingCheckins.length === 0 ? (
                  <div style={{ ...card, padding: 40, textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🎉</div>
                    <p style={{ color: "#555", fontSize: 14 }}>All check-ins reviewed!</p>
                  </div>
                ) : (
                  pendingCheckins.map(c => {
                    const weightChange = c.weight - (c.lastWeight || c.last_weight || 0);
                    const flags = [];
                    if (c.adherence < 80) flags.push({ label: `${c.adherence}% adherence`, color: red });
                    if (c.stress >= 8) flags.push({ label: "High stress", color: "#fb923c" });
                    if (c.sleep < 6) flags.push({ label: "Poor sleep", color: "#818cf8" });

                    return (
                      <div key={c.id} className="hover-card" onClick={() => openReview(c)}
                        style={{ ...card, padding: 24, marginBottom: 12, cursor: "pointer", transition: "all .15s ease" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #f5a623, #e07b00)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#000" }}>{c.avatar}</div>
                            <div>
                              <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{c.clientName}</div>
                              <div style={{ color: "#555", fontSize: 12 }}>Week {c.week} · {c.goal}</div>
                            </div>
                          </div>
                          <div style={{ background: "#1e1200", color: accent, fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>Needs review</div>
                        </div>

                        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: weightChange < 0 ? green : red, background: weightChange < 0 ? "#0d2010" : "#1f0d0d", padding: "4px 10px", borderRadius: 20 }}>
                            {weightChange > 0 ? "+" : ""}{weightChange.toFixed(1)} lbs
                          </span>
                          <span style={{ fontSize: 12, color: "#888", background: "#1a1a1a", padding: "4px 10px", borderRadius: 20 }}>Sleep {c.sleep}/10</span>
                          {flags.map(f => (
                            <span key={f.label} style={{ fontSize: 12, color: f.color, background: "#1a1a1a", padding: "4px 10px", borderRadius: 20 }}>⚠ {f.label}</span>
                          ))}
                        </div>

                        <p style={{ color: "#666", fontSize: 13, margin: "0 0 16px", lineHeight: 1.5, fontStyle: "italic" }}>"{(c.notes || "").slice(0, 100)}..."</p>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, color: "#555" }}>Click to review with AI →</span>
                          <span style={{ fontSize: 11, color: accent }}>⚡ AI Ready</span>
                        </div>
                      </div>
                    );
                  })
                )}

                {approvedCheckins.length > 0 && (
                  <>
                    <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: "32px 0 16px" }}>Recently Approved</h2>
                    {approvedCheckins.map(c => (
                      <div key={c.id} style={{ ...card, padding: 20, marginBottom: 10, opacity: 0.7 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#777" }}>{c.avatar}</div>
                            <div>
                              <div style={{ color: "#aaa", fontWeight: 600, fontSize: 14 }}>{c.clientName}</div>
                              <div style={{ color: "#555", fontSize: 11 }}>Week {c.week}</div>
                            </div>
                          </div>
                          <span style={{ color: green, fontSize: 12 }}>✓ Reviewed</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div>
                <div style={{ ...card, padding: 24, marginBottom: 20, background: "linear-gradient(135deg, #1a1200, #161616)", borderColor: "#2a2000" }}>
                  <h3 style={{ color: accent, fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>Client Check-in Form</h3>
                  <p style={{ color: "#777", fontSize: 12, lineHeight: 1.6, margin: "0 0 16px" }}>Share this link with your clients.</p>
                  <div style={{ background: "#0d0d0d", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#555", fontFamily: "monospace", marginBottom: 12, wordBreak: "break-all" }}>
                    {window.location.origin}/?checkin=true
                  </div>
                  <button className="cta-btn" onClick={() => setView("checkin")}
                    style={{ width: "100%", background: accent, color: "#000", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit", transition: "background .15s" }}>
                    Preview Client Form →
                  </button>
                </div>

                <div style={{ ...card, padding: 24 }}>
                  <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: "0 0 16px" }}>Your Clients</h3>
                  {clients.length === 0 && <p style={{ color: "#555", fontSize: 13, margin: "0 0 16px" }}>No clients yet — add your first one!</p>}
                  {clients.map((cl, i) => (
                    <div key={cl.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: i < clients.length - 1 ? 14 : 0, marginBottom: i < clients.length - 1 ? 14 : 0, borderBottom: i < clients.length - 1 ? "1px solid #1e1e1e" : "none" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#222", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#888" }}>
                          {cl.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ color: "#ddd", fontSize: 13, fontWeight: 500 }}>{cl.name}</div>
                          <div style={{ color: "#555", fontSize: 11 }}>{cl.goal}</div>
                        </div>
                      </div>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: green }} />
                    </div>
                  ))}

                  {showAddClient ? (
                    <div style={{ marginTop: 16, borderTop: "1px solid #1e1e1e", paddingTop: 16 }}>
                      <input placeholder="Client name" value={newClientName} onChange={e => setNewClientName(e.target.value)}
                        style={{ width: "100%", background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, marginBottom: 8, fontFamily: "inherit" }} />
                      <select value={newClientGoal} onChange={e => setNewClientGoal(e.target.value)}
                        style={{ width: "100%", background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, marginBottom: 12, fontFamily: "inherit" }}>
                        {["Fat loss", "Muscle gain", "Strength", "Endurance", "General fitness"].map(g => <option key={g}>{g}</option>)}
                      </select>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={addClient} style={{ flex: 1, background: accent, color: "#000", border: "none", borderRadius: 8, padding: "8px", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Add</button>
                        <button onClick={() => setShowAddClient(false)} style={{ flex: 1, background: "none", border: "1px solid #333", borderRadius: 8, padding: "8px", color: "#666", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddClient(true)} style={{ marginTop: 16, width: "100%", background: "none", border: "1px dashed #2a2a2a", borderRadius: 8, padding: "10px", color: "#555", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                      + Add Client
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
