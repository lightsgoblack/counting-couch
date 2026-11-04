'use strict';
const $ = (selector) => document.querySelector(selector);
const offices = {Senate: 'U.S. Senate', House: 'U.S. House', Governor: 'Governors'};
const senateSeats = 'AK AL AR CO DE FL GA IA ID IL KS KY LA MA ME MI MN MS MT NC NE NH NJ NM OH OK OR RI SC SD TN TX VA WV WY'.split(' ');
const officialLinks = {CA:'https://electionresults.sos.ca.gov/',AR:'https://sos.arkansas.gov/elections/research/election-results', FL:'https://floridaelectionwatch.gov/', GA:'https://sos.ga.gov/page/election-results', NC:'https://er.ncsbe.gov/', MI:'https://www.michigan.gov/sos/elections/election-results-and-data', OH:'https://www.ohiosos.gov/elections/election-results-and-data/', PA:'https://www.electionreturns.pa.gov/', TX:'https://electionresults.sos.state.tx.us/results.html'};
const params = new URLSearchParams(location.search);
const preferredOffice = params.get('office');
let office = Object.hasOwn(offices, preferredOffice) ? preferredOffice : 'Senate';
let state = Object.hasOwn(stateNames, params.get('state')) ? params.get('state') : '';
let seat = /^[A-Z]{2}(?:-\d{2}|-special)?$/.test(params.get('race') ?? '') ? params.get('race') : '';
if (seat && !state) state = seat.slice(0,2);
let overhead = params.get('view') === '2d' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const homeCamera={pitch:.64,yaw:-.17,zoom:1.12};
let {pitch,yaw,zoom}=homeCamera;
let timer, toastTimer, pointer, frame, nextCheckAt=0, lastCheckAt=0, renderedDetailKey, spotlightIndex=0;
const changedStates=new Map();
const feeds = new Map();
let failures=0, fetchJob;
const nf = new Intl.NumberFormat('en-US');
const stamp = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const formatTime = (value) => value && Number.isFinite(Date.parse(value)) ? stamp.format(new Date(value)) : '';
const pct = (value) => Number.isFinite(value) ? value.toFixed(1) + '%' : '—';
const hasVotes = (race) => Boolean(race && race.total > 0);
const partyName = (code) => ({D:'Democratic',R:'Republican',I:'Independent',L:'Libertarian',G:'Green',C:'Constitution',W:'Working Families',O:'Other'})[code] ?? (code || 'Unspecified party');
const tone = (code) => code === 'D' ? 'dem' : code === 'R' ? 'rep' : code ? 'other' : 'none';
const raceParty = (race) => !hasVotes(race) || !race.cands?.[0]?.v || race.cands[0].v === race.cands[1]?.v ? '' : race.leader;
const titles = (key,kind=office) => {
  const [code,suffix] = key.split('-'), name = stateNames[code] ?? code;
  if (kind === 'House') return name + (suffix === '00' ? ' · At-large' : ' · District ' + Number(suffix));
  if (kind === 'Senate' && (suffix === 'special' || code === 'FL' || code === 'OH')) return name + ' · Special election';
  return name;
};
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const svg = (tag, attrs) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
  return el;
};
const select = $('#state');
for (const [code,name] of Object.entries(stateNames).sort((a,b) => a[1].localeCompare(b[1]))) select.append(new Option(name,code));
const atlas = $('#atlas');
const land = $('#land'), labels = $('#labels'), grid = $('#grid');
const mapTone = (name,fallback) => window.themeColor?.(name) || fallback;
const colors = {};
function readMapColors() {
  const fallback = {dem:['#527eaa','#27415b'],rep:['#a75f60','#563537'],other:['#a89058','#504534'],none:['#495b45','#263726']};
  for (const [kind,[top,low]] of Object.entries(fallback)) colors[kind]=[mapTone("map-"+kind,top),mapTone("map-"+kind+"-low",low)];
  colors.grid=mapTone('map-grid','#97b486');colors.edge=mapTone('map-edge','#8fa58b');colors.edgeActive=mapTone('map-edge-active','#e2ffaa');
  colors.label=mapTone('map-label','#f1f2e5');colors.labelActive=mapTone('map-label-active','#e2ffaa');colors.halo=mapTone('map-label-halo','#101710');
}
readMapColors();
document.addEventListener('themechange',()=>{readMapColors();drawMap();});
let geometry = [];
function area(ring) {
  return Math.abs(ring.reduce((total,[x,y],i) => {
    const [u,v] = ring[(i+1)%ring.length];
    return total+x*v-y*u;
  },0))/2;
}
function centroid(ring) {
  let sum=0,x=0,y=0;
  for(let i=0;i<ring.length;i++){
    const [a,b]=ring[i], [c,d]=ring[(i+1)%ring.length], cross=a*d-c*b;
    sum+=cross; x+=(a+c)*cross; y+=(b+d)*cross;
  }
  return sum ? [x/(3*sum),y/(3*sum)] : ring[0];
}
function project([x,y],z=0) {
  x=(x-480)*.79; y=(y-310)*.79;
  if (overhead) return [482+x*zoom,267+y*zoom];
  const u=x*Math.cos(yaw)-y*Math.sin(yaw);
  const v=x*Math.sin(yaw)+y*Math.cos(yaw);
  const perspective=1+(v*Math.sin(pitch)+z*Math.cos(pitch))/1450;
  return [492+u*perspective*zoom,250+(v*Math.cos(pitch)-z*Math.sin(pitch))*perspective*zoom];
}
function path(rings,z) {
  return rings.flatMap(polygon => polygon.map(ring => ring.map((pt,i) => {
    const [x,y]=project(pt,z);
    return (i?'L':'M')+x.toFixed(1)+','+y.toFixed(1);
  }).join('')+'Z')).join('');
}
function coverage() {
  const data=feeds.get(office)?.races ?? {};
  const grouped = new Map();
  for (const [key,race] of Object.entries(data)) {
    const code=key.slice(0,2);
    if(!hasVotes(race)) continue;
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code).push(race);
  }
  return grouped;
}
function mapMetric(races=[]) {
  const counts={dem:0,rep:0,other:0,none:0};
  for(const race of races) counts[tone(raceParty(race))]++;
  const ordered=Object.entries(counts).filter(([key])=>key!=='none').sort((a,b)=>b[1]-a[1]);
  const type=ordered[0][1] > ordered[1][1] ? ordered[0][0] : 'none';
  const first=races[0]?.cands?.[0]?.pct, second=races[0]?.cands?.[1]?.pct;
  const relief=office==='House' ? Math.min(27,races.length*1.15) : Number.isFinite(first) && Number.isFinite(second) ? Math.min(28,Math.abs(first-second)*1.55) : 0;
  return {type,relief};
}
function drawMap() {
  if(!geometry.length) return;
  const byState=coverage(), gridItems=[];
  for (let x=-50;x<=1030;x+=60) {
    const a=project([x,12],-13), b=project([x,642],-13);
    gridItems.push(svg('path',{d:'M'+a+'L'+b,stroke:colors.grid,opacity:'.19','stroke-width':'.65'}));
  }
  for (let y=12;y<=642;y+=45) {
    const a=project([-50,y],-13), b=project([1030,y],-13);
    gridItems.push(svg('path',{d:'M'+a+'L'+b,stroke:colors.grid,opacity:'.19','stroke-width':'.65'}));
  }
  grid.replaceChildren(...gridItems);
  const sorted = geometry.map(g=>({...g,y:project(g.center)[1]})).sort((a,b)=>a.y-b.y);
  const selected=[];
  const features=sorted.map(g=>{
    const active=g.code===state, metric=mapMetric(byState.get(g.code));
    const [top,edge]=colors[metric.type];
    const height=overhead ? 0 : 11+metric.relief+(active?13:0);
    const group=svg('g',{'data-code':g.code});
    if ((changedStates.get(office)?.get(g.code) ?? 0)>Date.now()) group.classList.add('new-returns');
    if (!overhead) {
      for(let z=0;z<height;z+=4) group.append(svg('path',{d:path(g.rings,z),fill:edge,stroke:edge,'stroke-width':2,'fill-rule':'evenodd'}));
    }
    group.append(svg('path',{d:path(g.rings,height),fill:top,stroke:active?colors.edgeActive:colors.edge,'stroke-width':active?2:.7,'fill-rule':'evenodd','vector-effect':'non-scaling-stroke'}));
    const description=svg('title',{});
    description.textContent=stateNames[g.code] + ' · ' + (byState.get(g.code)?.length ?? 0) + ' races with votes';
    group.append(description);
    const [x,y]=project(g.center,height);
    if (g.area>3500 || active) {
      const label=svg('text',{x,y,fill:active?colors.labelActive:colors.label,'font-size':active?15:12,'font-family':(window.themeColor?.('mono')||'monospace'),'font-weight':active?700:500,'text-anchor':'middle','dominant-baseline':'middle','pointer-events':'none','paint-order':'stroke','stroke-width':2,stroke:colors.halo});
      label.textContent=g.code;
      selected.push(label);
    }
    return group;
  });
  land.replaceChildren(...features); labels.replaceChildren(...selected);
}
function queueMap() {cancelAnimationFrame(frame);frame=requestAnimationFrame(drawMap);}
function renderTVResults() {
  const totals=$('#tv-race-totals'), recent=$('#tv-recent-calls');
  const focused=document.activeElement?.dataset.tvRace;
  const calls=[];
  totals.replaceChildren(...Object.keys(offices).map(kind=>{
    const feed=feeds.get(kind);
    const counts={D:0,R:0,other:0};
    for (const [key,race] of Object.entries(feed?.races ?? {})) {
      if (!race.call?.length) continue;
      const party=race.cands.find(candidate=>candidate.n===race.call[0])?.p;
      counts[party==='D'||party==='R'?party:'other']++;
      if (race.callTime) calls.push({kind,key,race,party});
    }
    const card=node('div',null,'tv-race-stat');
    card.append(node('strong',offices[kind]),node('b',feed?Object.values(counts).reduce((a,b)=>a+b,0)+' / '+Object.keys(feed.races).length+' called':'Awaiting feed'));
    const breakdown=node('div',null,'tv-party-count');
    if (feed) {
      breakdown.append(node('span',counts.D+' D','dem'),node('span',counts.R+' R','rep'));
      if (counts.other) breakdown.append(node('span',counts.other+' other','other'));
    }
    card.append(breakdown);
    return card;
  }));
  calls.sort((a,b)=>Date.parse(b.race.callTime)-Date.parse(a.race.callTime));
  recent.replaceChildren(...calls.slice(0,3).map(({kind,key,race,party})=>{
    const row=node('button',null,'tv-call '+tone(party));
    row.type='button';row.dataset.tvRace=kind+':'+key;row.dataset.office=kind;row.dataset.race=key;
    row.append(node('strong',race.call.join(', ')),node('span',titles(key,kind)+' · '+offices[kind]),node('small',formatTime(race.callTime)));
    return row;
  }));
  if (!calls.length) recent.append(node('p','Waiting for race calls.','hint'));
  if (focused) [...recent.children].find(item=>item.dataset.tvRace===focused)?.focus({preventScroll:true});
}
function renderRecap() {
  const root=$('#election-recap');
  const focused=root.contains(document.activeElement) ? document.activeElement.dataset.tvRace : '';
  const controls=[], flips=[], watch=[];
  let total=0, called=0, noVotes=0, coverage=0;
  for (const kind of Object.keys(offices)) {
    const feed=feeds.get(kind);
    const control=feed?.tally?.control;
    if (kind!=='Governor' && control && Number.isFinite(control.dem) && Number.isFinite(control.rep)) {
      const card=node('div',null,'recap-control-card');
      const parties=node('b');
      parties.append(node('span',control.dem+' D','dem'),document.createTextNode(' / '),node('span',control.rep+' R','rep'));
      const majority=feed.tally.majorityGroup;
      card.append(node('strong',kind),parties);
      if (majority==='dem' || majority==='rep') card.append(node('small',(majority==='dem'?'D':'R')+' majority',majority));
      controls.push(card);
    }
    for (const [key,race] of Object.entries(feed?.races ?? {})) {
      total++;
      const previous=priorParty[kind][key];
      if (previous) coverage++;
      if (race.call?.length) {
        called++;
        const winner=race.cands.find(candidate=>candidate.n===race.call[0]);
        if (race.call.length===1 && previous && (winner?.p==='D'||winner?.p==='R') && winner.p!==previous) {
          flips.push({kind,key,party:winner.p,name:winner.n,previous,time:Date.parse(race.callTime)||0});
        }
        continue;
      }
      if (!hasVotes(race)) noVotes++;
      const [first,second]=race.cands ?? [];
      if (race.total>=1000 && second?.v>0) watch.push({
        kind,key,party:first.v===second.v?'':first.p,name:first.n,margin:100*(first.v-second.v)/race.total,total:race.total
      });
    }
  }
  const signature=JSON.stringify([total,called,noVotes,coverage,controls.map(card=>card.textContent),flips,watch]);
  if (root.dataset.signature===signature) return;
  root.dataset.signature=signature;
  $('#recap-called').textContent=total ? called+' / '+total+' called' : 'Awaiting returns';
  $('#recap-control').replaceChildren(...controls);
  flips.sort((a,b)=>b.time-a.time || a.key.localeCompare(b.key));
  watch.sort((a,b)=>a.margin-b.margin || b.total-a.total);
  const d=flips.filter(race=>race.party==='D').length;
  const r=flips.length-d;
  const gain=node('b');
  gain.append(node('span',d+' D','dem'),document.createTextNode(' / '),node('span',r+' R','rep'));
  $('#recap-flip-count').replaceChildren(node('strong','Flips'),coverage&&called?gain:node('b','—'));
  const raceButton=({kind,key,name,margin,previous,party},compact=false)=>{
    const button=node('button',null,'recap-race '+tone(party));
    button.type='button';button.dataset.tvRace=kind+':'+key;button.dataset.office=kind;button.dataset.race=key;
    const label=compact ? (kind==='House'?key.replace('-00','-AL'):key+' '+kind) : titles(key,kind)+' · '+kind;
    const metric=previous ? previous+' → '+party : margin===0 ? 'Tied' : margin<.1 ? '<0.1 pts' : margin.toFixed(1)+' pts';
    button.setAttribute('aria-label',label+' · '+name+' · '+metric);
    button.append(node('strong',label),node('b',metric));
    if (!compact) button.append(node('span',name));
    return button;
  };
  $('#recap-watch').replaceChildren(...(watch.length ? watch.slice(0,3).map(race=>raceButton(race,true)) :
    [node('span',total&&called===total?'All covered races called':'Waiting for close races','hint')]));
  const drawer=$('#recap-drawer');
  drawer.replaceChildren(node('p',total ? (total-called)+' uncalled · '+noVotes+' without reported votes · '+flips.length+' D/R flips'+(flips.length?' · '+(d===r?'Even on flips':(d>r?'D':'R')+' net +'+Math.abs(d-r)):'') : 'Awaiting the national feed.','recap-drawer-stats'));
  const columns=node('div',null,'recap-columns');
  for (const [heading,rows,empty] of [
    ['Closest uncalled races',watch,'No uncalled races have enough reported votes to rank.'],
    ['Called flips',flips,'No party flips have been recorded in the current feed.']
  ]) {
    const group=node('section');
    group.append(node('h3',heading));
    const list=node('div',null,'recap-race-list');
    list.append(...(rows.length ? rows.map(race=>raceButton(race)) : [node('p',empty,'hint')]));
    group.append(list);columns.append(group);
  }
  drawer.append(columns);
  if (focused) [...root.querySelectorAll('[data-tv-race]')].find(button=>button.dataset.tvRace===focused && button.getClientRects().length)?.focus({preventScroll:true});
}
function renderStatus() {
  const feed=feeds.get(office), error=failures>0;
  const signal=$('#signal'), time=formatTime(feed?.as_of);
  const races=Object.values(feed?.races ?? {}).filter(hasVotes).length;
  const status=error ? (feed?'OFFLINE SNAPSHOT':'FEED UNAVAILABLE') : !feed?'CONNECTING' : feed.stale?'FEED DELAYED' : feed.live?'LIVE RETURNS' : feed.counting?'RETURNS AVAILABLE':'AWAITING RETURNS';
  if (signal.dataset.label !== status) {
    signal.dataset.label=status;
    signal.replaceChildren(node('i'),document.createTextNode(status));
  }
  signal.dataset.live=String(status==='LIVE RETURNS');
  $('#race-count').textContent=feed?nf.format(races):'—';
  $('#state-count').textContent=feed?nf.format(Object.keys(feed.races).length):'—';
  $('#timestamp').textContent=time?(error?'Live feed unreachable · showing snapshot from '+time:'National feed checked · '+time) : error?'The feed could not be reached.':'Waiting for a timestamped state update.';
  const activeStates=coverage();
  const matrix=$('#matrix'), oldCode=document.activeElement?.dataset.signalCode;
  matrix.replaceChildren(...[...activeStates].sort(([a],[b])=>a.localeCompare(b)).map(([code,items])=>{
    const button=node('button',code,mapMetric(items).type);
    button.type='button';button.dataset.signalCode=code;
    button.setAttribute('aria-label',stateNames[code]+' · '+items.length+(items.length===1?' race with votes':' races with votes'));
    button.setAttribute('aria-pressed',String(state===code));
    return button;
  }));
  if (!activeStates.size) matrix.append(node('span','Awaiting vote totals','hint'));
  if (oldCode) [...matrix.children].find(el=>el.dataset.signalCode===oldCode)?.focus({preventScroll:true});
  $('#list-caption').textContent=office.toUpperCase()+' RACES'+(time?' · '+time:'');
  renderTVResults();renderRecap();
}
function raceEntries() {
  const data=feeds.get(office)?.races ?? {};
  const keys=new Set([...Object.keys(data).filter(key => stateNames[key.slice(0,2)]),...(office==='Senate'?senateSeats:[])]);
  for (const code of ['FL','OH']) if (keys.has(code+'-special') && !Object.hasOwn(data,code)) keys.delete(code);
  return [...keys].map(key=>[key,data[key]]);
}
function visibleRaces() {
  const query=$('#race-search').value.trim().toLowerCase();
  return raceEntries().filter(([key,race]) => (!state || key.startsWith(state)) &&
    [key,titles(key),...((race?.cands ?? []).map(c=>c.n))].some(value=>value.toLowerCase().includes(query)))
    .sort((a,b)=>Number(hasVotes(b[1]))-Number(hasVotes(a[1])) || titles(a[0]).localeCompare(titles(b[0]),undefined,{numeric:true}));
}
function renderRaces() {
  const list=$('#race-list'), focused=document.activeElement?.dataset.key, scroll=list.scrollTop;
  const entries=visibleRaces();
  list.replaceChildren(...entries.map(([key,race])=>{
    const btn=node('button',null,'race');
    btn.type='button'; btn.dataset.key=key; btn.setAttribute('aria-pressed',String(seat===key));
    const summary=node('span'), lead=raceParty(race);
    summary.append(node('strong',titles(key)),node('small',lead?race.cands[0].n+' · Leading':hasVotes(race)?'Reported count · tied or no party lead':race?'Awaiting reported votes':'No votes in this feed'));
    btn.append(summary,node('span',lead?pct(race.cands[0].pct):'—','count '+tone(lead)));
    return btn;
  }));
  if(!entries.length) list.append(node('p',state ? 'No matching '+office.toLowerCase()+' races in the current feed for '+stateNames[state]+'.' : 'No matching races in the current feed.','empty'));
  list.scrollTop=scroll;
  if (focused) [...list.children].find(el=>el.dataset.key===focused)?.focus({preventScroll:true});
}
function restartMotion(element,className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}
function spotlitRace(races) {
  const entries=Object.entries(races).filter(([,race])=>hasVotes(race));
  const close=entries.filter(([,race])=>!race.call?.length && Number.isFinite(race.cands[1]?.pct) && Number.isFinite(race.cands[0]?.pct))
    .sort(([,a],[,b])=>Math.abs(a.cands[0].pct-a.cands[1].pct)-Math.abs(b.cands[0].pct-b.cands[1].pct)).slice(0,3);
  const called=entries.filter(([,race])=>race.call?.length && race.callTime)
    .sort(([,a],[,b])=>Date.parse(b.callTime)-Date.parse(a.callTime)).slice(0,3);
  const rotation=[...close,...called];
  return rotation.length?rotation[spotlightIndex%rotation.length][0]:'';
}
function renderDetail() {
  const detail=$('#detail'), races=feeds.get(office)?.races ?? {};
  const featured=!state&&!seat&&document.body.classList.contains('tv-mode')&&matchMedia('(min-width: 760px)').matches?spotlitRace(races):'';
  const selected=seat||featured;
  const key=office+'|'+state+'|'+selected;
  const race=races[selected];
  const loading=!feeds.has(office)&&!failures;
  const title=node('h3',selected?titles(selected):state?stateNames[state]:'Inspect a race');
  title.id='detail-title';
  if (key !== renderedDetailKey) {
    restartMotion(detail,'detail-reveal');
    renderedDetailKey=key;
  } else detail.classList.remove('detail-reveal');
  detail.replaceChildren(node('div',featured?'RACE SPOTLIGHT / '+offices[office].toUpperCase():offices[office].toUpperCase()+' / RACE DETAIL','micro'),title);
  const countyState=(selected||state).slice(0,2);
  if(countyState && typeof CountyMap!=='undefined') detail.append(CountyMap.button(countyState));
  if(!hasVotes(race) && !race?.cands?.length){
    detail.append(node('p',seat||state?loading?'Connecting to the election results feed.':'This feed has no vote totals for this selection. Check the election office for its latest information.':'Tap a state on the map or select a race to see the reported vote totals and margins.','hint'));
    if(state) {
      const link=node('a',officialLinks[state]?'State election office':'Find the state election office');
      link.href=officialLinks[state] ?? 'https://www.usa.gov/state-election-office';
      detail.append(link);
    }
    return;
  }
  const meta=node('div',null,'detail-meta');
  const updated=formatTime(race.as_of);
  meta.append(node('span',hasVotes(race)?nf.format(race.total)+' votes reported':'Awaiting reported votes'));
  if (race.call?.length) {
    const callTime=formatTime(race.callTime);
    detail.append(node('p','Called by civicAPI · '+race.call.join(', ')+(callTime?' · '+callTime:''),'hint'));
  }
  if(Number.isFinite(race.pct_in)) meta.append(node('span',pct(race.pct_in)+' reporting units'));
  if(updated) meta.append(node('span','Updated '+updated));
  detail.append(meta);
  for(const candidate of featured?race.cands.slice(0,2):race.cands) {
    const line=node('div',null,'candidate '+tone(candidate.p));
    const text=node('div',null,'candtext'), name=node('span');
    name.append(document.createTextNode(candidate.n+' '),node('small',candidate.party || partyName(candidate.p)));
    text.append(name,node('strong',pct(candidate.pct)));
    const track=node('div',null,'track'), fill=node('span');
    track.setAttribute('aria-hidden','true');fill.style.width=Math.min(100,Math.max(0,candidate.pct ?? 0))+'%';track.append(fill);
    line.append(text,track,node('div',nf.format(candidate.v)+' votes','hint')); detail.append(line);
  }
  const [a,b]=race.cands;
  if (hasVotes(race) && Number.isFinite(a?.pct) && Number.isFinite(b?.pct)) detail.append(node('p','Reported margin · '+Math.abs(a.pct-b.pct).toFixed(2)+' percentage points.','hint'));
  const source=officialLinks[selected.slice(0,2)];
  if(source && !featured){
    const link=node('a','Official state results ↗');
    link.href=source;detail.append(link);
  }
}
function render() {
  for(const btn of document.querySelectorAll('.mode')) btn.setAttribute('aria-pressed',String(btn.dataset.office===office));
  $('#map-title').textContent=offices[office];
  $('#view').textContent=overhead?'2D':'3D';$('#view').setAttribute('aria-pressed',String(overhead));
  $('#zoom-in').disabled=zoom>=1.45;
  $('#zoom-out').disabled=zoom<=.75;
  $('.maptip').textContent=overhead?'TAP A STATE':'DRAG TO TILT · TAP A STATE';
  $('.legend').title=office==='House'?'Map color shows which party leads the most reported districts in each state. Relief shows districts with votes.':'Map color shows the reported vote leader. Relief shows the reported margin.';
  $('#map-key').textContent=office==='House'?'Color shows which party leads the most reported districts. Height shows how many districts have returns.':'Color shows the reported leader. Height shows the vote margin.';
  select.value=state;
  renderStatus();renderRaces();renderDetail();queueMap();
}
function viewURL() {
  const url=new URL(location.href);
  url.searchParams.set('office',office);
  for (const [key,value] of [['state',state],['race',seat],['view',overhead?'2d':'']]) {
    if(value) url.searchParams.set(key,value);else url.searchParams.delete(key);
  }
  return url;
}
function updateURL() {if (location.protocol !== 'file:') history.replaceState(null,'',viewURL());}
function changeZoom(delta) {
  zoom=Math.min(1.45,Math.max(.75,zoom+delta));
  $('#zoom-in').disabled=zoom>=1.45;
  $('#zoom-out').disabled=zoom<=.75;
  queueMap();
}
function selectState(code,scroll=false){
  state=code;seat='';$('#race-search').value='';
  const races=visibleRaces();
  if (code && races.length===1) seat=races[0][0];
  updateURL();render();
  if(scroll) $('.explore').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
const trackDemocraticCalls=democraticCallTracker();
const celebrationQueue=[];
const celebration=$('#call-celebration');
let celebrating=false;
function celebrateNextCall() {
  const result=celebrationQueue.shift();
  if (!result) {celebrating=false;return;}
  celebrating=true;
  const isTV=document.body.classList.contains('tv-mode')&&matchMedia('(min-width: 760px)').matches;
  const duration=isTV?7000:5500;
  celebration.style.setProperty('--call-duration',duration+'ms');
  const race=titles(result.raceId,result.office);
  const officeLabel=result.office==='Governor'?'Governor':offices[result.office];
  $('#call-winner').textContent=result.name;
  $('#call-race').textContent=race+' · '+officeLabel+' · Called by civicAPI';
  $('#call-announcer').textContent=result.name+' wins '+race+' '+officeLabel+', called by civicAPI.';
  celebration.hidden=false;
  restartMotion(celebration,'call-arrives');
  const stopBurst=matchMedia('(prefers-reduced-motion: reduce)').matches
    ? null : playCouchBurst($('#call-confetti'),duration,isTV);
  setTimeout(()=>{
    stopBurst?.();
    celebration.hidden=true;
    celebrateNextCall();
  },duration);
}
function queueRaceCalls(national) {
  celebrationQueue.push(...trackDemocraticCalls(national));
  if (!celebrating && celebrationQueue.length) celebrateNextCall();
}
function showNextCheck() {
  const period=nextCheckAt-lastCheckAt;
  const progress=period>0?Math.min(1,Math.max(0,(Date.now()-lastCheckAt)/period)):0;
  $('#update-meter').style.setProperty('--update-progress',String(progress));
  const wait=Math.max(0,Math.ceil((nextCheckAt-Date.now())/1000));
  $('#next-check').textContent=fetchJob?'Checking for updates…':wait?'Next check in '+(wait>90?Math.ceil(wait/60)+' min':wait+' sec'):'';
}
async function refresh(force=false) {
  if (fetchJob) return fetchJob;
  fetchJob=(async()=>{
    try {
      const response=await fetch('https://sitmap.live/api/elections/us-2026.json',{credentials:'omit',cache:force?'reload':'default',signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error('HTTP '+response.status);
      const national=normalizeNational(await response.json());
      for (const [kind,data] of Object.entries(national)) {
        const before=feeds.get(kind);
        if (before) {
          const changes=new Map();
          for (const [key,race] of Object.entries(data.races)) {
            const old=before.races[key];
            if (hasVotes(race) && (race.total!==old?.total || race.call?.join()!==old?.call?.join())) changes.set(key.slice(0,2),Date.now()+2400);
          }
          if (changes.size) {
            changedStates.set(kind,changes);
            if (kind===office) {
              restartMotion($('.brief'),'data-arrival');
              restartMotion($('.mapbox'),'live-sweep');
              restartMotion($('#tv-live'),'live-totals');
              restartMotion($('#election-recap'),'live-totals');
            }
          }
        }
        feeds.set(kind,data);
      }
      queueRaceCalls(national);
      failures=0;
    } catch (error) {
      console.warn('[Vote-Casting Couch] National feed unavailable, using snapshot:', error?.message ?? error);
      failures++;
      await Promise.all(Object.keys(offices).filter(kind=>!feeds.has(kind)).map(async kind=>{
        try {
          const response=await fetch('snapshot-'+kind.toLowerCase()+'.json');
          if(response.ok) feeds.set(kind,await response.json());
        } catch {}
      }));
    } finally {
      fetchJob=null;
      if (state && !seat) {
        const matches=visibleRaces();
        if (matches.length===1) {seat=matches[0][0];updateURL();}
      }
      render();
      clearTimeout(timer);
      const wait=failures?Math.min(600,30*2**Math.min(failures,5)):Math.min(3600,Math.max(60,feeds.get(office)?.interval ?? 60));
      lastCheckAt=Date.now();
      nextCheckAt=lastCheckAt+wait*1000;
      timer=setTimeout(refresh,wait*1000);
      showNextCheck();
    }
  })();
  showNextCheck();
  return fetchJob;
}
$('.modes').addEventListener('click',event=>{
  const btn=event.target.closest('button[data-office]');
  if(!btn || btn.dataset.office===office) return;
  office=btn.dataset.office;seat='';selectState(state);restartMotion($('.mapbox'),'mode-shift');
});
$('#view').addEventListener('click',()=>{overhead=!overhead;updateURL();render();});
$('#zoom-in').addEventListener('click',()=>changeZoom(.15));
$('#zoom-out').addEventListener('click',()=>changeZoom(-.15));
$('#matrix').addEventListener('click',event=>{
  const button=event.target.closest('[data-signal-code]');
  if(button) selectState(button.dataset.signalCode,true);
});
$('#reset').addEventListener('click',()=>{({pitch,yaw,zoom}=homeCamera);selectState('');});
$('#state').addEventListener('change',()=>selectState(select.value));
$('#race-search').addEventListener('input',renderRaces);
$('#refresh').addEventListener('click',async()=>{const button=$('#refresh');button.disabled=true;await refresh(true);button.disabled=false;});
function openRecapRace(event) {
  const button=event.target.closest('[data-tv-race]');
  if(!button) return;
  office=button.dataset.office;
  seat=button.dataset.race;
  state=seat.slice(0,2);
  $('#race-search').value='';
  updateURL();render();
  if (event.currentTarget.id==='election-recap') $('.recap-details').open=false;
  $('#detail').focus();
}
$('#tv-recent-calls').addEventListener('click',openRecapRace);
$('#election-recap').addEventListener('click',openRecapRace);
$('#close-recap').addEventListener('click',()=>{
  $('.recap-details').open=false;
  $('.recap-details summary').focus();
});
$('#race-list').addEventListener('click',event=>{
  const btn=event.target.closest('button[data-key]');
  if(!btn) return;
  seat=btn.dataset.key; updateURL();render();
  if (matchMedia('(max-width: 740px)').matches) $('#detail').focus();
});
atlas.addEventListener('pointerdown',event=>{
  if(event.button!==0) return;
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY,yaw,pitch,code:event.target.closest('[data-code]')?.dataset.code,drag:false};
});
atlas.addEventListener('pointermove',event=>{
  if(!pointer || pointer.id!==event.pointerId || overhead) return;
  const dx=event.clientX-pointer.x, dy=event.clientY-pointer.y;
  if(!pointer.drag && Math.hypot(dx,dy)<6) return;
  if(!pointer.drag) {pointer.drag=true;atlas.setPointerCapture(event.pointerId);atlas.classList.add('dragging');}
  yaw=Math.max(-.64,Math.min(.64,pointer.yaw-dx*.0035));
  pitch=Math.max(.18,Math.min(1.03,pointer.pitch-dy*.004));queueMap();
});
atlas.addEventListener('pointerup',event=>{
  if(pointer?.id!==event.pointerId) return;
  if(!pointer.drag && pointer.code && Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<8) selectState(pointer.code,true);
  pointer=null;atlas.classList.remove('dragging');
});
atlas.addEventListener('pointerleave',()=>{if (!pointer?.drag) pointer=null;});
atlas.addEventListener('pointercancel',()=>{pointer=null;atlas.classList.remove('dragging');});
atlas.addEventListener('wheel',event=>{
  if(!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();changeZoom(-event.deltaY*.002);
},{passive:false});
$('#share').addEventListener('click',async()=>{
  const url=viewURL().href;
  try{
    if(location.protocol==='file:') {showToast('Share the HTML file itself.');return;}
    if(navigator.share) await navigator.share({title:document.title,url});
    else {await navigator.clipboard.writeText(url);showToast('Link copied');}
  }catch(error){if(error.name!=='AbortError') showToast('Copy the current link from the address bar.');}
});
function showToast(message) {const toast=$('#toast');toast.textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.textContent='',3500);}
fetch('states.json').then(response=>{if(!response.ok)throw Error();return response.json();}).then(topology=>{
  geometry=decode(topology).map(g=>{
    const main=g.rings.map(p=>p[0]).sort((a,b)=>area(b)-area(a))[0];
    return {...g,area:area(main),center:centroid(main)};
  });
  queueMap();
}).catch(()=>$('#map-error').hidden=false);
render();refresh();
setInterval(showNextCheck,1000);
setInterval(()=>{
  if (document.hidden || state || seat || !document.body.classList.contains('tv-mode') || !matchMedia('(min-width: 760px)').matches ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  spotlightIndex++;
  renderDetail();
},11000);
document.addEventListener('layoutchange',renderDetail);
document.addEventListener('visibilitychange',()=>{
  if (!document.hidden && Date.now()>=nextCheckAt) refresh(true);
});
window.addEventListener('online',()=>refresh(true));
if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('sw.js').catch(()=>{});
