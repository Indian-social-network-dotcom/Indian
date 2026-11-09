/* Indian Group Chat — first release: private text groups */
import { getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, query, where,
  onSnapshot, getDocs, orderBy, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

(function(){
  "use strict";
  const apps=getApps();
  if(!apps.length){ console.warn("Indian Groups: Firebase app is not ready."); return; }
  const auth=getAuth(apps[0]);
  const db=getFirestore(apps[0]);
  let currentUser=null, groupsUnsubscribe=null, messagesUnsubscribe=null;
  let activeGroupId="", activeGroup=null, groupCache=[];

  const el=id=>document.getElementById(id);
  const setStatus=(message)=>{const n=el("indianGroupStatus");if(n)n.textContent=message||"";};
  const safe=(value,max=2000)=>String(value==null?"":value).normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g,"").trim().slice(0,max);
  const makeButton=(label,handler,aria)=>{const b=document.createElement("button");b.type="button";b.className="action";b.textContent=label;if(aria)b.setAttribute("aria-label",aria);b.addEventListener("click",handler);return b;};

  function showGroupMode(isGroup){
    const layout=el("messagesLayout"), panel=el("indianGroupsPanel");
    if(layout)layout.style.display=isGroup?"none":"";
    if(panel)panel.hidden=!isGroup;
    const p=el("indianPersonalChatsTab"),g=el("indianGroupsTab");
    if(p)p.setAttribute("aria-pressed",String(!isGroup));
    if(g)g.setAttribute("aria-pressed",String(isGroup));
    if(isGroup)loadGroups();
  }
  window.openIndianGroups=function(){showGroupMode(true);};
  window.openIndianPersonalChats=function(){showGroupMode(false);};

  function renderGroups(){
    const list=el("indianGroupList");if(!list)return;
    list.replaceChildren();
    if(!groupCache.length){const p=document.createElement("p");p.textContent="You are not in any groups yet.";list.appendChild(p);return;}
    groupCache.forEach(group=>{
      const b=document.createElement("button");b.type="button";b.className="conversationCard";b.style.width="100%";b.style.textAlign="left";
      b.textContent=group.name||"Unnamed group";
      b.setAttribute("aria-label","Open group "+(group.name||"Unnamed group"));
      b.addEventListener("click",()=>openGroup(group.id));list.appendChild(b);
    });
  }
  function loadGroups(){
    if(!currentUser){setStatus("Sign in to use Groups.");return;}
    if(groupsUnsubscribe)return;
    const q=query(collection(db,"groups"),where("members","array-contains",currentUser.uid));
    groupsUnsubscribe=onSnapshot(q,snap=>{
      groupCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAtMs||0)-(a.updatedAtMs||0));
      renderGroups();
      if(activeGroupId){const fresh=groupCache.find(g=>g.id===activeGroupId);if(fresh){activeGroup=fresh;renderGroupHeader();}}
    },err=>{console.error("Indian Groups list error",err,{uid:currentUser?.uid,projectId:apps[0]?.options?.projectId});const uidTail=currentUser?.uid?currentUser.uid.slice(-6):"not-signed-in";const project=apps[0]?.options?.projectId||"unknown-project";setStatus("Groups load error: "+(err?.code||"unknown")+" — "+(err?.message||"No details")+" | Account UID ending: "+uidTail+" | Firebase project: "+project);});
  }
  function renderGroupHeader(){
    const title=el("indianGroupTitle"),meta=el("indianGroupMembers");
    if(title)title.textContent=activeGroup?.name||"Select a group";
    if(meta)meta.textContent=activeGroup?(Array.isArray(activeGroup.members)?activeGroup.members.length:0)+" members":"Choose a group or create a new one.";
    const box=el("indianGroupComposer");if(box)box.hidden=!activeGroup;
    const add=el("indianGroupAddMemberArea");if(add)add.hidden=!activeGroup || !(activeGroup.admins||[]).includes(currentUser?.uid);
  }
  function renderGroupMessages(rows){
    const box=el("indianGroupMessages");if(!box)return;
    box.replaceChildren();
    if(!rows.length){const p=document.createElement("p");p.textContent="No messages yet. Send the first message.";box.appendChild(p);return;}
    rows.forEach(m=>{
      const wrap=document.createElement("div");wrap.className="messageBubble "+(m.senderId===currentUser?.uid?"sent":"received");
      const who=document.createElement("strong");who.textContent=m.senderName||"Indian User";
      const body=document.createElement("p");body.textContent=m.text||"";
      const time=document.createElement("small");time.textContent=m.createdAt?.toDate?m.createdAt.toDate().toLocaleString():"";
      wrap.append(who,body,time);box.appendChild(wrap);
    });
    box.scrollTop=box.scrollHeight;
  }
  function openGroup(groupId){
    const group=groupCache.find(g=>g.id===groupId)||(activeGroup&&activeGroup.id===groupId?activeGroup:null);if(!group)return;
    activeGroupId=groupId;activeGroup=group;renderGroupHeader();
    if(messagesUnsubscribe){messagesUnsubscribe();messagesUnsubscribe=null;}
    const q=query(collection(db,"groups",groupId,"messages"),orderBy("createdAt","asc"));
    messagesUnsubscribe=onSnapshot(q,snap=>renderGroupMessages(snap.docs.map(d=>({id:d.id,...d.data()}))),err=>{
      console.error("Indian Group messages error",err);setStatus("Group messages load nahi hue. Rules check karein.");
    });
    setStatus("");
  }
  async function createGroup(){
    if(!currentUser){setStatus("Sign in first.");return;}
    const input=el("indianNewGroupName"),name=safe(input?.value,60);
    if(name.length<1){setStatus("Group ka naam likhiye.");input?.focus();return;}
    const button=el("indianCreateGroupButton");if(button)button.disabled=true;
    try{
      const ref=await addDoc(collection(db,"groups"),{
        name,createdBy:currentUser.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
        updatedAtMs:Date.now(),members:[currentUser.uid],admins:[currentUser.uid]
      });
      if(input)input.value="";
      activeGroupId=ref.id;
      activeGroup={id:ref.id,name,members:[currentUser.uid],admins:[currentUser.uid]};
      renderGroupHeader();
      setStatus("Group ban gaya.");
      // The membership listener will populate the new group shortly.
      setTimeout(()=>openGroup(ref.id),350);
    }catch(err){console.error("Indian Group create error",err);setStatus("Group create error: "+(err?.code||"unknown")+" — "+(err?.message||"No details"));}
    finally{if(button)button.disabled=false;}
  }
  async function searchMembers(){
    if(!currentUser||!activeGroup){setStatus("Pehle group kholiye.");return;}
    const term=safe(el("indianGroupMemberSearch")?.value,60).toLowerCase();
    const out=el("indianGroupMemberResults");if(!out)return;out.replaceChildren();
    if(term.length<2){setStatus("Search ke liye kam se kam 2 letters likhiye.");return;}
    try{
      const snap=await getDocs(collection(db,"publicProfiles"));
      const matches=snap.docs.map(d=>({uid:d.id,...d.data()}))
        .filter(p=>p.uid!==currentUser.uid && !(activeGroup.members||[]).includes(p.uid) && safe(p.displayName,60).toLowerCase().includes(term))
        .slice(0,20);
      if(!matches.length){const p=document.createElement("p");p.textContent="Koi registered user nahi mila.";out.appendChild(p);return;}
      matches.forEach(profile=>{
        const row=document.createElement("div");row.className="conversationCard";
        const name=document.createElement("span");name.textContent=safe(profile.displayName,60)||"Indian User";
        const add=makeButton("Add",async()=>{
          add.disabled=true;
          try{
            await updateDoc(doc(db,"groups",activeGroupId),{members:arrayUnion(profile.uid),updatedAt:serverTimestamp(),updatedAtMs:Date.now()});
            setStatus("Member add ho gaya: "+name.textContent);
            activeGroup.members=Array.from(new Set([...(activeGroup.members||[]),profile.uid]));renderGroupHeader();
            row.remove();
          }catch(err){console.error("Indian Group add member error",err);setStatus("Member add nahi hua. Sirf group admin members add kar sakta hai.");add.disabled=false;}
        },"Add "+(profile.displayName||"member")+" to group");
        row.append(name,add);out.appendChild(row);
      });
      setStatus(matches.length+" registered users mile.");
    }catch(err){console.error("Indian Group member search error",err);setStatus("User search nahi ho saka. Public profile Rules check karein.");}
  }
  async function sendGroupMessage(){
    if(!currentUser||!activeGroupId)return;
    const input=el("indianGroupMessageText"),text=safe(input?.value,2000);
    if(!text)return;
    const send=el("indianGroupSendButton");if(send)send.disabled=true;
    try{
      await addDoc(collection(db,"groups",activeGroupId,"messages"),{
        senderId:currentUser.uid,
        senderName:safe(currentUser.displayName||currentUser.email||"Indian User",60),
        text,createdAt:serverTimestamp()
      });
      if(input)input.value="";
      setStatus("");
    }catch(err){console.error("Indian Group send error",err);setStatus("Message send nahi hua. Firestore Rules check karein.");}
    finally{if(send)send.disabled=false;}
  }

  document.addEventListener("DOMContentLoaded",()=>{
    el("indianPersonalChatsTab")?.addEventListener("click",()=>showGroupMode(false));
    el("indianGroupsTab")?.addEventListener("click",()=>showGroupMode(true));
    el("indianCreateGroupButton")?.addEventListener("click",createGroup);
    el("indianGroupMemberSearchButton")?.addEventListener("click",searchMembers);
    el("indianGroupSendButton")?.addEventListener("click",sendGroupMessage);
    el("indianGroupMessageText")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendGroupMessage();}});
  });
  onAuthStateChanged(auth,user=>{
    const nextUid=user?.uid||"";
    const previousUid=currentUser?.uid||"";
    if(nextUid!==previousUid){
      if(groupsUnsubscribe)groupsUnsubscribe();
      groupsUnsubscribe=null;
      if(messagesUnsubscribe)messagesUnsubscribe();
      messagesUnsubscribe=null;
      groupCache=[];
      activeGroup=null;
      activeGroupId="";
      renderGroups();
      renderGroupHeader();
    }
    currentUser=user||null;
    if(!currentUser){setStatus("Sign in to use Groups.");}
    else{loadGroups();}
  });
})();
