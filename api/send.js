// POST /api/send   body: { user, text }
// — Rate limiting por IP + validación estricta —

const messages        = global._msgs   || (global._msgs   = []);
const lastTime        = global._times  || (global._times  = {});
const ipCount         = global._ipCnt  || (global._ipCnt  = {});

const COOLDOWN_MS     = 3_000;   // 3 s entre mensajes del mismo usuario
const IP_WINDOW_MS    = 60_000;  // ventana para rate limit por IP
const IP_MAX_MSGS     = 15;      // máx mensajes por IP por ventana
const USER_MAX_LEN    = 32;
const TEXT_MAX_LEN    = 300;

// Patrón básico anti-spam: sin URLs en el nick
const SAFE_USER_RE    = /^[\w \-\.áéíóúÁÉÍÓÚñÑ]{1,32}$/u;

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  // 1. Rate limit por IP
  const ip  = (req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();

  if (!ipCount[ip] || now > ipCount[ip].reset) {
    ipCount[ip] = { count: 1, reset: now + IP_WINDOW_MS };
  } else {
    ipCount[ip].count++;
    if (ipCount[ip].count > IP_MAX_MSGS) {
      return res.status(429).json({ error: "Demasiados mensajes, espera un minuto." });
    }
  }

  // 2. Validar cuerpo
  const { user, text } = req.body ?? {};
  if (typeof user !== "string" || typeof text !== "string") {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  const u = user.trim().slice(0, USER_MAX_LEN);
  const t = text.trim().slice(0, TEXT_MAX_LEN);

  if (!u || !t)             return res.status(400).json({ error: "Campos vacíos" });
  if (!SAFE_USER_RE.test(u)) return res.status(400).json({ error: "Nombre inválido" });

  // 3. Cooldown por usuario
  if (lastTime[u] && now - lastTime[u] < COOLDOWN_MS) {
    return res.status(429).json({ error: "Muy rápido, espera un momento." });
  }
  lastTime[u] = now;

  // 4. Guardar mensaje
  messages.push({ user: u, text: t, time: now });
  if (messages.length > 50) messages.shift();

  return res.json({ success: true });
};
