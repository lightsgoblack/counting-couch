'use strict';
const desk = selector => document.querySelector(selector);
const deskParams = new URLSearchParams(location.search);
const deskView = ['outlook','compare','local'].includes(deskParams.get('view')) ? deskParams.get('view') : 'archive';
const formatNumber = new Intl.NumberFormat('en-US');
const prettyDate = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const safeDate = value => /^\d{4}-\d\d-\d\d$/.test(value ?? '') && Number.isFinite(Date.parse(value));
const officeNames={President:'President',Senate:'U.S. Senate',House:'U.S. House',Governor:'Governor'};
const partyColors={D:'dem',R:'rep',I:'other',O:'other'};
const element=(tag,content,className)=>{
  const result=document.createElement(tag);
  if (content!=null) result.textContent=content;
  if (className) result.className=className;
  return result;
};
const link=(title,url)=>{
  const result=element('a',title);
  result.href=url;
  if (result.origin!==location.origin) {result.target='_blank';result.rel='noopener noreferrer';}
  return result;
};
const percent=(value,total)=>total>0?(100*value/total).toFixed(2)+'%':'—';
const deskButton=(label,handler)=>{
  const button=element('button',label);
  button.type='button';button.addEventListener('click',handler);
  return button;
};
const fetchDesk=async (url,type='json')=>{
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Object.assign(new Error('Source HTTP '+response.status),{status:response.status});
  return response[type]();
};

for (const view of ['archive','compare','outlook','local']) desk('#'+view).hidden=deskView!==view;
desk('#archive-tab').removeAttribute('aria-current');
desk('#'+deskView+'-tab').setAttribute('aria-current','page');

const archiveCache=new Map();
const archiveIndex=()=>fetchDesk('history/index.json');
const getYear=year=>{
  if (!archiveCache.has(year)) archiveCache.set(year,fetchDesk('history/'+year+'.json').then(data=>{
    if(data.year!==year)throw new Error('Unexpected archive year');
    return data;
  }).catch(error=>{archiveCache.delete(year);throw error;}));
  return archiveCache.get(year);
};
const winner=row=>row.void?undefined:(row.candidates.find(c=>c[0]===row.winner)??row.candidates[0]);
const drMargin=row=>{
  if(!row?.total||row.void)return null;
  const sum=party=>row.candidates.filter(c=>c[1]===party).reduce((acc,c)=>acc+c[2],0);
  return 100*(sum('D')-sum('R'))/row.total;
};

if (deskView==='archive') {
  let years=[], electoral={};
  const sources={
    President:'https://doi.org/10.7910/DVN/42MVDX',
    Senate:'https://doi.org/10.7910/DVN/PEJ5QU',
    House:'https://doi.org/10.7910/DVN/IG0UN2',
    Governor:'https://www.electionwrld.com/data'
  };
  const stateByName=Object.entries(stateNames).sort((a,b)=>a[1].localeCompare(b[1]));
  let year=2024;
  let kind=deskParams.get('office')??'';
  let code=Object.hasOwn(stateNames,deskParams.get('state'))?deskParams.get('state'):'';
  let id=deskParams.get('race')??'';
  let data, generation=0, geometry=[], limit=30;
  if (!code && Object.hasOwn(stateNames,id.slice(0,2))) code=id.slice(0,2);
  const archiveState=desk('#archive-state'), search=desk('#archive-search'), sort=desk('#archive-sort');
  const groupByState = rows=>{
    const grouped=new Map();
    for(const row of rows){
      const state=row.id.slice(0,2);
      if(!grouped.has(state))grouped.set(state,[]);
      grouped.get(state).push(row);
    }
    return grouped;
  };
  for (const [abbreviation,name] of stateByName) archiveState.add(new Option(name,abbreviation));

  function raceTitle(row) {
    const [state,suffix]=row.id.split('-');
    const name=stateNames[state];
    if(kind==='House') return name+(suffix==='00'?' · At-large':' · District '+Number(suffix));
    return name+(suffix==='special'?' · Special election':'');
  }

  const margin = row => row.candidates.length>1 && row.total>0 ? 100*(row.candidates[0][2]-row.candidates[1][2])/row.total : Infinity;
  const rows = ()=>data?.offices[kind]??[];
  const prior = ()=>years.find(y=>y<year && y%4===0);
  function updateArchiveURL() {
    const url=new URL(location.href);
    for (const [key,value] of Object.entries({year,office:kind,state:code,race:id})) {
      if (value) url.searchParams.set(key,value);else url.searchParams.delete(key);
    }
    history.replaceState(null,'',url);
  }

  function selectState(state,race='',focus=false) {
    code=state;id=race;limit=30;
    if (!race) search.value='';
    archiveState.value=code;
    const matches=rows().filter(row=>row.id.startsWith(code));
    if (code && !id && matches.length===1) id=matches[0].id;
    updateArchiveURL();
    desk('#archive-compare').href='?'+new URLSearchParams({view:'compare',office:kind,b:year,...(code?{state:code}:{})});
    paintMap();paintRaces();paintDetail();
    if (focus) desk('#history-detail').focus();
  }

  const svgNode = (tag,attrs)=>{
    const result=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [key,value] of Object.entries(attrs))result.setAttribute(key,value);
    return result;
  };
  const project=(x,y,z=0)=>[x+(y-275)*.11, (y-275)*.82+267-z];
  const point=(x,y,z)=>project(x,y,z).map(n=>n.toFixed(1)).join(',');
  const outline=(rings,z)=>rings.map(polygon=>polygon.map(ring=>'M'+ring.map(([x,y])=>point(x,y,z)).join('L')+'Z').join('')).join('');
  function paintMap() {
    const grouped=groupByState(rows());
    const map=desk('#history-land'), labels=desk('#history-labels');
    map.replaceChildren();labels.replaceChildren();
    const tone=(name,fallback)=>window.themeColor?.(name)||fallback;
    const palette={D:[tone('map-dem','#527eaa'),tone('map-dem-low','#2e4966')],R:[tone('map-rep','#a65e62'),tone('map-rep-low','#58383a')],O:[tone('map-other','#a68c56'),tone('map-other-low','#514535')],N:[tone('map-none','#354439'),tone('map-none-low','#222e24')]};
    const edge=tone('map-edge','#829784'),edgeActive=tone('map-edge-active','#d1f897'),ink=tone('map-label','#e9eee1'),inkActive=tone('map-label-active','#e9ffbf');
    for (const state of geometry) {
      const results=grouped.get(state.code)??[];
      const votes=results.map(winner).filter(Boolean);
      const d=votes.filter(candidate=>candidate[1]==='D').length, r=votes.filter(candidate=>candidate[1]==='R').length;
      const color=!votes.length?'N':kind==='House'?(d===r?'O':d>r?'D':'R'):votes[0][1];
      const [fill,side]=palette[color]??palette.O;
      const active=state.code===code, height=active?22:results.length?12:5;
      const group=svgNode('g',{'data-state':state.code,role:'button',tabindex:results.length?'0':'-1','aria-pressed':String(active),'aria-label':stateNames[state.code]});
      const tooltip=svgNode('title',{});
      tooltip.textContent=stateNames[state.code]+' · '+(results.length?results.length+' archived '+(results.length===1?'race':'races'):'No archived race');
      group.append(tooltip,svgNode('path',{d:outline(state.rings,0),fill:side,'fill-rule':'evenodd',stroke:side,'stroke-width':2}));
      if (height>5) group.append(svgNode('path',{d:outline(state.rings,height/2),fill:side,'fill-rule':'evenodd',stroke:side,'stroke-width':3}));
      group.append(svgNode('path',{d:outline(state.rings,height),fill,'fill-rule':'evenodd',stroke:active?edgeActive:edge,'stroke-width':active?2.4:.8}));
      map.append(group);
      if (state.size>4200 || active) {
        const [x,y]=project(...state.center,height);
        const label=svgNode('text',{x,y,fill:active?inkActive:ink,'font-size':active?18:14,'text-anchor':'middle','dominant-baseline':'middle'});
        label.textContent=state.code;labels.append(label);
      }
    }
  }
  document.addEventListener('themechange',()=>{if(geometry.length)paintMap();});
  desk('#history-map').addEventListener('click',event=>{
    const button=event.target.closest('[data-state]');
    if(button) selectState(button.dataset.state);
  });
  desk('#history-map').addEventListener('keydown',event=>{
    const button=event.target.closest('[data-state]');
    if (button && (event.key==='Enter'||event.key===' ')) {event.preventDefault();selectState(button.dataset.state,'',true);}
  });
  desk('#clear-state').addEventListener('click',()=>selectState(''));

  function paintHighlights() {
    const current=rows(), items=[];
    if (kind==='President' && electoral[year]) {
      const [elected,votes,opponent,oppVotes,other]=electoral[year];
      const context={1868:' · Seymour had 71 excluding Georgia’s disputed electors',1872:' · Greeley died before the electoral vote',1876:' · Four states’ electoral votes were disputed'};
      items.push(['ELECTORAL COLLEGE',votes+' – '+oppVotes,elected+' over '+opponent+(other?' · '+other+' other electoral votes':'')+(context[year]??'')]);
      const stateLeads={D:0,R:0};
      for (const row of current) {
        const party=winner(row)?.[1];
        if (Object.hasOwn(stateLeads,party)) stateLeads[party]++;
      }
      items.push(['STATEWIDE POPULAR VOTE',stateLeads.D+' D · '+stateLeads.R+' R','States and D.C. by popular-vote leader']);
    } else {
      const parties={D:0,R:0,other:0};
      for (const row of current) {
        const party=winner(row)?.[1];
        if (party) parties[party==='D'||party==='R'?party:'other']++;
      }
      items.push(['TOP FINISHERS',parties.D+' D · '+parties.R+' R'+(parties.other?' · '+parties.other+' other':''),kind==='House'?'Districts in the archive':'Races in this election year']);
    }
    const close=[...current].filter(row=>!row.void&&Number.isFinite(margin(row))).sort((a,b)=>margin(a)-margin(b))[0];
    if(close) items.push(['CLOSEST IN ARCHIVE',margin(close).toFixed(2)+' pts',raceTitle(close)]);
    items.push(['COVERAGE',formatNumber.format(current.length)+' races',year+' '+officeNames[kind]]);
    desk('#archive-highlights').replaceChildren(...items.map(([label,value,note])=>{
      const stat=element('div',null,'desk-stat');
      stat.append(element('span',label,'micro'),element('strong',value),element('small',note));
      if(label==='ELECTORAL COLLEGE')stat.append(link('National Archives ↗','https://www.archives.gov/electoral-college/'+year));
      return stat;
    }));
    desk('#archive-map-title').textContent=year+' / '+officeNames[kind].toUpperCase();
    desk('#archive-map-caption').textContent=kind==='House'?'State color shows which party led in more districts. Select a state to see every district in the archive.':kind==='President'?'Color shows the statewide popular-vote leader. Electoral votes are shown separately above.':'Color shows the top finisher in each state. Where a state had two contests, the regular race sets the color.';
  }

  function paintRaces() {
    const query=search.value.trim().toLowerCase();
    let list=rows().filter(row=>(!code||row.id.startsWith(code))&&(!query||[raceTitle(row),row.id,...row.candidates.map(c=>c[0])].some(value=>value.toLowerCase().includes(query))));
    if(sort.value==='margin') list.sort((a,b)=>margin(a)-margin(b));
    else list.sort((a,b)=>raceTitle(a).localeCompare(raceTitle(b),undefined,{numeric:true}));
    desk('#archive-count').textContent=list.length ? 'Showing '+Math.min(limit,list.length)+' of '+list.length+' races' : 'No matching races in this archive.';
    desk('#archive-races').replaceChildren(...list.slice(0,limit).map(row=>{
      const button=deskButton('',()=>selectState(row.id.slice(0,2),row.id,true));
      button.className='archive-race';
      button.setAttribute('aria-pressed',String(row.id===id));
      const leader=winner(row);
      button.append(element('strong',raceTitle(row)),element('span',row.void?'Result not certified':leader?.[0]??'—',partyColors[leader?.[1]]),element('small',row.void?'—':Number.isFinite(margin(row))?margin(row).toFixed(2)+' pts':'—'));
      return button;
    }));
    desk('#archive-more').hidden=limit>=list.length;
  }
  function paintDetail() {
    const target=desk('#history-detail');
    const row=rows().find(row=>row.id===id);
    target.replaceChildren(element('span',year+' / '+(officeNames[kind]??'ARCHIVE').toUpperCase(),'micro'));
    if (!row) {
      target.append(element('h3',stateNames[code]??'Inspect a race'),element('p',code?'Select a race from the list to see candidate totals.':'Select a state on the map, or find a candidate below.','hint'));
      return;
    }
    target.append(element('h3',raceTitle(row)),element('p',(safeDate(row.date)?prettyDate.format(new Date(row.date))+' · ':'')+(row.total?formatNumber.format(row.total)+' votes in this tabulation':'Vote total unavailable'),'hint'));
    if(row.note)target.append(element('p',row.note,'desk-notice'));
    const candidates=element('div',null,'archive-candidates');
    for (const [name,party,votes,label] of row.candidates) {
      const info=element('div',null,'archive-candidate '+(partyColors[party]??''));
      const text=element('div');
      text.append(element('strong',name),element('small',label==='Na'?'':label));
      info.append(text,element('span',row.total?formatNumber.format(votes):'—'),element('b',percent(votes,row.total)));
      const track=element('div',null,'archive-track'), bar=element('i');
      bar.style.width=(row.total?100*votes/row.total:0)+'%';
      track.append(bar);info.append(track);candidates.append(info);
    }
    target.append(candidates,link('View source ↗',kind==='Governor'?'https://www.electionwrld.com/api/v1/datasets/governor?state='+row.id.slice(0,2).toLowerCase():row.source==='american-vote'?'https://theamericanvote.com/data':sources[kind]));
    if (kind==='President' && prior()) {
      const comparison=element('p',null,'archive-comparison');
      target.append(comparison);
      getYear(prior()).then(previous=>{
        const other=previous.offices.President?.find(race=>race.id===row.id);
        if(!other||!comparison.isConnected)return;
        const currentMargin=drMargin(row), previousMargin=drMargin(other);
        if(currentMargin==null||previousMargin==null)return;
        const change=currentMargin-previousMargin;
        comparison.append(element('strong','Since '+previous.year+' · '),document.createTextNode(change===0?'No change':Math.abs(change).toFixed(2)+' points toward '+(change>0?'Democrats':'Republicans')+' in the D–R margin.'));
      }).catch(()=>{});
    }
  }

  function paintArchive() {
    const focused=document.activeElement?.dataset.office;
    const era=String(Math.floor(year/10)*10);
    if(desk('#archive-era').value!==era){desk('#archive-era').value=era;paintYears();}
    for (const button of desk('#archive-years').children) button.setAttribute('aria-pressed',String(Number(button.dataset.year)===year));
    desk('#archive-year-select').value=String(year);
    const record=desk('#archive-record');
    record.hidden=year%2!==0;
    record.href='https://history.house.gov/Institution/Election-Statistics/'+year+'election/';
    desk('#archive-compare').href='?'+new URLSearchParams({view:'compare',office:kind,b:year,...(code?{state:code}:{})});
    desk('#archive-offices').replaceChildren(...Object.keys(officeNames).filter(name=>data.offices[name]?.length).map(name=>{
      const button=deskButton(officeNames[name],()=>{
        kind=name;id='';limit=30;search.value='';
        const matches=rows().filter(row=>row.id.startsWith(code));
        if(code&&matches.length===1)id=matches[0].id;
        updateArchiveURL();paintArchive();
      });
      button.dataset.office=name;
      button.setAttribute('aria-pressed',String(kind===name));
      return button;
    }));
    if(focused)desk('#archive-offices').querySelector('[data-office="'+kind+'"]')?.focus({preventScroll:true});
    archiveState.value=code;
    desk('#archive-status').textContent='Historical data · '+year+' general elections';
    paintHighlights();paintMap();paintRaces();paintDetail();
  }
  async function loadYear(nextYear) {
    const request=++generation;
    desk('#archive-status').textContent='Loading '+nextYear+'…';
    desk('#archive').setAttribute('aria-busy','true');
    try {
      const response=await getYear(nextYear);
      if(request!==generation)return;
      if(response.year!==nextYear)throw new Error('Unexpected archive year');
      if(year!==nextYear)id='';
      year=nextYear;data=response;
      if(!data.offices[kind]?.length)kind=Object.keys(officeNames).find(name=>data.offices[name]?.length);
      if (!rows().some(row=>row.id===id)) id='';
      if (code && !id) {
        const matches=rows().filter(row=>row.id.startsWith(code));
        if(matches.length===1)id=matches[0].id;
      }
      limit=30;updateArchiveURL();paintArchive();
    } catch (error) {
      console.warn('Archive unavailable',error);
      if(request===generation)desk('#archive-status').textContent='The archive could not load. Select the year to retry.';
    } finally {if(request===generation)desk('#archive').removeAttribute('aria-busy');}
  }

  function paintYears(){
    const era=Number(desk('#archive-era').value);
    desk('#archive-years').replaceChildren(...years.filter(y=>Math.floor(y/10)*10===era).map(y=>{
      const button=deskButton(y,()=>loadYear(y));
      button.dataset.year=y;button.setAttribute('aria-pressed',String(y===year));
      return button;
    }));
  }
  const officialYear=desk('#federal-record-year');
  const federalUrl='https://history.house.gov/Institution/Election-Statistics/';
  for(let y=2024;y>=1924;y-=2)officialYear.add(new Option(y,y));
  function updateOfficialLink(){desk('#federal-record-link').href=federalUrl+officialYear.value+'election/';}
  officialYear.addEventListener('change',updateOfficialLink);updateOfficialLink();
  desk('#archive-era').addEventListener('change',paintYears);
  desk('#archive-year-select').addEventListener('change',event=>loadYear(Number(event.target.value)));
  search.addEventListener('input',()=>{limit=30;paintRaces();});
  archiveState.addEventListener('change',()=>selectState(archiveState.value));
  sort.addEventListener('change',()=>{limit=30;paintRaces();});
  desk('#archive-more').addEventListener('click',()=>{limit+=30;paintRaces();});
  fetchDesk('states.json').then(topology=>{
    geometry=decode(topology).map(state=>{
      const ring=state.rings.map(polygon=>polygon[0]).sort((a,b)=>b.length-a.length)[0];
      const size=Math.abs(ring.reduce((sum,[x,y],i)=>{const [nx,ny]=ring[(i+1)%ring.length];return sum+x*ny-nx*y;},0)/2);
      const center=ring.reduce(([x,y],[a,b])=>[x+a/ring.length,y+b/ring.length],[0,0]);
      return {...state,size,center};
    }).sort((a,b)=>a.center[1]-b.center[1]);
    const grid=desk('#history-grid');
    for(let x=-25;x<=950;x+=55)grid.append(svgNode('path',{d:'M'+point(x,0,0)+'L'+point(x,555,0)}));
    for(let y=0;y<=555;y+=48)grid.append(svgNode('path',{d:'M'+point(-25,y,0)+'L'+point(950,y,0)}));
    paintMap();
  }).catch(()=>{desk('#archive-map-caption').textContent='Map geometry unavailable. Use the state selector below.';});
  archiveIndex().then(index=>{
    electoral=index.electoral;
    years=Object.keys(index.years).map(Number).sort((a,b)=>b-a);
    const requested=Number(deskParams.get('year'));
    if(years.includes(requested))year=requested;
    const era=desk('#archive-era'), yearSelect=desk('#archive-year-select');
    for(const decade of new Set(years.map(y=>Math.floor(y/10)*10))) era.add(new Option(decade+'s',decade));
    for(const option of years) yearSelect.add(new Option(option,option));
    era.value=String(Math.floor(year/10)*10);
    paintYears();loadYear(year);
  }).catch(()=>{desk('#archive-status').textContent='The archive index could not load. Reload the page to retry.';});
}
