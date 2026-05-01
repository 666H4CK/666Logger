// 666 H4CK — Standalone API Server
// Requires: Node.js 18+ (built-in fetch)
//
// Setup:
//   npm install express cors
//   node server.js
//
// Endpoints:
//   POST /send           { user, text }  → enviar mensaje al chat
//   GET  /messages                       → leer mensajes del chat
//   GET  /api/roblox-user?username=...   → buscar usuario de Roblox

const express = require("express");
const cors    = require("cors");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── CHAT ─────────────────────────────────────────────────────────────
const messages        = [];
const lastMessageTime = {};

app.post("/send", (req, res) => {
  const { user, text } = req.body ?? {};
  if (!user || !text) return res.status(400).json({ error: "Datos inválidos" });

  const now = Date.now();
  if (lastMessageTime[user] && now - lastMessageTime[user] < 2000) {
    return res.status(429).json({ error: "Muy rápido" });
  }
  lastMessageTime[user] = now;

  messages.push({ user, text, time: now });
  if (messages.length > 50) messages.shift();

  res.json({ success: true });
});

app.get("/messages", (_req, res) => {
  res.json(messages);
});

// ── ROBLOX USER SEARCH ────────────────────────────────────────────────
app.get("/api/roblox-user", async (req, res) => {
  const username = String(req.query.username ?? "").trim();
  if (!username) return res.status(400).json({ error: "username required" });

  try {
    // Exact lookup first
    const lookupRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
    });

    if (!lookupRes.ok) return res.status(502).json({ error: "Roblox API error" });

    const lookupData = await lookupRes.json();

    let user = lookupData.data?.[0];

    // Fallback to search if exact match not found
    if (!user) {
      const searchRes = await fetch(
        `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`,
        { headers: { "Accept": "application/json" } }
      );
      if (!searchRes.ok) return res.status(404).json({ error: "User not found" });
      const searchData = await searchRes.json();
      user = searchData.data?.[0];
      if (!user) return res.status(404).json({ error: "User not found" });
    }

    // Fetch avatar
    let avatarUrl = "";
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=60x60&format=Png`,
      { headers: { "Accept": "application/json" } }
    );
    if (thumbRes.ok) {
      const thumbData = await thumbRes.json();
      avatarUrl = thumbData.data?.[0]?.imageUrl ?? "";
    }

    res.json({ userId: user.id, username: user.name, displayName: user.displayName, avatarUrl });
  } catch (err) {
    res.status(502).json({ error: "Failed to reach Roblox API" });
  }
});

// ── START ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`666 H4CK API running on http://localhost:${PORT}`);
});
    
