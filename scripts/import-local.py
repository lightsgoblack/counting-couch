"""Build a dated local results snapshot from the official San Diego ENR and civicAPI."""
from datetime import datetime
from html import unescape
import json
from pathlib import Path
import re
from sys import argv

root=Path(__file__).resolve().parents[1]
raw=Path(argv[1])
page=(raw/'sd.html').read_text()
stamp=re.search(r'id="lblLastPublishedDateTime"[^>]*>([^<]+)',page)[1]
datetime.strptime(stamp,'%m/%d/%Y %I:%M:%S %p')
portal='https://www.livevoterturnout.com/ENR/sandiegocaenr/25/en/Index_25.html'
blocks=re.split(r'<div id="listid_(\d+)"',page)
san_diego=[]
for contest_id,block in zip(blocks[1::2],blocks[2::2]):
    title=re.search(r'<span class="race-title">(.*?)</span>',block,re.S)
    if int(contest_id)<43 or not title:continue
    title=' '.join(unescape(title[1]).split())
    if re.match(r'^(STATE PROPOSITION|PROP\.? \d)',title):continue
    candidates=[]
    for row in re.findall(r'<tr class="content-row">(.*?)</tr>',block,re.S):
        name=re.search(r'data-candidate="true"[^>]*>\s*<span[^>]*>([^<]+)',row)
        votes=re.search(r'data-votes="true"[^>]*>\s*([\d,]+)',row)
        pct=re.search(r'data-percent="true"[^>]*>\s*([\d.]+)%',row)
        if name and votes and pct:candidates.append({'name':unescape(name[1]),'votes':int(votes[1].replace(',','')),'percent':float(pct[1])})
    if not candidates:continue
    vote_for=re.search(r'class="vote-for">\(VOTE FOR (\d+)\)',block)
    san_diego.append({'id':'sd-'+contest_id,'name':title,'candidates':candidates,'voteFor':int(vote_for[1]) if vote_for else None,
                      'source':'San Diego County Registrar of Voters','sourceUrl':portal+'#listid_'+contest_id})
assert len(san_diego)>100 and len({r['id'] for r in san_diego})==len(san_diego)
assert next(r for r in san_diego if r['name']=='CITY OF LA MESA MAYOR')['candidates'][0]['name']=='PATRICIA NORMANDY-DILLARD'

def civic_records(file):
    rows=json.loads((raw/file).read_text())['races']
    return [{'id':str(row['id']),'name':row['election_name'],'type':row['type'],'candidates':row['candidates'],'source':'civicAPI',
             'sourceUrl':'https://civicapi.org/results/elections/'+str(row['id'])}
            for row in rows if row['country']=='US' and row['province']=='CA' and row['election_type']=='Local']

la=civic_records('local-Los-Angeles.json')
assert any(r['id']=='182171' for r in la)
output={'date':'2026-11-03','retrievedAt':datetime.now().astimezone().isoformat(timespec='seconds'),
        'sanDiegoPublished':stamp+' Pacific','san-diego':san_diego,'los-angeles':la,
        'orange':civic_records('local-Orange-County.json')}
(root/'dist/local-2026.json').write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
print('Local snapshot',len(san_diego),len(la),len(output['orange']))
