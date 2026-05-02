// GET /api/roblox-user?username=Builderman
// — Rate limiting por IP —

const ipSearches = global._ipSearch || (global._ipSearch = {});
const WINDOW_MS  = 60_000;
const MAX_SEARCH = 20; // búsquedas por minuto por IP

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Rate limit por IP
  const ip  = (req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();

  if (!ipSearches[ip] || now > ipSearches[ip].reset) {
    ipSearches[ip] = { count: 1, reset: now + WINDOW_MS };
  } else {
    ipSearches[ip].count++;
    if (ipSearches[ip].count > MAX_SEARCH) {
      return res.status(429).json({ error: "Demasiadas búsquedas, espera un minuto." });
    }
  }

  const username = String(req.query.username ?? "").trim().slice(0, 50);
  if (!username) return res.status(400).json({ error: "username required" });

  // Bloquear caracteres raros en el username
  if (!/^[\w\s\-\.]{1,50}$/.test(username)) {
    return res.status(400).json({ error: "Username inválido" });
  }

  try {
    const lookupRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });

    if (!lookupRes.ok) return res.status(502).json({ error: "Roblox API error" });

    const lookupData = await lookupRes.json();
    let user = lookupData.data?.[0];

    if (!user) {
      const searchRes = await fetch(
        `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`,
        { headers: { Accept: "application/json" } }
      );
      if (!searchRes.ok) return res.status(404).json({ error: "User not found" });
      const searchData = await searchRes.json();
      user = searchData.data?.[0];
      if (!user) return res.status(404).json({ error: "User not found" });
    }

    let avatarUrl = "";
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=60x60&format=Png`,
      { headers: { Accept: "application/json" } }
    );
    if (thumbRes.ok) {
      const thumbData = await thumbRes.json();
      avatarUrl = thumbData.data?.[0]?.imageUrl ?? "";
    }

    return res.json({
      userId:      user.id,
      username:    user.name,
      displayName: user.displayName,
      avatarUrl,
    });
  } catch {
    return res.status(502).json({ error: "Failed to reach Roblox API" });
  }
};
