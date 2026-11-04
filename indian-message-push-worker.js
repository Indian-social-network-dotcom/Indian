/**
 * Indian message-push bridge for Cloudflare Workers.
 * App secrets are configured in Cloudflare > Worker > Settings > Variables & Secrets.
 * Never place the OneSignal REST API key in GitHub or public HTML.
 */
const ALLOWED_ORIGIN = "https://indian-social-network-dotcom.github.io";
const FIREBASE_PROJECT_ID = "indian-84a86";
const ONESIGNAL_APP_ID = "019d756d-8ff5-4c09-bcab-75ace208d8da";
const INDIAN_SITE_URL = "https://indian-social-network-dotcom.github.io/Indian/";

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
  const uid = data && Array.isArray(data.users) && data.users[0] && data.users[0].localId
    ? data.users[0].localId
    : null;
  if (response.ok && uid) return { uid: uid, error: null };

  // Return only Google's short error code/message; never log or expose the ID token or API key.
  const apiError = data && data.error ? data.error : {};
  const detail = String(apiError.message || "Unknown Firebase verification error").slice(0, 180);
  return { uid: null, error: { httpStatus: response.status, detail: detail } };
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

async function getPublicProfile(uid, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/publicProfiles/${encodeURIComponent(uid)}`;
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${idToken}` }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore public profile read failed (${response.status})`);
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

async function sendOneSignalPush(env, receiverUid, messageId, senderName, messageText) {
  const idempotencyKey = await stableIdempotencyKey(messageId);
  const safeSender = String(senderName || "Someone")
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Someone";
  const safeMessage = String(messageText || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    include_aliases: { external_id: [`indian_firebase_${receiverUid}`] },
    target_channel: "push",
    headings: { en: `${safeSender} sent you a message` },
    contents: { en: safeMessage || "Sent you a photo or video." },
    url: `${INDIAN_SITE_URL}?indianMessageId=${encodeURIComponent(messageId)}`,
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
  const responseText = await response.text();
  let result = {};
  try { result = responseText ? JSON.parse(responseText) : {}; } catch {}
  if (!response.ok) {
    // Expose a short provider error for diagnosis; never expose the REST API key.
    const providerError = result && (result.errors || result.error || result.message);
    const detail = (typeof providerError === "string"
      ? providerError
      : Array.isArray(providerError)
        ? providerError.join("; ")
        : providerError
          ? JSON.stringify(providerError)
          : response.statusText) || "Unknown OneSignal error";
    console.error("OneSignal API request failed:", response.status, detail.slice(0, 240));
    throw new Error(`OneSignal HTTP ${response.status}: ${detail.slice(0, 240)}`);
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

    const verification = await verifyFirebaseIdToken(idToken, env.FIREBASE_WEB_API_KEY);
    if (!verification.uid) {
      const failure = verification.error || { httpStatus: 0, detail: "Unknown verification error" };
      console.error("Firebase ID token verification failed:", failure.httpStatus, failure.detail);
      return json({
        error: "Firebase ID token verification failed.",
        firebaseHttpStatus: failure.httpStatus,
        firebaseError: failure.detail
      }, 401, origin);
    }
    const callerUid = verification.uid;

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON." }, 400, origin); }
    const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
    const callId = typeof body.callId === "string" ? body.callId.trim() : "";
    if (messageId && callId) {
      return json({ error: "Send either messageId or callId, not both." }, 400, origin);
    }
    if (!messageId && !callId) {
      return json({ error: "Missing messageId or callId." }, 400, origin);
    }
    if (messageId && !/^[A-Za-z0-9_-]{10,40}$/.test(messageId)) {
      return json({ error: "Invalid message ID." }, 400, origin);
    }
    if (callId && !/^[A-Za-z0-9_-]{10,40}$/.test(callId)) {
      return json({ error: "Invalid call ID." }, 400, origin);
    }

    try {
      if (callId) {
        const callUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/calls/${encodeURIComponent(callId)}`;
        const callResponse = await fetch(callUrl, {
          headers: { "Authorization": `Bearer ${idToken}` }
        });
        if (callResponse.status === 404) return json({ error: "Call not found." }, 404, origin);
        if (!callResponse.ok) throw new Error(`Firestore call read failed (${callResponse.status})`);
        const callDoc = await callResponse.json();
        const callerId = stringField(callDoc, "callerId");
        const calleeId = stringField(callDoc, "calleeId");
        const callerName = stringField(callDoc, "callerName") || "Someone";
        const callType = stringField(callDoc, "callType") || "audio";
        const status = stringField(callDoc, "status");

        if (!callerId || !calleeId) return json({ error: "Call caller or receiver is missing." }, 400, origin);
        if (callerId !== callerUid) return json({ error: "You can only notify for a call you started." }, 403, origin);
        if (status !== "ringing") return json({ error: "Call is not in ringing state." }, 400, origin);
        if (callType !== "audio" && callType !== "video") return json({ error: "Invalid call type." }, 400, origin);

        const safeCaller = callerName.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Someone";
        const callKey = await stableIdempotencyKey(`call:${callId}`);
        const callPayload = {
          app_id: ONESIGNAL_APP_ID,
          include_aliases: { external_id: [`indian_firebase_${calleeId}`] },
          target_channel: "push",
          headings: { en: callType === "video" ? "Incoming Indian Video Call" : "Incoming Indian Voice Call" },
          contents: { en: `${safeCaller} is calling you. Tap to answer.` },
          url: `${INDIAN_SITE_URL}?indianCallId=${encodeURIComponent(callId)}`,
          idempotency_key: callKey,
          data: { type: "call", callId, callType }
        };
        const callPushResponse = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Authorization": `Key ${env.ONESIGNAL_REST_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(callPayload)
        });
        const callResponseText = await callPushResponse.text();
        let callResult = {};
        try { callResult = callResponseText ? JSON.parse(callResponseText) : {}; } catch {}
        if (!callPushResponse.ok) {
          const providerError = callResult && (callResult.errors || callResult.error || callResult.message);
          const detail = (typeof providerError === "string" ? providerError : Array.isArray(providerError) ? providerError.join("; ") : providerError ? JSON.stringify(providerError) : callPushResponse.statusText) || "Unknown OneSignal error";
          console.error("OneSignal call push failed:", callPushResponse.status, detail.slice(0, 240));
          throw new Error(`OneSignal call push HTTP ${callPushResponse.status}: ${detail.slice(0, 240)}`);
        }
        if (!callResult || !callResult.id) {
          return json({ success: false, type: "call", message: "No subscribed OneSignal device matched this recipient." }, 200, origin);
        }
        return json({ success: true, type: "call", notificationId: callResult.id }, 200, origin);
      }

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

      const profile = await getPublicProfile(senderId, idToken);
      const senderName = stringField(profile, "displayName") || "Someone";
      const messageText = stringField(message, "text");
      const attachmentFields = message.fields && message.fields.attachment
        && message.fields.attachment.mapValue && message.fields.attachment.mapValue.fields;
      const attachmentType = attachmentFields && attachmentFields.type
        ? attachmentFields.type.stringValue : "";
      const notificationText = messageText || (
        attachmentType === "video" ? "Sent you a video."
        : attachmentType === "image" ? "Sent you a photo."
        : "Sent you a message."
      );
      const result = await sendOneSignalPush(
        env, receiverId, messageId, senderName, notificationText
      );
      if (!result || !result.id) {
        return json({ success: false, message: "No subscribed OneSignal device matched this recipient." }, 200, origin);
      }
      return json({ success: true, notificationId: result.id }, 200, origin);
    } catch (error) {
      const detail = String(error && error.message ? error.message : "Unknown push delivery error").slice(0, 300);
      console.error("Indian message push failed:", detail);
      return json({
        error: "Could not send a push for this message. The message itself was saved successfully.",
        detail: detail
      }, 502, origin);
    }
  }
};