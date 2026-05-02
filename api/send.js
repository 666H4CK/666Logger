// Vercel Serverless Function — Chat send
// POST /api/send   body: { user: "nombre", text: "mensaje" }

const messages        = global._msgs  || (global._msgs  = []);
const lastMessageTime = global._times || (global._times = {});

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  const { user, text } = req.body ?? {};
  if (!user || !text) return res.status(400).json({ error: "Datos inválidos" });

  const now = Date.now();
  if (lastMessageTime[user] && now - lastMessageTime[user] < 2000) {
    return res.status(429).json({ error: "Muy rápido" });
  }
  lastMessageTime[user] = now;

  messages.push({ user, text, time: now });
  if (messages.length > 50) messages.shift();

  return res.json({ success: true });
};
