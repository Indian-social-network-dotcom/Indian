/**
 * Indian message & call push bridge for Cloudflare Workers.
 * App secrets are configured in Cloudflare > Worker > Settings > Variables & Secrets.
 * Never place the OneSignal REST API key in GitHub or public HTML.
 */
const ALLOWED_ORIGIN = "https://indian-social-network-dotcom.github.io";
const FIREBASE_PROJECT_ID = "indian-84a86";
const ONESIGNAL_APP_ID = "019d756d-8ff5-4c09-bcab-75ace208d8da";
const TEST_SITE_URL = "https://indian-social-network-dotcom.github.io/Indian/css-test/index.html";

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
  const data = await response.json().catch(() => ({}));
  const uid = data && Array.isArray(data.users) && data.users[0] ? data.users[0].localId : null;
  return uid;
}

async function getFirestoreDocument(projectId, documentPath, idToken) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    {
      headers: { "Authorization": `Bearer ${idToken}` }
    }
  );
  if (!response.ok) return null;
  return await response.json().catch(() => null);
}

async function sendOneSignalPush(appId, apiKey, externalUserId, title, message, url, dataPayload) {
  const payload = {
    app_id: appId,
    include_external_user_ids: [externalUserId],
    headings: { en: title },
    contents: { en: message },
    url: url || TEST_SITE_URL,
    data: dataPayload || {}
  };
  const response = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": `Basic ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, result };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, origin);
    }

    const authHeader = request.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized: missing bearer token" }, 401, origin);
    }
    const idToken = authHeader.slice(7);

    const apiKey = env.FIREBASE_API_KEY;
    const oneSignalApiKey = env.ONESIGNAL_REST_API_KEY;
    if (!apiKey || !oneSignalApiKey) {
      return json({ error: "Server configuration missing API keys" }, 500, origin);
    }

    const callerUid = await verifyFirebaseIdToken(idToken, apiKey);
    if (!callerUid) {
      return json({ error: "Unauthorized: invalid Firebase token" }, 401, origin);
    }

    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Invalid JSON body" }, 400, origin);
    }

    // Handle Message or Call Notification triggers
    const messageId = body.messageId;
    const callId = body.callId;

    if (messageId) {
      const msgDoc = await getFirestoreDocument(FIREBASE_PROJECT_ID, `messages/${messageId}`, idToken);
      if (!msgDoc || !msgDoc.fields) {
        return json({ error: "Message document not found" }, 404, origin);
      }
      const fields = msgDoc.fields;
      const senderId = fields.senderId && fields.senderId.stringValue;
      const receiverId = fields.receiverId && fields.receiverId.stringValue;
      const text = fields.text && fields.text.stringValue ? fields.text.stringValue : "New attachment";

      if (senderId !== callerUid) {
        return json({ error: "Forbidden: sender mismatch" }, 403, origin);
      }

      const externalUserId = `indian_firebase_${receiverId}`;
      const pushResult = await sendOneSignalPush(
        ONESIGNAL_APP_ID,
        oneSignalApiKey,
        externalUserId,
        "New Message on Indian",
        text,
        TEST_SITE_URL,
        { type: "messages", targetId: senderId }
      );

      return json({ success: true, pushResult }, 200, origin);
    }

    if (callId) {
      const callDoc = await getFirestoreDocument(FIREBASE_PROJECT_ID, `calls/${callId}`, idToken);
      if (!callDoc || !callDoc.fields) {
        return json({ error: "Call document not found" }, 404, origin);
      }
      const fields = callDoc.fields;
      const callerId = fields.callerId && fields.callerId.stringValue;
      const calleeId = fields.calleeId && fields.calleeId.stringValue;
      const callerName = fields.callerName && fields.callerName.stringValue ? fields.callerName.stringValue : "Someone";
      const callType = fields.callType && fields.callType.stringValue ? fields.callType.stringValue : "audio";
      const status = fields.status && fields.status.stringValue ? fields.status.stringValue : "";

      if (callerId !== callerUid) {
        return json({ error: "Forbidden: caller mismatch" }, 403, origin);
      }
      if (status !== "ringing") {
        return json({ error: "Call is not in ringing state" }, 400, origin);
      }

      const externalUserId = `indian_firebase_${calleeId}`;
      const title = callType === "video" ? "Incoming Indian Video Call" : "Incoming Indian Voice Call";
      const message = `${callerName} is calling you. Tap to answer.`;

      const pushResult = await sendOneSignalPush(
        ONESIGNAL_APP_ID,
        oneSignalApiKey,
        externalUserId,
        title,
        message,
        TEST_SITE_URL,
        { type: "call", callId: callId, callType: callType }
      );

      return json({ success: true, pushResult }, 200, origin);
    }

    return json({ error: "Missing messageId or callId parameter" }, 400, origin);
  }
};
