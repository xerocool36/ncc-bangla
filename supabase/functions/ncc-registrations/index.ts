import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://xerocool36.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const NCC_BANGLA_LIST_ID = Deno.env.get("NCC_BANGLA_LIST_ID")!;
const NCC_BANGLA_WELCOME_TEMPLATE_ID = Deno.env.get(
  "NCC_BANGLA_WELCOME_TEMPLATE_ID",
)!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

async function verifyTurnstile(token: string): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

async function brevoCall(
  email: string,
  name: string,
  phone: string,
): Promise<void> {
  try {
    const contactRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        attributes: { FIRSTNAME: name, SMS: phone },
        listIds: [Number(NCC_BANGLA_LIST_ID)],
        updateEnabled: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!contactRes.ok) {
      console.error("brevo contact failed", contactRes.status, await contactRes.text());
    }

    const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        to: [{ email, name }],
        templateId: Number(NCC_BANGLA_WELCOME_TEMPLATE_ID),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!emailRes.ok) {
      console.error("brevo email failed", emailRes.status, await emailRes.text());
    }
  } catch (err) {
    console.error("brevo failure", err);
  }
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return json({ error: "metodo non consentito" }, 405, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "richiesta non valida" }, 400, origin);
  }

  const { action, email: rawEmail, turnstile_token, hp } = body as {
    action?: string;
    email?: string;
    turnstile_token?: string;
    hp?: string;
  };

  // Honeypot: return 200 silently so bots don't know they were caught
  if (hp) {
    return json({ ok: true }, 200, origin);
  }

  // Turnstile verification
  const tokenStr = String(turnstile_token ?? "");
  const turnstileOk = await verifyTurnstile(tokenStr);
  if (!turnstileOk) {
    return json(
      { error: "verifica anti-bot fallita, ricarica e riprova" },
      400,
      origin,
    );
  }

  const email = String(rawEmail ?? "").trim().toLowerCase();

  try {
    if (action === "lookup") {
      const { data } = await supabase
        .from("ncc_bangla_registrations")
        .select("id")
        .eq("email", email)
        .limit(1)
        .maybeSingle();

      if (data) {
        await supabase
          .from("ncc_bangla_registrations")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", data.id);
        return json({ exists: true }, 200, origin);
      }

      return json({ exists: false }, 200, origin);
    }

    if (action === "register") {
      const name = String(body.name ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const marketing_consent = body.marketing_consent;

      if (!name) return json({ error: "il nome è obbligatorio" }, 400, origin);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "email non valida" }, 400, origin);
      }
      if (phone.replace(/\D/g, "").length < 8) {
        return json(
          { error: "numero di telefono non valido (minimo 8 cifre)" },
          400,
          origin,
        );
      }
      if (marketing_consent !== true) {
        return json(
          { error: "devi accettare la privacy policy per continuare" },
          400,
          origin,
        );
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("ncc_bangla_registrations")
        .insert({ email, name, phone, marketing_consent })
        .select("id")
        .maybeSingle();

      if (insertErr) {
        // Postgres unique violation code = 23505 (surfaced via supabase-js as code string)
        if (insertErr.code === "23505") {
          // Already registered — treat as returning user
          await supabase
            .from("ncc_bangla_registrations")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("email", email);
          return json({ exists: true }, 200, origin);
        }
        throw insertErr;
      }

      // Fresh insert: respond immediately, fire Brevo in the background
      const response = json({ exists: false, registered: true }, 200, origin);
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil(brevoCall(email, name, phone));
      return response;
    }

    return json({ error: "azione non valida" }, 400, origin);
  } catch (err) {
    console.error("ncc-registrations unhandled error", err);
    return json({ error: "errore del server, riprova tra poco" }, 500, origin);
  }
});
