'use strict';
{
  const desk = document.querySelector('#coverage');
  const tv = document.querySelector('#tv-mode');
  const computer = document.querySelector('#computer-mode');
  const fullscreen = document.querySelector('#fill-screen');
  if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
    fullscreen.hidden = false;
    fullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        showToast('Use your browser’s full-screen control.');
      }
    });
    document.addEventListener('fullscreenchange', () => {
      fullscreen.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
    });
  }
  function setTV(enabled, updateLink) {
    document.body.classList.toggle('tv-mode', enabled);
    tv.setAttribute('aria-pressed', String(enabled));
    computer.setAttribute('aria-pressed', String(!enabled));
    document.dispatchEvent(new Event('layoutchange'));
    if (updateLink && location.protocol !== 'file:') {
      const url = new URL(location.href);
      if (enabled) url.searchParams.set('tv','1');
      else url.searchParams.set('tv','0');
      history.replaceState(null,'',url);
    }
  }
  setTV(new URLSearchParams(location.search).get('tv')!=='0', false);
  tv.addEventListener('click', () => setTV(true, true));
  computer.addEventListener('click', () => setTV(false, true));
  const player = desk.querySelector('#video-player');
  const mount = desk.querySelector('#video-mount');
  const title = desk.querySelector('#on-air-title');
  const pin = desk.querySelector('#pin-player');
  const stop = desk.querySelector('#stop-player');
  const audio = desk.querySelector('#stream-audio');
  const open = desk.querySelector('#on-air-link');
  const status = desk.querySelector('#stream-status');
  const retry = desk.querySelector('#retry-video');
  const choices = [...desk.querySelectorAll('[data-video]')];
  const kind=desk.querySelector('#stream-kind');
  const liveList=desk.querySelector('#live-stations');
  const replayList=desk.querySelector('#replay-stations');
  const unconfirmed=desk.querySelector('#unconfirmed-stations');
  const liveChoices=choices.filter(choice=>choice.dataset.kind==='LIVE')
    .sort((a,b)=>Date.parse(b.dataset.liveStart)-Date.parse(a.dataset.liveStart));
  const latestLive=()=>liveChoices.find(choice=>choice.dataset.kind==='LIVE') ?? choices[0];

  function updateKind(choice,label,list) {
    choice.dataset.kind=label;
    const badge=choice.querySelector('.station-badge');
    badge.textContent=label;
    badge.setAttribute('aria-label',label);
    list.append(choice.closest('.station'));
    if (choice===active) kind.textContent=label;
  }
  function expireLiveLabels() {
    for (const choice of liveChoices) {
      if (choice.dataset.kind==='LIVE' && Date.parse(choice.dataset.liveUntil)<=Date.now()) {
        updateKind(choice,'CHECK',unconfirmed);
      }
    }
    desk.querySelector('#unconfirmed-section').hidden=!unconfirmed.children.length;
  }
  let active = null, retried=false, selectionMuted=true;
  let pinned = matchMedia('(min-width: 760px)').matches;
  let youtube, apiPromise, ready=false, restoreOnInput=false;
  const soundKey='counting-couch-audio';
  const readPreference=()=>{try{return localStorage.getItem(soundKey)==='on';}catch{return false;}};
  let wantsSound=readPreference();

  function updateSoundButton() {
    const audible=ready&&!youtube.isMuted()&&youtube.getVolume()>0;
    audio.setAttribute('aria-pressed',String(audible));
    audio.textContent=audible?'Mute sound':wantsSound?'Resume sound':'Sound on';
  }
  function sound(enabled) {
    wantsSound=enabled;
    selectionMuted=!enabled;
    restoreOnInput=false;
    try {localStorage.setItem(soundKey,enabled?'on':'off');} catch {}
    if (!ready) return;
    if (enabled) {
      if (youtube.getVolume()===0) youtube.setVolume(100);
      youtube.unMute();
      if ([0,2,5,-1].includes(youtube.getPlayerState())) youtube.playVideo();
    } else youtube.mute();
    updateSoundButton();
  }
  function loadPlayerAPI() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (!apiPromise) apiPromise=new Promise((resolve,reject)=>{
      window.onYouTubeIframeAPIReady=()=>resolve(window.YT);
      const script=document.createElement('script');
      script.src='https://www.youtube.com/iframe_api';
      script.onerror=reject;
      document.head.append(script);
    });
    return apiPromise;
  }
  async function connectAudio(iframe) {
    try {
      const api=await loadPlayerAPI();
      if (!mount.contains(iframe)) return;
      youtube=new api.Player(iframe,{events:{
        onStateChange(event) {
          if (!mount.contains(iframe) || !active) return;
          if(event.data===1) reportPlaying(event.target);
          else if(event.data===2) setPlayback('paused','Paused');
          else if(event.data===3) setPlayback('loading','Buffering…');
          else if(event.data===0) {
            setPlayback('ended','Ended · choose a channel');
            if (active.dataset.liveStart) {
              updateKind(active,'REPLAY',replayList);
              expireLiveLabels();
            }
          }
        },
        onError() {
          if (!mount.contains(iframe) || !active) return;
          if (!retried) {
            retried=true;
            setPlayback('loading','Reconnecting…');
            mountBroadcast(active,selectionMuted);
          } else {
            setPlayback('error','Playback unavailable');
            retry.hidden=false;
          }
        },
        onAutoplayBlocked() {
          if (mount.contains(iframe)) setPlayback('paused','Press play in the video');
        },
        onReady(event) {
          if (!mount.contains(iframe)) return;
          youtube=event.target; ready=true;
          restoreOnInput=wantsSound && youtube.isMuted();
          audio.hidden=false;updateSoundButton();
          if (youtube.getPlayerState()===1) reportPlaying(youtube);
        }
      }});
    } catch {}
  }
  function restoreSound(event) {
    if (!event.isTrusted || !restoreOnInput || event.target.closest?.('#stream-audio,#stop-player')) return;
    sound(true);
  }
  document.addEventListener('pointerdown',restoreSound);
  document.addEventListener('keydown',restoreSound);
  audio.addEventListener('click',()=>sound(youtube.isMuted()||youtube.getVolume()===0));
  setInterval(()=>{if(ready&&!document.hidden) updateSoundButton();},800);

  function setPin(value) {
    pinned = value;
    player.classList.toggle('is-pinned', Boolean(active && pinned));
    pin.setAttribute('aria-pressed', String(pinned));
    pin.textContent = pinned ? 'Unpin' : 'Pin video';
  }
  function reportPlaying(playerApi) {
    const url=playerApi.getVideoUrl();
    if(!url || new URL(url).searchParams.get('v')!==active.dataset.video) return;
    status.dataset.videoId=active.dataset.video;
    setPlayback('playing','Playing');
  }
  function setPlayback(state,text) {
    if (state!=='playing') delete status.dataset.videoId;
    if (status.dataset.playback===state && status.textContent===text) return;
    status.dataset.playback=state;
    status.textContent=text;
  }
  function mountBroadcast(choice, muted) {
    ready=restoreOnInput=false;
    youtube?.destroy();
    youtube=null;
    audio.hidden=true;
    const iframe=document.createElement('iframe');
    const url=new URL('https://www.youtube-nocookie.com/embed/'+choice.dataset.video);
    url.search=new URLSearchParams({autoplay:'1',playsinline:'1',rel:'0',mute:muted?'1':'0'});
    if(location.protocol!=='file:') {
      url.searchParams.set('enablejsapi','1');
      url.searchParams.set('origin',location.origin);
    }
    iframe.src=url.href;
    iframe.title=choice.dataset.name+' video';
    iframe.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
    iframe.allowFullscreen=true;
    iframe.referrerPolicy='strict-origin-when-cross-origin';
    mount.replaceChildren(iframe);
    if(location.protocol!=='file:') connectAudio(iframe);
  }
  function play(choice, startMuted=false) {
    if (!/^[\w-]{11}$/.test(choice.dataset.video) || active === choice) return;
    selectionMuted=startMuted || (ready?youtube.isMuted():!wantsSound);
    active=choice;
    retried=false;
    retry.hidden=true;
    setPlayback('loading','Connecting…');
    const name=choice.dataset.name;
    if (ready) {
      youtube.getIframe().title=name+' video';
      youtube.loadVideoById(choice.dataset.video);
    } else mountBroadcast(choice,selectionMuted);
    title.textContent = name;
    kind.textContent=choice.dataset.kind;kind.hidden=false;
    open.href = choice.nextElementSibling.href;
    open.hidden = false;
    pin.hidden = stop.hidden = false;
    for (const other of choices) other.setAttribute('aria-pressed', String(other === choice));
    setPin(pinned);
    if (!startMuted && !pinned) player.scrollIntoView({block:'nearest'});
  }
  retry.addEventListener('click',()=>{
    if (!active) return;
    retried=false;
    retry.hidden=true;
    setPlayback('loading','Connecting…');
    mountBroadcast(active,selectionMuted);
  });
  for (const choice of choices) choice.addEventListener('click', () => play(choice));
  mount.addEventListener('click', event => {
    if (event.target.closest('#play-featured')) play(latestLive());
  });
  pin.addEventListener('click', () => {
    setPin(!pinned);
    if (!pinned) player.scrollIntoView({block:'nearest'});
  });
  stop.addEventListener('click', () => {
    const prior = active;
    active = null;
    ready=restoreOnInput=false;
    youtube?.destroy();youtube=null;
    audio.hidden=retry.hidden=true;
    setPlayback('idle','');
    mount.replaceChildren(desk.querySelector('#video-placeholder').content.cloneNode(true));
    title.textContent = 'Select a broadcast';
    kind.hidden=true;
    open.hidden = pin.hidden = stop.hidden = true;
    player.classList.remove('is-pinned');
    prior?.setAttribute('aria-pressed','false');
    document.querySelector('#coverage-link').focus({preventScroll:true});
  });
  liveList.append(...liveChoices.map(choice=>choice.closest('.station')));
  expireLiveLabels();
  setInterval(expireLiveLabels,60000);
  play(latestLive(),true);
}
