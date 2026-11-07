/* Uran social layer: accessible creator cards, likes/views, comments and creator profiles. */
(function(){
 'use strict';
 function el(id){return document.getElementById(id);}
 function profiles(){return Array.isArray(window.indianFirebasePublicProfiles)?window.indianFirebasePublicProfiles:[];}
 function profileFor(uid){return profiles().find(function(p){return p&&p.uid===uid;})||null;}
 function safeText(value,fallback){return String(value||fallback||'');}
 function make(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
 function button(text,action,videoId,extra){var b=make('button','action uran-social-button',text);b.type='button';b.dataset.uranSocialAction=action;b.dataset.uranVideoId=videoId||'';if(extra)Object.keys(extra).forEach(function(k){b.dataset[k]=extra[k];});return b;}
 function setStatus(message){var n=el('shortsStatus');if(n)n.textContent=message;}
 function countLabel(label,count){return label+': '+Number(count||0);}
 function renderCommentRows(target,comments){
  target.replaceChildren();
  if(!comments.length){target.appendChild(make('p','uran-no-comments','Abhi koi comment nahi hai. Pehla comment aap karein.'));return;}
  comments.forEach(function(c){var row=make('div','uran-comment-row');var avatar;
   if(c.photoURL){avatar=make('img','uran-comment-avatar');avatar.src=c.photoURL;avatar.alt=safeText(c.displayName,'User')+' profile photo';row.appendChild(avatar);}
   var body=make('div','uran-comment-body');body.appendChild(make('strong','',safeText(c.displayName,'Indian user')));body.appendChild(make('p','',safeText(c.text,'')));row.appendChild(body);target.appendChild(row);
  });
 }
 function ensureCard(card){
  if(!card||card.dataset.uranSocialReady==='yes')return;
  var id=card.dataset.uranVideoId;if(!id)return;
  card.dataset.uranSocialReady='yes';
  var cached=[];try{cached=JSON.parse(localStorage.getItem('indian_uran_youtube_links_v1')||'[]');}catch(e){}
  var item=Array.isArray(cached)?cached.find(function(x){return String(x.id)===String(id);}):null;
  var creatorUid=item&&item.addedBy?String(item.addedBy):'';
  var creatorName=safeText(item&&item.addedByName,'Indian creator');
  var head=make('div','uran-creator-row');
  var who=make('button','uran-creator-link',creatorName);who.type='button';who.dataset.uranSocialAction='profile';who.dataset.uranCreatorUid=creatorUid;
  var p=profileFor(creatorUid);
  if(p&&p.photoURL){var img=make('img','uran-creator-avatar');img.src=p.photoURL;img.alt=creatorName+' profile photo';who.prepend(img);}
  else{var initial=make('span','uran-creator-avatar uran-creator-initial',creatorName.trim().charAt(0).toUpperCase()||'I');who.prepend(initial);}
  head.appendChild(who);
  var follow=button('Follow','follow','',{'uranCreatorUid':creatorUid});follow.classList.add('uran-follow-button');if(!creatorUid||creatorUid===String(window.firebaseCurrentUid||''))follow.hidden=true;head.appendChild(follow);
  card.insertBefore(head,card.firstChild);
  var social=make('section','uran-social-panel');social.setAttribute('aria-label','Video likes, views, sharing and comments');
  var metrics=make('div','uran-social-metrics');
  var likeWrap=make('div','uran-like-control');likeWrap.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:42px;';
  var like=button(item&&item.liked?'♥':'♡','like',id);like.setAttribute('aria-pressed',String(!!(item&&item.liked)));like.setAttribute('aria-label',item&&item.liked?'Unlike this video':'Like this video');like.style.cssText='min-width:42px;min-height:38px;padding:4px 10px;font-size:25px;line-height:1;';likeWrap.appendChild(like);
  var likeCount=make('span','uran-like-count',String(Number(item&&item.likedBy&&item.likedBy.length||0)));likeCount.dataset.uranLikeCountFor=id;likeCount.setAttribute('aria-label','Likes');likeWrap.appendChild(likeCount);metrics.appendChild(likeWrap);
  var views=make('span','uran-social-count',countLabel('Views','…'));views.dataset.uranViewsFor=id;metrics.appendChild(views);
  var share=button('↗ Share','share',id);metrics.appendChild(share);
  social.appendChild(metrics);
  var commentHeading=make('h4','uran-comments-heading','Comments');
  social.appendChild(commentHeading);
  var comments=make('div','uran-comment-list');comments.dataset.uranCommentsFor=id;comments.appendChild(make('p','','Comments load hone ka intezar karein.'));social.appendChild(comments);
  var form=make('form','uran-comment-form');form.dataset.uranCommentForm=id;
  var input=make('textarea','');input.name='comment';input.rows=2;input.maxLength=1000;input.placeholder='Comment likhein…';input.setAttribute('aria-label','Write a comment');input.required=true;form.appendChild(input);
  var send=make('button','action uran-comment-send','Comment bhejein');send.type='submit';form.appendChild(send);social.appendChild(form);
  card.appendChild(social);
  var oldActions=card.querySelector(':scope > div[style*="display:flex"]');
  if(oldActions){Array.from(oldActions.querySelectorAll('button')).forEach(function(b){if(!/Remove from Uran/.test(b.textContent)){b.hidden=true;b.setAttribute('aria-hidden','true');}});}
  loadCardData(card,id,creatorUid);
 }
 async function loadCardData(card,id,creatorUid){
  if(typeof window.indianUranGetSocialData!=='function')return;
  try{
   var data=await window.indianUranGetSocialData(id);
   var like=card.querySelector('[data-uran-social-action="like"]');if(like){var isLiked=!!(JSON.parse(localStorage.getItem('indian_uran_youtube_links_v1')||'[]').find(function(x){return String(x.id)===id;})||{}).liked;like.textContent=isLiked?'♥':'♡';like.setAttribute('aria-pressed',String(isLiked));like.setAttribute('aria-label',isLiked?'Unlike this video':'Like this video');}var likeCount=card.querySelector('[data-uran-like-count-for="'+id+'"]');if(likeCount)likeCount.textContent=String(data.likes);
   var view=card.querySelector('[data-uran-views-for="'+id+'"]');if(view)view.textContent=countLabel('Views',data.views);
   var list=card.querySelector('[data-uran-comments-for="'+id+'"]');if(list)renderCommentRows(list,data.comments);
   var uid=creatorUid||data.creatorUid;var follow=card.querySelector('[data-uran-social-action="follow"]');if(follow&&uid&&typeof window.indianUranIsFollowing==='function'&&uid!==String(window.firebaseCurrentUid||'')){var isFollowing=await window.indianUranIsFollowing(uid);follow.textContent=isFollowing?'Following':'Follow';follow.dataset.following=String(isFollowing);}
   if(uid){var who=card.querySelector('[data-uran-social-action="profile"]');if(who){who.dataset.uranCreatorUid=uid;if(typeof window.indianUranGetPublicProfile==='function'){try{var creator=await window.indianUranGetPublicProfile(uid);who.textContent=creator.displayName||data.creatorName||'Indian creator';if(creator.photoURL){var avatar=make('img','uran-creator-avatar');avatar.src=creator.photoURL;avatar.alt=who.textContent+' profile photo';who.prepend(avatar);}}catch(profileError){console.warn('Uran creator photo could not load',profileError);}}}}
   if(typeof window.indianUranRecordView==='function'&&uid&&window.firebaseCurrentUid){var key='indian_uran_viewed_'+window.firebaseCurrentUid+'_'+id;try{if(!sessionStorage.getItem(key)){await window.indianUranRecordView(id);sessionStorage.setItem(key,'1');var updated=await window.indianUranGetSocialData(id);if(view)view.textContent=countLabel('Views',updated.views);}}catch(viewError){console.warn('Uran view could not be recorded',viewError);}}
   document.dispatchEvent(new CustomEvent('indian-uran-social-updated',{detail:{videoId:id}}));
  }catch(error){var view=card.querySelector('[data-uran-views-for="'+id+'"]');if(view)view.textContent='Views unavailable';console.warn('Uran social data load failed',error);}
 }
 function collect(){var selector='#shortsFeed > article[data-uran-video-id], #indianMixedFeedItems article[data-uran-video-id]';Array.from(document.querySelectorAll(selector)).forEach(ensureCard);}
 function findCreatorButton(target){return target&&target.closest?target.closest('[data-uran-social-action]'):null;}
 async function openProfile(uid){
  if(!uid){setStatus('Creator profile abhi available nahi hai.');return;}
  if(typeof window.indianUranGetCreatorProfile!=='function'){setStatus('Profile service load nahi hui. Page refresh karein.');return;}
  var old=el('uranCreatorProfilePage');if(old)old.remove();
  var page=make('section','uran-profile-page');page.id='uranCreatorProfilePage';page.setAttribute('role','dialog');page.setAttribute('aria-modal','true');page.setAttribute('aria-labelledby','uranCreatorProfileTitle');page.tabIndex=-1;
  var back=make('button','action uran-profile-back','← Uran par wapas');back.type='button';back.addEventListener('click',function(){page.remove();});page.appendChild(back);
  page.appendChild(make('p','uran-profile-loading','Profile load ho rahi hai…'));
  document.body.appendChild(page);page.focus();page.scrollIntoView({behavior:'smooth',block:'start'});
  try{
   var data=await window.indianUranGetCreatorProfile(uid),p=data.profile;
   page.replaceChildren(back);
   var hero=make('div','uran-profile-hero');
   if(p.photoURL){var photo=make('img','uran-profile-photo');photo.src=p.photoURL;photo.alt=p.displayName+' profile photo';hero.appendChild(photo);}
   else hero.appendChild(make('div','uran-profile-photo uran-creator-initial',p.displayName.charAt(0).toUpperCase()));
   var profileTitle=make('h2','',p.displayName);profileTitle.id='uranCreatorProfileTitle';hero.appendChild(profileTitle);if(p.bio)hero.appendChild(make('p','',p.bio));
   var followCount=make('div','uran-profile-counts');
   var followers=button('Followers · '+data.followers.length,'list-followers','',{'uranCreatorUid':uid,'listType':'followers'});
   var following=button('Following · '+data.following.length,'list-following','',{'uranCreatorUid':uid,'listType':'following'});
   followCount.append(followers,following);hero.appendChild(followCount);
   hero.appendChild(make('p','uran-profile-video-count','Uran Videos · '+data.videos.length));
   if(uid!==String(window.firebaseCurrentUid||'')){
    var isFollowing=await window.indianUranIsFollowing(uid);
    var fb=button(isFollowing?'Following':'Follow','profile-follow','',{'uranCreatorUid':uid,'following':String(isFollowing)});hero.appendChild(fb);
   }
   page.appendChild(hero);
   var list=make('div','uran-profile-list');list.id='uranProfileList';page.appendChild(list);
   followers.dataset.profileListTarget='uranProfileList';following.dataset.profileListTarget='uranProfileList';
   var title=make('h3','uran-profile-videos-title','Uran Videos');page.appendChild(title);
   var grid=make('div','uran-profile-video-list');
   data.videos.forEach(function(v,index){var row=make('div','uran-profile-video');var video=make('video','');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=String(v.mediaUrl||'');video.setAttribute('aria-label','Uran video '+(index+1)+' by '+p.displayName);row.appendChild(video);row.appendChild(make('p','',safeText(v.caption,'Uran video')));grid.appendChild(row);});
   if(!data.videos.length)grid.appendChild(make('p','','Is creator ne abhi Uran video upload nahi kiya hai.'));
   page.appendChild(grid);
  }catch(error){page.replaceChildren(back,make('p','uran-profile-error','Profile load nahi ho saki: '+safeText(error.message,'Unknown error')));}
 }
 async function showConnectionList(uid,type,targetId){
  var target=el(targetId);if(!target)return;target.replaceChildren(make('p','','List load ho rahi hai…'));
  try{
   var data=await window.indianUranGetCreatorProfile(uid),rows=type==='followers'?data.followers:data.following;
   target.replaceChildren();
   if(!rows.length){target.appendChild(make('p','',type==='followers'?'Abhi koi follower nahi hai.':'Abhi kisi ko follow nahi kiya hai.'));return;}
   var people=await Promise.all(rows.map(async function(row){var personUid=type==='followers'?row.followerId:(row.followingUid||row.followingKey||'');if(!personUid||String(personUid).indexOf('demo_')===0)return null;var p=profileFor(personUid);if(typeof window.indianUranGetPublicProfile==='function'){try{p=await window.indianUranGetPublicProfile(personUid);}catch(e){}}return{uid:personUid,profile:p,row:row};}));
   people.filter(Boolean).forEach(function(person){var row=person.row,p=person.profile;var fallback=type==='following'?(row.followingName||'Indian user'):'Indian user';var name=safeText(p&&p.displayName||fallback);var b=make('button','uran-connection-row',name);b.type='button';if(p&&p.photoURL){var img=make('img','uran-connection-avatar');img.src=p.photoURL;img.alt=name+' profile photo';b.prepend(img);}b.addEventListener('click',function(){openProfile(person.uid);});target.appendChild(b);});
   if(!target.children.length)target.appendChild(make('p','',type==='followers'?'Abhi koi follower nahi hai.':'Abhi kisi ko follow nahi kiya hai.'));
  }catch(error){target.replaceChildren(make('p','uran-profile-error','List load nahi hui: '+safeText(error.message,'')));}
 }
 document.addEventListener('click',async function(event){
  var b=findCreatorButton(event.target);if(!b)return;
  var action=b.dataset.uranSocialAction,id=b.dataset.uranVideoId,uid=b.dataset.uranCreatorUid;
  if(action==='profile'){event.preventDefault();openProfile(uid);return;}
  if(action==='share'){event.preventDefault();var card=b.closest('article[data-uran-video-id]'),v=card&&card.querySelector('video'),url=v&&(v.currentSrc||v.src)||'';var item=[];try{item=JSON.parse(localStorage.getItem('indian_uran_youtube_links_v1')||'[]');}catch(e){}var found=item.find(function(x){return String(x.id)===String(id);});url=found&&(found.mediaUrl||found.videoUrl)||url;if(navigator.share){navigator.share({title:'Indian Uran Video',url:url}).catch(function(){});}else if(navigator.clipboard){navigator.clipboard.writeText(url).then(function(){setStatus('Video link copy ho gaya.');}).catch(function(){setStatus('Share link copy nahi ho saka.');});}return;}
  if(action==='like'){event.preventDefault();if(!window.firebaseCurrentUid){setStatus('Like karne ke liye sign in karein.');return;}var liked=b.getAttribute('aria-pressed')!=='true';b.disabled=true;try{await window.indianUranToggleLike(id,liked);var cached=JSON.parse(localStorage.getItem('indian_uran_youtube_links_v1')||'[]');var item=cached.find(function(x){return String(x.id)===String(id);});if(item)item.liked=liked;localStorage.setItem('indian_uran_youtube_links_v1',JSON.stringify(cached));var d=await window.indianUranGetSocialData(id);Array.from(document.querySelectorAll('[data-uran-social-action="like"]')).filter(function(control){return String(control.dataset.uranVideoId)===String(id);}).forEach(function(control){control.textContent=liked?'♥':'♡';control.setAttribute('aria-pressed',String(liked));control.setAttribute('aria-label',liked?'Unlike this video':'Like this video');control.disabled=false;});Array.from(document.querySelectorAll('[data-uran-like-count-for]')).filter(function(count){return String(count.dataset.uranLikeCountFor)===String(id);}).forEach(function(count){count.textContent=String(d.likes);});setStatus('Like update ho gaya.');}catch(e){setStatus('Like save nahi hua: '+safeText(e.message,''));}finally{b.disabled=false;}return;}
  if(action==='follow'||action==='profile-follow'){event.preventDefault();if(!window.firebaseCurrentUid){setStatus('Follow karne ke liye sign in karein.');return;}var currently=b.dataset.following==='true'||b.textContent==='Following';b.disabled=true;try{await window.indianUranToggleFollow(uid,!currently);b.dataset.following=String(!currently);b.textContent=!currently?'Following':'Follow';setStatus(!currently?'Ab aap is creator ko follow kar rahe hain.':'Creator ko unfollow kar diya.');if(action==='profile-follow')await openProfile(uid);}catch(e){setStatus('Follow update nahi hua: '+safeText(e.message,''));}finally{b.disabled=false;}return;}
  if(action==='list-followers'||action==='list-following'){event.preventDefault();var page=el('uranCreatorProfilePage');var list=page&&page.querySelector('#uranProfileList');if(list)showConnectionList(uid,b.dataset.listType,list.id);return;}
 });
 document.addEventListener('submit',async function(event){
  var form=event.target;if(!form||!form.matches('form[data-uran-comment-form]'))return;event.preventDefault();
  var id=form.dataset.uranCommentForm,input=form.querySelector('textarea'),send=form.querySelector('button[type="submit"]');
  if(!window.firebaseCurrentUid){setStatus('Comment karne ke liye sign in karein.');return;}
  if(!input||!input.value.trim())return;
  if(send)send.disabled=true;
  try{await window.indianUranAddComment(id,input.value);input.value='';var data=await window.indianUranGetSocialData(id);document.querySelectorAll('[data-uran-comments-for]').forEach(function(list){if(String(list.dataset.uranCommentsFor)===String(id))renderCommentRows(list,data.comments);});setStatus('Comment publish ho gaya.');}
  catch(error){setStatus('Comment save nahi hua: '+safeText(error.message,''));}
  finally{if(send)send.disabled=false;}
 });
 function install(){collect();var feed=el('shortsFeed');if(feed){new MutationObserver(collect).observe(feed,{childList:true,subtree:true});}}
 window.addEventListener('indian-uran-cloud-ready',function(){collect();Array.from((el('shortsFeed')||document).querySelectorAll('article[data-uran-video-id]')).forEach(function(card){var id=card.dataset.uranVideoId;if(id)loadCardData(card,id,'');});});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
