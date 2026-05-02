// GET /api/messages
// — Rate limiting por IP —

const messages   = global._msgs    || (global._msgs    = []);
const ipReads    = global._ipReads || (global._ipReads = {});
const WINDOW_MS  = 60_000;
const MAX_READS  = 60; // lecturas por minuto por IP

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const ip  = (req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();

  if (!ipReads[ip] || now > ipReads[ip].reset) {
    ipReads[ip] = { count: 1, reset: now + WINDOW_MS };
  } else {
    ipReads[ip].count++;
    if (ipReads[ip].count > MAX_READS) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }
  }

  return res.json(messages);
};
