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
  const [settingsTab, setSettingsTab] = useState("general");
  const [savedSettings, setSavedSettings] = useState(false);
  const [coachBio, setCoachBio] = useState("");
  const [coachTitle, setCoachTitle] = useState("");
  const [helpMessages, setHelpMessages] = useState([{ role: "assistant", content: "Hi! I'm your CheckIn AI assistant 👋 I can help you navigate the app, troubleshoot issues, or answer questions about your account. What do you need help with?" }]);
  const [helpInput, setHelpInput] = useState("");
  const [helpLoading, setHelpLoading] = useState(false);

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
  const [newClientEmail, setNewClientEmail] = useState("");
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
      // Send welcome email if client email was provided
      if (newClientEmail.trim()) {
        try {
          await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "welcome-client",
              data: {
                clientEmail: newClientEmail.trim(),
                clientName: newClientName.trim(),
                coachName: user.firstName || "Your Coach",
                coachEmail: user.emailAddresses?.[0]?.emailAddress || "",
                checkinUrl: window.location.origin + "?checkin=true"
              }
            })
          });
        } catch(e) { console.error("Email error:", e); }
      }
      setNewClientName("");
      setNewClientEmail("");
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
      // Notify coach by email
      try {
        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "new-checkin",
            data: {
              coachEmail: user?.emailAddresses?.[0]?.emailAddress || "",
              clientName: clientForm.name,
              weight: clientForm.weight,
              adherence: clientForm.adherence,
              sleep: clientForm.sleep,
              energy: clientForm.energy,
              notes: clientForm.notes,
              appUrl: window.location.origin
            }
          })
        });
      } catch(e) { console.error("Email error:", e); }
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
    // Notify client by email if they have an email stored
    if (selectedCheckin.clientEmail) {
      try {
        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "feedback-sent",
            data: {
              clientEmail: selectedCheckin.clientEmail,
              coachName: user.firstName || "Your Coach",
              coachEmail: user.emailAddresses?.[0]?.emailAddress || "",
              coachNote,
              analysis: analysisText,
              appUrl: window.location.origin
            }
          })
        });
      } catch(e) { console.error("Email error:", e); }
    }
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
        <SignIn appearance={{ variables: { colorPrimary: "#f5a623", colorBackground: "#161616", colorText: "#ffffff", colorInputBackground: "#1e1e1e", colorInputText: "#ffffff", colorTextSecondary: "#999999", colorNeutral: "#ffffff" }, elements: { card: { border: "1px solid #2a2a2a", boxShadow: "none" }, socialButtonsBlockButton: { border: "1px solid #333", background: "#1e1e1e", color: "#fff" }, dividerLine: { background: "#2a2a2a" }, dividerText: { color: "#555" }, footerActionLink: { color: "#f5a623" }, footerActionText: { color: "#aaaaaa" } } }} />
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



  // ── Legal / Security sub-pages ──────────────────────────────────────────

  const legalViews = ["privacy-policy", "terms", "dpa", "security"];

  if (legalViews.includes(view)) {

    const backTo = ["privacy-policy","terms","dpa"].includes(view) ? "settings" : "settings";

    // ── Shared shell ────────────────────────────────────────────────────────
    const Shell = ({ title, subtitle, children }) => (
      <div style={{ background: "#0d0d0d", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Serif+Display&display=swap'); * { box-sizing: border-box; }`}</style>
        <div style={{ borderBottom: "1px solid #1e1e1e", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setView("dashboard")}>
            <div style={{ width: 32, height: 32, background: "#f5a623", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
            <span style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 20 }}>CheckIn AI</span>
          </div>
          <button onClick={() => { setView("settings"); setSettingsTab(["privacy-policy","terms","dpa"].includes(view) ? "privacy" : "account"); }}
            style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 8, padding: "6px 14px", color: "#666", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>← Back to Settings</button>
        </div>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "60px 40px" }}>
          <div style={{ marginBottom: 48 }}>
            <h1 style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 38, margin: "0 0 10px" }}>{title}</h1>
            <p style={{ color: "#555", fontSize: 14, margin: 0 }}>{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    );

    const Section = ({ title, children }) => (
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ color: "#f5a623", fontSize: 13, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 16px", fontWeight: 700 }}>{title}</h2>
        <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28 }}>
          {children}
        </div>
      </div>
    );

    const P = ({ children }) => <p style={{ color: "#aaa", fontSize: 14, lineHeight: 1.8, margin: "0 0 14px" }}>{children}</p>;
    const Li = ({ children }) => <li style={{ color: "#aaa", fontSize: 14, lineHeight: 1.8, marginBottom: 8 }}>{children}</li>;
    const Ul = ({ children }) => <ul style={{ paddingLeft: 20, margin: "0 0 14px" }}>{children}</ul>;
    const lastUpdated = "March 1, 2026";

    // ── PRIVACY POLICY ──────────────────────────────────────────────────────
    if (view === "privacy-policy") return (
      <Shell title="Privacy Policy" subtitle={`Last updated: ${lastUpdated}`}>
        <Section title="1. Introduction">
          <P>CheckIn AI ("we", "our", or "us") is committed to protecting the privacy of coaches and their clients who use our platform. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service.</P>
          <P>By using CheckIn AI, you agree to the collection and use of information in accordance with this policy.</P>
        </Section>
        <Section title="2. Information We Collect">
          <P>We collect information you provide directly to us, including:</P>
          <Ul>
            <Li>Account information such as your name, email address, and password</Li>
            <Li>Coach profile information including your title and bio</Li>
            <Li>Client data you enter into the platform, including check-in responses and progress metrics</Li>
            <Li>Payment information processed securely through Stripe</Li>
          </Ul>
          <P>We also automatically collect certain information when you use our service, including usage data, device information, and cookies.</P>
        </Section>
        <Section title="3. How We Use Your Information">
          <P>We use the information we collect to:</P>
          <Ul>
            <Li>Provide, maintain, and improve our services</Li>
            <Li>Process transactions and send related information</Li>
            <Li>Generate AI-powered analysis of client check-ins</Li>
            <Li>Send notifications and updates relevant to your account</Li>
            <Li>Respond to your comments and questions</Li>
            <Li>Monitor and analyze usage patterns to improve user experience</Li>
          </Ul>
        </Section>
        <Section title="4. Data Sharing & Disclosure">
          <P>We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:</P>
          <Ul>
            <Li>With service providers who assist in our operations (Supabase for database, Anthropic for AI, Stripe for payments, Clerk for authentication)</Li>
            <Li>When required by law or to protect our legal rights</Li>
            <Li>In connection with a merger, acquisition, or sale of assets</Li>
          </Ul>
        </Section>
        <Section title="5. Data Retention">
          <P>We retain your personal data for as long as your account is active or as needed to provide services. You may request deletion of your data at any time by contacting us. Client check-in data is retained until you delete it from your dashboard or close your account.</P>
        </Section>
        <Section title="6. Security">
          <P>We implement industry-standard security measures to protect your data, including encryption in transit and at rest, row-level security in our database, and secure authentication via Clerk. However, no method of transmission over the internet is 100% secure.</P>
        </Section>
        <Section title="7. Your Rights">
          <P>You have the right to access, correct, or delete your personal data at any time. You may also object to or restrict certain processing of your data. To exercise these rights, contact us through the Help section of the app.</P>
        </Section>
        <Section title="8. Contact Us">
          <P>If you have questions about this Privacy Policy, please contact us through the Help section in your dashboard settings.</P>
        </Section>
      </Shell>
    );

    // ── TERMS OF SERVICE ────────────────────────────────────────────────────
    if (view === "terms") return (
      <Shell title="Terms of Service" subtitle={`Last updated: ${lastUpdated}`}>
        <Section title="1. Acceptance of Terms">
          <P>By accessing or using CheckIn AI, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service. These terms apply to all coaches, users, and others who access the service.</P>
        </Section>
        <Section title="2. Description of Service">
          <P>CheckIn AI is a subscription-based software platform that enables fitness coaches to collect, review, and respond to client check-ins using AI-powered analysis. The service includes a coach dashboard, client check-in forms, AI-generated feedback, and subscription management tools.</P>
        </Section>
        <Section title="3. Subscriptions & Billing">
          <P>CheckIn AI is offered on a monthly subscription basis at $19.99/month. A 7-day free trial is available for new accounts. After the trial period, your payment method will be charged automatically. You may cancel at any time through the Billing section of your settings.</P>
          <Ul>
            <Li>Subscriptions auto-renew monthly unless cancelled</Li>
            <Li>Refunds are handled on a case-by-case basis</Li>
            <Li>Price changes will be communicated with at least 30 days notice</Li>
          </Ul>
        </Section>
        <Section title="4. Acceptable Use">
          <P>You agree to use CheckIn AI only for lawful purposes and in accordance with these terms. You may not:</P>
          <Ul>
            <Li>Use the service to collect data without client consent</Li>
            <Li>Attempt to gain unauthorized access to our systems</Li>
            <Li>Resell or sublicense access to the platform</Li>
            <Li>Use the AI features to provide medical diagnoses or replace licensed medical advice</Li>
            <Li>Upload content that is illegal, harmful, or violates third-party rights</Li>
          </Ul>
        </Section>
        <Section title="5. AI-Generated Content">
          <P>CheckIn AI uses artificial intelligence to generate coaching suggestions and analysis. This content is intended to assist coaches, not replace professional judgment. You are solely responsible for reviewing AI-generated content before sharing it with clients. CheckIn AI is not liable for decisions made based on AI outputs.</P>
        </Section>
        <Section title="6. Client Data Responsibility">
          <P>As a coach using our platform, you are responsible for obtaining appropriate consent from your clients to collect and process their data. You agree to handle client data in compliance with applicable privacy laws in your jurisdiction.</P>
        </Section>
        <Section title="7. Intellectual Property">
          <P>The CheckIn AI platform, including its design, code, and content, is owned by us and protected by intellectual property laws. You retain ownership of all data you input into the platform. We do not claim ownership of your client data or coaching content.</P>
        </Section>
        <Section title="8. Termination">
          <P>We reserve the right to suspend or terminate your account for violations of these terms. You may cancel your account at any time. Upon termination, your data will be retained for 30 days before permanent deletion, giving you time to export your information.</P>
        </Section>
        <Section title="9. Limitation of Liability">
          <P>To the maximum extent permitted by law, CheckIn AI shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service. Our total liability shall not exceed the amount you paid us in the 3 months preceding the claim.</P>
        </Section>
        <Section title="10. Contact">
          <P>For questions about these Terms of Service, contact us through the Help section in your dashboard.</P>
        </Section>
      </Shell>
    );

    // ── DATA PROCESSING AGREEMENT ───────────────────────────────────────────
    if (view === "dpa") return (
      <Shell title="Data Processing Agreement" subtitle={`Last updated: ${lastUpdated}`}>
        <Section title="1. Purpose & Scope">
          <P>This Data Processing Agreement ("DPA") forms part of the agreement between CheckIn AI ("Processor") and the coach using our platform ("Controller"). It governs the processing of personal data of clients submitted through the CheckIn AI platform in accordance with applicable data protection laws.</P>
        </Section>
        <Section title="2. Definitions">
          <Ul>
            <Li><strong style={{color:"#fff"}}>Personal Data:</strong> Any information relating to an identified or identifiable natural person (your clients)</Li>
            <Li><strong style={{color:"#fff"}}>Processing:</strong> Any operation performed on personal data, including collection, storage, and analysis</Li>
            <Li><strong style={{color:"#fff"}}>Controller:</strong> The coach who determines the purpose and means of processing client data</Li>
            <Li><strong style={{color:"#fff"}}>Processor:</strong> CheckIn AI, which processes data on behalf of the Controller</Li>
          </Ul>
        </Section>
        <Section title="3. Data Processing Details">
          <P>CheckIn AI processes the following categories of client data on your behalf:</P>
          <Ul>
            <Li>Body metrics (weight, measurements)</Li>
            <Li>Lifestyle data (sleep, stress, energy, hunger levels)</Li>
            <Li>Dietary adherence information</Li>
            <Li>Coach and client notes</Li>
            <Li>AI-generated analysis and feedback</Li>
          </Ul>
        </Section>
        <Section title="4. Processor Obligations">
          <P>CheckIn AI agrees to:</P>
          <Ul>
            <Li>Process personal data only on documented instructions from the Controller</Li>
            <Li>Ensure persons authorized to process data are bound by confidentiality</Li>
            <Li>Implement appropriate technical and organizational security measures</Li>
            <Li>Not engage sub-processors without prior authorization</Li>
            <Li>Assist the Controller in fulfilling data subject rights requests</Li>
            <Li>Delete or return all personal data upon termination of services</Li>
          </Ul>
        </Section>
        <Section title="5. Sub-Processors">
          <P>CheckIn AI uses the following authorized sub-processors:</P>
          <Ul>
            <Li><strong style={{color:"#fff"}}>Supabase</strong> — Database storage (United States)</Li>
            <Li><strong style={{color:"#fff"}}>Anthropic</strong> — AI analysis processing (United States)</Li>
            <Li><strong style={{color:"#fff"}}>Vercel</strong> — Application hosting (United States)</Li>
            <Li><strong style={{color:"#fff"}}>Clerk</strong> — Authentication services (United States)</Li>
            <Li><strong style={{color:"#fff"}}>Stripe</strong> — Payment processing (United States)</Li>
          </Ul>
        </Section>
        <Section title="6. Security Measures">
          <P>We maintain the following technical and organizational security measures:</P>
          <Ul>
            <Li>Encryption of data in transit using TLS 1.2+</Li>
            <Li>Encryption of data at rest in our database</Li>
            <Li>Row-level security policies to prevent unauthorized data access</Li>
            <Li>Multi-factor authentication options for coach accounts</Li>
            <Li>Regular security reviews and dependency updates</Li>
          </Ul>
        </Section>
        <Section title="7. Data Transfers">
          <P>Your client data is stored and processed in the United States. By using CheckIn AI, you acknowledge that data may be transferred to and processed in the US, which may have different data protection laws than your country.</P>
        </Section>
        <Section title="8. Term & Termination">
          <P>This DPA remains in effect for the duration of your CheckIn AI subscription. Upon termination, we will delete all personal data within 30 days unless retention is required by law.</P>
        </Section>
      </Shell>
    );

    // ── SECURITY SETTINGS ───────────────────────────────────────────────────
    if (view === "security") return (
      <Shell title="Security Settings" subtitle="Manage your account security and authentication preferences.">
        <Section title="Authentication">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #222" }}>
            <div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Email Address</div>
              <div style={{ color: "#555", fontSize: 13 }}>{user.emailAddresses[0]?.emailAddress}</div>
            </div>
            <span style={{ background: "#1e3a1e", color: "#4ade80", fontSize: 11, padding: "4px 12px", borderRadius: 20, fontWeight: 600 }}>Verified</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #222" }}>
            <div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Password</div>
              <div style={{ color: "#555", fontSize: 13 }}>Last changed: unknown</div>
            </div>
            <button style={{ background: "none", border: "1px solid #333", borderRadius: 8, padding: "8px 16px", color: "#ccc", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Change Password</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Two-Factor Authentication</div>
              <div style={{ color: "#555", fontSize: 13 }}>Add an extra layer of security to your account</div>
            </div>
            <button style={{ background: "#f5a623", border: "none", borderRadius: 8, padding: "8px 16px", color: "#000", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700 }}>Enable 2FA</button>
          </div>
        </Section>

        <Section title="Connected Accounts">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>G</div>
              <div>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Google</div>
                <div style={{ color: "#555", fontSize: 12 }}>Sign in with Google</div>
              </div>
            </div>
            <span style={{ color: "#555", fontSize: 12 }}>
              {user.externalAccounts?.length > 0 ? <span style={{ color: "#4ade80" }}>Connected</span> : "Not connected"}
            </span>
          </div>
        </Section>

        <Section title="Active Sessions">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Current Session</div>
              <div style={{ color: "#555", fontSize: 12 }}>This device · Active now</div>
            </div>
            <span style={{ background: "#1e3a1e", color: "#4ade80", fontSize: 11, padding: "4px 12px", borderRadius: 20 }}>Current</span>
          </div>
          <button style={{ background: "none", border: "1px solid #f87171", borderRadius: 8, padding: "10px 20px", color: "#f87171", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
            Sign Out All Other Sessions
          </button>
        </Section>

        <Section title="Account Actions">
          <P>Need to make changes to your email or connected accounts? These are managed through your authentication provider.</P>
          <button onClick={() => signOut()} style={{ background: "none", border: "1px solid #333", borderRadius: 8, padding: "10px 20px", color: "#ccc", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
            Sign Out →
          </button>
        </Section>
      </Shell>
    );
  }

  // Settings page
  if (view === "settings") {
    const tabs = ["general", "account", "billing", "privacy", "help"];
    const tabLabels = { general: "General", account: "Account", billing: "Billing", privacy: "Privacy", help: "Help & Support" };

    return (
      <div style={{ background: "#0d0d0d", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Serif+Display&display=swap');
          * { box-sizing: border-box; }
          @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
          .settings-tab:hover { color: #fff !important; }
        `}</style>

        {/* Header */}
        <div style={{ borderBottom: "1px solid #1e1e1e", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setView("dashboard")}>
            <div style={{ width: 32, height: 32, background: "#f5a623", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
            <span style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 20 }}>CheckIn AI</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setView("dashboard")} style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 8, padding: "6px 14px", color: "#666", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>← Dashboard</button>
            <button onClick={() => signOut()} style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 8, padding: "6px 14px", color: "#666", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Sign out</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "calc(100vh - 73px)" }}>
          {/* Sidebar */}
          <div style={{ borderRight: "1px solid #1e1e1e", padding: "32px 0" }}>
            <p style={{ color: "#444", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, padding: "0 24px", marginBottom: 12 }}>Settings</p>
            {tabs.map(tab => (
              <button key={tab} className="settings-tab" onClick={() => setSettingsTab(tab)}
                style={{ width: "100%", textAlign: "left", padding: "10px 24px", background: settingsTab === tab ? "#1a1a1a" : "none", border: "none", borderLeft: settingsTab === tab ? "2px solid #f5a623" : "2px solid transparent", color: settingsTab === tab ? "#fff" : "#666", cursor: "pointer", fontSize: 14, fontFamily: "inherit", transition: "all .15s" }}>{tab === "help" ? "💬 " : ""}
                {tabLabels[tab]}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ padding: "40px", maxWidth: 640, animation: "fadeUp .3s ease" }}>

            {/* GENERAL TAB */}
            {settingsTab === "general" && (
              <div>
                <h2 style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 26, margin: "0 0 4px" }}>General</h2>
                <p style={{ color: "#555", fontSize: 14, margin: "0 0 36px" }}>Manage your coaching profile and preferences.</p>

                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28, marginBottom: 20 }}>
                  <h3 style={{ color: "#f5a623", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 20px" }}>Coach Profile</h3>
                  {[["Display Name", user.firstName + " " + (user.lastName || ""), false], ["Email", user.emailAddresses[0]?.emailAddress, true]].map(([label, val, disabled]) => (
                    <div key={label} style={{ marginBottom: 20 }}>
                      <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{label}</label>
                      <input defaultValue={val} disabled={disabled}
                        style={{ width: "100%", background: disabled ? "#111" : "#1e1e1e", border: "1px solid #333", borderRadius: 8, padding: "10px 14px", color: disabled ? "#444" : "#fff", fontSize: 14, fontFamily: "inherit", cursor: disabled ? "not-allowed" : "text" }} />
                      {disabled && <p style={{ color: "#444", fontSize: 11, margin: "4px 0 0" }}>Managed by your sign-in provider</p>}
                    </div>
                  ))}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Your Title</label>
                    <input placeholder="e.g. Online Strength Coach" value={coachTitle} onChange={e => setCoachTitle(e.target.value)}
                      style={{ width: "100%", background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "inherit" }} />
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Bio</label>
                    <textarea rows={3} placeholder="Tell clients a bit about yourself..." value={coachBio} onChange={e => setCoachBio(e.target.value)}
                      style={{ width: "100%", background: "#1e1e1e", border: "1px solid #333", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "inherit", resize: "vertical" }} />
                  </div>
                  <button onClick={() => { setSavedSettings(true); setTimeout(() => setSavedSettings(false), 2000); }}
                    style={{ background: "#f5a623", color: "#000", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
                    {savedSettings ? "✓ Saved!" : "Save Changes"}
                  </button>
                </div>

                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28 }}>
                  <h3 style={{ color: "#f5a623", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 20px" }}>Notifications</h3>
                  {[["Email me when a client submits a check-in", true], ["Weekly summary of client progress", true], ["Product updates and announcements", false]].map(([label, def]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <span style={{ color: "#ccc", fontSize: 14 }}>{label}</span>
                      <div style={{ width: 44, height: 24, background: def ? "#f5a623" : "#2a2a2a", borderRadius: 12, position: "relative", cursor: "pointer" }}>
                        <div style={{ width: 18, height: 18, background: "#fff", borderRadius: "50%", position: "absolute", top: 3, left: def ? 23 : 3, transition: "left .2s" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ACCOUNT TAB */}
            {settingsTab === "account" && (
              <div>
                <h2 style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 26, margin: "0 0 4px" }}>Account</h2>
                <p style={{ color: "#555", fontSize: 14, margin: "0 0 36px" }}>Manage your account security and data.</p>

                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28, marginBottom: 20 }}>
                  <h3 style={{ color: "#f5a623", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 20px" }}>Account Info</h3>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #f5a623, #e07b00)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 20, color: "#000" }}>
                      {(user.firstName?.[0] || user.emailAddresses[0]?.emailAddress?.[0] || "C").toUpperCase()}
                    </div>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{user.firstName} {user.lastName}</div>
                      <div style={{ color: "#555", fontSize: 13 }}>{user.emailAddresses[0]?.emailAddress}</div>
                      <div style={{ color: "#f5a623", fontSize: 11, marginTop: 2 }}>Pro Plan · Trial Active</div>
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid #222", paddingTop: 20 }}>
                    <p style={{ color: "#555", fontSize: 13, margin: "0 0 12px" }}>Member since {new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
                  </div>
                </div>

                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28, marginBottom: 20 }}>
                  <h3 style={{ color: "#f5a623", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 8px" }}>Password & Security</h3>
                  <p style={{ color: "#555", fontSize: 13, margin: "0 0 16px" }}>Password and security settings are managed through your sign-in provider.</p>
                  <button onClick={() => setView("security")} style={{ background: "none", border: "1px solid #333", borderRadius: 8, padding: "10px 20px", color: "#ccc", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                    Manage Security Settings →
                  </button>
                </div>

                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28, borderColor: "#2a1a1a" }}>
                  <h3 style={{ color: "#f87171", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 8px" }}>Danger Zone</h3>
                  <p style={{ color: "#555", fontSize: 13, margin: "0 0 16px" }}>Once you delete your account, all data will be permanently removed.</p>
                  <button style={{ background: "none", border: "1px solid #f87171", borderRadius: 8, padding: "10px 20px", color: "#f87171", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                    Delete Account
                  </button>
                </div>
              </div>
            )}

            {/* BILLING TAB */}
            {settingsTab === "billing" && (
              <div>
                <h2 style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 26, margin: "0 0 4px" }}>Billing</h2>
                <p style={{ color: "#555", fontSize: 14, margin: "0 0 36px" }}>Manage your subscription and payment details.</p>

                <div style={{ background: "linear-gradient(135deg, #1a1200, #161616)", border: "1px solid #3a2800", borderRadius: 12, padding: 28, marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                    <div>
                      <h3 style={{ color: "#f5a623", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>CheckIn AI Pro</h3>
                      <p style={{ color: "#666", fontSize: 13, margin: 0 }}>$19.99 / month · 7-day free trial</p>
                    </div>
                    <span style={{ background: "#1e3a1e", color: "#4ade80", fontSize: 11, padding: "4px 12px", borderRadius: 20, fontWeight: 600 }}>Trial Active</span>
                  </div>
                  <div style={{ borderTop: "1px solid #2a2000", paddingTop: 20, marginBottom: 20 }}>
                    {[["Plan", "CheckIn AI Pro"], ["Status", "Free Trial"], ["Billing cycle", "Monthly"], ["Amount", "$19.99/month after trial"]].map(([label, val]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ color: "#555", fontSize: 13 }}>{label}</span>
                        <span style={{ color: "#ccc", fontSize: 13 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleUpgrade} disabled={upgrading}
                    style={{ width: "100%", background: "#f5a623", color: "#000", border: "none", borderRadius: 8, padding: "12px", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
                    {upgrading ? "Redirecting to Stripe..." : "Manage Subscription →"}
                  </button>
                </div>

                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28 }}>
                  <h3 style={{ color: "#f5a623", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 16px" }}>What's Included</h3>
                  {["Unlimited AI check-in analysis", "Unlimited clients", "AI-powered coaching suggestions", "Progress tracking dashboard", "Secure client check-in forms", "Priority support"].map(feature => (
                    <div key={feature} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                      <span style={{ color: "#4ade80", fontSize: 14 }}>✓</span>
                      <span style={{ color: "#ccc", fontSize: 14 }}>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HELP TAB */}

            {/* HELP TAB */}
            {settingsTab === "help" && (
              <div>
                <h2 style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 26, margin: "0 0 4px" }}>Help & Support</h2>
                <p style={{ color: "#555", fontSize: 14, margin: "0 0 36px" }}>Get instant help from our AI assistant or browse common topics.</p>

                {/* Quick links */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }}>
                  {[
                    ["🚀", "Getting Started", "Learn the basics of CheckIn AI"],
                    ["👥", "Managing Clients", "Add, edit, and organise clients"],
                    ["🤖", "AI Analysis", "How the AI reviews check-ins"],
                    ["💳", "Billing & Plans", "Subscription and payment help"],
                  ].map(([icon, title, desc]) => (
                    <div key={title} onClick={() => setHelpInput(title)}
                      style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 10, padding: "16px 18px", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "#f5a623"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "#2a2a2a"}>
                      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                      <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                      <div style={{ color: "#555", fontSize: 12 }}>{desc}</div>
                    </div>
                  ))}
                </div>

                {/* AI Chat */}
                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, background: "#f5a623", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚡</div>
                    <div>
                      <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>CheckIn AI Assistant</div>
                      <div style={{ color: "#4ade80", fontSize: 11 }}>● Online</div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div style={{ height: 340, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
                    ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
                    {helpMessages.map((msg, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                        <div style={{
                          maxWidth: "80%", padding: "10px 14px", borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                          background: msg.role === "user" ? "#f5a623" : "#222",
                          color: msg.role === "user" ? "#000" : "#ccc",
                          fontSize: 13, lineHeight: 1.6
                        }}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {helpLoading && (
                      <div style={{ display: "flex", justifyContent: "flex-start" }}>
                        <div style={{ background: "#222", borderRadius: "12px 12px 12px 2px", padding: "10px 16px", color: "#555", fontSize: 13 }}>Thinking...</div>
                      </div>
                    )}
                  </div>

                  {/* Input */}
                  <div style={{ padding: "12px 16px", borderTop: "1px solid #1e1e1e", display: "flex", gap: 10 }}>
                    <input
                      value={helpInput}
                      onChange={e => setHelpInput(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === "Enter" && helpInput.trim() && !helpLoading) {
                          const userMsg = helpInput.trim();
                          setHelpInput("");
                          const newMessages = [...helpMessages, { role: "user", content: userMsg }];
                          setHelpMessages(newMessages);
                          setHelpLoading(true);
                          try {
                            const res = await fetch("/api/anthropic", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                model: "claude-sonnet-4-20250514",
                                max_tokens: 1000,
                                system: "You are a friendly support assistant for CheckIn AI, a SaaS platform for fitness coaches to manage client check-ins using AI. You help coaches with: navigating the dashboard, adding/managing clients, understanding AI analysis, billing and subscriptions ($19.99/month with 7-day trial), settings, and troubleshooting. Keep answers concise, friendly, and practical. If asked something outside the app, politely redirect.",
                                messages: newMessages
                              })
                            });
                            const data = await res.json();
                            const reply = data.content?.[0]?.text || "Sorry, I couldn't get a response. Please try again.";
                            setHelpMessages([...newMessages, { role: "assistant", content: reply }]);
                          } catch {
                            setHelpMessages([...newMessages, { role: "assistant", content: "Something went wrong. Please try again in a moment." }]);
                          }
                          setHelpLoading(false);
                        }
                      }}
                      placeholder="Ask anything about CheckIn AI..."
                      style={{ flex: 1, background: "#222", border: "1px solid #333", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, fontFamily: "inherit" }}
                    />
                    <button
                      onClick={async () => {
                        if (!helpInput.trim() || helpLoading) return;
                        const userMsg = helpInput.trim();
                        setHelpInput("");
                        const newMessages = [...helpMessages, { role: "user", content: userMsg }];
                        setHelpMessages(newMessages);
                        setHelpLoading(true);
                        try {
                          const res = await fetch("/api/anthropic", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              model: "claude-sonnet-4-20250514",
                              max_tokens: 1000,
                              system: "You are a friendly support assistant for CheckIn AI, a SaaS platform for fitness coaches to manage client check-ins using AI. You help coaches with: navigating the dashboard, adding/managing clients, understanding AI analysis, billing and subscriptions ($19.99/month with 7-day trial), settings, and troubleshooting. Keep answers concise, friendly, and practical. If asked something outside the app, politely redirect.",
                              messages: newMessages
                            })
                          });
                          const data = await res.json();
                          const reply = data.content?.[0]?.text || "Sorry, I couldn't get a response. Please try again.";
                          setHelpMessages([...newMessages, { role: "assistant", content: reply }]);
                        } catch {
                          setHelpMessages([...newMessages, { role: "assistant", content: "Something went wrong. Please try again in a moment." }]);
                        }
                        setHelpLoading(false);
                      }}
                      style={{ background: "#f5a623", border: "none", borderRadius: 8, padding: "10px 16px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                      Send
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* PRIVACY TAB */}
            {settingsTab === "privacy" && (
              <div>
                <h2 style={{ fontFamily: "'DM Serif Display'", color: "#fff", fontSize: 26, margin: "0 0 4px" }}>Privacy</h2>
                <p style={{ color: "#555", fontSize: 14, margin: "0 0 36px" }}>Control how your data and your clients' data is handled.</p>

                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28, marginBottom: 20 }}>
                  <h3 style={{ color: "#f5a623", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 20px" }}>Data & Privacy</h3>
                  {[
                    ["Store AI analysis results", "AI-generated analysis is saved to your dashboard", true],
                    ["Anonymous usage analytics", "Help us improve CheckIn AI with anonymous usage data", true],
                    ["Share aggregated insights", "Contribute anonymized data to improve AI recommendations", false],
                  ].map(([title, desc, def]) => (
                    <div key={title} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #1e1e1e" }}>
                      <div style={{ flex: 1, marginRight: 20 }}>
                        <div style={{ color: "#ccc", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{title}</div>
                        <div style={{ color: "#555", fontSize: 12 }}>{desc}</div>
                      </div>
                      <div style={{ width: 44, height: 24, background: def ? "#f5a623" : "#2a2a2a", borderRadius: 12, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                        <div style={{ width: 18, height: 18, background: "#fff", borderRadius: "50%", position: "absolute", top: 3, left: def ? 23 : 3, transition: "left .2s" }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28, marginBottom: 20 }}>
                  <h3 style={{ color: "#f5a623", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 12px" }}>Client Data</h3>
                  <p style={{ color: "#666", fontSize: 13, lineHeight: 1.7, margin: "0 0 16px" }}>
                    All client check-in data is encrypted and stored securely. Only you as the coach can access your clients' data. We never sell or share personal data with third parties.
                  </p>
                  <p style={{ color: "#666", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                    Clients can request deletion of their data at any time by contacting you directly.
                  </p>
                </div>

                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28 }}>
                  <h3 style={{ color: "#f5a623", fontSize: 11, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 12px" }}>Legal</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[["Privacy Policy","privacy-policy"], ["Terms of Service","terms"], ["Data Processing Agreement","dpa"]].map(([doc, slug]) => (
                      <button key={doc} onClick={() => setView(slug)} style={{ textAlign: "left", background: "none", border: "none", color: "#f5a623", fontSize: 14, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                        {doc} →
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#555", fontSize: 13 }}>{user.firstName || user.emailAddresses[0]?.emailAddress}</span>
          <button onClick={() => setView("settings")} style={{ background: view === "settings" ? "#1e1e1e" : "none", border: "1px solid #2a2a2a", borderRadius: 8, padding: "6px 14px", color: view === "settings" ? "#fff" : "#666", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>⚙ Settings</button>
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
                <span style={{ color: "#666", fontSize: 13, marginLeft: 12 }}>Upgrade anytime to keep full access at $19.99/month</span>
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
                      <input placeholder="Client email (optional — sends welcome email)" value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)}
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
