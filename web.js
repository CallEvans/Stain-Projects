const express = require("express");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisConnectReason,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const path = require("path");
const fs = require("fs-extra");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SESSIONS_DIR = "./sessions";
const SESSIONS_FILE = "./sessions/active_sessions.json";

function createSessionDir(botNumber) {
  const deviceDir = path.join(SESSIONS_DIR, `device${botNumber}`);
  if (!fs.existsSync(deviceDir)) {
    fs.mkdirSync(deviceDir, { recursive: true });
  }
  return deviceDir;
}

function saveActiveSession(botNumber) {
  try {
    let sessions = [];
    if (fs.existsSync(SESSIONS_FILE)) {
      sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE));
    }
    if (!sessions.includes(botNumber)) {
      sessions.push(botNumber);
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions));
    }
  } catch (e) {
    console.error("Error saving session:", e);
  }
}

// --- WEB PAIRING ENDPOINT ---
app.post("/pair", async (req, res) => {
  const { number } = req.body;
  const botNumber = number?.replace(/[^0-9]/g, "");

  if (!botNumber || botNumber.length < 10) {
    return res.json({ success: false, message: "Invalid number. Please enter a valid WhatsApp number." });
  }

  const sessionDir = createSessionDir(botNumber);

  if (fs.existsSync(`${sessionDir}/creds.json`)) {
    return res.json({ success: false, message: "This number is already connected." });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: P({ level: "silent" }),
      defaultQueryTimeoutMs: undefined,
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const code = await sock.requestPairingCode(botNumber, "STAINFKU");
    const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;

    sock.ev.on("connection.update", async (update) => {
      const { connection } = update;
      if (connection === "open") {
        saveActiveSession(botNumber);
        await saveCreds();
      }
    });

    sock.ev.on("creds.update", saveCreds);

    return res.json({ success: true, code: formattedCode, number: botNumber });
  } catch (err) {
    console.error("Pairing error:", err);
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
    return res.json({ success: false, message: "Failed to generate pairing code. Try again." });
  }
});

// --- MAIN PAGE ---
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ѕтαιη ρяσנєcт — WA Pairing</title>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #060810;
      --surface: #0d1117;
      --border: rgba(99, 210, 255, 0.12);
      --accent: #63d2ff;
      --accent2: #a78bfa;
      --text: #e2e8f0;
      --muted: #64748b;
      --success: #34d399;
      --error: #f87171;
      --glow: rgba(99, 210, 255, 0.15);
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Syne', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      overflow-x: hidden;
    }

    body::before {
      content: '';
      position: fixed;
      top: -30%;
      left: -20%;
      width: 60%;
      height: 60%;
      background: radial-gradient(ellipse, rgba(99,210,255,0.06) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }

    body::after {
      content: '';
      position: fixed;
      bottom: -20%;
      right: -10%;
      width: 50%;
      height: 50%;
      background: radial-gradient(ellipse, rgba(167,139,250,0.06) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }

    .container {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 480px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(99,210,255,0.08);
      border: 1px solid rgba(99,210,255,0.2);
      border-radius: 100px;
      padding: 5px 14px;
      font-size: 11px;
      font-family: 'DM Mono', monospace;
      color: var(--accent);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 24px;
    }

    .badge::before {
      content: '';
      width: 6px;
      height: 6px;
      background: var(--accent);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.8); }
    }

    h1 {
      font-size: clamp(28px, 6vw, 40px);
      font-weight: 800;
      line-height: 1.1;
      margin-bottom: 10px;
      background: linear-gradient(135deg, #ffffff 30%, var(--accent) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      color: var(--muted);
      font-size: 14px;
      font-weight: 400;
      margin-bottom: 36px;
      line-height: 1.6;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 28px;
      margin-bottom: 16px;
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 28px;
    }

    .step {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .step-num {
      width: 24px;
      height: 24px;
      min-width: 24px;
      background: rgba(99,210,255,0.1);
      border: 1px solid rgba(99,210,255,0.25);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-family: 'DM Mono', monospace;
      color: var(--accent);
      font-weight: 500;
      margin-top: 1px;
    }

    .step-text {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
    }

    .step-text strong {
      color: var(--text);
      font-weight: 600;
    }

    label {
      display: block;
      font-size: 12px;
      font-family: 'DM Mono', monospace;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
    }

    .input-wrap {
      position: relative;
      margin-bottom: 16px;
    }

    .prefix {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      font-family: 'DM Mono', monospace;
      font-size: 13px;
      color: var(--accent);
      pointer-events: none;
      user-select: none;
    }

    input[type="text"] {
      width: 100%;
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 13px 14px 13px 38px;
      font-family: 'DM Mono', monospace;
      font-size: 14px;
      color: var(--text);
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      -webkit-appearance: none;
    }

    input[type="text"]:focus {
      border-color: rgba(99,210,255,0.4);
      box-shadow: 0 0 0 3px rgba(99,210,255,0.08);
    }

    input[type="text"]::placeholder {
      color: var(--muted);
    }

    button {
      width: 100%;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #060810;
      border: none;
      border-radius: 12px;
      padding: 14px;
      font-family: 'Syne', sans-serif;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      letter-spacing: 0.04em;
      transition: opacity 0.2s, transform 0.1s;
      position: relative;
      overflow: hidden;
    }

    button:hover { opacity: 0.9; }
    button:active { transform: scale(0.98); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    .result {
      display: none;
      margin-top: 20px;
    }

    .result.show { display: block; }

    .code-box {
      background: rgba(99,210,255,0.05);
      border: 1px solid rgba(99,210,255,0.2);
      border-radius: 14px;
      padding: 20px;
      text-align: center;
    }

    .code-label {
      font-size: 11px;
      font-family: 'DM Mono', monospace;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 12px;
    }

    .code-value {
      font-family: 'DM Mono', monospace;
      font-size: 28px;
      font-weight: 500;
      color: var(--accent);
      letter-spacing: 0.12em;
      margin-bottom: 10px;
    }

    .code-hint {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.5;
    }

    .error-box {
      background: rgba(248,113,113,0.06);
      border: 1px solid rgba(248,113,113,0.2);
      border-radius: 12px;
      padding: 14px 16px;
      font-size: 13px;
      color: var(--error);
      text-align: center;
    }

    .footer {
      text-align: center;
      font-size: 12px;
      color: var(--muted);
      margin-top: 20px;
    }

    .footer a {
      color: var(--accent);
      text-decoration: none;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(6,8,16,0.3);
      border-top-color: #060810;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      vertical-align: middle;
      margin-right: 6px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">Multi Device • WhatsApp Pairing</div>

    <h1>ѕтαιη ρяσנєcт</h1>
    <p class="subtitle">Connect your WhatsApp number in seconds. No QR code needed.</p>

    <div class="card">
      <div class="steps">
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-text">Enter your <strong>WhatsApp number</strong> with country code below</div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-text">Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong></div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-text">Tap <strong>"Link with phone number"</strong> and enter the code shown</div>
        </div>
      </div>

      <label for="number">WhatsApp Number</label>
      <div class="input-wrap">
        <span class="prefix">+</span>
        <input
          type="text"
          id="number"
          placeholder="628123456789"
          inputmode="numeric"
          autocomplete="off"
        />
      </div>

      <button id="pairBtn" onclick="requestPairing()">
        Get Pairing Code
      </button>

      <div class="result" id="result"></div>
    </div>

    <div class="footer">
      Powered by <a href="https://t.me/stainprojectss" target="_blank">ѕтαιη ρяσנєcт</a>
      &nbsp;·&nbsp;
      <a href="https://t.me/heisevanss" target="_blank">Contact Owner</a>
    </div>
  </div>

  <script>
    async function requestPairing() {
      const input = document.getElementById("number");
      const btn = document.getElementById("pairBtn");
      const result = document.getElementById("result");
      const number = input.value.replace(/[^0-9]/g, "");

      if (!number || number.length < 10) {
        result.className = "result show";
        result.innerHTML = '<div class="error-box">Please enter a valid number with country code.</div>';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Generating code...';
      result.className = "result";
      result.innerHTML = "";

      try {
        const res = await fetch("/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number })
        });

        const data = await res.json();

        if (data.success) {
          result.className = "result show";
          result.innerHTML = \`
            <div class="code-box">
              <div class="code-label">Your Pairing Code</div>
              <div class="code-value">\${data.code}</div>
              <div class="code-hint">
                Enter this code in WhatsApp → Linked Devices → Link with phone number.<br/>
                Code expires in ~60 seconds.
              </div>
            </div>
          \`;
        } else {
          result.className = "result show";
          result.innerHTML = \`<div class="error-box">\${data.message}</div>\`;
        }
      } catch (err) {
        result.className = "result show";
        result.innerHTML = '<div class="error-box">Server error. Please try again.</div>';
      }

      btn.disabled = false;
      btn.innerHTML = "Get Pairing Code";
    }

    document.getElementById("number").addEventListener("keydown", (e) => {
      if (e.key === "Enter") requestPairing();
    });
  </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Web pairing server running on port ${PORT}`);
});

module.exports = app;
