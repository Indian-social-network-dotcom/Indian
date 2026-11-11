// Indian public profile migration — copy-only, per signed-in owner.
// This file is intentionally not loaded by index.html yet. Integrate only after
// the new Firestore Rules are reviewed and explicitly approved for publication.
// It never deletes or clears legacy publicProfiles data.

import { getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

function cleanStoryList(value, nowMs) {
  return (Array.isArray(value) ? value : [])
    .filter(item => item && Number(item.expiresAt) > nowMs)
    .slice(-3);
}

function safeDocPart(value) {
  const original = String(value || "");
  if (!original) throw new Error("Reaction message ID is empty; migration stopped safely.");
  const encoded = encodeURIComponent(original);
  if (encoded.length > 700) {
    throw new Error("Reaction message ID is too long to migrate safely; no legacy data was changed.");
  }
  return encoded;
}

window.runIndianPublicProfileMigration = async function () {
  const apps = getApps();
  if (!apps.length) throw new Error("Indian Firebase app is not initialized.");

  const auth = getAuth(apps[0]);
  const db = getFirestore(apps[0]);
  const user = auth.currentUser;
  if (!user) throw new Error("Indian account mein pehle sign in karein.");

  const uid = user.uid;
  const markerRef = doc(db, "publicProfileMigrations", uid);
  const markerSnap = await getDoc(markerRef);
  if (markerSnap.exists() && markerSnap.data()?.status === "complete") {
    return { status: "already-migrated", uid };
  }

  const legacySnap = await getDoc(doc(db, "publicProfiles", uid));
  if (!legacySnap.exists()) {
    throw new Error("Aapka purana public profile document nahi mila. Koi data change nahi hua.");
  }

  const legacy = legacySnap.data() || {};
  const nowMs = Date.now();
  const stories = cleanStoryList(legacy.activeStories, nowMs);
  const live = legacy.liveSession && typeof legacy.liveSession === "object"
    ? legacy.liveSession : null;
  const reactions = legacy.messageReactions && typeof legacy.messageReactions === "object"
    ? legacy.messageReactions : {};

  const targets = {
    stories: doc(db, "userStories", uid),
    presence: doc(db, "userPresence", uid),
    typing: doc(db, "userTyping", uid),
    live: doc(db, "userLiveStatus", uid)
  };

  const expectedRecords = [];
  const stableValue = value => {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((out, key) => {
        out[key] = stableValue(value[key]);
        return out;
      }, {});
    }
    return value;
  };
  const ensureCopied = async (ref, data) => {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, data);
    } else {
      const current = existing.data() || {};
      const matches = Object.keys(data).every(key =>
        JSON.stringify(stableValue(current[key])) === JSON.stringify(stableValue(data[key]))
      );
      if (!matches) {
        throw new Error("Naya record pehle se maujood hai lekin purane data se match nahi karta: " + ref.path + ". Koi purana record overwrite nahi kiya gaya.");
      }
    }
    expectedRecords.push({ ref, data });
  };

  await ensureCopied(targets.stories, {
    uid,
    activeStories: stories,
    lastStoryAtMs: Number(legacy.lastStoryAtMs) || 0
  });

  if (legacy.presenceOnline !== undefined ||
      legacy.presenceAtMs !== undefined ||
      legacy.lastSeenAtMs !== undefined) {
    await ensureCopied(targets.presence, {
      uid,
      presenceOnline: legacy.presenceOnline === true,
      presenceAtMs: Number(legacy.presenceAtMs) || 0,
      lastSeenAtMs: Number(legacy.lastSeenAtMs) || 0
    });
  }

  const typingAtMs = Number(legacy.typingAtMs) || 0;
  const typingIsFresh = !!legacy.typingToUid && nowMs - typingAtMs < 7000;
  if (legacy.typingToUid !== undefined || legacy.typingAtMs !== undefined) {
    await ensureCopied(targets.typing, {
      uid,
      typingToUid: typingIsFresh ? String(legacy.typingToUid) : "",
      typingAtMs: typingIsFresh ? typingAtMs : 0
    });
  }

  if (live) {
    await ensureCopied(targets.live, { uid, liveSession: live });
  }

  let reactionCount = 0;
  for (const [messageId, value] of Object.entries(reactions)) {
    const emoji = typeof value === "string"
      ? value
      : value && typeof value === "object" ? value.emoji : "";
    if (!emoji) continue;
    if (typeof emoji !== "string" || emoji.length > 8) {
      throw new Error("Legacy reaction emoji is invalid or longer than the Rules allow; migration stopped safely without changing legacy data.");
    }
    const reactionId = uid + "_" + safeDocPart(messageId);
    if (reactionId.length > 800) {
      throw new Error("Reaction document ID is too long for the migration Rules; no legacy data was changed.");
    }
    const reactionRef = doc(db, "messageReactions", reactionId);
    await ensureCopied(reactionRef, {
      uid,
      messageId,
      emoji,
      // Stable fallback: retries must produce the same record, not a new Date.now().
      // Legacy string reactions have no timestamp; zero is a stable retry-safe fallback.
      createdAtMs: Number(value?.createdAtMs) || 0
    });
    reactionCount++;
  }

  // Re-read every migrated document and verify every copied field before marking complete.
  for (const item of expectedRecords) {
    const check = await getDoc(item.ref);
    if (!check.exists()) throw new Error("Migration verification failed: " + item.ref.path);
    const actual = check.data() || {};
    const matches = Object.keys(item.data).every(key =>
      JSON.stringify(stableValue(actual[key])) === JSON.stringify(stableValue(item.data[key]))
    );
    if (!matches) {
      throw new Error("Migration data verification failed: " + item.ref.path + ". Completion marker was not written.");
    }
  }

  // Publish a non-sensitive version flag only after every separated record verifies.
  // Clients can read this flag from the public identity document and avoid exposing
  // partially copied records while the private migration marker remains owner-only.
  await setDoc(doc(db, "publicProfiles", uid), {
    uid,
    profileSchemaVersion: 2,
    updatedAt: serverTimestamp()
  }, { merge: true });

  const report = {
    uid,
    status: "complete",
    stories: stories.length,
    reactions: reactionCount,
    presenceCopied: !!(legacy.presenceOnline !== undefined ||
      legacy.presenceAtMs !== undefined || legacy.lastSeenAtMs !== undefined),
    typingCopied: legacy.typingToUid !== undefined || legacy.typingAtMs !== undefined,
    liveCopied: !!live
  };

  await setDoc(markerRef, {
    uid,
    status: "complete",
    report,
    completedAt: serverTimestamp()
  }, { merge: true });

  // Legacy publicProfiles fields are deliberately left untouched.
  return report;
};
