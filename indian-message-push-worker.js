/**
 * Indian message-push bridge for Cloudflare Workers.
 * App secrets are configured in Cloudflare > Worker > Settings > Variables & Secrets.
 * Never place the OneSignal REST API key in GitHub or public HTML.
 */
const ALLOWED_ORIGIN = "https://indian-social-network-dotcom.github.io";
const FIREBASE_PROJECT_ID = "indian-84a86";
const ONESIGNAL_APP_ID = "019d756d-8ff5-4c09-bcab-75ace208d8da";
const TEST_SITE_URL = "https://indian-social-network-dotcom.github.io/Indian/";

function corsHeaders(origin) {
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  if (origin === ALLOWED_ORIGIN) headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
  return headers;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

async function verifyFirebaseIdToken(idToken, apiKey) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    }
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data && Array.isArray(data.users) && data.users[0] && data.users[0].localId
    ? data.users[0].localId
    : null;
}

async function getFirestoreMessage(messageId, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/messages/${encodeURIComponent(messageId)}`;
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${idToken}` }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore read failed (${response.status})`);
  return response.json();
}

function stringField(document, name) {
  const field = document && document.fields && document.fields[name];
  return field && typeof field.stringValue === "string" ? field.stringValue : "";
}

async function stableIdempotencyKey(messageId) {
  const data = new TextEncoder().encode(`indian-message-push:${FIREBASE_PROJECT_ID}:${messageId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const bytes = digest.slice(0, 16);
  // Format as a stable UUID so retries for the same Firestore message are idempotent.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function sendOneSignalPush(env, receiverUid, messageId) {
  const idempotencyKey = await stableIdempotencyKey(messageId);
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    include_aliases: { external_id: [`indian_firebase_${receiverUid}`] },
    target_channel: "push",
    headings: { en: "New message on Indian" },
    // Keep private message contents off the lock screen.
    contents: { en: "You have received a new message." },
    url: TEST_SITE_URL,
    idempotency_key: idempotencyKey,
    data: { type: "message", messageId }
  };
  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Authorization": `Key ${env.ONESIGNAL_REST_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("OneSignal API request failed", response.status);
    throw new Error("OneSignal rejected the push request.");
  }
  return result;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    // A harmless GET status response is useful for opening/testing the Worker URL directly.
    if (request.method === "GET") {
      return json({ service: "indian-message-push", status: "ready", configured: !!(env.FIREBASE_WEB_API_KEY && env.ONESIGNAL_REST_API_KEY) }, 200, origin);
    }
    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403, origin);
    if (request.method !== "POST") return json({ error: "Use POST." }, 405, origin);
    if (!env.FIREBASE_WEB_API_KEY || !env.ONESIGNAL_REST_API_KEY) {
      return json({ error: "Worker secrets are not configured yet." }, 500, origin);
    }

    const authorization = request.headers.get("Authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return json({ error: "Sign in is required." }, 401, origin);
    const idToken = match[1].trim();

    const callerUid = await verifyFirebaseIdToken(idToken, env.FIREBASE_WEB_API_KEY);
    if (!callerUid) return json({ error: "Firebase sign-in token is invalid or expired." }, 401, origin);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON." }, 400, origin); }
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    if (!/^[A-Za-z0-9_-]{10,40}$/.test(messageId)) {
      return json({ error: "Invalid message ID." }, 400, origin);
    }

    try {
      const message = await getFirestoreMessage(messageId, idToken);
      if (!message) return json({ error: "Message not found." }, 404, origin);

      const senderId = stringField(message, "senderId");
      const receiverId = stringField(message, "receiverId");
      if (senderId !== callerUid) {
        return json({ error: "You can only notify for a message you sent." }, 403, origin);
      }
      if (!receiverId || receiverId === senderId) {
        return json({ skipped: true, reason: "No other recipient." }, 200, origin);
      }

      const createdAtMs = message.fields && message.fields.createdAtMs && message.fields.createdAtMs.integerValue
        ? Number(message.fields.createdAtMs.integerValue)
        : 0;
      if (createdAtMs && Date.now() - createdAtMs > 24 * 60 * 60 * 1000) {
        return json({ skipped: true, reason: "Message is too old for a new push." }, 200, origin);
      }

      const result = await sendOneSignalPush(env, receiverId, messageId);
      if (!result || !result.id) {
        return json({ success: false, message: "No subscribed OneSignal device matched this recipient." }, 200, origin);
      }
      return json({ success: true, notificationId: result.id }, 200, origin);
    } catch (error) {
      console.error("Indian message push failed:", error && error.message ? error.message : String(error));
      return json({ error: "Could not send a push for this message. The message itself was saved successfully." }, 502, origin);
    }
  }
};
