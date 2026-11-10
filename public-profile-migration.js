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
  return encodeURIComponent(String(value || "")).replace(/%/g, "_");
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

  const ensureCopied = async (ref, data) => {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, { ...data, migratedFromPublicProfilesAt: serverTimestamp() });
    }
    const verified = await getDoc(ref);
    if (!verified.exists()) throw new Error("Naye collection mein record verify nahi hua: " + ref.path);
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
    const emoji = typeof value === "string" ? value : String(value?.emoji || "");
    if (!emoji) continue;
    const reactionId = uid + "_" + safeDocPart(messageId);
    const reactionRef = doc(db, "messageReactions", reactionId);
    await ensureCopied(reactionRef, {
      uid,
      messageId: String(messageId),
      emoji: emoji.slice(0, 8),
      createdAtMs: Number(value?.createdAtMs) || nowMs
    });
    reactionCount++;
  }

  // Verify the main migrated records again before recording completion.
  for (const ref of [targets.stories]) {
    const check = await getDoc(ref);
    if (!check.exists()) throw new Error("Migration verification failed: " + ref.path);
  }

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
