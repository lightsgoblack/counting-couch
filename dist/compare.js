'use strict';
if(deskView==='compare'){
  const office=desk('#compare-office'), left=desk('#compare-a'), right=desk('#compare-b'), state=desk('#compare-state');
  const status=desk('#compare-status'), table=desk('#compare-rows'), summary=desk('#compare-summary'), detail=desk('#compare-detail');
  const filter=desk('#compare-flips'), changeHeader=desk('#compare-change');
  const sort=desk('#compare-sort'), download=desk('#compare-download');
  const names=Object.entries(stateNames).sort((a,b)=>a[1].localeCompare(b[1]));
  let index, pair, generation=0, visibleRows=[];
  for(const [code,name] of names)state.add(new Option(name,code));
  state.value=Object.hasOwn(stateNames,deskParams.get('state'))?deskParams.get('state'):'';
  filter.checked=deskParams.get('changes')==='1';
  const labelParty={D:'Democratic',R:'Republican',I:'Independent',O:'Other'};
  const pointLabel=(points,absolute=false)=>{
    if(points==null)return '—';
    if(Math.abs(points)<.005)return 'Even';
    return (points>0?'D':'R')+(absolute?' +':' ')+Math.abs(points).toFixed(2)+' pts';
  };
  const signed=value=>value>0?'+'+value:String(value);
  const requestedYear=(value,options,fallback)=>options.includes(Number(value))?Number(value):fallback;
  const archiveLink=(year,kind,code,id)=>{
    const params=new URLSearchParams({year,office:kind,state:code});
    if(id)params.set('race',id);
    return link('Open '+year+' records ↗','elections.html?'+params);
  };

  function updateUrl(){
    const query=new URLSearchParams({view:'compare',office:office.value,a:left.value,b:right.value});
    if(state.value)query.set('state',state.value);
    if(filter.checked)query.set('changes','1');
    history.replaceState(null,'','?'+query);
  }

  function chooseYears(preferredA,preferredB){
    const years=Object.keys(index.years).map(Number).filter(y=>index.years[y][office.value]).sort((a,b)=>b-a);
    left.replaceChildren(...years.map(year=>new Option(year,year)));
    right.replaceChildren(...years.map(year=>new Option(year,year)));
    const b=requestedYear(preferredB,years,years[0]);
    const before=years.find(y=>y<b)??[...years].reverse().find(y=>y>b)??b;
    left.value=String(requestedYear(preferredA,years,before));
    right.value=String(b);
    load();
  }

  const stateRows=(data,kind,code)=>data.offices[kind].filter(row=>row.id.startsWith(code));
  function delegation(rows){
    if(!rows.length)return null;
    const out={D:0,R:0,O:0,unavailable:0};
    for(const race of rows){
      const p=winner(race)?.[1];
      if(!p)out.unavailable++;
      else out[p==='D'||p==='R'?p:'O']++;
    }
    return out;
  }
  function delegationLabel(out){
    if(!out)return '—';
    return out.D+' D · '+out.R+' R'+(out.O?' · '+out.O+' other':'')+(out.unavailable?' · '+out.unavailable+' without a certified result':'');
  }

  function resultFor(code,kind){
    const [a,b]=pair;
    const rowsA=stateRows(a,kind,code), rowsB=stateRows(b,kind,code);
    if(kind==='House'){
      const first=delegation(rowsA), second=delegation(rowsB);
      const delta=first&&second?second.D-first.D:null, deltaR=first&&second?second.R-first.R:null;
      return {code,rowsA,rowsB,first,second,delta,deltaR,
        changed:delta!==null&&(delta!==0||deltaR!==0||first.O!==second.O),
        magnitude:delta===null?0:Math.abs(delta)+Math.abs(deltaR)+Math.abs(second.O-first.O)};
    }
    const first=rowsA.find(row=>row.id===code), second=rowsB.find(row=>row.id===code);
    const w1=first&&winner(first), w2=second&&winner(second);
    const m1=drMargin(first),m2=drMargin(second);
    const delta=m1==null||m2==null?null:m2-m1;
    return {code,first,second,delta,w1,w2,changed:Boolean(w1&&w2&&w1[1]!==w2[1]),magnitude:Math.abs(delta??0)};
  }

  function candidatePanel(year,kind,code,row,delegationStats){
    const panel=element('article',null,'outlook-card');
    panel.append(element('span',year+' / '+officeNames[kind].toUpperCase(),'micro'));
    if(kind==='House'){
      panel.append(element('h3',delegationLabel(delegationStats)));
    } else {
      const leading=row&&winner(row);
      panel.append(element('h3',leading?.[0]??'No regular result'));
      if(row){
        panel.append(element('p',row.total?formatNumber.format(row.total)+' recorded candidate votes':'Vote total unavailable','hint'));
        if(row.note)panel.append(element('p',row.note,'hint'));
        const list=element('ul');
        for(const [name,party,votes] of row.candidates.slice(0,5)){
          list.append(element('li',name+' · '+percent(votes,row.total),partyColors[party]));
        }
        panel.append(list);
      }
    }
    panel.append(archiveLink(year,kind,code,row?.id));return panel;
  }
  function card(label,number,caption){
    const stat=element('div',null,'desk-stat');
    stat.append(element('span',label,'micro'),element('strong',number),element('small',caption));
    return stat;
  }
  function render(){
    if(!pair)return;
    updateUrl();
    const kind=office.value,isHouse=kind==='House';
    const [a,b]=pair;
    const results=names.map(([code])=>resultFor(code,kind));
    const comparable=results.filter(r=>r.first&&r.second);
    const changed=comparable.filter(r=>r.changed);
    const gains=isHouse?null:changed.filter(r=>r.w2[1]==='D').length;
    summary.replaceChildren(card('MATCHED GEOGRAPHIES',comparable.length+' states',a.year+' versus '+b.year),
      card(isHouse?'DELEGATIONS CHANGED':'PARTY LEAD CHANGES',String(changed.length),isHouse?'Change in top-finisher counts':gains+' changed to a Democratic lead'),
      card('ARCHIVE RECORDS',formatNumber.format(a.offices[kind].length)+' / '+formatNumber.format(b.offices[kind].length),'First year / second year'));
    const selected=state.value?results.find(r=>r.code===state.value):null;
    const pool=selected?[selected]:comparable;
    visibleRows=pool.filter(r=>!filter.checked||r.changed);
    if(sort.value==='change')visibleRows.sort((x,y)=>y.magnitude-x.magnitude);
    const national=desk('#compare-national');
    const firstHouse=index.house?.[a.year], secondHouse=index.house?.[b.year];
    national.hidden=!firstHouse||!secondHouse;
    if(!national.hidden){
      const row=(year,stats)=>year+' · '+stats.D+' D / '+stats.R+' R'+(stats.other?' / '+stats.other+' other':'');
      desk('#compare-national-counts').textContent=row(a.year,firstHouse)+' → '+row(b.year,secondHouse);
    }
    desk('#compare-col-a').textContent=a.year;
    desk('#compare-col-b').textContent=b.year;
    changeHeader.textContent=isHouse?'Seat count change':'D–R margin change';
    table.replaceChildren(...visibleRows.map(row=>{
      const tr=element('tr');
      const th=element('th');th.scope='row';
      const button=deskButton(stateNames[row.code],()=>{state.value=row.code;render();detail.focus();});
      th.append(button);tr.append(th);
      if(isHouse){
        tr.append(element('td',delegationLabel(row.first)),element('td',delegationLabel(row.second)),element('td',row.delta==null?'—':signed(row.delta)+' D · '+signed(row.deltaR)+' R'));
      }else{
        for(const [win,record] of [[row.w1,row.first],[row.w2,row.second]]){
          const cell=element('td');
          cell.append(element('strong',win?.[0]??'—',partyColors[win?.[1]]),element('small',win?labelParty[win[1]]+' · '+percent(win[2],record.total):'No result'));
          tr.append(cell);
        }
        tr.append(element('td',pointLabel(row.delta,true)));
      }
      return tr;
    }));
    status.textContent=visibleRows.length?'Showing '+visibleRows.length+' '+(visibleRows.length===1?'state':'states'):'No comparable states match this selection.';
    download.disabled=!visibleRows.length;
    detail.replaceChildren();
    if(selected){
      detail.append(candidatePanel(a.year,kind,selected.code,isHouse?null:selected.first,isHouse?selected.first:null),
        candidatePanel(b.year,kind,selected.code,isHouse?null:selected.second,isHouse?selected.second:null));
    }
  }

  function exportCsv(){
    if(!pair||!visibleRows.length)return;
    const kind=office.value,[a,b]=pair,isHouse=kind==='House';
    const columns=['State','Office','First year','First result','Second year','Second result',isHouse?'Democratic seat change':'D minus R swing in percentage points','Party lead or delegation changed'];
    const cells=visibleRows.map(row=>[stateNames[row.code],kind,a.year,isHouse?delegationLabel(row.first):row.w1?.[0]??'',b.year,
      isHouse?delegationLabel(row.second):row.w2?.[0]??'',row.delta==null?'':row.delta.toFixed(isHouse?0:2),row.changed?'Yes':'No']);
    const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
    const url=URL.createObjectURL(new Blob([[columns,...cells].map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const aTag=element('a');aTag.href=url;aTag.download='counting-couch-'+kind.toLowerCase()+'-'+a.year+'-'+b.year+'.csv';
    aTag.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function load(){
    const revision=++generation;
    pair=null;visibleRows=[];download.disabled=true;
    status.textContent='Loading both election years…';
    table.replaceChildren();summary.replaceChildren();detail.replaceChildren();desk('#compare-national').hidden=true;
    try{
      const rows=await Promise.all([getYear(Number(left.value)),getYear(Number(right.value))]);
      if(revision!==generation)return;
      pair=rows;render();
    }catch{if(revision===generation)status.textContent='Comparison data could not load. Select a year to retry.';}
  }

  archiveIndex().then(data=>{
    index=data;
    for(const [id,label] of Object.entries(officeNames)) office.add(new Option(label,id));
    office.value=Object.hasOwn(officeNames,deskParams.get('office'))?deskParams.get('office'):'President';
    chooseYears(deskParams.get('a'),deskParams.get('b'));
  }).catch(()=>{status.textContent='The archive index could not load. Reload to retry.';});
  office.addEventListener('change',()=>chooseYears(left.value,right.value));
  left.addEventListener('change',load);right.addEventListener('change',load);
  state.addEventListener('change',render);filter.addEventListener('change',render);sort.addEventListener('change',render);
  desk('#compare-swap').addEventListener('click',()=>{if(!pair)return;[left.value,right.value]=[right.value,left.value];load();});
  download.addEventListener('click',exportCsv);
}
