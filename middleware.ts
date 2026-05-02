// ─── Configuración ────────────────────────────────────────────────────────────
const API_LIMIT        = 30;   // máx requests por IP en la ventana de tiempo
const WINDOW_MS        = 60_000; // ventana: 1 minuto
const GLOBAL_LIMIT     = 500;  // máx requests globales por ventana (todas las IPs)
const BODY_MAX_BYTES   = 2_048; // 2 KB máximo en POST

// Agentes de bot conocidos (bloqueados)
const BAD_BOTS = [
  "python-requests", "go-http-client", "curl/", "wget/",
  "masscan", "zgrab", "nikto", "sqlmap", "nmap",
];

// ─── Estado en memoria (por instancia edge) ──────────────────────────────────
const ipMap     = new Map<string, { count: number; reset: number }>();
let   globalHits = 0;
let   globalReset = Date.now() + WINDOW_MS;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function tooManyResponse(retryAfterSec: number) {
  return new Response(
    JSON.stringify({ error: "Too Many Requests — slow down." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(API_LIMIT),
      },
    }
  );
}

function blockedResponse(reason: string) {
  return new Response(JSON.stringify({ error: reason }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Middleware principal ─────────────────────────────────────────────────────
export default function middleware(req: Request) {
  const url = new URL(req.url);
  const now = Date.now();

  // Solo proteger rutas /api/*
  if (!url.pathname.startsWith("/api/")) return next();

  // 1. Bloquear user-agents de bots / herramientas de ataque
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BAD_BOTS.some((b) => ua.toLowerCase().includes(b))) {
    return blockedResponse("Forbidden");
  }

  // 2. Bloquear Content-Length demasiado grande en POST
  const cl = Number(req.headers.get("content-length") ?? "0");
  if (req.method === "POST" && cl > BODY_MAX_BYTES) {
    return new Response(JSON.stringify({ error: "Payload too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Rate limit global (anti-flood masivo)
  if (now > globalReset) {
    globalHits  = 0;
    globalReset = now + WINDOW_MS;
  }
  globalHits++;
  if (globalHits > GLOBAL_LIMIT) {
    return tooManyResponse(Math.ceil((globalReset - now) / 1000));
  }

  // 4. Rate limit por IP
  const ip = getIP(req);
  const rec = ipMap.get(ip);

  if (!rec || now > rec.reset) {
    ipMap.set(ip, { count: 1, reset: now + WINDOW_MS });
  } else {
    rec.count++;
    if (rec.count > API_LIMIT) {
      return tooManyResponse(Math.ceil((rec.reset - now) / 1000));
    }
  }

  // 5. Pasar la request
  return next();
}

export const config = {
  matcher: "/api/:path*",
};
