import { getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, query, where,
  onSnapshot, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const app = getApps()[0];
if (!app) {
  console.warn("Indian Friend Requests: Firebase app is not ready.");
} else {
  const auth = getAuth(app);
  const db = getFirestore(app);
  let currentUser = null;
  let ownRecords = [];
  let incomingRecords = [];
  let responsesToMe = [];
  let friendUnsubs = [];

  const clean = (value, max = 100) => String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

  const displayName = () => clean(
    window.profileName || currentUser?.displayName || currentUser?.email || "Indian User",
    60
  ) || "Indian User";

  const setStatus = message => {
    const node = document.getElementById("indianFriendRequestStatus");
    if (node) node.textContent = message;
  };

  function getResponses() {
    return [...ownRecords, ...responsesToMe]
      .filter(item => item && item.recordType === "friend_request_response" && item.requestId)
      .sort((a, b) => (Number(a.createdAtMs) || 0) - (Number(b.createdAtMs) || 0));
  }

  function responseMap() {
    const map = new Map();
    getResponses().forEach(item => map.set(String(item.requestId), item));
    return map;
  }

  function getPendingIncoming() {
    const responses = responseMap();
    return incomingRecords.filter(item =>
      item && item.recordType === "friend_request" && !responses.has(item.id)
    );
  }

  function getOutgoingRequests() {
    const responses = responseMap();
    return ownRecords.filter(item =>
      item && item.recordType === "friend_request"
    ).map(item => ({ request: item, response: responses.get(item.id) || null }));
  }

  function getFriends() {
    const result = new Map();
    getResponses().forEach(item => {
      if (item.status !== "accepted") return;
      const otherUid = item.followerId === currentUser?.uid
        ? item.friendUid
        : item.followerId;
      if (!otherUid || otherUid === currentUser?.uid) return;
      const otherName = item.followerId === currentUser?.uid
        ? item.friendName
        : item.followerName;
      result.set(String(otherUid), clean(otherName || "Indian User", 60));
    });
    return result;
  }

  function requestStateFor(targetUid) {
    if (!currentUser || !targetUid || targetUid === currentUser.uid) {
      return { label: "Friend Request unavailable", disabled: true };
    }
    if (getFriends().has(targetUid)) {
      return { label: "Friends", disabled: true };
    }
    const incoming = getPendingIncoming().find(item => item.followerId === targetUid);
    if (incoming) return { label: "Accept Request", action: "accept", request: incoming };
    const outgoing = getOutgoingRequests().find(item =>
      item.request.targetUid === targetUid && !item.response
    );
    if (outgoing) return { label: "Cancel Request", action: "cancel", request: outgoing.request };
    return { label: "Add Friend", action: "send" };
  }

  function updateFriendButton(button) {
    const targetUid = String(button.dataset.targetUid || "");
    const state = requestStateFor(targetUid);
    button.textContent = state.label;
    button.disabled = !!state.disabled;
    button.setAttribute("aria-label", state.label + (button.dataset.targetName ? " with " + button.dataset.targetName : ""));
  }

  function refreshFriendButtons() {
    document.querySelectorAll(".indianFriendRequestButton").forEach(updateFriendButton);
  }

  function makeActionButton(label, handler, ariaLabel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action";
    button.textContent = label;
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
    button.addEventListener("click", handler);
    return button;
  }

  function renderFriendHub() {
    const incomingBox = document.getElementById("indianIncomingFriendRequests");
    const outgoingBox = document.getElementById("indianOutgoingFriendRequests");
    const friendsBox = document.getElementById("indianFriendsList");
    if (!incomingBox || !outgoingBox || !friendsBox) return;

    incomingBox.replaceChildren();
    outgoingBox.replaceChildren();
    friendsBox.replaceChildren();

    if (!currentUser) {
      incomingBox.textContent = "Sign in to see friend requests.";
      outgoingBox.textContent = "Sign in to see sent requests.";
      friendsBox.textContent = "Sign in to see your friends.";
      refreshFriendButtons();
      return;
    }

    const incoming = getPendingIncoming();
    if (!incoming.length) {
      const empty = document.createElement("p");
      empty.textContent = "No new friend requests.";
      incomingBox.appendChild(empty);
    } else {
      incoming.forEach(request => {
        const row = document.createElement("div");
        row.className = "indian-friend-row";
        row.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #d7dce2;";
        const name = document.createElement("span");
        name.textContent = clean(request.followerName || "Indian User", 60) + " sent you a friend request.";
        row.appendChild(name);
        row.appendChild(makeActionButton("Accept", () => respondToRequest(request, "accepted"), "Accept friend request from " + clean(request.followerName || "Indian User", 60)));
        row.appendChild(makeActionButton("Reject", () => respondToRequest(request, "rejected"), "Reject friend request from " + clean(request.followerName || "Indian User", 60)));
        incomingBox.appendChild(row);
      });
    }

    const outgoing = getOutgoingRequests();
    if (!outgoing.length) {
      const empty = document.createElement("p");
      empty.textContent = "You have not sent any friend requests.";
      outgoingBox.appendChild(empty);
    } else {
      outgoing.forEach(entry => {
        const request = entry.request;
        const row = document.createElement("div");
        row.className = "indian-friend-row";
        const name = document.createElement("span");
        name.textContent = clean(request.targetName || "Indian User", 60) + " — " +
          (entry.response ? (entry.response.status === "accepted" ? "Accepted" : "Declined") : "Request sent");
        row.appendChild(name);
        if (!entry.response) {
          row.appendChild(makeActionButton("Cancel", () => cancelRequest(request), "Cancel friend request to " + clean(request.targetName || "Indian User", 60)));
        }
        outgoingBox.appendChild(row);
      });
    }

    const friends = [...getFriends().entries()].sort((a, b) => a[1].localeCompare(b[1]));
    if (!friends.length) {
      const empty = document.createElement("p");
      empty.textContent = "No friends yet. Search for a registered user and send a request.";
      friendsBox.appendChild(empty);
    } else {
      friends.forEach(([uid, name]) => {
        const row = document.createElement("div");
        row.className = "indian-friend-row";
        const label = document.createElement("span");
        label.textContent = name;
        row.appendChild(label);
        const person = (window.peopleData || []).find(item => String(item.firebaseUid || "") === uid);
        if (person && typeof window.openConversation === "function") {
          row.appendChild(makeActionButton("Message", () => window.openConversation(person.id), "Message " + name));
        }
        friendsBox.appendChild(row);
      });
    }

    const status = document.getElementById("indianFriendRequestStatus");
    if (status && !status.textContent) status.textContent = "Friend requests are synced with your Indian account.";
    refreshFriendButtons();
  }

  async function notifyUser(recipientUid, message, type, requestId) {
    if (!recipientUid || recipientUid === currentUser?.uid) return;
    try {
      await addDoc(collection(db, "notifications"), {
        recipientId: recipientUid,
        actorId: currentUser.uid,
        message: clean(message, 500),
        type: clean(type, 50),
        targetId: requestId || null,
        read: false,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now()
      });
    } catch (error) {
      console.warn("Friend request notification could not be saved:", error);
    }
  }

  async function sendFriendRequest(person) {
    if (!currentUser) throw new Error("Sign in to send a friend request.");
    const targetUid = String(person?.firebaseUid || "");
    if (!targetUid || targetUid === currentUser.uid) throw new Error("Choose another registered Indian user.");
    const state = requestStateFor(targetUid);
    if (state.action === "accept") {
      await respondToRequest(state.request, "accepted");
      return;
    }
    if (state.action === "cancel") {
      await cancelRequest(state.request);
      return;
    }
    if (getFriends().has(targetUid)) return;

    const existing = await getDocs(query(
      collection(db, "follows"),
      where("followerId", "==", currentUser.uid),
      where("targetUid", "==", targetUid)
    ));
    const pending = existing.docs.find(item => {
      const data = item.data() || {};
      return data.recordType === "friend_request" && !responseMap().has(item.id);
    });
    if (pending) return;

    const requestRef = await addDoc(collection(db, "follows"), {
      recordType: "friend_request",
      followerId: currentUser.uid,
      followerName: displayName(),
      targetUid,
      targetName: clean(person.name || "Indian User", 60),
      createdAt: serverTimestamp(),
      createdAtMs: Date.now()
    });
    await notifyUser(
      targetUid,
      displayName() + " sent you a friend request.",
      "friend_request",
      requestRef.id
    );
    setStatus("Friend request sent to " + clean(person.name || "Indian User", 60) + ".");
  }

  async function respondToRequest(request, status) {
    if (!currentUser || !request || request.targetUid !== currentUser.uid) {
      throw new Error("This friend request is not addressed to your account.");
    }
    if (status !== "accepted" && status !== "rejected") return;
    const existing = await getDocs(query(
      collection(db, "follows"),
      where("requestId", "==", request.id)
    ));
    if (existing.docs.some(item => (item.data() || {}).recordType === "friend_request_response")) return;

    await addDoc(collection(db, "follows"), {
      recordType: "friend_request_response",
      followerId: currentUser.uid,
      followerName: displayName(),
      friendUid: request.followerId,
      friendName: clean(request.followerName || "Indian User", 60),
      requestId: request.id,
      status,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now()
    });
    await notifyUser(
      request.followerId,
      displayName() + (status === "accepted" ? " accepted your friend request." : " declined your friend request."),
      status === "accepted" ? "friend_request_accepted" : "friend_request_rejected",
      request.id
    );
    setStatus(status === "accepted" ? "Friend request accepted." : "Friend request rejected.");
  }

  async function cancelRequest(request) {
    if (!currentUser || !request || request.followerId !== currentUser.uid) return;
    if (responseMap().has(request.id)) return;
    await deleteDoc(doc(db, "follows", request.id));
    setStatus("Friend request cancelled.");
  }

  window.createIndianFriendRequestButton = function(person) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action searchButton indianFriendRequestButton";
    button.dataset.targetUid = String(person?.firebaseUid || "");
    button.dataset.targetName = clean(person?.name || "Indian User", 60);
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await sendFriendRequest(person);
      } catch (error) {
        setStatus("Friend request failed: " + clean(error?.message || error, 220));
      } finally {
        updateFriendButton(button);
        renderFriendHub();
      }
    });
    updateFriendButton(button);
    return button;
  };

  function startFriendRequestListeners() {
    friendUnsubs.forEach(unsubscribe => { try { unsubscribe(); } catch (error) {} });
    friendUnsubs = [];
    ownRecords = [];
    incomingRecords = [];
    responsesToMe = [];
    const uid = currentUser.uid;

    friendUnsubs.push(onSnapshot(
      query(collection(db, "follows"), where("followerId", "==", uid)),
      snapshot => {
        ownRecords = snapshot.docs.map(item => ({ id: item.id, ...(item.data() || {}) }));
        renderFriendHub();
      },
      error => setStatus("Your friend requests could not load: " + clean(error?.message || error, 180))
    ));

    friendUnsubs.push(onSnapshot(
      query(collection(db, "follows"), where("targetUid", "==", uid)),
      snapshot => {
        incomingRecords = snapshot.docs.map(item => ({ id: item.id, ...(item.data() || {}) }));
        renderFriendHub();
      },
      error => setStatus("Incoming friend requests could not load: " + clean(error?.message || error, 180))
    ));

    friendUnsubs.push(onSnapshot(
      query(collection(db, "follows"), where("friendUid", "==", uid)),
      snapshot => {
        responsesToMe = snapshot.docs.map(item => ({ id: item.id, ...(item.data() || {}) }));
        renderFriendHub();
      },
      error => setStatus("Friend status could not refresh: " + clean(error?.message || error, 180))
    ));
  }

  onAuthStateChanged(auth, user => {
    currentUser = user || null;
    friendUnsubs.forEach(unsubscribe => { try { unsubscribe(); } catch (error) {} });
    friendUnsubs = [];
    ownRecords = [];
    incomingRecords = [];
    responsesToMe = [];
    if (currentUser) startFriendRequestListeners();
    renderFriendHub();
    if (typeof window.performSearch === "function") {
      const searchBox = document.getElementById("searchBox");
      if (searchBox && searchBox.value.trim()) window.performSearch();
    }
  });

  window.addEventListener("indian-friend-hub-refresh", renderFriendHub);
}
