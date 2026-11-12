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

function numberField(document, name) {
  const field = document && document.fields && document.fields[name];
  if (!field) return NaN;
  if (field.doubleValue !== undefined) return Number(field.doubleValue);
  if (field.integerValue !== undefined) return Number(field.integerValue);
  return NaN;
}

async function getFirestoreHelpRequest(requestId, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/helpRequests/${encodeURIComponent(requestId)}`;
  const response = await fetch(url, { headers: { "Authorization": `Bearer ${idToken}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore Help Request read failed (${response.status})`);
  return response.json();
}



// --- Secure Indian Racing Star Wallet (server-side only) ---
function base64UrlBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlText(value) {
  return base64UrlBytes(new TextEncoder().encode(value));
}
function pemBytes(pem) {
  const body = String(pem || "").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}
async function getFirestoreAdminToken(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Star Wallet server secret is not configured.");
  let account;
  try { account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); }
  catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON."); }
  if (!account.client_email || !account.private_key || account.project_id !== FIREBASE_PROJECT_ID) {
    throw new Error("Firebase service account must belong to Indian project indian-84a86.");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlText(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3500
  }));
  const unsigned = header + "." + claims;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + base64UrlBytes(new Uint8Array(signature));
  const tokenResponse = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error("Firebase service-account OAuth failed (" + tokenResponse.status + ").");
  }
  return tokenData.access_token;
}
function fromFirestoreValue(v) {
  if (!v || v.nullValue !== undefined) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFirestoreValue(x)]));
  return null;
}
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFirestoreValue(x)])) } };
  throw new Error("Unsupported Firestore value.");
}
function decodeFirestoreDoc(doc) {
  return doc && doc.fields ? Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, fromFirestoreValue(v)])) : null;
}
function encodeFirestoreFields(data) {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFirestoreValue(v)]));
}
function firestoreDocUrl(path) {
  return "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID +
    "/databases/(default)/documents/" + path.split("/").map(encodeURIComponent).join("/");
}
async function adminFirestoreTransaction(env, paths, mutate) {
  const token = await getFirestoreAdminToken(env);
  const root = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID + "/databases/(default)/documents";
  const begin = await fetch(root + ":beginTransaction", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ options: { readWrite: {} } })
  });
  const beginData = await begin.json().catch(() => ({}));
  if (!begin.ok || !beginData.transaction) throw new Error("Firestore transaction could not start (" + begin.status + ").");
  const transaction = beginData.transaction;
  try {
    const docs = {};
    for (const path of paths) {
      const response = await fetch(firestoreDocUrl(path) + "?transaction=" + encodeURIComponent(transaction), {
        headers: { Authorization: "Bearer " + token }
      });
      if (response.status === 404) docs[path] = { exists: false, data: null, raw: null };
      else {
        const raw = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("Firestore read failed (" + response.status + ").");
        docs[path] = { exists: true, data: decodeFirestoreDoc(raw), raw };
      }
    }
    const writes = await mutate(docs);
    if (!writes || !writes.length) {
      await fetch(root + ":rollback", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ transaction }) });
      return null;
    }
    const commit = await fetch(root + ":commit", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction,
        writes: writes.map(w => ({
          update: { name: root + "/" + w.path.split("/").map(encodeURIComponent).join("/"), fields: encodeFirestoreFields(w.data) },
          updateMask: { fieldPaths: Object.keys(w.data) },
          currentDocument: w.exists ? { updateTime: w.updateTime } : { exists: false }
        }))
      })
    });
    const commitData = await commit.json().catch(() => ({}));
    if (!commit.ok) throw new Error("Firestore transaction commit failed (" + commit.status + ").");
    return commitData;
  } catch (error) {
    try { await fetch(root + ":rollback", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ transaction }) }); } catch {}
    throw error;
  }
}
function docWrite(path, data, snapshot) {
  return { path, data, exists: !!snapshot.exists, updateTime: snapshot.raw && snapshot.raw.updateTime };
}
async function getOrCreateRacingWallet(env, uid) {
  const path = "racingWallets/" + uid;
  let result;
  await adminFirestoreTransaction(env, [path], async docs => {
    const d = docs[path];
    if (!d.exists) {
      result = { uid, available: 10, locked: 0, totalEarned: 10, starterGranted: true };
      return [docWrite(path, { ...result, createdAtMs: Date.now(), updatedAtMs: Date.now() }, d)];
    }
    const data = d.data || {};
    result = { uid, available: Number(data.available || 0), locked: Number(data.locked || 0), totalEarned: Number(data.totalEarned || 0), starterGranted: !!data.starterGranted };
    return [];
  });
  return result;
}
async function adminGetDocument(env, path) {
  const token = await getFirestoreAdminToken(env);
  const response = await fetch(firestoreDocUrl(path), { headers: { Authorization: "Bearer " + token } });
  if (response.status === 404) return null;
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Firestore document read failed (" + response.status + ").");
  return { raw, data: decodeFirestoreDoc(raw) };
}
async function acceptStarChallenge(env, roomId, callerUid) {
  if (!/^[A-Z0-9]{6}$/.test(roomId)) throw new Error("Invalid challenge room ID.");
  const gamePath = "games/" + roomId;
  const initial = await adminGetDocument(env, gamePath);
  if (!initial) throw new Error("Star Challenge room not found.");
  const game = initial.data || {};
  if (game.type !== "racing" || !game.starChallenge || !Array.isArray(game.players) || game.players.length !== 2) throw new Error("This is not a ready Star Challenge.");
  if (game.players[1].uid !== callerUid) throw new Error("Only the invited second player can accept this challenge.");
  const stake = Number(game.starChallenge.stake);
  if (!Number.isInteger(stake) || stake < 1 || stake > 100) throw new Error("Challenge stake must be 1 to 100 stars.");
  const uids = game.players.map(p => String(p.uid || ""));
  const walletPaths = uids.map(uid => "racingWallets/" + uid);
  let result = null;
  await adminFirestoreTransaction(env, [gamePath, ...walletPaths], async docs => {
    const current = docs[gamePath], g = current.data || {};
    if (!current.exists || g.status !== "waiting" || !g.starChallenge || g.players?.length !== 2 ||
        g.players[1].uid !== callerUid || Number(g.starChallenge.stake) !== stake) {
      throw new Error("Challenge is no longer waiting for acceptance.");
    }
    const writes = [];
    const wallets = [];
    for (let i = 0; i < 2; i++) {
      const path = walletPaths[i], d = docs[path], old = d.data || {};
      const available = d.exists ? Number(old.available || 0) : 10;
      const locked = d.exists ? Number(old.locked || 0) : 0;
      const earned = d.exists ? Number(old.totalEarned || 0) : 10;
      if (available < stake) throw new Error((i === 0 ? "Host" : "Aapke") + " paas stake ke liye kaafi stars nahi hain.");
      wallets.push({ uid: uids[i], available: available - stake, locked: locked + stake, totalEarned: earned, starterGranted: true, createdAtMs: d.exists ? Number(old.createdAtMs || Date.now()) : Date.now(), updatedAtMs: Date.now() });
    }
    for (let i = 0; i < 2; i++) writes.push(docWrite(walletPaths[i], wallets[i], docs[walletPaths[i]]));
    writes.push(docWrite(gamePath, {
      status: "playing",
      raceStartAtMs: Date.now() + 4000,
      starChallenge: { stake, status: "locked", hostUid: uids[0], challengerUid: uids[1], acceptedAtMs: Date.now() },
      updatedAtMs: Date.now()
    }, current));
    result = { accepted: true, stake, totalPot: stake * 2, raceStartAtMs: Date.now() + 4000 };
    return writes;
  });
  return result;
}
async function settleNormalRaceStars(env, roomId, callerUid) {
  if (!/^[A-Z0-9]{6}$/.test(roomId)) throw new Error("Invalid race room ID.");
  const gamePath = "games/" + roomId;
  const initial = await adminGetDocument(env, gamePath);
  if (!initial) throw new Error("Race room not found.");
  const initialGame = initial.data || {};
  if (initialGame.type !== "racing" || !Array.isArray(initialGame.players) || initialGame.players.length !== 2) throw new Error("This is not a two-player racing room.");
  if (!initialGame.players.some(p => p && p.uid === callerUid)) throw new Error("You are not a player in this race.");
  const players = initialGame.players, uids = players.map(p => String(p.uid || ""));
  if (!uids[0] || !uids[1] || uids[0] === uids[1]) throw new Error("Race player list is invalid.");
  const paths = [gamePath, ...uids.map(uid => "games/" + roomId + "/racePlayers/" + uid), ...uids.map(uid => "racingWallets/" + uid)];
  let outcome = null;
  await adminFirestoreTransaction(env, paths, async docs => {
    const gameDoc = docs[gamePath], game = gameDoc.data || {};
    if (!gameDoc.exists || game.type !== "racing" || !Array.isArray(game.players) ||
        game.players.length !== 2 || game.players[0].uid !== uids[0] || game.players[1].uid !== uids[1]) throw new Error("Race room changed. Please retry.");
    if (!game.players.some(p => p.uid === callerUid)) throw new Error("You are not a player in this race.");
    if (game.starsSettled) {
      outcome = { settled: true, alreadySettled: true, winnerUid: game.winnerUid || "", starsAwarded: Number(game.starReward || 0), draw: !!game.starDraw };
      return [];
    }
    if (game.status !== "playing") throw new Error("Race is not active or has already ended.");
    const a = docs["games/" + roomId + "/racePlayers/" + uids[0]], b = docs["games/" + roomId + "/racePlayers/" + uids[1]];
    if (!a.exists || !b.exists) throw new Error("Both players' live race records are not ready.");
    const da = Number(a.data.distance || 0), db = Number(b.data.distance || 0);
    if (Math.max(da, db) < 3000) throw new Error("Finish line has not been confirmed by the live race records.");
    const challenge = game.starChallenge && game.starChallenge.status === "locked";
    const stake = challenge ? Number(game.starChallenge.stake) : 0;
    if (challenge && (!Number.isInteger(stake) || stake < 1 || stake > 100)) throw new Error("Locked challenge stake is invalid.");
    const draw = da === db;
    const winnerUid = draw ? "" : (da > db ? uids[0] : uids[1]);
    const winnerPlayer = players.find(p => p.uid === winnerUid);
    const writes = [];
    let starsAwarded = 0;
    for (const uid of uids) {
      const path = "racingWallets/" + uid, walletDoc = docs[path], old = walletDoc.data || {};
      const available = walletDoc.exists ? Number(old.available || 0) : 10;
      const locked = walletDoc.exists ? Number(old.locked || 0) : 0;
      const earned = walletDoc.exists ? Number(old.totalEarned || 0) : 10;
      let nextAvailable = available, nextLocked = locked, nextEarned = earned;
      if (challenge) {
        if (locked < stake) throw new Error("Locked star balance does not match this challenge.");
        nextLocked -= stake;
        if (draw) nextAvailable += stake;
        else if (uid === winnerUid) { nextAvailable += stake * 2; nextEarned += stake; starsAwarded = stake * 2; }
      } else if (!draw && uid === winnerUid) {
        nextAvailable += 3; nextEarned += 3; starsAwarded = 3;
      }
      writes.push(docWrite(path, {
        uid, available: nextAvailable, locked: nextLocked, totalEarned: nextEarned,
        starterGranted: true, createdAtMs: walletDoc.exists ? Number(old.createdAtMs || Date.now()) : Date.now(),
        updatedAtMs: Date.now()
      }, walletDoc));
    }
    const winnerName = winnerPlayer ? String(winnerPlayer.name || "Indian Player").slice(0, 60) : "";
    const gameUpdate = {
      status: "finished", winnerUid: winnerUid || null, winnerName,
      starsSettled: true, starReward: starsAwarded, starDraw: draw,
      finishedAtMs: Date.now(), updatedAtMs: Date.now()
    };
    if (challenge) gameUpdate.starChallenge = { ...game.starChallenge, status: draw ? "refunded" : "settled", winnerUid: winnerUid || null, pot: stake * 2, settledAtMs: Date.now() };
    writes.push(docWrite(gamePath, gameUpdate, gameDoc));
    outcome = { settled: true, alreadySettled: false, winnerUid, winnerName, starsAwarded, draw, challenge, stake, totalPot: challenge ? stake * 2 : 0 };
    return writes;
  });
  return outcome;
}
async function getOneSignalUser(env, uid) {
  const externalId = `indian_firebase_${uid}`;
  const url = `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(externalId)}`;
  const response = await fetch(url, {
    headers: { "Authorization": `Key ${env.ONESIGNAL_REST_API_KEY}` }
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 404) return null;
  if (!response.ok) {
    const errors = result && result.errors;
    const detail = Array.isArray(errors) ? errors.map(x => typeof x === "string" ? x : (x.title || x.code || JSON.stringify(x))).join("; ") : (result.message || response.statusText);
    throw new Error(`OneSignal user lookup failed (${response.status}): ${String(detail || "Unknown error").slice(0, 220)}`);
  }
  return result;
}

function hasActivePushSubscription(user) {
  const subscriptions = user && Array.isArray(user.subscriptions) ? user.subscriptions : [];
  return subscriptions.some(subscription => {
    if (!subscription || !/Push$/i.test(String(subscription.type || ""))) return false;
    if (subscription.enabled === false) return false;
    if (subscription.enabled === true) return true;
    return Number(subscription.notification_types) > 0;
  });
}

async function sendNearbyHelpPush(env, requestId, requestData, senderUid, latitude, longitude) {
  const safeName = String(stringField(requestData, "displayName") || "An Indian user")
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "An Indian user";
  const category = String(stringField(requestData, "category") || "General help")
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
  const problem = String(stringField(requestData, "text") || "A person nearby needs help.")
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 480);
  const mediaCount = numberField(requestData, "mediaCount");
  const mediaNote = Number.isFinite(mediaCount) && mediaCount > 0 ? " Media is attached." : "";
  const idempotencyKey = await stableIdempotencyKey(`help-request:${requestId}`);
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: "push",
    filters: [
      { field: "location", relation: "=", radius: 5000, lat: latitude, long: longitude },
      { field: "tag", key: "indian_help_location_optin", relation: "=", value: "1" },
      { field: "tag", key: "indian_firebase_uid", relation: "!=", value: senderUid }
    ],
    headings: { en: `Help Request Nearby — ${category}` },
    contents: { en: `${safeName} — ${category}: ${problem}${mediaNote}`.slice(0, 520) },
    web_url: `${INDIAN_SITE_URL}?indianHelpRequestId=${encodeURIComponent(requestId)}#help`,
    idempotency_key: idempotencyKey,
    data: { type: "help_request", helpRequestId: requestId, category: category }
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
    const providerError = result && (result.errors || result.error || result.message);
    const detail = (typeof providerError === "string"
      ? providerError
      : Array.isArray(providerError)
        ? providerError.join("; ")
        : providerError
          ? JSON.stringify(providerError)
          : response.statusText) || "Unknown OneSignal error";
    console.error("OneSignal nearby Help push failed:", response.status, detail.slice(0, 240));
    throw new Error(`OneSignal nearby Help push HTTP ${response.status}: ${detail.slice(0, 240)}`);
  }
  return result;
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

async function sendOneSignalPush(env, receiverUid, messageId, senderName, messageText, sendAfter) {
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
    web_url: `${INDIAN_SITE_URL}?indianMessageId=${encodeURIComponent(messageId)}`,
    idempotency_key: idempotencyKey,
    data: { type: "message", messageId },
    ...(sendAfter ? { send_after: sendAfter } : {})
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

    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (action) {
      try {
        if (action === "acceptStarChallenge") {
          const roomId = typeof body.roomId === "string" ? body.roomId.trim().toUpperCase() : "";
          const result = await acceptStarChallenge(env, roomId, callerUid);
          return json({ success: true, ...result }, 200, origin);
        }

        if (action === "getRacingWallet") {
          const wallet = await getOrCreateRacingWallet(env, callerUid);
          return json({ success: true, wallet }, 200, origin);
        }

        if (action === "finishRacingRace") {
          const roomId = typeof body.roomId === "string" ? body.roomId.trim().toUpperCase() : "";
          const result = await settleNormalRaceStars(env, roomId, callerUid);
          return json({ success: true, ...result }, 200, origin);
        }

        if (action === "getHelpLocationStatus") {
          const oneSignalUser = await getOneSignalUser(env, callerUid);
          const tags = oneSignalUser && oneSignalUser.properties && oneSignalUser.properties.tags || {};
          const pushActive = hasActivePushSubscription(oneSignalUser);
          const locationOptIn = tags.indian_help_location_optin === "1";
          const latitude = Number(oneSignalUser && oneSignalUser.properties && oneSignalUser.properties.lat);
          const longitude = Number(oneSignalUser && oneSignalUser.properties && oneSignalUser.properties.long);
          const locationReady = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
            Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
          return json({
            success: true,
            enabled: locationOptIn && locationReady,
            locationOptIn: locationOptIn,
            pushActive: pushActive,
            locationReady: locationReady
          }, 200, origin);
        }

        if (action === "setHelpLocation") {
          const latitude = Number(body.latitude);
          const longitude = Number(body.longitude);
          if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
              !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            return json({ error: "Valid latitude and longitude are required." }, 400, origin);
          }
          await updateOneSignalUser(env, callerUid, {
            lat: latitude,
            long: longitude,
            tags: {
              indian_help_location_optin: "1",
              indian_firebase_uid: callerUid
            }
          });
          return json({ success: true, locationShared: true }, 200, origin);
        }

        if (action === "clearHelpLocation") {
          await updateOneSignalUser(env, callerUid, {
            lat: 0,
            long: 0,
            tags: {
              indian_help_location_optin: "0",
              indian_firebase_uid: callerUid
            }
          });
          return json({ success: true, locationShared: false }, 200, origin);
        }

        if (action === "cancelScheduledMessage") {
          const scheduledMessageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
          if (!/^[A-Za-z0-9_-]{10,40}$/.test(scheduledMessageId)) {
            return json({ error: "Invalid scheduled message ID." }, 400, origin);
          }
          const scheduledMessage = await getFirestoreMessage(scheduledMessageId, idToken);
          if (!scheduledMessage) return json({ success: true, cancelled: false, message: "Message no longer exists." }, 200, origin);
          if (stringField(scheduledMessage, "senderId") !== callerUid) {
            return json({ error: "You can only cancel a scheduled message you sent." }, 403, origin);
          }
          const notificationId = stringField(scheduledMessage, "scheduledNotificationId");
          if (!notificationId) return json({ success: true, cancelled: false, message: "No scheduled push notification was recorded." }, 200, origin);
          const cancelUrl = "https://api.onesignal.com/notifications/" + encodeURIComponent(notificationId) + "?app_id=" + encodeURIComponent(ONESIGNAL_APP_ID);
          const cancelResponse = await fetch(cancelUrl, {
            method: "DELETE",
            headers: { "Authorization": "Key " + env.ONESIGNAL_REST_API_KEY }
          });
          if (!cancelResponse.ok) throw new Error("OneSignal scheduled notification cancellation failed (" + cancelResponse.status + ").");
          return json({ success: true, cancelled: true }, 200, origin);
        }

        if (action === "sendHelpRequest") {
          const helpRequestId = typeof body.helpRequestId === "string" ? body.helpRequestId.trim() : "";
          if (!/^[A-Za-z0-9_-]{10,40}$/.test(helpRequestId)) {
            return json({ error: "Invalid Help Request ID." }, 400, origin);
          }
          const helpRequest = await getFirestoreHelpRequest(helpRequestId, idToken);
          if (!helpRequest) return json({ error: "Help Request not found." }, 404, origin);
          if (stringField(helpRequest, "uid") !== callerUid) {
            return json({ error: "You can only send nearby alerts for your own Help Request." }, 403, origin);
          }
          if (stringField(helpRequest, "status") !== "Open") {
            return json({ error: "Only an open Help Request can send nearby alerts." }, 400, origin);
          }
          const createdAtMs = numberField(helpRequest, "createdAtMs");
          if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > 10 * 60 * 1000) {
            return json({ error: "Nearby alerts can only be sent when the Help Request is first created." }, 400, origin);
          }
          const oneSignalUser = await getOneSignalUser(env, callerUid);
          const tags = oneSignalUser && oneSignalUser.properties && oneSignalUser.properties.tags || {};
          if (!oneSignalUser || tags.indian_help_location_optin !== "1") {
            return json({ error: "Enable Nearby Help Alerts and allow location before posting a request." }, 403, origin);
          }
          const latitude = Number(oneSignalUser && oneSignalUser.properties && oneSignalUser.properties.lat);
          const longitude = Number(oneSignalUser && oneSignalUser.properties && oneSignalUser.properties.long);
          if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
              !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            return json({ error: "Your saved nearby location is missing. Enable Nearby Help Alerts again." }, 403, origin);
          }
          const pushResult = await sendNearbyHelpPush(env, helpRequestId, helpRequest, callerUid, latitude, longitude);
          const recipientCount = Number(pushResult && pushResult.recipients);
          if (!pushResult || !pushResult.id || (Number.isFinite(recipientCount) && recipientCount === 0)) {
            return json({ success: true, sent: false, recipients: 0, message: "No eligible nearby subscribers were found." }, 200, origin);
          }
          return json({
            success: true,
            sent: true,
            recipients: Number.isFinite(recipientCount) ? recipientCount : null,
            notificationId: pushResult.id
          }, 200, origin);
        }

        return json({ error: "Unknown action." }, 400, origin);
      } catch (error) {
        const detail = String(error && error.message ? error.message : "Unknown nearby Help error").slice(0, 300);
        console.error("Indian nearby Help action failed:", detail);
        return json({ error: "Nearby Help action failed.", detail: detail }, 502, origin);
      }
    }

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
        const callerPhoto = stringField(callDoc, "callerPhotoURL");
        // OneSignal image fields require a publicly reachable HTTPS image URL.
        // Current Indian profile photos are Firestore data URLs, so do not send those as notification images.
        const safeCallerPhoto = /^https:\/\//i.test(callerPhoto) ? callerPhoto : "";
        const callKey = await stableIdempotencyKey(`call:${callId}`);
        const callPayload = {
          app_id: ONESIGNAL_APP_ID,
          include_aliases: { external_id: [`indian_firebase_${calleeId}`] },
          target_channel: "push",
          headings: { en: `${callType === "video" ? "Video" : "Voice"} call from ${safeCaller}` },
          contents: { en: "Tap to answer on Indian." },
          web_url: `${INDIAN_SITE_URL}?indianCallId=${encodeURIComponent(callId)}`,
          ...(safeCallerPhoto ? { chrome_web_icon: safeCallerPhoto } : {}),
          idempotency_key: callKey,
          data: { type: "call", callId, callType, callerName: safeCaller }
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
      const rawMessageText = stringField(message, "text");
      let messageText = rawMessageText;
      if (rawMessageText.indexOf("INDIAN_POLL_V1:") === 0) {
        try {
          const pollData = JSON.parse(rawMessageText.slice("INDIAN_POLL_V1:".length));
          messageText = "📊 Poll: " + String(pollData.question || "You received a chat poll.").slice(0, 180);
        } catch {
          messageText = "📊 You received a chat poll.";
        }
      }
      const attachmentFields = message.fields && message.fields.attachment
        && message.fields.attachment.mapValue && message.fields.attachment.mapValue.fields;
      const attachmentType = attachmentFields && attachmentFields.type
        ? attachmentFields.type.stringValue : "";
      const notificationText = messageText || (
        attachmentType === "video" ? "Sent you a video."
        : attachmentType === "image" ? "Sent you a photo."
        : "Sent you a message."
      );
      const scheduledAtMs = numberField(message, "scheduledAtMs");
      const sendAfter = Number.isFinite(scheduledAtMs) && scheduledAtMs > Date.now()
        ? new Date(scheduledAtMs).toISOString()
        : "";
      const result = await sendOneSignalPush(
        env, receiverId, messageId, senderName, notificationText, sendAfter
      );
      if (!result || !result.id) {
        return json({ success: false, message: "No subscribed OneSignal device matched this recipient." }, 200, origin);
      }
      return json({ success: true, notificationId: result.id, scheduled: !!sendAfter }, 200, origin);
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