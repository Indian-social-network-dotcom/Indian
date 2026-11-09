/* Indian Group Chat — unified with the Personal Chats list; private text groups only. */
import { getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, query, where,
  onSnapshot, getDocs, orderBy, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

(function () {
  "use strict";
  const apps = getApps();
  if (!apps.length) {
    console.warn("Indian Group Chat: Firebase app is not ready.");
    return;
  }

  const auth = getAuth(apps[0]);
  const db = getFirestore(apps[0]);
  let currentUser = null;
  let groupsUnsubscribe = null;
  let messagesUnsubscribe = null;
  let activeGroupId = "";
  let activeGroup = null;
  let groupCache = [];
  let groupMode = false;
  let originalRenderConversationList = null;
  let originalOpenConversation = null;

  const el = id => document.getElementById(id);
  const safe = (value, max = 2000) => String(value == null ? "" : value)
    .normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
  const setStatus = message => {
    const node = el("indianGroupStatus");
    if (node) node.textContent = message || "";
  };

  function createActionButton(label, handler, ariaLabel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action";
    button.textContent = label;
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
    button.addEventListener("click", handler);
    return button;
  }

  function ensureGroupControls() {
    const panel = document.querySelector("#messagesLayout .chatPanel");
    const messages = el("chatMessages");
    if (!panel || !messages) return null;
    let controls = el("indianUnifiedGroupControls");
    if (controls) return controls;

    controls = document.createElement("section");
    controls.id = "indianUnifiedGroupControls";
    controls.hidden = true;
    controls.style.marginTop = "10px";
    controls.setAttribute("aria-label", "Group chat controls");

    const composer = document.createElement("div");
    composer.id = "indianUnifiedGroupComposer";
    const label = document.createElement("label");
    label.htmlFor = "indianUnifiedGroupText";
    label.textContent = "Group message";
    const input = document.createElement("textarea");
    input.id = "indianUnifiedGroupText";
    input.rows = 3;
    input.maxLength = 2000;
    input.placeholder = "Write a group message…";
    input.style.cssText = "display:block;width:100%;box-sizing:border-box;padding:10px;margin:6px 0;";
    const send = createActionButton("Send", sendGroupMessage, "Send group message");
    send.id = "indianUnifiedGroupSend";
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendGroupMessage();
      }
    });
    composer.append(label, input, send);

    const memberArea = document.createElement("div");
    memberArea.id = "indianUnifiedGroupMemberArea";
    memberArea.style.marginTop = "12px";
    const heading = document.createElement("h4");
    heading.textContent = "Add a member";
    const memberLabel = document.createElement("label");
    memberLabel.htmlFor = "indianUnifiedGroupMemberSearch";
    memberLabel.textContent = "Search registered Indian users";
    const memberInput = document.createElement("input");
    memberInput.id = "indianUnifiedGroupMemberSearch";
    memberInput.type = "search";
    memberInput.maxLength = 60;
    memberInput.placeholder = "Type a display name";
    memberInput.style.cssText = "display:block;width:100%;max-width:420px;box-sizing:border-box;padding:10px;margin:6px 0;";
    const search = createActionButton("Search users", searchMembers);
    search.id = "indianUnifiedGroupMemberSearchButton";
    const results = document.createElement("div");
    results.id = "indianUnifiedGroupMemberResults";
    results.setAttribute("aria-live", "polite");
    memberArea.append(heading, memberLabel, memberInput, search, results);

    controls.append(composer, memberArea);
    messages.insertAdjacentElement("afterend", controls);
    return controls;
  }

  function renderGroupCards() {
    const list = el("conversationList");
    if (!list) return;

    list.querySelectorAll("[data-indian-group-id]").forEach(node => node.remove());
    groupCache.forEach(group => {
      const card = document.createElement("div");
      card.className = "conversationCard";
      card.dataset.indianGroupId = group.id;
      card.setAttribute("role", "group");
      card.setAttribute("aria-label", "Group conversation: " + (group.name || "Unnamed group"));

      const header = document.createElement("div");
      header.className = "conversationHeader";
      const avatar = document.createElement("div");
      avatar.className = "personAvatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = "👥";

      const info = document.createElement("div");
      info.className = "conversationInfo";
      const name = document.createElement("div");
      name.className = "conversationName";
      name.textContent = group.name || "Unnamed group";
      const preview = document.createElement("div");
      preview.className = "conversationPreview";
      preview.textContent = (Array.isArray(group.members) ? group.members.length : 0) + " members";
      info.append(name, preview);

      const open = createActionButton("Open Chat", () => openGroup(group.id),
        "Open group chat " + (group.name || "Unnamed group"));
      header.append(avatar, info, open);
      card.appendChild(header);
      list.appendChild(card);
    });
  }

  function installConversationHooks() {
    if (!originalRenderConversationList && typeof window.renderConversationList === "function") {
      originalRenderConversationList = window.renderConversationList;
      window.renderConversationList = function () {
        const result = originalRenderConversationList.apply(this, arguments);
        renderGroupCards();
        return result;
      };
    }
    if (!originalOpenConversation && typeof window.openConversation === "function") {
      originalOpenConversation = window.openConversation;
      window.openConversation = function () {
        closeGroupMode();
        return originalOpenConversation.apply(this, arguments);
      };
    }
  }

  function renderGroupMessages(rows) {
    const box = el("chatMessages");
    if (!box) return;
    box.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "chatEmpty";
      empty.textContent = "No messages yet. Send the first message.";
      box.appendChild(empty);
      return;
    }

    rows.forEach(message => {
      const wrap = document.createElement("div");
      wrap.className = "messageBubble " + (message.senderId === currentUser?.uid ? "sent" : "received");
      const who = document.createElement("strong");
      who.textContent = message.senderName || "Indian User";
      const body = document.createElement("p");
      body.textContent = message.text || "";
      const time = document.createElement("small");
      time.textContent = message.createdAt?.toDate ? message.createdAt.toDate().toLocaleString() : "";
      wrap.append(who, body, time);
      box.appendChild(wrap);
    });
    box.scrollTop = box.scrollHeight;
  }

  function renderGroupHeader() {
    const title = el("chatTitle");
    const presence = el("chatPresence");
    const avatar = el("chatProfileAvatar");
    const controls = ensureGroupControls();
    const personalComposer = el("messageComposer");
    const typing = el("chatTypingStatus");
    const headerActions = document.querySelector("#messagesLayout .chatHeaderActions");

    if (title) title.textContent = activeGroup?.name || "Group chat";
    if (presence) presence.textContent =
      (Array.isArray(activeGroup?.members) ? activeGroup.members.length : 0) + " members";
    if (avatar) {
      avatar.textContent = "👥";
      avatar.setAttribute("aria-label", "Group conversation");
    }
    if (personalComposer) personalComposer.style.display = "none";
    if (typing) typing.hidden = true;
    if (headerActions) headerActions.style.display = "none";
    if (controls) {
      controls.hidden = false;
      const memberArea = el("indianUnifiedGroupMemberArea");
      if (memberArea) memberArea.hidden = !(activeGroup?.admins || []).includes(currentUser?.uid);
    }
  }

  function closeGroupMode() {
    if (!groupMode) return;
    groupMode = false;
    if (messagesUnsubscribe) {
      messagesUnsubscribe();
      messagesUnsubscribe = null;
    }
    activeGroupId = "";
    activeGroup = null;
    const controls = el("indianUnifiedGroupControls");
    const personalComposer = el("messageComposer");
    const typing = el("chatTypingStatus");
    const headerActions = document.querySelector("#messagesLayout .chatHeaderActions");
    if (controls) controls.hidden = true;
    if (personalComposer) personalComposer.style.display = "";
    if (typing) typing.hidden = false;
    if (headerActions) headerActions.style.display = "";
  }

  function openGroup(groupId) {
    const group = groupCache.find(item => item.id === groupId) ||
      (activeGroup?.id === groupId ? activeGroup : null);
    if (!group) return;

    groupMode = true;
    activeGroupId = groupId;
    activeGroup = group;
    const layout = el("messagesLayout");
    const results = el("messageUserResults");
    if (layout) layout.style.display = "";
    if (results) {
      results.hidden = true;
      results.replaceChildren();
    }
    const search = el("conversationSearchBox");
    if (search) search.value = "";
    renderGroupHeader();

    const box = el("chatMessages");
    if (box) {
      box.replaceChildren();
      const loading = document.createElement("p");
      loading.textContent = "Loading group messages…";
      box.appendChild(loading);
    }
    if (messagesUnsubscribe) messagesUnsubscribe();
    const messageQuery = query(
      collection(db, "groups", groupId, "messages"),
      orderBy("createdAt", "asc")
    );
    messagesUnsubscribe = onSnapshot(messageQuery, snapshot => {
      renderGroupMessages(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      setStatus("");
    }, error => {
      console.error("Indian group messages read error", error);
      setStatus("Group messages error: " + (error?.code || "unknown") + " — " + (error?.message || "No details"));
    });

    const section = el("messagesSection");
    if (section) section.style.display = "block";
    const input = el("indianUnifiedGroupText");
    if (input) input.focus();
  }

  async function createGroup() {
    if (!currentUser) {
      setStatus("Sign in first.");
      return;
    }
    const input = el("indianNewGroupName");
    const name = safe(input?.value, 60);
    if (!name) {
      setStatus("Group ka naam likhiye.");
      input?.focus();
      return;
    }
    const button = el("indianCreateGroupButton");
    if (button) button.disabled = true;
    try {
      const ref = await addDoc(collection(db, "groups"), {
        name,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
        members: [currentUser.uid],
        admins: [currentUser.uid]
      });
      if (input) input.value = "";
      const details = el("indianCreateGroupDetails");
      if (details) details.open = false;
      activeGroup = {
        id: ref.id,
        name,
        createdBy: currentUser.uid,
        members: [currentUser.uid],
        admins: [currentUser.uid]
      };
      activeGroupId = ref.id;
      if (!groupCache.some(item => item.id === ref.id)) groupCache.unshift(activeGroup);
      renderGroupCards();
      openGroup(ref.id);
      setStatus("Group ban gaya. Ab aap member add kar sakte hain.");
    } catch (error) {
      console.error("Indian group create error", error);
      setStatus("Group create error: " + (error?.code || "unknown") + " — " + (error?.message || "No details"));
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function searchMembers() {
    if (!currentUser || !activeGroup) {
      setStatus("Pehle group kholiye.");
      return;
    }
    const term = safe(el("indianUnifiedGroupMemberSearch")?.value, 60).toLowerCase();
    const results = el("indianUnifiedGroupMemberResults");
    if (!results) return;
    results.replaceChildren();
    if (term.length < 2) {
      setStatus("Search ke liye kam se kam 2 letters likhiye.");
      return;
    }

    try {
      const snapshot = await getDocs(collection(db, "publicProfiles"));
      const matches = snapshot.docs.map(item => ({ uid: item.id, ...item.data() }))
        .filter(profile => profile.uid !== currentUser.uid &&
          !(activeGroup.members || []).includes(profile.uid) &&
          safe(profile.displayName, 60).toLowerCase().includes(term))
        .slice(0, 20);

      if (!matches.length) {
        const empty = document.createElement("p");
        empty.textContent = "Koi registered user nahi mila.";
        results.appendChild(empty);
        return;
      }

      matches.forEach(profile => {
        const row = document.createElement("div");
        row.className = "conversationCard";
        const name = document.createElement("span");
        name.textContent = safe(profile.displayName, 60) || "Indian User";
        const add = createActionButton("Add", async () => {
          add.disabled = true;
          try {
            await updateDoc(doc(db, "groups", activeGroupId), {
              members: arrayUnion(profile.uid),
              updatedAt: serverTimestamp(),
              updatedAtMs: Date.now()
            });
            activeGroup.members = Array.from(new Set([...(activeGroup.members || []), profile.uid]));
            const cached = groupCache.find(item => item.id === activeGroupId);
            if (cached) cached.members = activeGroup.members.slice();
            renderGroupHeader();
            renderGroupCards();
            row.remove();
            setStatus("Member add ho gaya: " + name.textContent);
          } catch (error) {
            console.error("Indian group add member error", error);
            setStatus("Member add nahi hua: " + (error?.code || "unknown") + " — " + (error?.message || "No details"));
            add.disabled = false;
          }
        }, "Add " + (profile.displayName || "member") + " to group");
        row.append(name, add);
        results.appendChild(row);
      });
      setStatus(matches.length + " registered users mile.");
    } catch (error) {
      console.error("Indian group member search error", error);
      setStatus("User search error: " + (error?.code || "unknown") + " — " + (error?.message || "No details"));
    }
  }

  async function sendGroupMessage() {
    if (!currentUser || !activeGroupId || !groupMode) return;
    const input = el("indianUnifiedGroupText");
    const message = safe(input?.value, 2000);
    if (!message) return;
    const send = el("indianUnifiedGroupSend");
    if (send) send.disabled = true;
    try {
      await addDoc(collection(db, "groups", activeGroupId, "messages"), {
        senderId: currentUser.uid,
        senderName: safe(currentUser.displayName || currentUser.email || "Indian User", 60),
        text: message,
        createdAt: serverTimestamp()
      });
      if (input) input.value = "";
      setStatus("");
    } catch (error) {
      console.error("Indian group send error", error);
      setStatus("Message send error: " + (error?.code || "unknown") + " — " + (error?.message || "No details"));
    } finally {
      if (send) send.disabled = false;
    }
  }

  function refreshChatList() {
    if (typeof window.renderConversationList === "function") {
      window.renderConversationList();
    } else {
      renderGroupCards();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    installConversationHooks();
    el("indianCreateGroupButton")?.addEventListener("click", createGroup);
    ensureGroupControls();
    refreshChatList();
  });

  onAuthStateChanged(auth, user => {
    const nextUid = user?.uid || "";
    const previousUid = currentUser?.uid || "";
    if (nextUid !== previousUid) {
      if (groupsUnsubscribe) groupsUnsubscribe();
      groupsUnsubscribe = null;
      closeGroupMode();
      groupCache = [];
      activeGroup = null;
      activeGroupId = "";
      renderGroupCards();
    }
    currentUser = user || null;
    if (!currentUser) {
      setStatus("Sign in to use group chats.");
      return;
    }

    if (groupsUnsubscribe) groupsUnsubscribe();
    groupsUnsubscribe = null;
    const membershipQuery = query(
      collection(db, "groups"),
      where("members", "array-contains", currentUser.uid)
    );
    groupsUnsubscribe = onSnapshot(membershipQuery, snapshot => {
      groupCache = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
      refreshChatList();
      if (activeGroupId) {
        const latest = groupCache.find(item => item.id === activeGroupId);
        if (latest) {
          activeGroup = latest;
          renderGroupHeader();
        }
      }
      setStatus("");
    }, error => {
      console.error("Indian group list read error", error, {
        uid: currentUser?.uid,
        projectId: apps[0]?.options?.projectId
      });
      const uidTail = currentUser?.uid ? currentUser.uid.slice(-6) : "not-signed-in";
      const project = apps[0]?.options?.projectId || "unknown-project";
      setStatus("Groups load error: " + (error?.code || "unknown") + " — " +
        (error?.message || "No details") + " | Account UID ending: " + uidTail +
        " | Firebase project: " + project);
    });
  });
})();
