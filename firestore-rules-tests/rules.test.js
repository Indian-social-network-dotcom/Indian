import { readFile } from "node:fs/promises";
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from "@firebase/rules-unit-testing";
import {
  collection, doc, getDoc, getDocs, query, where,
  setDoc, updateDoc, deleteDoc, serverTimestamp
} from "firebase/firestore";

const projectId = "demo-indian-public-profile-migration";
const rules = await readFile(new URL("../firestore.rules.public-profiles-migration-DRAFT.txt", import.meta.url), "utf8");
let env;

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules } });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const db = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

test("publicProfiles: signed-in read, owner-only validated writes", async () => {
  await seed("publicProfiles/alice", { uid: "alice", displayName: "Alice" });
  await assertSucceeds(getDoc(doc(db("bob"), "publicProfiles/alice")));
  await assertFails(getDoc(doc(anon(), "publicProfiles/alice")));
  await assertSucceeds(updateDoc(doc(db("alice"), "publicProfiles/alice"), { displayName: "Alice A" }));
  await assertFails(updateDoc(doc(db("bob"), "publicProfiles/alice"), { displayName: "Mallory" }));
});

for (const collectionName of ["userStories", "userPresence", "userLiveStatus"]) {
  test(collectionName + ": signed-in read and owner-only writes", async () => {
    await seed(collectionName + "/alice", { uid: "alice", marker: true });
    await assertSucceeds(getDoc(doc(db("bob"), collectionName, "alice")));
    await assertFails(setDoc(doc(db("bob"), collectionName, "bob"), { uid: "alice" }));
    await assertSucceeds(setDoc(doc(db("alice"), collectionName, "alice"), { uid: "alice", marker: false }));
    await assertFails(deleteDoc(doc(db("bob"), collectionName, "alice")));
  });
}

test("userTyping: owner and intended recipient can get; unrelated user and list are denied", async () => {
  await seed("userTyping/alice", { uid: "alice", typingToUid: "bob", typingAtMs: 123 });
  await assertSucceeds(getDoc(doc(db("alice"), "userTyping/alice")));
  await assertSucceeds(getDoc(doc(db("bob"), "userTyping/alice")));
  await assertFails(getDoc(doc(db("carol"), "userTyping/alice")));
  await assertSucceeds(getDoc(doc(db("bob"), "userTyping/missing")));
  await assertFails(getDocs(collection(db("bob"), "userTyping")));
  await assertFails(setDoc(doc(db("bob"), "userTyping/alice"), { uid: "alice", typingToUid: "bob" }));
  await assertSucceeds(setDoc(doc(db("alice"), "userTyping/alice"), { uid: "alice", typingToUid: "bob", typingAtMs: 124 }));
});

test("messageReactions: signed-in read and owner-only create/update/delete", async () => {
  await assertSucceeds(setDoc(doc(db("alice"), "messageReactions/alice_msg1"), {
    uid: "alice", messageId: "msg1", emoji: "❤️", createdAtMs: 10
  }));
  await assertSucceeds(getDoc(doc(db("bob"), "messageReactions/alice_msg1")));
  await assertFails(setDoc(doc(db("alice"), "messageReactions/alice_badEmoji"), {
    uid: "alice", messageId: "badEmoji", emoji: "TOO-LONG-EMOJI", createdAtMs: 11
  }));
  await assertFails(setDoc(doc(db("alice"), "messageReactions/alice_extra"), {
    uid: "alice", messageId: "extra", emoji: "❤️", createdAtMs: 11, extra: true
  }));
  await assertFails(updateDoc(doc(db("bob"), "messageReactions/alice_msg1"), { emoji: "😂" }));
  await assertSucceeds(updateDoc(doc(db("alice"), "messageReactions/alice_msg1"), { emoji: "😂" }));
  await assertFails(setDoc(doc(db("bob"), "messageReactions/bob_msg2"), {
    uid: "alice", messageId: "msg2", emoji: "❤️", createdAtMs: 10
  }));
  await assertSucceeds(deleteDoc(doc(db("alice"), "messageReactions/alice_msg1")));
});

test("publicProfileMigrations: private owner marker; no list or delete", async () => {
  await assertSucceeds(setDoc(doc(db("alice"), "publicProfileMigrations/alice"), { uid: "alice", status: "complete" }));
  await assertSucceeds(getDoc(doc(db("alice"), "publicProfileMigrations/alice")));
  await assertFails(getDoc(doc(db("bob"), "publicProfileMigrations/alice")));
  await assertFails(getDocs(collection(db("alice"), "publicProfileMigrations")));
  await assertFails(deleteDoc(doc(db("alice"), "publicProfileMigrations/alice")));
  await assertFails(setDoc(doc(db("bob"), "publicProfileMigrations/bob"), { uid: "alice", status: "complete" }));
});

test("storyInteractions: accepts a story in separated userStories", async () => {
  await seed("userStories/story-owner", {
    uid: "story-owner",
    activeStories: [{ id: "story-1", expiresAt: Date.now() + 60000 }]
  });
  const interaction = {
    ownerUid: "story-owner", storyId: "story-1", viewerUid: "viewer",
    viewerName: "Viewer", viewerPhotoURL: "", viewedAtMs: Date.now(),
    liked: false, reaction: ""
  };
  await assertSucceeds(setDoc(doc(db("viewer"), "storyInteractions/story-owner_story-1_viewer"), interaction));
});

test("storyInteractions: legacy publicProfiles story fallback remains available", async () => {
  await seed("publicProfiles/story-owner", {
    uid: "story-owner", displayName: "Owner",
    activeStories: [{ id: "legacy-story", expiresAt: Date.now() + 60000 }]
  });
  const interaction = {
    ownerUid: "story-owner", storyId: "legacy-story", viewerUid: "viewer",
    viewerName: "Viewer", viewerPhotoURL: "", viewedAtMs: Date.now(),
    liked: false, reaction: ""
  };
  await assertSucceeds(setDoc(doc(db("viewer"), "storyInteractions/story-owner_legacy-story_viewer"), interaction));
});

test("personal message Read Receipt: receiver may only flip read false to true", async () => {
  await seed("messages/message-1", {
    senderId: "alice", receiverId: "bob", text: "hello", read: false
  });
  await assertSucceeds(updateDoc(doc(db("bob"), "messages/message-1"), { read: true }));
  await seed("messages/message-2", {
    senderId: "alice", receiverId: "bob", text: "hello", read: false
  });
  await assertFails(updateDoc(doc(db("bob"), "messages/message-2"), { read: true, text: "tampered" }));
  await assertFails(updateDoc(doc(db("carol"), "messages/message-2"), { read: true }));
  await assertSucceeds(updateDoc(doc(db("alice"), "messages/message-2"), { text: "edited" }));
});

test("Group Chat: member-only group/message access and sender-only deletion", async () => {
  await seed("groups/group-1", {
    name: "Test", createdBy: "alice", members: ["alice", "bob"], admins: ["alice"],
    createdAt: new Date(), updatedAt: new Date(), updatedAtMs: 1
  });
  await seed("groups/group-1/messages/msg-1", {
    senderId: "alice", senderName: "Alice", text: "hello", createdAt: new Date()
  });
  await assertSucceeds(getDoc(doc(db("bob"), "groups/group-1")));
  await assertFails(getDoc(doc(db("carol"), "groups/group-1")));
  const memberQuery = query(collection(db("bob"), "groups"), where("members", "array-contains", "bob"));
  await assertSucceeds(getDocs(memberQuery));
  await assertSucceeds(getDoc(doc(db("bob"), "groups/group-1/messages/msg-1")));
  await assertFails(getDoc(doc(db("carol"), "groups/group-1/messages/msg-1")));
  await assertFails(deleteDoc(doc(db("bob"), "groups/group-1/messages/msg-1")));
  await assertSucceeds(deleteDoc(doc(db("alice"), "groups/group-1/messages/msg-1")));
});
