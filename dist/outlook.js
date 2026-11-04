'use strict';
if (deskView==='outlook') {
  const civic='https://civicapi.org/api/v2/';
  const firstFederalYear=2028;
  const day=86400000;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York'}).format(new Date());
  const louisiana='https://www.sos.la.gov/elections-voting/election-dates';
  const laCandidates='https://voterportal.sos.la.gov/candidateinquiry';
  const ky='https://elect.ky.gov/Resources/Pages/Election-Calendar.aspx';
  const ms='https://www.sos.ms.gov/sites/default/files/publications/Election%20Calendar_2026.pdf';
  const federal='https://www.govinfo.gov/content/pkg/USCODE-2023-title2/html/USCODE-2023-title2-chap1-sec7.htm';
  const fec='https://www.fec.gov/data/candidates/';
  const calendar=[
    {id:'us-2026',date:'2026-11-03',name:'2026 U.S. midterms',stage:'Congress & governors',national:true,queries:['United States Senate','House of Representatives','Governor'],types:['Senate','U.S. Senate','US Senate','House of Representatives','U.S. House','US House','Governor'],models:['senate','house','governor'],note:'Review the 2026 candidate field, reported returns, and dated pre-election polling and forecasts.',links:[['Open the full 2026 atlas','./'],['FEC candidate filings',fec+'?election_year=2026']]},

    {id:'us-2026-measures',date:'2026-11-03',name:'2026 statewide ballot measures',stage:'Referendums & propositions',statewide:true,queries:['Question','Proposition','Amendment','Measure','Initiative','Referendum','Proposal'],types:['Referendum'],note:'Browse the statewide questions listed by the results provider. Use the state name or the measure’s title to filter the results.',links:[['civicAPI results calendar','https://civicapi.org/results']]},
    {id:'la-2026-runoff',date:'2026-12-12',name:'Louisiana House elections',stage:'Open general',state:'LA',queries:['House'],types:['House of Representatives','U.S. House','US House'],note:'Louisiana schedules its open U.S. House general election and other races for this date.',links:[['Official election calendar',louisiana],['Candidate lookup',laCandidates]]},
    {id:'la-2027-primary',date:'2027-10-09',name:'Louisiana governor',stage:'Gubernatorial primary',state:'LA',queries:['Governor'],types:['Governor'],models:['governor'],poll:'governor',note:'Louisiana’s open gubernatorial primary. The state calendar lists Aug. 3–5 for qualifying.',links:[['Official 2027 calendar','https://www.sos.la.gov/media/byfpyc5f/elections-calendar-2027.pdf'],['Candidate lookup',laCandidates]]},
    {id:'ky-2027',date:'2027-11-02',name:'Kentucky governor',stage:'Statewide general',state:'KY',queries:['Governor'],types:['Governor'],models:['governor'],poll:'governor',note:'Kentucky’s statewide general election includes the governor and lieutenant governor ticket.',links:[['State election calendar',ky],['Official candidate filings','https://web.sos.ky.gov/CandidateFilings/default.aspx']]},
    {id:'ms-2027',date:'2027-11-02',name:'Mississippi governor',stage:'Statewide general',state:'MS',queries:['Governor'],types:['Governor'],models:['governor'],poll:'governor',note:'Mississippi elects a governor and other statewide officers. The state calendar lists a possible Nov. 30 runoff.',links:[['Secretary of State calendar',ms]]},
    {id:'va-2027',date:'2027-11-02',name:'Virginia legislature',stage:'State legislative general',state:'VA',queries:['State Senate','House of Delegates'],types:['State Senate','State House'],note:'All 40 State Senate and 100 House of Delegates seats are scheduled.',links:[['Official five-year calendar','https://www.fluvannacounty.org/sites/default/files/fileattachments/registrar/page/4261/five_year_election_day_calendar_2025_2029.pdf'],['Virginia elections','https://www.elections.virginia.gov/']]},
    {id:'la-2027-general',date:'2027-11-20',name:'Louisiana governor',stage:'Gubernatorial general, if needed',state:'LA',queries:['Governor'],types:['Governor'],models:['governor'],poll:'governor',note:'The Louisiana calendar reserves this date for the gubernatorial general election if the race proceeds to a second round.',links:[['Official 2027 calendar','https://www.sos.la.gov/media/byfpyc5f/elections-calendar-2027.pdf'],['Candidate lookup',laCandidates]]}
  ];
  const announcements={
    'ky-2027':[['Jonathan Hay','Independent','https://jonathanhaymedia.com/']],
    'ms-2027':[
      ['Andy Gipson','Republican','https://andygipson.com/'],
      ['Priscilla Williams Till','','https://governortillmississippi.org/']
    ]
  };
  const harrisPoll='https://harvardharrispoll.com/assets/uploads/2026/09/HHP_Oct2026_KeyResults.pdf';
  const early2028=[
    {pollster:'Harvard CAPS–Harris',subject:'National Democratic nomination preference',start:'2026-10-24',end:'2026-10-26',sample:'Democratic respondents',source_url:harrisPoll+'#page=76',
      results:[{candidate:'Kamala Harris',pct:34},{candidate:'Gavin Newsom',pct:20},{candidate:'Alexandria Ocasio-Cortez',pct:11},{candidate:'Pete Buttigieg',pct:10}]},
    {pollster:'Harvard CAPS–Harris',subject:'National Republican nomination preference',start:'2026-10-24',end:'2026-10-26',sample:'Republican respondents',source_url:harrisPoll+'#page=77',
      results:[{candidate:'JD Vance',pct:40},{candidate:'Donald Trump Jr.',pct:21},{candidate:'Marco Rubio',pct:21}]},
    {pollster:'Big Data Poll',subject:'Florida Republican primary',start:'2026-10-26',end:'2026-10-30',sample:'Screened Florida Republican primary voters',source_url:'https://www.bigdatapoll.com/blog/sunshine-state-poll-vance-leads-desantis-follows-and-rubio-third-in-florida-for-2028/',
      results:[{candidate:'JD Vance',pct:30.6},{candidate:'Ron DeSantis',pct:25.6},{candidate:'Marco Rubio',pct:24.8}]}
  ];
  const yearOf=date=>Number(date.slice(0,4));
  const federalDate=year=>{
    const first=new Date(Date.UTC(year,10,1));
    return new Date(Date.UTC(year,10,2+(8-first.getUTCDay())%7)).toISOString().slice(0,10);
  };
  const firstYear=firstFederalYear;
  for(let year=firstYear;year<=Math.max(2030,yearOf(today)+4);year+=2){
    const presidential=year%4===0;
    calendar.push({id:'us-'+year,date:federalDate(year),name:year+' U.S. '+(presidential?'general election':'midterms'),stage:presidential?'President & Congress':'Congress & governors',national:true,
      queries:[...(presidential?['President']:[]),'United States Senate','House of Representatives','Governor'],
      types:['President','U.S. President','US President','Senate','U.S. Senate','US Senate','House of Representatives','U.S. House','US House','Governor'],
      models:['senate','house','governor'],
      note:(presidential?'President and vice president, all 435 voting U.S. House seats, regularly scheduled Senate seats and state races.':'All 435 voting U.S. House seats, regularly scheduled Senate seats and state races.'),
      links:[['Federal election schedule',federal],['FEC candidate filings',fec+'?election_year='+year],...(year===2028?[['Senate seats up in 2028','https://www.senate.gov/senators/Class_III.htm']]:[])]});
  }
  calendar.sort((a,b)=>a.date.localeCompare(b.date));
  let selected=calendar.find(event=>event.id===deskParams.get('event'))??calendar.find(event=>event.date>=today);
  let races=[], raceLimit=12, revision=0, raceTimer, refreshAt=0, checking=false, pollCache, pollAt=0, analysisAt=0;
  const candidateTypes=new Set(['President','U.S. President','US President','Senate','U.S. Senate','US Senate','Governor','House of Representatives','U.S. House','US House','State Senate','State House']);
  const eventTime=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  const eventLinks=desk('#event-sources'), raceList=desk('#event-races');
  const filters=desk('#event-filters'), raceSearch=desk('#event-search');
  const models=desk('#event-model'), polls=desk('#event-polls'), status=desk('#event-status');
  const info=(target,text)=>target.replaceChildren(element('p',text,'hint'));
  const token=(event,request)=>event===selected&&request===revision;
  const safeSource=value=>{
    try {const url=new URL(value);return url.protocol==='https:'?url.href:null;} catch{return null;}
  };

  function showCalendar() {
    const includePast=desk('#past-events').checked;
    const activeEvents=calendar.filter(event=>includePast || event.date>=today || event===selected || Date.now()-Date.parse(event.date)<14*day);
    const options=activeEvents.map(event=>{
      const button=deskButton('',()=>choose(event));
      button.dataset.event=event.id;
      button.setAttribute('aria-pressed',String(event===selected));
      button.append(element('span',prettyDate.format(new Date(event.date)),'micro'),element('strong',event.name),element('small',event.stage));
      return button;
    });
    const focus=document.activeElement?.dataset.event;
    desk('#outlook-calendar').replaceChildren(...options);
    if(focus)options.find(button=>button.dataset.event===focus)?.focus({preventScroll:true});
  }

  function choose(event) {
    clearTimeout(raceTimer);
    selected=event;
    const request=++revision;
    desk('#event-race-label').textContent=event.statewide?'BALLOT MEASURES & RESULTS':'CANDIDATES & RESULTS';
    races=[];raceLimit=12;checking=false;
    raceSearch.value='';
    desk('#event-date').textContent=prettyDate.format(new Date(event.date)).toUpperCase()+' / '+event.stage.toUpperCase();
    desk('#event-title').textContent=event.name;
    desk('#event-description').textContent=event.note;
    eventLinks.replaceChildren(...event.links.map(([label,url])=>link(label+' ↗',url)));
    const url=new URL(location.href);
    url.searchParams.set('view','outlook');url.searchParams.set('event',event.id);
    history.replaceState(null,'',url);
    showCalendar();paintRaces();paintAnnouncements(event);
    if (event.id==='us-2028')paintPolls(early2028,[]);else info(polls,'Checking the poll archive…');
    info(models,'Checking for published models…');
    status.textContent='Checking candidate and results feeds…';
    refreshAnalysis(event,request);
    refreshRaces(event,request);
  }

  function refreshAnalysis(event,request) {
    analysisAt=Date.now();
    loadPolls(event,request);loadModels(event,request);
  }

  async function searchRaces(event,query,offset=0) {
    const params=new URLSearchParams({country:'US',startDate:event.date,endDate:event.date,limit:'500',offset:String(offset)});
    if (event.state)params.set('province',event.state);
    if (event.statewide)params.set('election_type','Statewide');
    if (query)params.set('query',query);
    const result=await fetchDesk(civic+'race/search?'+params);
    if(!Array.isArray(result.races))throw new Error('Unexpected race format');
    return result.races;
  }

  const allowed=(r,event)=>r.country==='US' && r.election_date?.slice(0,10)===event.date &&
    (!event.state||r.province===event.state) && (!event.statewide||r.election_type==='Statewide'&&Object.hasOwn(stateNames,r.province)) && (event.types?.includes(r.type) || !event.types?.length&&candidateTypes.has(r.type));
  const civicRow = race => ({
    id:String(race.id),name:race.election_name,state:race.province,type:race.type,district:race.district,
    candidates:(race.candidates??[]).filter(c=>typeof c.name==='string'),
    source:'https://civicapi.org/results/elections/'+encodeURIComponent(race.id)
  });

  async function civicResults(event) {
    const queryList=event.queries.length?event.queries:[''];
    const responses=await Promise.allSettled(queryList.map(async query=>{
      const results=await searchRaces(event,query);
      if(results.length===500)results.push(...await searchRaces(event,query,500));
      return results;
    }));
    const available=responses.filter(result=>result.status==='fulfilled');
    if (!available.length)throw new Error('Race queries unavailable');
    const byId=new Map();
    for(const result of available)for(const race of result.value) {
      if(!allowed(race,event)||!Number.isSafeInteger(Number(race.id))||typeof race.election_name!=='string')continue;
      byId.set(String(race.id),civicRow(race));
    }
    return {races:[...byId.values()],publisher:'civicAPI',partial:available.length!==responses.length};
  }

  async function nationalResults(event) {
    if(event.national){
      try {
        const result=await fetchDesk('https://sitmap.live/api/elections/us-'+yearOf(event.date)+'.json');
        if (result?.test!==false || result.election?.date!==event.date || !Array.isArray(result.contests) ||
            !Number.isFinite(Date.parse(result.fetchedAt)) || result.contests.length<1)throw new Error('Unexpected national feed');
        const rows=result.contests.filter(row=>typeof row.name==='string'&&row.jurisdiction?.country==='US'&&Array.isArray(row.candidates));
        if(rows.length)return {
          publisher:'sitmap.live / civicAPI',asOf:result.fetchedAt,
          races:rows.map(row=>({
            id:String(row.id),name:row.name,state:row.jurisdiction.state,type:row.chamber,district:row.jurisdiction.district,
            candidates:row.candidates.filter(c=>typeof c.name==='string').map(c=>({...c,percent:c.pct})),
            source:'https://sitmap.live/elections/us-'+yearOf(event.date)
          }))
        };
      } catch {}
    }
    return civicResults(event);
  }

  const isCounting = race => race.candidates.some(c=>Number.isFinite(c.votes)&&c.votes>0);
  async function refreshRaces(event,request) {
    if(!token(event,request)||checking)return;
    checking=true;desk('#event-refresh').disabled=true;
    if(Date.now()-analysisAt>1800000)refreshAnalysis(event,request);
    try {
      const result=await nationalResults(event);
      if(!token(event,request))return;
      races=result.races.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
      const voting=races.filter(isCounting).length;
      const when=eventTime.format(new Date(result.asOf??Date.now()));
      const from= ' · '+result.publisher+(result.partial?' · Some source queries unavailable':'');
      const timing=result.asOf?' · Feed timestamp '+when:' · Checked '+when;
      status.textContent=voting?voting+' '+(voting===1?'race':'races')+' with unofficial vote totals'+timing+from:races.length?races.length+' race listings'+timing+from:'The source has not published race listings for this date'+timing+'.';
      paintRaces();
    } catch {
      if(token(event,request))status.textContent=races.length?'Source unavailable. Showing the last successful update in this tab.':'The race feed is temporarily unavailable. The official election links are above.';
    } finally {
      if(token(event,request)){
        checking=false;desk('#event-refresh').disabled=false;
        const delta=Date.now()-Date.parse(event.date);
        const interval=delta>=-day&&delta<7*day?60000:600000;
        refreshAt=Date.now()+interval;
        clearTimeout(raceTimer);
        raceTimer=setTimeout(()=>{
          if(!document.hidden)refreshRaces(event,request);
        },interval);
      }
    }
  }

  function paintRaces() {
    const query=raceSearch.value.trim().toLowerCase();
    const open=new Set([...raceList.querySelectorAll('details[open]')].map(row=>row.dataset.id));
    filters.hidden=!races.length;
    const subset=races.filter(r=>!query||[r.name,r.state,stateNames[r.state],...r.candidates.map(c=>c.name)].some(value=>String(value??'').toLowerCase().includes(query)));
    raceList.replaceChildren(...subset.slice(0,raceLimit).map(race=>{
      const row=element('details',null,'event-race');row.dataset.id=race.id;row.open=open.has(race.id);
      const voting=isCounting(race);
      row.append(element('summary',race.name+' · '+(voting?'Unofficial returns':race.candidates.length+' listed candidates')));
      const candidates=[...race.candidates].sort((a,b)=>voting?(b.votes??0)-(a.votes??0):a.name.localeCompare(b.name));
      const list=element('ul');
      for(const c of candidates){
        const reported=Number.isFinite(c.votes)?' · '+formatNumber.format(c.votes)+' votes':'';
        const share=Number.isFinite(c.percent)?' ('+c.percent.toFixed(1)+'%)':'';
        list.append(element('li',c.name+(c.party?' · '+c.party:'')+(voting?reported+share+(c.winner===true?' · Called by source':''):'')));
      }
      if(candidates.length)row.append(list);
      else row.append(element('p','Candidate field pending.','hint'));
      row.append(link('Open source ↗',race.source));return row;
    }));
    if(races.length&&!subset.length)info(raceList,'No matching races.');
    desk('#event-more').hidden=raceLimit>=subset.length;
  }
  raceSearch.addEventListener('input',()=>{raceLimit=12;paintRaces();});
  desk('#event-more').addEventListener('click',()=>{raceLimit+=20;paintRaces();});

  async function loadPolls(event,request) {
    try {
      if(!pollCache||Date.now()-pollAt>1800000){
        pollAt=Date.now();
        pollCache=fetchDesk('https://www.electionwrld.com/api/v1/datasets/polls').catch(error=>{pollCache=null;throw error;});
      }
      const result=await pollCache;
      if(!token(event,request))return;
      if(!Array.isArray(result))throw new Error('Unexpected poll format');
      const cycle='-'+yearOf(event.date);
      const relevant=result.filter(p=>typeof p.race==='string'&&p.race.endsWith(cycle)&&
        (event.national?p.poll_type!=='approval':p.state===event.state&&(p.poll_type===event.poll||p.office===event.poll))&&
        safeDate(p.end)&&p.end<=today&&safeSource(p.source_url)&&Array.isArray(p.results))
        .sort((a,b)=>b.end.localeCompare(a.end)).slice(0,6);
      paintPolls(event.id==='us-2028'?early2028:[],relevant);
    } catch {
      if(!token(event,request))return;
      if(event.id==='us-2028')paintPolls(early2028,[]);
      else info(polls,'The poll archive is temporarily unavailable.');
    }
  }

  function paintPolls(early,remote) {
    if(!early.length&&!remote.length){info(polls,'No sourced polls for this election in the connected poll archive.');return;}
    const sorted=[...early,...remote].sort((a,b)=>b.end.localeCompare(a.end)).slice(0,6);
    polls.replaceChildren(...sorted.map(p=>{
      const panel=element('div',null,'outlook-poll');
      const subject=typeof p.subject==='string'?p.subject:[p.state,p.office].filter(Boolean).join(' ');
      panel.append(element('strong',p.pollster+(subject?' · '+subject:'')),element('small',
        (safeDate(p.start)?prettyDate.format(new Date(p.start))+' – ':'')+prettyDate.format(new Date(p.end))+
        (p.sample?' · '+p.sample:Number.isFinite(p.n)?' · n='+formatNumber.format(p.n):'')+(p.internal?' · Internal poll':'')));
      const matches=p.results.filter(r=>typeof r.candidate==='string'&&Number.isFinite(r.pct)&&r.pct>=0&&r.pct<=100);
      panel.append(element('p',matches.map(r=>r.candidate+' '+r.pct+'%').join(' · ')),link('Original survey release ↗',safeSource(p.source_url)));
      return panel;
    }));
    if(early.length)polls.append(element('p','Selected early primary polls show preferences among the names tested. The releases include the full responses and methodology.','hint'));
    if(remote.length)polls.append(element('p','Additional poll data via Election Wrld.','hint'));
  }

  function paintAnnouncements(event) {
    const target=desk('#event-announcements');
    target.replaceChildren();
    const entries=event.date>today?announcements[event.id]:null;
    if (!entries)return;
    const list=element('ul');
    for(const [name,party,url] of entries){
      const item=element('li');
      item.append(link(name+' ↗',url),document.createTextNode(party?' · '+party:''));
      list.append(item);
    }
    target.append(element('h4','Selected campaign announcements'),element('p','Checked Nov. 4, 2026. See the state’s filing records for ballot status.','hint'),list);
  }

  async function loadModels(event,request) {
    const offices=event.models??[];
    if(!offices.length){info(models,'No connected forecast for this race type.');return;}
    const year=yearOf(event.date);
    const results=await Promise.allSettled(offices.map(office=>fetchDesk(civic+'forecast/'+office+'/'+year+'/civicapi')));
    if(!token(event,request))return;
    const cards=[];
    for(const response of results){
      if(response.status!=='fulfilled')continue;
      const model=response.value;
      if(model?.year!==year||model.pundit!=='civicAPI'||!model.states||!safeDate(model.last_updated))continue;
      const race=event.state?model.states[event.state]:null;
      if(event.state&&!race)continue;
      const odds=event.state?null:model.majority_odds;
      const card=element('div',null,'outlook-poll');
      const rating=event.state?race.rating:odds?.rating;
      card.append(element('strong',model.chamber+(event.state?' · '+event.state:'')),element('small','civicAPI model · '+prettyDate.format(new Date(model.last_updated))));
      if(typeof rating==='string')card.append(element('p','Rating · '+rating));
      if(odds&&[odds.D,odds.R].every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&odds.D+odds.R<=1.02){
        card.append(element('p','Majority probability · D '+(100*odds.D).toFixed(1)+'% · R '+(100*odds.R).toFixed(1)+'%'));
      }
      card.append(link('Model publisher ↗','https://civicapi.org/forecasts'));cards.push(card);
    }
    if(cards.length)models.replaceChildren(...cards);
    else info(models,results.every(r=>r.status==='rejected'&&r.reason.status!==404)?'The model source is temporarily unavailable.':'No verified model or win probability is published for this election.');
  }

  async function discoverDates(initial=false) {
    const openedAtRevision=revision;
    const current=yearOf(today);
    const results=await Promise.allSettled([current,current+1].map(year=>fetchDesk(civic+'getElectionDates?country=US&year='+year)));
    const dates=new Map();
    for(const result of results)if(result.status==='fulfilled'&&Array.isArray(result.value.months)){
      for(const month of result.value.months)for(const entry of month.dates??[]){
        if(safeDate(entry.date)&&entry.date>=today&&Number(entry.count)>0)dates.set(entry.date,entry);
      }
    }
    const known=new Set(calendar.map(event=>event.date));
    for(const [date,entry] of [...dates].sort(([a],[b])=>a.localeCompare(b)).filter(([date])=>!known.has(date)).slice(0,5)){
      calendar.push({id:'calendar-'+date,date,name:'U.S. races on '+prettyDate.format(new Date(date)),stage:'Provider calendar',queries:[],
        note:'civicAPI lists '+entry.count+' U.S. entries for this date. Availability and office coverage vary.',
        links:[['civicAPI results calendar','https://civicapi.org/results']]});
    }
    calendar.sort((a,b)=>a.date.localeCompare(b.date));
    const requested=initial&&calendar.find(event=>event.id===deskParams.get('event'));
    if(requested&&requested!==selected&&openedAtRevision===revision)choose(requested);else showCalendar();
  }

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&Date.now()>=refreshAt)refreshRaces(selected,revision);
  });
  window.addEventListener('online',()=>refreshRaces(selected,revision));
  desk('#past-events').addEventListener('change',showCalendar);
  desk('#event-refresh').addEventListener('click',()=>refreshRaces(selected,revision));
  choose(selected);
  discoverDates(true);
  setInterval(()=>{if(!document.hidden)discoverDates();},1800000);
}
