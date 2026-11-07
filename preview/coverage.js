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
      const on = !!document.fullscreenElement;
      fullscreen.setAttribute('aria-pressed', String(on));
      fullscreen.querySelector('strong').textContent = on ? 'Exit full screen' : 'Full screen';
      document.body.classList.toggle('is-fullscreen', on);
    });
  }
  // Three layouts: 'computer' (Explore), 'tv' (Big screen) and 'video' (Big video: Big screen
  // with the player taking about two-thirds of the width and everything else in a side rail).
  const bigVideo = document.querySelector('#video-mode');
  const watchHome = document.querySelector('#my-races');
  const watchAnchor = watchHome && document.createComment('my-races');
  if (watchHome) watchHome.before(watchAnchor);
  let layout = 'tv';
  // Big video swaps two strips (Colin, Nov 6): My races goes up into the recap bar where
  // Closest uncalled was, and Closest uncalled goes under the player. Without My races,
  // Closest uncalled stays in the recap and the live totals sit under the player.
  const closeStrip = document.querySelector('.recap-watch');
  const closeAnchor = closeStrip && document.createComment('recap-watch');
  if (closeStrip) closeStrip.before(closeAnchor);
  function placeStrips() {
    const main = document.querySelector('main');
    const video = layout === 'video' && innerWidth >= 760;
    const swap = video && document.body.classList.contains('has-watch');
    if (watchHome && watchAnchor && closeAnchor) {
      if (swap && watchHome.nextSibling !== closeAnchor) closeAnchor.before(watchHome);
      else if (!swap && video && watchHome.parentNode !== main) main.append(watchHome);
      else if (!video && watchHome.previousSibling !== watchAnchor) watchAnchor.after(watchHome);
    }
    if (closeStrip && closeAnchor && main) {
      if (swap && closeStrip.parentNode !== main) main.append(closeStrip);
      else if (!swap && closeStrip.previousSibling !== closeAnchor) closeAnchor.after(closeStrip);
    }
    document.body.classList.toggle('tv-video-swap', swap);
  }
  function setLayout(mode, updateLink) {
    layout = mode === 'video' || mode === 'computer' ? mode : 'tv';
    const enabled = layout !== 'computer';
    document.body.classList.toggle('tv-mode', enabled);
    document.body.classList.toggle('tv-video', layout === 'video');
    tv.setAttribute('aria-pressed', String(layout === 'tv'));
    computer.setAttribute('aria-pressed', String(layout === 'computer'));
    bigVideo?.setAttribute('aria-pressed', String(layout === 'video'));
    const viewName = document.querySelector('#view-name');
    if (viewName) viewName.textContent = layout === 'video' ? 'Big video' : layout === 'computer' ? 'Explore' : 'Big screen';
    const viewToggle = document.querySelector('#view-toggle');
    viewToggle?.setAttribute('aria-label', 'View: ' + (viewName ? viewName.textContent : '') + '. Change layout or go full screen');
    placeStrips();
    document.dispatchEvent(new Event('layoutchange'));
    if (updateLink && location.protocol !== 'file:') {
      const url = new URL(location.href);
      url.searchParams.set('tv', layout === 'video' ? 'video' : enabled ? '1' : '0');
      history.replaceState(null,'',url);
    }
  }
  const setTV = (enabled, updateLink) => setLayout(enabled ? 'tv' : 'computer', updateLink);
  // View menu: the three layouts plus Full screen, behind one button in the masthead.
  {
    const picker = document.querySelector('.view-picker');
    const toggle = document.querySelector('#view-toggle');
    const menu = document.querySelector('#view-menu');
    if (picker && toggle && menu) {
      const options = () => [...menu.querySelectorAll('.view-option:not([hidden])')];
      const open = () => {
        menu.hidden = false; toggle.setAttribute('aria-expanded', 'true');
        (options().find(o => o.getAttribute('aria-pressed') === 'true') || options()[0])?.focus();
      };
      const close = focusToggle => {
        if (menu.hidden) return;
        menu.hidden = true; toggle.setAttribute('aria-expanded', 'false');
        if (focusToggle) toggle.focus();
      };
      toggle.addEventListener('click', () => menu.hidden ? open() : close(false));
      menu.addEventListener('click', event => { if (event.target.closest('.view-option')) close(false); });
      menu.addEventListener('keydown', event => {
        const list = options(), i = list.indexOf(document.activeElement);
        if (event.key === 'Escape') { event.preventDefault(); close(true); }
        else if (event.key === 'ArrowDown') { event.preventDefault(); list[(i + 1) % list.length].focus(); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
      });
      document.addEventListener('click', event => { if (!picker.contains(event.target)) close(false); });
      // Safari/Firefox on macOS don't focus buttons on click (relatedTarget=null), so only close on real tab-outs
      picker.addEventListener('focusout', event => { if (event.relatedTarget && !picker.contains(event.relatedTarget)) close(false); });
    }
  }
  // TV layout: size the Coverage Desk column so the player is exactly 16:9 (see style.css).
  {
    const main = document.querySelector('main');
    const hero = document.querySelector('.hero');
    const frame = desk.querySelector('#video-mount');
    let raf = 0;
    const fit = () => {
      raf = 0;
      if (!main || !frame || !document.body.classList.contains('tv-mode') || innerWidth < 760) {
        main?.style.removeProperty('--video-w'); document.body.classList.remove('tv-split'); return;
      }
      const box = frame.getBoundingClientRect();
      if (document.body.classList.contains('tv-video')) {
        // Big video: the player gets ~70% of the width (less if the height can't hold a 16:9
        // frame that wide), My races takes what's left under it, the side rail gets the rest.
        const m = main.getBoundingClientRect();
        const cs = getComputedStyle(main);
        const gap = parseFloat(cs.columnGap) || 0;
        const innerH = m.height - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
        const deskBox = desk.getBoundingClientRect();
        const chromeW = Math.max(0, deskBox.width - box.width);
        // vertical chrome = player bar + borders: everything in the player slot that isn't the frame
        const slot = desk.querySelector('.player-slot');
        const chromeH = Math.max(0, Math.min(140, (slot ? slot.getBoundingClientRect().height : box.height) - box.height));
        // Always keep a strip under the player: My races when you have some, live totals otherwise
        const watchMin = Math.max(122, Math.min(180, innerH * .135)) + gap;
        const rail = Math.max(360, m.width * .28);
        const maxW = Math.max(320, m.width - rail - gap);
        const fitW = (innerH - chromeH - watchMin) * 16 / 9 + chromeW;
        const w = Math.round(Math.max(320, Math.min(maxW, fitW)));
        const h = Math.round((w - chromeW) * 9 / 16 + chromeH);
        if (Math.abs((parseFloat(main.style.getPropertyValue('--video-w')) || 0) - w) > 1) main.style.setProperty('--video-w', w + 'px');
        if (Math.abs((parseFloat(main.style.getPropertyValue('--video-h')) || 0) - h) > 1) main.style.setProperty('--video-h', h + 'px');
        // Four row tracks so both columns can split differently: the player spans 1-3 and the strip
        // under it is 4; the side rail is map (1), race finder (2) and Local races (3-4).
        const r1 = Math.round(innerH * .43), r2 = Math.round(innerH * .32);
        let rows, low = false;
        if (r1 + r2 + 2 * gap <= h) {
          rows = `${r1}px ${r2}px ${h - r1 - r2 - 2 * gap}px minmax(0,1fr)`;
        } else {
          // Short player (narrow or short screens): the finder's bottom edge falls below the player's,
          // so the strip under the player starts on track 3 and Local races takes track 4 only.
          const b2 = Math.max(0, h - r1 - gap), c3 = Math.max(0, r2 - b2 - gap);
          rows = `${r1}px ${b2}px ${c3}px minmax(0,1fr)`; low = true;
        }
        document.body.classList.toggle('tv-video-low', low);
        if (main.style.getPropertyValue('--video-rows') !== rows) main.style.setProperty('--video-rows', rows);
        document.body.classList.remove('tv-split');
        return;
      }
      main.style.removeProperty('--video-h'); main.style.removeProperty('--video-rows'); document.body.classList.remove('tv-video-low');
      if (box.height > 60) {
        // add back any border/padding a theme puts around the frame, so the frame itself is 16:9
        const chrome = Math.max(0, desk.getBoundingClientRect().width - box.width);
        const w = Math.round(box.height * 16 / 9 + chrome);
        if (Math.abs((parseFloat(main.style.getPropertyValue('--video-w')) || 0) - w) > 1) main.style.setProperty('--video-w', w + 'px');
      }
      // Map + sidebar side by side when the hero is wide for its height; stacked otherwise
      const r = hero ? hero.getBoundingClientRect() : { width: 0, height: 1 };
      document.body.classList.toggle('tv-split', r.width >= 720 && r.width / Math.max(r.height, 1) >= 1.7);
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(fit); };
    if ('ResizeObserver' in window && frame) new ResizeObserver(queue).observe(frame);
    addEventListener('resize', () => { placeStrips(); queue(); });
    document.addEventListener('layoutchange', queue);
    // My races appearing/emptying changes how tall Big video's player can be
    if ('MutationObserver' in window) new MutationObserver(() => { placeStrips(); queue(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  // Layout: ?tv= in the link wins, then the visitor's saved pick, then Big screen.
  // First visit on a wide screen asks which one (see layoutPicker below).
  const LAYOUT_KEY = 'vcc-layout';
  const urlLayout = new URLSearchParams(location.search).get('tv');
  let savedLayout = null; try { savedLayout = localStorage.getItem(LAYOUT_KEY); } catch {}
  const chooseLayout = mode => {
    if (typeof mode === 'boolean') mode = mode ? 'tv' : 'computer';
    setLayout(mode, true); try { localStorage.setItem(LAYOUT_KEY, layout); } catch {}
  };
  setLayout(urlLayout !== null ? (urlLayout === 'video' ? 'video' : urlLayout === '0' ? 'computer' : 'tv') : savedLayout || 'tv', false);
  tv.addEventListener('click', () => chooseLayout('tv'));
  computer.addEventListener('click', () => chooseLayout('computer'));
  bigVideo?.addEventListener('click', () => chooseLayout('video'));
  window.setLayout = chooseLayout;
  {
    const params = new URLSearchParams(location.search);
    const skip = urlLayout !== null || savedLayout || window.top !== window || params.has('mini') || params.has('watch') || params.has('mirror')
      || document.documentElement.classList.contains('remote-nav') || !matchMedia('(min-width: 760px)').matches;
    if (!skip) {
      const picker = document.createElement('dialog');
      picker.className = 'layout-picker';
      picker.setAttribute('aria-labelledby', 'layout-picker-title');
      picker.innerHTML = '<p class="layout-picker-kicker">Pull up a seat</p><h2 id="layout-picker-title">How are you watching?</h2>'
        + '<div class="layout-picker-choices">'
        + '<button type="button" data-layout="tv"><span class="layout-picker-icon" aria-hidden="true">📺</span><b>Big screen</b><span>For a TV, a projector or a laptop you leave running. Big type, no scrolling. The map, the live coverage and the closest races all fit on one screen and keep updating on their own.</span></button>'
        + '<button type="button" data-layout="computer"><span class="layout-picker-icon" aria-hidden="true">🔎</span><b>Explore</b><span>For digging in at your desk. A regular scrolling page: search any race, open states and counties, read every result.</span></button>'
        + '</div><p class="layout-picker-note">Switch anytime with <b>View</b> at the top of the page. It also has <b>Big video</b>, where the live coverage takes over most of the screen, and <b>Full screen</b>.</p>';
      const close = enabled => { chooseLayout(enabled); picker.close(); picker.remove(); };
      picker.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click', () => close(button.dataset.layout === 'tv')));
      // Esc or a click outside keeps the current layout (Big screen) and doesn't ask again.
      picker.addEventListener('cancel', event => { event.preventDefault(); close(document.body.classList.contains('tv-mode')); });
      picker.addEventListener('click', event => { if (event.target === picker) close(document.body.classList.contains('tv-mode')); });
      document.body.append(picker);
      try { picker.showModal(); picker.querySelector('[data-layout="tv"]').focus(); } catch { picker.remove(); }
    }
  }
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
  const picker=desk.querySelector('#channel-select');
  const offList=desk.querySelector('#offair-stations');
  const liveNote=desk.querySelector('#live-note');
  // Page order is the ranking (U.S. networks, then local, then world).
  const channelChoices=choices.filter(choice=>choice.dataset.channel);
  const rank=new Map(choices.map((choice,index)=>[choice,choice.dataset.rank?+choice.dataset.rank:1000+index]));
  const playable=choice=>/^[\w-]{11}$/.test(choice?.dataset.video||'');
  const latestLive=()=>channelChoices.find(choice=>choice.dataset.kind==='LIVE'&&playable(choice)) ?? choices.find(playable);
  const BADGES={OFF:'OFF AIR'};

  function updateKind(choice,label,list) {
    choice.dataset.kind=label;
    const badge=choice.querySelector('.station-badge');
    badge.textContent=BADGES[label]||label;
    badge.setAttribute('aria-label',BADGES[label]||label);
    const station=choice.closest('.station');
    // keep each list in page-rank order rather than appending to the end
    const after=[...list.children].find(item=>rank.get(item.querySelector('[data-video]'))>rank.get(choice));
    if (station.parentElement!==list || station.nextElementSibling!==after) list.insertBefore(station,after||null);
    if (choice===active) kind.textContent=BADGES[label]||label;
    refreshPicker();
  }
  function expireLiveLabels() {
    for (const choice of channelChoices) {
      if (choice.dataset.kind==='LIVE' && Date.parse(choice.dataset.liveUntil)<=Date.now()) {
        updateKind(choice,'CHECK',unconfirmed);
      }
    }
    desk.querySelector('#unconfirmed-section').hidden=!unconfirmed.children.length;
    updateLineupNote();
  }
  let active = null, retried=false, selectionMuted=true, vodChecked=null;
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
          } else if (active.dataset.channel && !active.dataset.rechecked) {
            // the saved stream may have ended or restarted under a new ID: ask YouTube again
            active.dataset.rechecked='1';
            setPlayback('loading','Finding the current stream…');
            recheckActive();
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

  // Computer layout: a pinned player only floats in the corner once the Coverage Desk
  // itself is scrolled out of view; while the desk is on screen it plays in place.
  const slot = player.parentElement;
  let slotInView = false;
  const floating = () => Boolean(active && pinned && !slotInView);
  function placePlayer() {
    if (document.body.classList.contains('tv-mode') && innerWidth >= 760) slot.style.minHeight = '';
    else if (!floating() && player.offsetHeight > 120) slot.style.minHeight = player.offsetHeight + 'px';
    player.classList.toggle('is-pinned', floating());
  }
  let dockHeight = 0, scrollQueued = false;
  function checkSlot() {
    scrollQueued = false;
    if (!floating() && player.offsetHeight > 120) dockHeight = player.offsetHeight;
    // the slot can be taller than the player (it stretches with the channel list), so measure
    // only the player-sized area at its top: dock when at least half of that is on screen
    const top = slot.getBoundingClientRect().top, h = dockHeight || 300;
    const seen = Math.min(innerHeight, top + h) - Math.max(0, top);
    const inView = seen >= h / 2;
    if (inView !== slotInView) { slotInView = inView; placePlayer(); }
  }
  const queueCheck = () => { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(checkSlot); } };
  addEventListener('scroll', queueCheck, {passive: true});
  addEventListener('resize', queueCheck);
  document.addEventListener('layoutchange', () => { slot.style.minHeight = ''; dockHeight = 0; requestAnimationFrame(() => { placePlayer(); checkSlot(); }); });
  function setPin(value) {
    pinned = value;
    placePlayer();
    queueCheck();
    pin.setAttribute('aria-pressed', String(pinned));
    pin.textContent = pinned ? 'Unpin' : 'Pin video';
  }
  function reportPlaying(playerApi) {
    const url=playerApi.getVideoUrl();
    if(!url || new URL(url).searchParams.get('v')!==active.dataset.video) return;
    status.dataset.videoId=active.dataset.video;
    setPlayback('playing','Playing');
    delete active.dataset.rechecked;
    // a LIVE channel that plays back as a normal video has ended its stream
    if (active.dataset.kind==='LIVE' && active.dataset.channel && vodChecked!==active.dataset.video && playerApi.getVideoData?.().isLive===false) {
      vodChecked=active.dataset.video;
      recheckActive();
    }
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
  function buildPicker() {
    const groups=[['LIVE','Live now'],['REPLAY','Replays'],['RECAP','Recaps & replays'],['CHECK','Checking live status'],['OFF','Not live right now']];
    const placeholder=new Option('Choose a channel…','');
    placeholder.disabled=true;
    picker.replaceChildren(placeholder);
    const ordered=[...desk.querySelectorAll('.station-lineup [data-video]')];
    for (const [label,heading] of groups) {
      const members=ordered.filter(choice=>choice.dataset.kind===label);
      const sets=new Map();
      for (const choice of members) {
        const key=label==='LIVE'&&choice.dataset.group?heading+' · '+choice.dataset.group:heading;
        if (!sets.has(key)) sets.set(key,[]);
        sets.get(key).push(choice);
      }
      for (const [key,list] of sets) {
        const group=document.createElement('optgroup');
        group.label=key;
        for (const choice of list) {
          const option=new Option(choice.dataset.name+' · '+(label==='OFF'?'off air':choice.querySelector('small')?.textContent||label),choice.dataset.video||'off:'+choice.dataset.channel);
          option.disabled=!playable(choice);
          group.append(option);
        }
        picker.append(group);
      }
    }
    picker.value=active?.dataset.video||'';
  }
  // Rebuilding the <select> while it is open closes it, so wait until it loses focus.
  let pickerStale=false;
  function refreshPicker() {
    if (document.activeElement===picker) { pickerStale=true; return; }
    pickerStale=false;
    buildPicker();
  }
  picker.addEventListener('blur',()=>{ if (pickerStale) refreshPicker(); });
  picker.addEventListener('change',()=>{
    const choice=choices.find(item=>item.dataset.video===picker.value);
    if (choice) play(choice);
  });
  function play(choice, startMuted=false) {
    if (!playable(choice) || active === choice) return;
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
    picker.value=choice.dataset.video;
    setPin(pinned);
    if (!startMuted && !pinned) (window.ccReveal ? ccReveal(player, {block:'nearest', smooth:false}) : player.scrollIntoView({block:'nearest'}));
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
    if (!pinned) (window.ccReveal ? ccReveal(player, {block:'nearest', smooth:false}) : player.scrollIntoView({block:'nearest'}));
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
    slot.style.minHeight = '';
    prior?.setAttribute('aria-pressed','false');
    picker.value='';
    document.querySelector('#coverage-link').focus({preventScroll:true});
  });
  // ---- Live check ---------------------------------------------------------------------
  // Each channel's live status is checked from the viewer's own browser: a hidden, muted
  // YouTube player loads the channel's live_stream embed, which resolves to whatever that
  // channel is broadcasting right now. If it starts playing as a live stream, the channel
  // is LIVE (and we learn the current video ID, so restarted 24/7 streams keep working).
  // No stream, embedding blocked, or an ended/scheduled video means OFF AIR. No server or
  // GitHub job is needed; the build-time list in index.html is only the starting guess.
  const CHECK_EVERY=10*60e3, CACHE_KEY='vcc-live-check';
  const canCheck=location.protocol!=='file:' && window.top===window && !navigator.connection?.saveData && channelChoices.length>0;
  let checking=false, lastCheck=0, autoplayWorks=false;
  function channelLink(choice) {
    const link=choice.nextElementSibling;
    if (link) link.href=playable(choice)?'https://www.youtube.com/watch?v='+choice.dataset.video:'https://www.youtube.com/channel/'+choice.dataset.channel+'/live';
  }
  function applyCheck(choice,result,at=Date.now()) {
    if (!result || choice===active) return;
    if (result.live) {
      choice.dataset.video=result.video;
      choice.dataset.liveUntil=new Date(at+CHECK_EVERY*3).toISOString();
      choice.disabled=false;
      channelLink(choice);
      if (choice.dataset.kind!=='LIVE') updateKind(choice,'LIVE',liveList);
    } else {
      if (choice.dataset.video) choice.dataset.lastVideo=choice.dataset.video;
      choice.dataset.video='';
      choice.disabled=true;
      channelLink(choice);
      if (choice.dataset.kind!=='OFF') updateKind(choice,'OFF',offList);
    }
  }
  // Load one embed in a hidden muted player. `path` is a video ID or 'live_stream?channel=…'.
  // Resolves {live:true,video}, {live:false} when it's definitely not live here, or null.
  function probe(path) {
    return new Promise(resolve=>{
      loadPlayerAPI().then(api=>{
        const host=document.createElement('div');
        host.className='live-probe';
        host.setAttribute('aria-hidden','true');
        const frame=document.createElement('iframe');
        const url=new URL('https://www.youtube-nocookie.com/embed/'+path);
        for (const [key,value] of Object.entries({autoplay:'0',mute:'1',playsinline:'1',controls:'0',enablejsapi:'1',origin:location.origin})) url.searchParams.set(key,value);
        frame.src=url.href;
        frame.allow='autoplay; encrypted-media';
        frame.tabIndex=-1;
        frame.title='Live check';
        host.append(frame);
        document.body.append(host);
        let player, done=false;
        const data=()=>{ try { return player.getVideoData()||{}; } catch { return {}; } };
        const finish=result=>{
          if (done) return;
          done=true; clearTimeout(timer);
          try { player?.destroy(); } catch {}
          host.remove();
          resolve(result);
        };
        const timer=setTimeout(()=>{
          // it resolved to a video but never started: a scheduled stream if this browser
          // autoplays muted video (other channels proved it), otherwise we can't tell yet
          const info=data();
          if (!info.video_id) finish(null);
          else if (autoplayWorks) finish({live:false,video:info.video_id});
          else finish({live:true,video:info.video_id,soft:true});
        },12000);
        player=new api.Player(frame,{events:{
          onReady() {
            setTimeout(()=>{
              if (done) return;
              const info=data();
              let length=0;
              try { length=player.getDuration(); } catch {}
              if (!info.video_id) return finish({live:false});
              if (length>0) return finish({live:false,video:info.video_id}); // an ended stream
              try { player.mute(); player.playVideo(); } catch { finish(null); }
            },700);
          },
          onStateChange(event) {
            if (event.data!==1) return;
            const info=data();
            if (info.isLive) autoplayWorks=true;
            finish({live:info.isLive!==false,video:info.video_id});
          },
          onError(event) {
            // 2/100: no such video, 101/150: no live stream or embedding switched off
            finish([2,100,101,150].includes(event.data)?{live:false}:null);
          }
        }});
      },()=>resolve(null));
    });
  }
  // The stream we already know is the fastest check. If that's over, ask for the channel's
  // current live stream (this also finds a 24/7 stream that restarted under a new ID).
  // Some channels refuse the live_stream lookup, so the known-ID check comes first.
  async function checkChannel(choice) {
    const known=choice.dataset.video||choice.dataset.lastVideo;
    const first=known?await probe(known):null;
    if (first?.live) return {...first,video:first.video||known};
    const second=await probe('live_stream?channel='+encodeURIComponent(choice.dataset.channel));
    if (second?.live) return second;
    return first||second;
  }
  function updateLineupNote() {
    const live=channelChoices.filter(choice=>choice.dataset.kind==='LIVE').length;
    const off=offList?offList.children.length:0;
    const count=desk.querySelector('#offair-count');
    if (count) count.textContent=String(off);
    const section=desk.querySelector('#offair-section');
    if (section) section.hidden=!off;
    if (!liveNote) return;
    if (checking) liveNote.textContent=`${live} of ${channelChoices.length} channels live so far. Checking each one with YouTube…`;
    else if (lastCheck) liveNote.textContent=`${live} of ${channelChoices.length} channels live, checked ${new Date(lastCheck).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}. Rechecks every 10 minutes.`;
  }
  function saveCheck() {
    const channels={};
    for (const choice of channelChoices) if (choice.dataset.kind==='LIVE'||choice.dataset.kind==='OFF') channels[choice.dataset.channel]={live:choice.dataset.kind==='LIVE',video:choice.dataset.video||choice.dataset.lastVideo||''};
    try { localStorage.setItem(CACHE_KEY,JSON.stringify({at:lastCheck,channels})); } catch {}
  }
  function restoreCheck() {
    try {
      const saved=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if (!saved || Date.now()-saved.at>CHECK_EVERY) return;
      for (const choice of channelChoices) {
        const result=saved.channels[choice.dataset.channel];
        if (!result || (result.live && !/^[\w-]{11}$/.test(result.video))) continue;
        if (!result.live && result.video) choice.dataset.video=result.video;
        applyCheck(choice,result,saved.at);
      }
      lastCheck=saved.at;
    } catch {}
  }
  async function checkChannels() {
    if (!canCheck || checking || document.hidden) return;
    checking=true;
    updateLineupNote();
    const queue=channelChoices.filter(choice=>choice!==active);
    const lanes=Math.min(navigator.hardwareConcurrency>4?3:2,queue.length);
    await Promise.all(Array.from({length:lanes},async()=>{
      while (queue.length) {
        const choice=queue.shift();
        applyCheck(choice,await checkChannel(choice));
      }
    }));
    checking=false;
    lastCheck=Date.now();
    saveCheck();
    expireLiveLabels();
  }
  async function recheckActive() {
    const choice=active;
    const result=await checkChannel(choice);
    if (choice!==active) return;
    if (result?.live && result.video!==choice.dataset.video) {
      choice.dataset.video=result.video;
      channelLink(choice);
      open.href=choice.nextElementSibling.href;
      picker.value='';
      refreshPicker();
      retried=false;
      mountBroadcast(choice,selectionMuted);
    } else if (result && !result.live) {
      active=null;
      applyCheck(choice,result);
      active=choice;
      kind.textContent=BADGES.OFF;
      setPlayback('ended','Off air now · choose a channel');
    } else if (status.dataset.playback!=='playing') {
      setPlayback('error','Playback unavailable');
      retry.hidden=false;
    }
  }
  window.checkLiveChannels=()=>{ lastCheck=0; return checkChannels(); };

  liveList.append(...channelChoices.filter(choice=>choice.dataset.kind==='LIVE').map(choice=>choice.closest('.station')));
  if (canCheck) restoreCheck();
  buildPicker();
  expireLiveLabels();
  setInterval(()=>{
    expireLiveLabels();
    if (Date.now()-lastCheck>=CHECK_EVERY) checkChannels();
  },60000);
  document.addEventListener('visibilitychange',()=>{ if (!document.hidden && Date.now()-lastCheck>=CHECK_EVERY) setTimeout(checkChannels,1500); });
  play(latestLive(),true);
  // let the main player start first, then check every channel
  if (canCheck && Date.now()-lastCheck>=CHECK_EVERY) setTimeout(checkChannels,2500);
}
