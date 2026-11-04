'use strict';
if(deskView==='local'){
  const eventDate='2026-11-03';
  const sanDiego='https://www.livevoterturnout.com/ENR/sandiegocaenr/25/en/Index_25.html';
  const regions={
    'los-angeles':{name:'Los Angeles',description:'Mayor, City Council and ballot measures',term:'Los Angeles',featured:'182171',official:'https://results.lavote.gov/'},
    'san-diego':{name:'San Diego',description:'City, county, schools and special districts',featured:'sd-148',official:sanDiego},
    'la-mesa':{name:'La Mesa',description:'Mayor, council, treasurer and school measures',featured:'sd-135',official:sanDiego},
    orange:{name:'Orange County',description:'Supervisors, school boards and more',term:'Orange County',official:'https://ocvote.gov/datacentral/?tab=results'},
    riverside:{name:'Riverside County',description:'County and city contests',term:'Riverside',official:'https://voteinfo.net/november-3-2026-general-election'},
    'san-bernardino':{name:'San Bernardino County',description:'County and city contests',term:'San Bernardino',official:'https://results.rov.sbcounty.gov/Results/20261103/'},
    imperial:{name:'Imperial County',description:'County, city and district contests',term:'Imperial County',official:'https://elections.imperialcounty.org/'}
  };
  const localState=desk('#local-search-state'), localQuery=desk('#local-search-query');
  const search=desk('#local-filter'), status=desk('#local-status'), detail=desk('#local-detail'), list=desk('#local-list');
  const refresh=desk('#local-refresh'), sourceLinks=desk('#local-sources');
  const more=desk('#local-more'), places=desk('#local-places');
  const checkTime=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles',timeZoneName:'short'});
  let region=Object.hasOwn(regions,deskParams.get('region'))?deskParams.get('region'):'los-angeles';
  let selected=deskParams.get('race'), results=[], revision=0, limit=18, timer, foundTerm;
  const snapshot=fetchDesk('local-2026.json').catch(()=>null);

  for(const [code,name] of Object.entries(stateNames).sort((a,b)=>a[1].localeCompare(b[1])))localState.add(new Option(name,code));
  localState.value='CA';

  const title=value=>value===value.toUpperCase()?value.toLowerCase().replace(/(^|[\s-])[a-z]/g,part=>part.toUpperCase()):value;
  function updateURL(){
    const url=new URL(location.href);
    url.searchParams.set('view','local');
    if(region)url.searchParams.set('region',region);else url.searchParams.delete('region');
    if(selected&&region)url.searchParams.set('race',selected);else url.searchParams.delete('race');
    history.replaceState(null,'',url);
  }
  function renderPlaces(){
    const focus=document.activeElement?.dataset.region;
    places.replaceChildren(...Object.entries(regions).map(([id,place])=>{
      const button=deskButton('',()=>selectPlace(id));button.dataset.region=id;
      button.setAttribute('aria-pressed',String(region===id));
      button.append(element('span','SOUTHERN CALIFORNIA','micro'),element('strong',place.name),element('small',place.description));
      return button;
    }));
    if(focus)places.querySelector('[data-region="'+focus+'"]')?.focus({preventScroll:true});
  }
  function selectPlace(id){
    region=id;selected=null;results=[];limit=18;foundTerm=null;
    search.value='';clearTimeout(timer);updateURL();renderPlaces();paint();
    loadPlace();
  }

  async function providerSearch(term,state){
    const query=new URLSearchParams({country:'US',province:state,startDate:eventDate,endDate:eventDate,election_type:'Local',query:term,limit:'100'});
    const response=await fetchDesk('https://civicapi.org/api/v2/race/search?'+query);
    if(!Array.isArray(response.races))throw new Error('Unexpected local feed');
    return response.races.filter(r=>r.country==='US'&&r.province===state&&r.election_type==='Local'&&
      r.election_date?.slice(0,10)===eventDate&&typeof r.election_name==='string'&&Number.isSafeInteger(Number(r.id))&&Array.isArray(r.candidates))
      .map(r=>({id:String(r.id),name:r.election_name,type:r.type,source:'civicAPI',
        sourceUrl:'https://civicapi.org/results/elections/'+encodeURIComponent(r.id),candidates:r.candidates.filter(c=>typeof c.name==='string'&&Number.isFinite(c.votes))}));
  }

  function paint(){
    const q=search.value.toLowerCase().trim();
    const filtered=results.filter(r=>!q||[r.name,...r.candidates.map(c=>c.name)].some(s=>s.toLowerCase().includes(q)));
    list.replaceChildren(...filtered.slice(0,limit).map(race=>{
      const button=deskButton('',()=>{selected=race.id;updateURL();paint();detail.focus();});
      button.className='archive-race';button.dataset.race=race.id;
      button.setAttribute('aria-pressed',String(selected===race.id));
      const top=[...race.candidates].sort((a,b)=>b.votes-a.votes)[0];
      button.append(element('strong',title(race.name)),element('span',top?.votes?title(top.name):'Returns pending'),element('small',top?.votes&&Number.isFinite(top.percent)?top.percent.toFixed(2)+'%':'—'));
      return button;
    }));
    more.hidden=filtered.length<=limit;
    if(q&&!filtered.length)list.append(element('p','No contests match this filter.','hint'));
    const race=results.find(item=>item.id===selected);
    detail.replaceChildren(element('span','CONTEST DETAILS','micro'));
    if(!race){detail.append(element('h3','Choose a contest'),element('p','Open a race to see the reported totals and source.','hint'));return;}
    detail.append(element('h3',title(race.name)),element('p','Unofficial returns · '+race.source+(race.voteFor?' · Vote for '+race.voteFor:''),'hint'));
    const rows=[...race.candidates].sort((a,b)=>b.votes-a.votes);
    const box=element('div',null,'archive-candidates');
    for(const c of rows){
      const row=element('div',null,'archive-candidate');
      const vote=c.votes>0||rows.some(candidate=>candidate.votes>0);
      const formatted=vote&&Number.isFinite(c.percent)?c.percent.toFixed(2)+'%':'—';
      row.append(element('strong',title(c.name)),element('span',vote?formatNumber.format(c.votes):'—'),element('b',formatted));
      const track=element('div',null,'archive-track'), bar=element('i');
      bar.style.width=vote&&Number.isFinite(c.percent)?Math.max(0,Math.min(100,c.percent))+'%':'0';
      track.append(bar);row.append(track);box.append(row);
    }
    detail.append(box);
    if(race.voteFor===1&&rows[1]&&rows[0].votes>0&&!/measure|proposition/i.test(race.name)){
      detail.append(element('p','Reported lead · '+formatNumber.format(rows[0].votes-rows[1].votes)+' votes','desk-notice'));
    }
    if(race.id==='182171'&&rows[1]&&rows[0].votes>0){
      detail.append(element('p','Reported lead · '+formatNumber.format(rows[0].votes-rows[1].votes)+' votes','desk-notice'));
    }
    detail.append(link('Open source ↗',race.sourceUrl));
  }

  async function loadPlace(){
    const request=++revision, place=regions[region];
    refresh.disabled=true;
    const priorStatus=status.textContent;
    status.textContent='Checking local returns…';
    sourceLinks.replaceChildren(link('Official county results ↗',place.official));
    if(region==='la-mesa')sourceLinks.append(link('La Mesa city election office ↗','https://www.cityoflamesa.gov/1492/Elections'));
    if(region==='los-angeles')sourceLinks.append(link('Los Angeles city election office ↗','https://clerk.lacity.gov/elections/municipal-elections'));
    const data=await snapshot;
    if(request!==revision)return;
    const county=region==='la-mesa'||region==='san-diego';
    const stored=county?data?.['san-diego']:data?.[region];
    const ready=region==='la-mesa'?stored?.filter(r=>/\bLA MESA\b/.test(r.name)):stored;
    if(ready?.length&&!results.length){
      results=[...ready].sort((a,b)=>Number(b.id===place.featured)-Number(a.id===place.featured)||
        (region==='san-diego'?Number(/^CITY OF SAN DIEGO\b/.test(b.name))-Number(/^CITY OF SAN DIEGO\b/.test(a.name)):0));
      selected=selected??place.featured??results[0].id;
      if(!results.some(r=>r.id===selected))selected=results[0].id;
      status.textContent=county?results.length+' contests · County update '+data.sanDiegoPublished+' · Saved snapshot':results.length+' contests · Saved provider snapshot checked '+checkTime.format(new Date(data.retrievedAt));
      paint();
    }
    if(county){
      if(!ready?.length)status.textContent='The county snapshot is unavailable. Use the official county results above.';
      refresh.disabled=false;
      refresh.textContent='Open latest county results ↗';
      updateURL();return;
    }
    refresh.textContent='Refresh';
    try{
      const current=await providerSearch(place.term,'CA');
      if(request!==revision)return;
      if(current.length){
        results=current;
        if(!results.some(r=>r.id===selected))selected=results.some(r=>r.id===place.featured)?place.featured:results[0].id;
        status.textContent=results.length+' local contests · civicAPI checked '+checkTime.format(new Date());
        paint();updateURL();
      }else if(!results.length)status.textContent='The provider lists no matches for this area. Open the county’s official results above.';
      else if(status.textContent==='Checking local returns…')status.textContent=priorStatus;
    }catch{
      if(request===revision){
        if(!results.length)status.textContent='The provider is temporarily unavailable. Open the county’s official results above.';
        else if(status.textContent==='Checking local returns…')status.textContent=priorStatus;
      }
    }finally{
      if(request===revision){
        refresh.disabled=false;
        timer=setTimeout(()=>{if(!document.hidden)loadPlace();},60000);
      }
    }
  }

  async function searchOutside(){
    const term=localQuery.value.trim();
    if(!term)return;
    const request=++revision;
    clearTimeout(timer);region='';selected=null;foundTerm=term;results=[];limit=18;
    renderPlaces();updateURL();sourceLinks.replaceChildren(link('Provider calendar ↗','https://civicapi.org/results'));
    search.value='';status.textContent='Searching for '+term+'…';refresh.textContent='Refresh';refresh.disabled=true;paint();
    try{
      const matches=await providerSearch(term,localState.value);
      if(request!==revision)return;
      results=matches;selected=results[0]?.id;
      status.textContent=results.length?results.length+' local matches for '+term+' · civicAPI checked '+checkTime.format(new Date()):'No local matches for '+term+' in this provider.';
      paint();
    }catch{if(request===revision)status.textContent='Local search is temporarily unavailable.';}
    finally{if(request===revision)refresh.disabled=false;}
  }

  search.addEventListener('input',()=>{limit=18;paint();});
  more.addEventListener('click',()=>{limit+=30;paint();});
  desk('#local-search-form').addEventListener('submit',event=>{event.preventDefault();searchOutside();});
  refresh.addEventListener('click',()=>{
    if(region==='san-diego'||region==='la-mesa')window.open(sanDiego,'_blank','noopener,noreferrer');
    else if(region){clearTimeout(timer);loadPlace();}
    else if(foundTerm)searchOutside();
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&region&&region!=='san-diego'&&region!=='la-mesa'){clearTimeout(timer);loadPlace();}
  });
  renderPlaces();loadPlace();
}
