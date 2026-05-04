# n8n — NCC Bangla Registrations

Webhook-driven registration backend. Replaces the Supabase Edge Function
(`supabase/functions/ncc-registrations`) — same DB schema, same Brevo
calls, hosted on the user's own n8n instance.

## Live endpoint

- **Webhook URL:** `https://n8n.x3roautomations.it/webhook/ncc-register`
- **Hosted on:** `n8n.x3roautomations.it` (user's VPS)
- **Workflow ID:** `cixOQc0zzz2rFfO7`
- **Source workflow JSON:** `ncc-registrations.json` (re-export here after every UI edit)

## Required credentials (in n8n UI)

| Credential name | Type | Used by | Notes |
|---|---|---|---|
| `supabase dhaka` | `supabaseApi` | Get/insert/update on `ncc_bangla_registrations` | Shared with the review-management workflow — same Supabase project (`drypjcgloclnxayfzdsz`) |
| `Brevo API` | `httpHeaderAuth` | Brevo Contacts + Transactional API | Header `api-key`, value from `ncc-bangla/.env` `BREVO_API_KEY` |

Hardcoded inside the workflow nodes (do NOT use n8n env vars on this instance — `$env.*` does not resolve here):

- Brevo list ID: `3` ("NCC Bangla — Iscritti")
- Brevo welcome template ID: `1` ("NCC Bangla — Benvenuto")

## Request shape

```jsonc
// Lookup — does this email exist?
POST /webhook/ncc-register
{ "action": "lookup", "email": "user@example.com" }
// → 200 { "exists": true }   // also bumps last_seen_at
// → 200 { "exists": false }

// Register — create new row + add Brevo contact + send welcome email
POST /webhook/ncc-register
{
  "action": "register",
  "email": "user@example.com",
  "name": "Alice",
  "phone": "+39 333 1234567",
  "marketing_consent": true,
  "hp": ""        // honeypot — non-empty value silently 200's with {ok:true}
}
// → 200 { "exists": false, "registered": true }   // fresh row inserted, Brevo fires
// → 200 { "exists": true }                         // already registered, last_seen_at bumped
// → 400 { "error": "<italian message>" }           // validation failed
```

CORS: `https://xerocool36.github.io`, `http://localhost:8000`, `http://127.0.0.1:8000`.

## Workflow shape

```
Webhook → Parse + honeypot → Route action (Switch)
                                ├─ honeypot ──► Respond {ok:true}
                                ├─ lookup ────► Find by email → IF found?
                                │                                 ├─ true ──► bump last_seen → Respond {exists:true}
                                │                                 └─ false ─► Respond {exists:false}
                                ├─ register ──► Validate → IF valid?
                                │                            ├─ false ─► Respond {error:...} 400
                                │                            └─ true ──► Find by email → IF exists?
                                │                                                          ├─ true ──► bump last_seen → Respond {exists:true}
                                │                                                          └─ false ─► Insert Row → Respond {registered:true}
                                │                                                                                          │
                                │                                                                            (after respond, fire-and-forget)
                                │                                                                                          ▼
                                │                                                                              Brevo: add contact → Brevo: send welcome
                                └─ fallback ─► Respond {error:"azione non valida"} 400
```

The register branch does a pre-flight Get-by-email rather than catching a
Postgres `23505` unique-constraint violation after the fact. Cleaner: the
duplicate path doesn't burn an INSERT cycle, and we don't depend on n8n's
inconsistent `error?.code` exposure for failed nodes.

## Re-importing into n8n

n8n UI → Workflows → ⋯ → "Import from File" → select `ncc-registrations.json`.

After import:
1. Open each Supabase node — the dropdown should already show `supabase dhaka`
   (same credential ID `FjXknluDwpYHQYoI`). If empty, re-select.
2. Open both Brevo HTTP Request nodes — re-attach `Brevo API` credential
   (`KiG1k1GIyjUsa9z5`).
3. Activate the workflow (top-right toggle).
4. Verify the production webhook URL stays `https://n8n.x3roautomations.it/webhook/ncc-register`
   — must match `WEBHOOK_URL` in the inline splash JS in `index.html`.

## Smoke tests

```bash
# honeypot
curl -s -X POST https://n8n.x3roautomations.it/webhook/ncc-register \
  -H 'Content-Type: application/json' \
  -d '{"action":"register","email":"x@y.com","hp":"i-am-a-bot"}'
# expected: {"ok":true}

# unknown action
curl -s -X POST https://n8n.x3roautomations.it/webhook/ncc-register \
  -H 'Content-Type: application/json' \
  -d '{"action":"bogus"}'
# expected: {"error":"azione non valida"} 400

# lookup nonexistent
curl -s -X POST https://n8n.x3roautomations.it/webhook/ncc-register \
  -H 'Content-Type: application/json' \
  -d '{"action":"lookup","email":"nope@example.invalid"}'
# expected: {"exists":false}

# register with missing consent
curl -s -X POST https://n8n.x3roautomations.it/webhook/ncc-register \
  -H 'Content-Type: application/json' \
  -d '{"action":"register","email":"x@y.com","name":"Test","phone":"+39 333 1234567","marketing_consent":false}'
# expected: {"error":"devi accettare la privacy policy per continuare"} 400
```
