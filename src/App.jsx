import { useState, useRef, useEffect, useCallback } from "react";

const SHEET_NAME = "Notes and list";
const TAB_NAME = "List";

const SYSTEM_PROMPT = `You are a shopping list assistant. The user will speak commands to manage their Google Sheets shopping list.

You must respond ONLY with a valid JSON object — no markdown, no explanation, no extra text.

Detect the intent and extract items from the user's spoken input.

Respond with one of these JSON shapes:

Add items:
{"action": "add", "items": ["item1", "item2"]}

Read list (user says "read my list", "what's on my list", "show my list", etc.):
{"action": "read"}

Clear list:
{"action": "clear"}

Unknown / chitchat:
{"action": "unknown", "message": "friendly short response"}

Rules:
- Capitalize each item properly
- Remove duplicates
- Strip quantities/amounts from item names (just the item)
- If the user says "add X and Y" or "I need X, Y, Z" — extract all items`;

export default function ShoppingListApp() {
  const [status, setStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const [listItems, setListItems] = useState([]);
  const [showList, setShowList] = useState(false);
  const [pulseRings, setPulseRings] = useState(false);
  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);

  const speak = (text) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const callClaude = async (text) => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
    });
    const data = await response.json();
    const raw = data.content?.find((b) => b.type === "text")?.text || "{}";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  };

  const callClaudeWithDrive = async (conversationHistory) => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: `You are a Google Drive assistant. The user wants to manage a Google Sheet called "${SHEET_NAME}", tab "${TAB_NAME}", column A.

When asked to add items, use the Google Drive MCP tools to:
1. First find the spreadsheet file named "${SHEET_NAME}"
2. Append new rows to column A of the "${TAB_NAME}" sheet, after any existing items

When asked to read the list, retrieve all non-empty values from column A of the "${TAB_NAME}" sheet.

Be efficient and direct. After completing the task, summarize what you did in plain language.`,
        messages: conversationHistory,
        mcp_servers: [
          {
            type: "url",
            url: "https://drivemcp.googleapis.com/mcp/v1",
            name: "google-drive-mcp",
          },
        ],
      }),
    });
    return response.json();
  };

  const handleVoiceResult = useCallback(async (text) => {
    setTranscript(text);
    setStatus("thinking");
    setMessage("Figuring out what you need...");

    try {
      const intent = await callClaude(text);

      if (intent.action === "add") {
        const items = intent.items || [];
        if (items.length === 0) {
          setStatus("error");
          setMessage("I couldn't find any items to add. Try again!");
          speak("I couldn't find any items to add.");
          setTimeout(() => { setStatus("idle"); setMessage(""); setTranscript(""); }, 3000);
          return;
        }

        setMessage(`Adding ${items.join(", ")}...`);

        const history = [{
          role: "user",
          content: `Add these items to column A of the "${TAB_NAME}" tab in the Google Sheet named "${SHEET_NAME}": ${items.join(", ")}. Append them after any existing items.`,
        }];

        await callClaudeWithDrive(history);

        setStatus("success");
        setMessage(`✓ Added: ${items.join(", ")}`);
        speak(`Added ${items.join(" and ")} to your shopping list.`);

        setTimeout(() => { setStatus("idle"); setMessage(""); setTranscript(""); }, 3500);

      } else if (intent.action === "read") {
        setMessage("Reading your shopping list...");

        const history = [{
          role: "user",
          content: `Read all non-empty values from column A of the "${TAB_NAME}" tab in the Google Sheet named "${SHEET_NAME}". Return them as a simple list.`,
        }];

        const driveResponse = await callClaudeWithDrive(history);
        const textBlock = driveResponse.content?.find((b) => b.type === "text");
        const responseText = textBlock?.text || "";

        const lines = responseText
          .split("\n")
          .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
          .filter((l) => l.length > 1 && !l.toLowerCase().includes("column") && !l.toLowerCase().includes("sheet") && !l.toLowerCase().includes("tab"));

        setListItems(lines);
        setShowList(true);
        setStatus("success");
        setMessage(`Your list has ${lines.length} item(s)`);

        if (lines.length > 0) {
          speak(`You have ${lines.length} items on your list: ${lines.slice(0, 5).join(", ")}${lines.length > 5 ? ", and more." : "."}`);
        } else {
          speak("Your shopping list is empty.");
        }

        setTimeout(() => { setStatus("idle"); setTranscript(""); }, 2000);

      } else {
        setStatus("idle");
        setMessage(intent.message || "Try saying 'add milk and eggs' or 'read my list'.");
        setTimeout(() => setMessage(""), 4000);
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
      speak("Something went wrong. Please try again.");
      setTimeout(() => { setStatus("idle"); setMessage(""); setTranscript(""); }, 3000);
    }
  }, []);

  const startListening = useCallback(() => {
    if (status === "listening") {
      recognitionRef.current?.stop();
      return;
    }
    if (status === "thinking") return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessage("Speech recognition not supported. Use Chrome on Android.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus("listening");
      setMessage("Listening... speak now");
      setPulseRings(true);
      setShowList(false);
    };

    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setPulseRings(false);
      handleVoiceResult(text);
    };

    recognition.onerror = (e) => {
      setPulseRings(false);
      setStatus("error");
      setMessage(`Mic error: ${e.error}. Tap to try again.`);
      setTimeout(() => { setStatus("idle"); setMessage(""); }, 3000);
    };

    recognition.onend = () => {
      setPulseRings(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [status, handleVoiceResult]);

  // Auto-start mic if ?listen=1 is in the URL (used by Google Assistant routine)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("listen") === "1") {
      const timer = setTimeout(() => startListening(), 900);
      return () => clearTimeout(timer);
    }
  }, [startListening]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      clearTimeout(timeoutRef.current);
    };
  }, []);

  const btnColor = {
    idle: "#16a34a", listening: "#ef4444",
    thinking: "#f59e0b", success: "#22c55e", error: "#dc2626"
  }[status];

  const btnIcon = {
    idle: "🎙", listening: "⏹", thinking: "⋯", success: "✓", error: "✕"
  }[status];

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f2010 0%, #1a3a1a 40%, #0d1f0d 100%)",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(circle at 20% 80%, rgba(34,197,94,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(134,239,172,0.06) 0%, transparent 50%)",
        pointerEvents: "none",
      }} />

      <div style={{ textAlign: "center", marginBottom: "40px", position: "relative" }}>
        <div style={{ fontSize: "11px", letterSpacing: "4px", color: "#4ade80", textTransform: "uppercase", marginBottom: "8px", opacity: 0.8 }}>
          Voice Assistant
        </div>
        <h1 style={{ fontSize: "clamp(28px, 6vw, 42px)", color: "#f0fdf4", margin: 0, fontWeight: "normal", letterSpacing: "-0.5px" }}>
          Shopping List
        </h1>
        <div style={{ width: "40px", height: "2px", background: "#22c55e", margin: "12px auto 0", borderRadius: "2px" }} />
      </div>

      <div style={{ position: "relative", marginBottom: "32px" }}>
        {pulseRings && [0, 1, 2].map((i) => (
          <div key={i} style={{
            position: "absolute", inset: `-${(i + 1) * 16}px`,
            borderRadius: "50%", border: "2px solid rgba(239,68,68,0.4)",
            animation: `pulse ${1 + i * 0.3}s ease-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }} />
        ))}
        <button onClick={startListening} disabled={status === "thinking"} style={{
          width: "120px", height: "120px", borderRadius: "50%",
          border: "none", background: btnColor, color: "white",
          fontSize: status === "thinking" ? "28px" : "36px",
          cursor: status === "thinking" ? "not-allowed" : "pointer",
          boxShadow: `0 0 40px ${btnColor}66, 0 8px 32px rgba(0,0,0,0.4)`,
          transition: "all 0.3s ease", display: "flex",
          alignItems: "center", justifyContent: "center",
          position: "relative", zIndex: 1,
          transform: status === "listening" ? "scale(1.08)" : "scale(1)",
        }}>
          {btnIcon}
        </button>
      </div>

      <div style={{ minHeight: "56px", textAlign: "center", marginBottom: "24px", maxWidth: "340px" }}>
        {transcript && (
          <div style={{ fontSize: "13px", color: "#86efac", marginBottom: "6px", fontStyle: "italic", opacity: 0.85 }}>
            "{transcript}"
          </div>
        )}
        {message && (
          <div style={{
            fontSize: "15px", lineHeight: 1.4,
            color: status === "error" ? "#fca5a5" : status === "success" ? "#86efac" : "#d1fae5",
          }}>
            {message}
          </div>
        )}
        {!transcript && !message && status === "idle" && (
          <div style={{ fontSize: "14px", color: "#6b7280", lineHeight: 1.6 }}>
            Tap the mic and say<br />
            <span style={{ color: "#4ade80", fontStyle: "italic" }}>"Add milk and eggs"</span><br />
            or <span style={{ color: "#4ade80", fontStyle: "italic" }}>"Read my list"</span>
          </div>
        )}
      </div>

      {showList && listItems.length > 0 && (
        <div style={{
          width: "100%", maxWidth: "360px",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(74,222,128,0.2)",
          borderRadius: "16px", padding: "20px",
          backdropFilter: "blur(10px)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "3px", color: "#4ade80", textTransform: "uppercase" }}>Your List</span>
            <button onClick={() => setShowList(false)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "20px" }}>×</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {listItems.map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "8px 0",
                borderBottom: i < listItems.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
              }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                <span style={{ color: "#e2e8f0", fontSize: "15px" }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {status === "idle" && !showList && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "16px" }}>
          {["Add items", "Read my list"].map((hint) => (
            <div key={hint} style={{
              padding: "6px 14px", borderRadius: "20px",
              border: "1px solid rgba(74,222,128,0.25)",
              color: "#6b7280", fontSize: "12px", letterSpacing: "0.5px",
            }}>
              {hint}
            </div>
          ))}
        </div>
      )}

      <div style={{ position: "absolute", bottom: "20px", display: "flex", alignItems: "center", gap: "6px", opacity: 0.5 }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
        <span style={{ fontSize: "11px", color: "#6b7280", letterSpacing: "1px" }}>Connected to Google Sheets</span>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
