import { useState, useRef, useCallback } from "react";

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyiX6DVqhYT5qm4krjH4OpK7xqthe7PePCPgbMH-HARnXlbh9SsGCS0mGVhUGrep6CuUQ/exec";

const SYSTEM_PROMPT = `You are a shopping list assistant. The user will speak commands to manage their shopping list.

You must respond ONLY with a valid JSON object — no markdown, no explanation, no extra text.

Respond with one of these JSON shapes:

Add items:
{"action": "add", "items": ["item1", "item2"]}

Read list:
{"action": "read"}

Unknown:
{"action": "unknown", "message": "friendly short response"}

Rules:
- Capitalize each item properly
- Remove duplicates
- Strip quantities from item names (just the item name)
- If the user says "add X and Y" or "I need X, Y, Z" extract all items`;

export default function ShoppingListApp() {
  const [phase, setPhase] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const [listItems, setListItems] = useState([]);
  const [showList, setShowList] = useState(false);
  const recognitionRef = useRef(null);

  const speak = (text) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(u);
  };

  const callClaude = async (text) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
    });
    const data = await res.json();
    const raw = data.content?.find((b) => b.type === "text")?.text || "{}";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  };

  const callSheet = async (payload) => {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
    });
    return { success: true };
  };

  const readSheet = async () => {
    const res = await fetch(SCRIPT_URL + "?action=read");
    return res.json();
  };

  const processText = useCallback(async (text) => {
    setTranscript(text);
    setPhase("thinking");
    setMessage("Got it, processing...");

    try {
      const intent = await callClaude(text);

      if (intent.action === "add") {
        const items = intent.items || [];
        if (!items.length) {
          setPhase("error");
          setMessage("Couldn't find items to add. Try again.");
          setTimeout(() => { setPhase("idle"); setMessage(""); setTranscript(""); }, 3000);
          return;
        }
        setMessage(`Adding ${items.join(", ")}...`);
        await callSheet({ action: "add", items });
        setPhase("success");
        setMessage(`✓ Added: ${items.join(", ")}`);
        speak(`Added ${items.join(" and ")} to your list.`);
        setTimeout(() => { setPhase("idle"); setMessage(""); setTranscript(""); }, 3500);

      } else if (intent.action === "read") {
        setMessage("Reading your list...");
        const result = await readSheet();
        const items = result.items || [];
        setListItems(items);
        setShowList(true);
        setPhase("success");
        setMessage(`${items.length} item(s) on your list`);
        speak(items.length
          ? `You have ${items.length} items: ${items.slice(0, 5).join(", ")}${items.length > 5 ? ", and more" : ""}.`
          : "Your list is empty.");
        setTimeout(() => { setPhase("idle"); setTranscript(""); }, 2000);

      } else {
        setPhase("idle");
        setMessage(intent.message || "Try: 'Add milk and eggs' or 'Read my list'");
        setTimeout(() => setMessage(""), 4000);
      }
    } catch (err) {
      console.error(err);
      setPhase("error");
      setMessage("Error: " + (err.message || err.toString()).slice(0, 80));
      setTimeout(() => { setPhase("idle"); setMessage(""); setTranscript(""); }, 3000);
    }
  }, []);

  const handleMicPress = useCallback(() => {
    if (phase === "thinking") return;

    if (phase === "recording") {
      recognitionRef.current?.stop();
      setPhase("idle");
      setMessage("");
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMessage("Use Chrome on Android for voice support.");
      return;
    }

    const r = new SR();
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onstart = () => {
      setPhase("recording");
      setMessage("Listening... speak now");
      setShowList(false);
      setTranscript("");
    };

    r.onspeechend = () => r.stop();

    r.onresult = (e) => {
      const text = e.results[0][0].transcript;
      processText(text);
    };

    r.onerror = (e) => {
      console.error("SR error", e.error);
      setPhase("error");
      if (e.error === "no-speech") {
        setMessage("No speech detected. Tap and try again.");
      } else if (e.error === "not-allowed") {
        setMessage("Microphone blocked. Check Chrome site permissions.");
      } else {
        setMessage(`Error: ${e.error}. Tap to try again.`);
      }
      setTimeout(() => { setPhase("idle"); setMessage(""); }, 3500);
    };

    r.onend = () => {
      if (phase === "recording") setPhase("idle");
    };

    recognitionRef.current = r;
    try {
      r.start();
    } catch (e) {
      setPhase("error");
      setMessage("Couldn't start mic. Tap to try again.");
      setTimeout(() => { setPhase("idle"); setMessage(""); }, 3000);
    }
  }, [phase, processText]);

  const colors = { idle: "#16a34a", recording: "#ef4444", thinking: "#f59e0b", success: "#22c55e", error: "#dc2626" };
  const icons = { idle: "🎙", recording: "⏹", thinking: "⋯", success: "✓", error: "!" };
  const btnColor = colors[phase];

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f2010 0%, #1a3a1a 50%, #0d1f0d 100%)",
      fontFamily: "Georgia, serif",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(circle at 20% 80%, rgba(34,197,94,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(134,239,172,0.06) 0%, transparent 50%)",
        pointerEvents: "none",
      }} />

      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "4px", color: "#4ade80", textTransform: "uppercase", marginBottom: "8px", opacity: 0.8 }}>
          Voice Assistant
        </div>
        <h1 style={{ fontSize: "clamp(28px, 7vw, 44px)", color: "#f0fdf4", margin: 0, fontWeight: "normal" }}>
          Shopping List
        </h1>
        <div style={{ width: "40px", height: "2px", background: "#22c55e", margin: "12px auto 0", borderRadius: "2px" }} />
      </div>

      <div style={{ position: "relative", marginBottom: "40px" }}>
        {phase === "recording" && [0, 1, 2].map((i) => (
          <div key={i} style={{
            position: "absolute", inset: `-${(i + 1) * 18}px`,
            borderRadius: "50%", border: "2px solid rgba(239,68,68,0.35)",
            animation: `pulse ${1.2 + i * 0.35}s ease-out infinite`,
            animationDelay: `${i * 0.25}s`,
          }} />
        ))}
        <button
          onPointerDown={handleMicPress}
          disabled={phase === "thinking"}
          style={{
            width: "140px", height: "140px", borderRadius: "50%",
            border: "none", background: btnColor, color: "white",
            fontSize: phase === "thinking" ? "32px" : "44px",
            cursor: phase === "thinking" ? "not-allowed" : "pointer",
            boxShadow: `0 0 50px ${btnColor}55, 0 10px 40px rgba(0,0,0,0.5)`,
            transition: "all 0.25s ease",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", zIndex: 1,
            transform: phase === "recording" ? "scale(1.1)" : "scale(1)",
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
          }}
        >
          {icons[phase]}
        </button>
      </div>

      <div style={{ marginBottom: "8px" }}>
        <span style={{ fontSize: "13px", color: "#4ade80", letterSpacing: "2px", textTransform: "uppercase", opacity: phase === "idle" ? 1 : 0, transition: "opacity 0.3s" }}>
          TAP TO SPEAK
        </span>
      </div>

      <div style={{ minHeight: "64px", textAlign: "center", maxWidth: "320px", marginBottom: "24px" }}>
        {transcript && (
          <div style={{ fontSize: "13px", color: "#86efac", marginBottom: "8px", fontStyle: "italic", opacity: 0.9 }}>
            "{transcript}"
          </div>
        )}
        {message && (
          <div style={{ fontSize: "15px", lineHeight: 1.5, color: phase === "error" ? "#fca5a5" : phase === "success" ? "#86efac" : "#d1fae5" }}>
            {message}
          </div>
        )}
        {!message && !transcript && phase === "idle" && (
          <div style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.7 }}>
            Say <span style={{ color: "#4ade80", fontStyle: "italic" }}>"Add milk and eggs"</span><br />
            or <span style={{ color: "#4ade80", fontStyle: "italic" }}>"Read my list"</span>
          </div>
        )}
      </div>

      {showList && listItems.length > 0 && (
        <div style={{ width: "100%", maxWidth: "340px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: "16px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "3px", color: "#4ade80", textTransform: "uppercase" }}>Your List</span>
            <button onClick={() => setShowList(false)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "22px", lineHeight: 1 }}>×</button>
          </div>
          {listItems.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 0", borderBottom: i < listItems.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
              <span style={{ color: "#e2e8f0", fontSize: "15px" }}>{item}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: "absolute", bottom: "20px", display: "flex", alignItems: "center", gap: "6px", opacity: 0.4 }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
        <span style={{ fontSize: "11px", color: "#6b7280", letterSpacing: "1px" }}>Connected to Google Sheets</span>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
