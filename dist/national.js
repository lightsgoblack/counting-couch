'use strict';
function normalizeNational(data) {
  if (data?.test !== false || data.election?.date !== '2026-11-03' ||
      !Array.isArray(data.contests) || !Number.isFinite(Date.parse(data.fetchedAt))) {
    throw new Error('Unexpected national results format');
  }
  const offices = {senate:'Senate',house:'House',governor:'Governor'};
  const parties = {dem:'D',rep:'R',ind:'I'};
  const races = {Senate:{},House:{},Governor:{}};
  for (const contest of data.contests) {
    const office = offices[contest.chamber];
    const {state,district} = contest.jurisdiction ?? {};
    if (!office || !/^[A-Z]{2}$/.test(state) || !Array.isArray(contest.candidates)) continue;
    if (office==='House' && !/^(AL|\d{1,2})$/.test(district)) continue;
    const key = office==='House' ? state+'-'+(district==='AL'?'00':district.padStart(2,'0')) : state;
    const cands = contest.candidates.filter(c=>typeof c.name==='string').map(c=>({
      n:c.name, p:parties[c.group] ?? 'O', party:c.party,
      v:Number.isFinite(c.votes)?c.votes:0, pct:Number.isFinite(c.pct)?c.pct:null
    })).sort((a,b)=>b.v-a.v);
    const call = contest.call?.caller === 'civicAPI' && Array.isArray(contest.call.winners)
      ? contest.candidates.filter(c=>contest.call.winners.includes(c.id)).map(c=>c.name) : [];
    races[office][key] = {
      leader:cands[0]?.p, total:Number.isFinite(contest.totalVotes)?contest.totalVotes:0,
      pct_in:Number.isFinite(contest.reportingPct)?contest.reportingPct:null,
      as_of:contest.updatedAt, cands, call, callTime:contest.call?.calledAt
    };
  }
  const minimum = {Senate:35,House:435,Governor:36};
  for (const [office,rows] of Object.entries(races)) {
    if (Object.keys(rows).length<minimum[office]) throw new Error('Incomplete national results response');
  }
  const counting = data.dataState==='counting';
  const liveMode = data.refresh?.mode==='live';
  const interval = Number.isFinite(data.refresh?.everySeconds)?data.refresh.everySeconds:60;
  const stale = liveMode && Date.now()-Date.parse(data.fetchedAt)>Math.max(300,interval*3)*1000;
  return Object.fromEntries(Object.entries(races).map(([office,entries])=>[office,{
    races:entries, counting, live:counting&&liveMode&&!stale, stale, as_of:data.fetchedAt, interval,
    tally:data.tallies?.find?.(entry=>offices[entry.chamber]===office)
  }]));
}
