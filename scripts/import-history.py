from collections import defaultdict, Counter
from pathlib import Path
import csv, json, re, hashlib
from html import unescape
from sys import argv

# Run with a directory containing the source files, then review the race counts.
# house.tsv is the MIT MEDSL House CSV (DOI DVN/IG0UN2, original checksum).
# senate.tsv and president.csv are MEDSL Dataverse datafiles 13887039 and 13887042.
# governor-xx.json files come from Election Wrld's /api/v1/datasets/governor?state=xx.
# president-history.csv is The American Vote's CC BY 4.0 state-results-1789-2024.csv.
root=Path(__file__).resolve().parents[1]
raw=Path(argv[1])
out=root/'dist/history'
out.mkdir(exist_ok=True)
years={y:defaultdict(list) for y in range(1868,2026)}
votes_by_race=defaultdict(list)
states=set('AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY'.split())
assert hashlib.md5((raw/'house.tsv').read_bytes()).hexdigest()=='a9566ac393913a1af343284e837c17bb'

def read(name, sep=','):
    with (raw/name).open(encoding='utf-8-sig',newline='') as f:
        yield from csv.DictReader(f,delimiter=sep)

def pname(value):
    return (value or 'Unspecified').strip().title().replace('Democratic-Farmer-Labor','Democratic–Farmer–Labor')

def party(label):
    if label.startswith(('DEMOCRAT','DFL')):return 'D'
    if label.startswith(('REPUBLICAN','GOP')):return 'R'
    if label in ('INDEPENDENT','UNAFFILIATED','NO PARTY AFFILIATION','NO PARTY'):return 'I'
    return 'O'

def name(raw_name):
    if not raw_name or raw_name.strip() in ('NA','WRITEIN','WRITE-IN','WRITE INS','OTHER','OTHER VOTES'):
        return 'Write-in / other'
    raw_name=' '.join(raw_name.split())
    p=raw_name.split(', ',1)
    val=(p[1]+' '+p[0]) if len(p)==2 and p[1] not in ('JR','JR.','SR','SR.','II','III','IV') else raw_name
    val=re.sub(r'\b(JR\.?|SR\.?|II|III|IV) ([A-Z][A-Z -]+)$',r'\2 \1',val)
    return re.sub(r"\b(?:Mc[a-z]|O'[a-z])|\b(?:Ii|Iii|Iv)\b",lambda m:m.group(0)[:-1]+m.group(0)[-1].upper() if len(m.group(0))==3 and m.group(0)[:2]=='Mc' else m.group(0).upper() if m.group(0).lower() in ('ii','iii','iv') else m.group(0),val.title().strip())

for file,office,sep in [('house.tsv','House',','),('senate.tsv','Senate','\t'),('president.csv','President',',')]:
    for row in read(file,sep):
        year=int(row['year']);state=row['state_po']
        if year not in years or state not in states:continue
        if office=="House" and state=="DC":continue
        stage=row.get('stage','gen').lower()
        if stage not in ('gen','gen runoff','runoff') or row.get('mode','total').lower()!='total':continue
        if year==2021 and office=='Senate' and state=='GA' and stage=='runoff':year=2020
        if office=='Senate' and state=='GA' and year in (2020,2022) and stage=='gen':continue
        special=row.get('special','false').lower()=='true'
        district=row.get('district','') if office=='House' else ''
        id=state+('-'+str(int(float(district))).zfill(2) if office=='House' else '-special' if special else '')
        votes_by_race[year,office,id].append(row)

for (year,office,id),rows in sorted(votes_by_race.items()):
    candidates={}
    excluded=('EXHAUSTED BALLOT','UNDERVOTE','OVERVOTE','BLANK VOTE','INVALID BALLOT')
    rows=[row for row in rows if not (row.get('candidate') or '').strip().upper().startswith(excluded)]
    if not rows:continue
    for row in rows:
        n=name(row.get('candidate'))
        label=row.get('party_simplified') or row.get('party') or 'OTHER'
        detail=row.get('party_detailed') or row.get('party') or label
        p=party(label)
        try:v=int(float(row['candidatevotes']))
        except (TypeError,ValueError):continue
        if v<0 and len(rows)>1:continue
        v=max(0,v)
        c=candidates.setdefault(n,[n,p,0,pname(detail)])
        if c[1]=='O' and p in ('D','R','I'):c[1]=p;c[3]=pname(detail)
        c[2]+=v
    cands=sorted(candidates.values(),key=lambda x:-x[2])
    if not cands:continue
    total=sum(c[2] for c in cands)
    note='No vote total is reported for this contest.' if total==0 else ''
    if office=='Senate' and id.startswith('GA') and year in (2020,2022):note='Deciding runoff · '+('January 5, 2021' if year==2020 else 'December 6, 2022')
    if office=='House' and id=='NC-09' and year==2018:note='The 2018 result was not certified. A new election was held in 2019.'
    if any(row.get('unofficial','').lower()=='true' for row in rows) and not note:note='The source marks these returns as unofficial.'
    years[year][office].append({'id':id,'total':total,'candidates':cands,**({'note':note} if note else {}),**({'void':True} if office=='House' and id=='NC-09' and year==2018 else {})})

for path in sorted(raw.glob('governor-??.json')):
    for r in json.loads(path.read_text()):
        y=r['year']; state=path.stem[-2:].upper()
        if y not in years or not r.get('total') or not r.get('candidates'):continue
        cands=[[c['name'],c['party'] if c['party'] in ('D','R','I') else 'O',c['votes'],c['party_label']] for c in r['candidates'] if isinstance(c.get('votes'),int) and c['votes']>=0]
        winner=next((c['name'] for c in r['candidates'] if c.get('winner')),None)
        years[y]['Governor'].append({'id':state+('-special' if r.get('special') else ''),'date':r.get('date'),'total':r['total'],'candidates':sorted(cands,key=lambda x:-x[2]),'winner':winner,'source':r['source']})

# Presidential popular votes before MEDSL and electoral votes for every cycle.
presidential=defaultdict(list)
for row in read('president-history.csv'):
    year=int(row['year'])
    if year in years and row['state'] in states:presidential[year].append(row)

labels={'Dem':'Democratic','Rep':'Republican','Prog':'Progressive','Ind':'Independent','Dix':'States’ Rights Democratic','AIP':'American Independent'}
electoral={}
for year,rows in sorted(presidential.items()):
    totals=Counter()
    for row in rows:
        count=int(row['electoral_votes'] or 0)
        if count>0:totals[row['candidate']]+=count
    [(first,votes),(second,runner),*other]=totals.most_common()
    electoral[year]=[first,votes,second,runner,sum(count for _,count in other)]
    if years[year].get('President'):continue
    groups=defaultdict(list)
    for row in rows:
        if row['vote_status']=='sourced' and row['popular_votes']:groups[row['state']].append(row)
    for state,entries in sorted(groups.items()):
        parties={'Dem':'D','Rep':'R','Ind':'I'}
        candidates=[[row['candidate'],parties.get(row['party'],'O'),int(row['popular_votes']),labels.get(row['party'],row['party'] or 'Other')]
                    for row in entries if int(row['popular_votes'])>0]
        candidates.sort(key=lambda row:-row[2])
        notes=list(dict.fromkeys(row['note'] for row in entries if row['note']))
        years[year]['President'].append({'id':state,'total':sum(row[2] for row in candidates),'candidates':candidates,
            'source':'american-vote','note':' '.join(notes) if notes else 'Historic popular-vote tabulation.'})

# The 1960 state export separates Alabama's five pledged electors from its
# presidential candidate name. Use the certified national tally in that cycle.
electoral[1960]=['John F. Kennedy',303,'Richard Nixon',219,15]
# Greeley died before electors voted. Congress rejected the three votes cast for him.
electoral[1872]=['Ulysses S. Grant',286,'Horace Greeley',0,63]
expected_electors=[(214,80),(286,0),(185,184),(214,155),(219,182),(233,168),(277,145),(271,176),(292,155),(336,140),(321,162),(435,88),(277,254),(404,127),(382,136),(444,87),(472,59),(523,8),(449,82),(432,99),(303,189),(442,89),(457,73),
    (303,219),(486,52),(301,191),(520,17),(297,240),(489,49),(525,13),(426,111),(370,168),(379,159),
    (271,266),(286,251),(365,173),(332,206),(304,227),(306,232),(312,226)]
for year,(first,second) in zip(range(1868,2025,4),expected_electors):
    assert tuple(electoral[year][i] for i in (1,3))==(first,second),(year,electoral[year])
    expected_states={1868:33,1872:36,1876:37,1880:38,1884:38,1888:38,1892:44,1896:45,1900:45,1904:45,1908:46}.get(year,48 if year<1960 else 50 if year==1960 else 51)
    assert len(years[year]['President'])==expected_states,(year,len(years[year]['President']))

for y in (2016,2018,2020,2022,2024):
    assert len(years[y]['House'])==435,(y,len(years[y]['House']))
for year,offices in years.items():
    for office,rows in offices.items():
        assert len(rows)==len({row['id'] for row in rows}),(year,office,'duplicate contest')
        assert all(row['total']>=0 and row['candidates'] for row in rows),(year,office,'invalid votes')

index={}
for year,offices in years.items():
    if not offices:continue
    index[year]={kind:len(rows) for kind,rows in offices.items()}
    (out/f'{year}.json').write_text(json.dumps({'year':year,'offices':offices},ensure_ascii=False,separators=(',',':')))
# Initial national House divisions, independent of our district-level returns.
house={}
for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>',(raw/'house-parties.html').read_text(),re.I|re.S):
    cells=[unescape(re.sub(r'<[^>]+>',' ',re.sub(r'<sup\b[^>]*>.*?</sup>','',c,flags=re.I|re.S))).strip()
           for c in re.findall(r'<td\b[^>]*>(.*?)</td>',row,re.I|re.S)]
    if len(cells)<6:continue
    match=re.search(r'\((\d{4})\s*[-–]\s*\d{4}\)',cells[0])
    if not match:continue
    year=int(match[1])-1
    if not 1924<=year<=2024:continue
    seats,d,r=map(int,cells[1:4])
    other=sum(int(v) for v in re.findall(r'\((\d+)\)',cells[4]))
    assert seats>=d+r+other,(year,seats,d,r,other)
    house[year]={'seats':seats,'D':d,'R':r,'other':other}
assert len(house)==51 and house[1924]['R']==247 and house[2024]['R']==220
(out/'index.json').write_text(json.dumps({'years':index,'electoral':electoral,'house':house},ensure_ascii=False,separators=(',',':')))
print('Coverage',Counter({office:sum(len(cycle.get(office,[])) for cycle in years.values()) for office in ('President','Senate','House','Governor')}))
