#!/usr/bin/env python3
"""Build the per-state county files used by the 3D county map.

Usage: python3 scripts/import-counties.py INPUT_DIR [--fetch] [--year 2024] [--out dist/counties]

--fetch downloads both inputs into INPUT_DIR first (used by the GitHub Action).

INPUT_DIR holds two files:
  countypres.csv   MIT Election Data and Science Lab "County Presidential Election
                   Returns 2000-2024" (doi:10.7910/DVN/VOQCHQ), original CSV export.
  counties.zip     Census cartographic boundary county shapefile (cb_YYYY_us_county_5m.zip),
                   read with pyshp. A counties.geojson with GEOID and NAME properties
                   works too.

Writes one JSON file per state plus index.json. Every file is labeled historical
and names its sources. Counties with shapes but no joinable returns are kept as
gaps, and returns with no shape are counted, so coverage holes stay visible.
"""
import argparse
import csv
import io
import json
import math
import sys
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

STATES = dict(pair.split(':') for pair in (
    '01:AL 02:AK 04:AZ 05:AR 06:CA 08:CO 09:CT 10:DE 11:DC 12:FL 13:GA 15:HI 16:ID 17:IL 18:IN '
    '19:IA 20:KS 21:KY 22:LA 23:ME 24:MD 25:MA 26:MI 27:MN 28:MS 29:MO 30:MT 31:NE 32:NV 33:NH '
    '34:NJ 35:NM 36:NY 37:NC 38:ND 39:OH 40:OK 41:OR 42:PA 44:RI 45:SC 46:SD 47:TN 48:TX 49:UT '
    '50:VT 51:VA 53:WA 54:WV 55:WI 56:WY').split())
PARTY = {'DEMOCRAT': 'D', 'REPUBLICAN': 'R', 'LIBERTARIAN': 'L', 'GREEN': 'G'}
PRECISION = 1000  # 0.001 degree, roughly 100 m

SOURCES = {
    'returns': {
        'name': 'MIT Election Data and Science Lab, County Presidential Election Returns 2000-2024',
        'url': 'https://doi.org/10.7910/DVN/VOQCHQ',
    },
    'shapes': {
        'name': 'U.S. Census Bureau cartographic boundary files, counties 1:5,000,000',
        'url': 'https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html',
    },
}


DATAVERSE = 'https://dataverse.harvard.edu/api'
COUNTYPRES_DOI = 'doi:10.7910/DVN/VOQCHQ'
CENSUS_COUNTIES = 'https://www2.census.gov/geo/tiger/GENZ{year}/shp/cb_{year}_us_county_5m.zip'


def fetch(folder, shapes_year):
    from urllib.request import Request, urlopen
    folder.mkdir(parents=True, exist_ok=True)
    get = lambda url: urlopen(Request(url, headers={'User-Agent': 'counting-couch-import'}), timeout=120).read()
    files = json.loads(get(f'{DATAVERSE}/datasets/:persistentId/versions/:latest-published/files?persistentId={COUNTYPRES_DOI}'))['data']
    match = [f for f in files if f['label'].lower().startswith('countypres')]
    if not match:
        sys.exit('No countypres file in the Dataverse listing: ' + ', '.join(f['label'] for f in files))
    print('Downloading', match[0]['label'])
    (folder / 'countypres.csv').write_bytes(get(f"{DATAVERSE}/access/datafile/{match[0]['dataFile']['id']}?format=original"))
    url = CENSUS_COUNTIES.format(year=shapes_year)
    print('Downloading', url)
    (folder / 'counties.zip').write_bytes(get(url))


def fips(value):
    value = (value or '').strip()
    if not value or value.upper() == 'NA':
        return ''
    try:
        return f'{int(float(value)):05d}'
    except ValueError:
        return ''


def title(name):
    words = []
    for word in name.strip().split():
        words.append(word if len(word) == 1 else word.capitalize())
    return ' '.join(words)


def load_returns(path, year):
    """Return {fips: {candidate: (party, votes)}}, preferring TOTAL rows over vote-mode splits."""
    totals = defaultdict(lambda: defaultdict(lambda: ['', 0]))
    modes = defaultdict(lambda: defaultdict(lambda: ['', 0]))
    has_total = set()
    with open(path, newline='', encoding='utf-8-sig') as handle:
        for row in csv.DictReader(handle):
            if row.get('year') != str(year) or 'PRESIDENT' not in row.get('office', '').upper():
                continue
            code = fips(row.get('county_fips'))
            if not code or code[:2] not in STATES:
                continue
            name = row.get('candidate', '').strip()
            if not name or name.upper() in {'TOTAL VOTES CAST', 'UNDERVOTES', 'OVERVOTES'}:
                continue
            try:
                votes = int(float(row.get('candidatevotes') or 0))
            except ValueError:
                continue
            mode = (row.get('mode') or 'TOTAL').strip().upper()
            bucket = totals if mode == 'TOTAL' else modes
            if mode == 'TOTAL':
                has_total.add(code)
            entry = bucket[code][name]
            entry[0] = PARTY.get(row.get('party', '').strip().upper(), 'O')
            entry[1] += votes
    merged = {}
    for code in set(totals) | set(modes):
        merged[code] = totals[code] if code in has_total else modes[code]
    return merged


def read_shapes(folder):
    geojson = folder / 'counties.geojson'
    if geojson.exists():
        data = json.loads(geojson.read_text())
        for feature in data['features']:
            props = feature['properties']
            yield props['GEOID'], props['NAME'], feature['geometry']
        return
    import shapefile  # pyshp
    with zipfile.ZipFile(folder / 'counties.zip') as archive:
        stem = next(n[:-4] for n in archive.namelist() if n.endswith('.shp'))
        reader = shapefile.Reader(
            shp=io.BytesIO(archive.read(stem + '.shp')),
            shx=io.BytesIO(archive.read(stem + '.shx')),
            dbf=io.BytesIO(archive.read(stem + '.dbf')))
        for record in reader.iterShapeRecords():
            props = record.record.as_dict()
            yield props['GEOID'], props['NAME'], record.shape.__geo_interface__


def ring_area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])) / 2


def pack(geometry):
    """Quantize to integer thousandths of a degree, drop repeats and slivers."""
    polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
    out = []
    for polygon in polygons:
        rings = []
        for ring in polygon:
            pts = []
            for lon, lat in ring:
                pt = [round(lon * PRECISION), round(lat * PRECISION)]
                if not pts or pts[-1] != pt:
                    pts.append(pt)
            if len(pts) > 1 and pts[0] == pts[-1]:
                pts.pop()
            if len(pts) >= 3 and abs(ring_area(pts)) > 2:
                rings.append(pts)
        if rings:
            out.append(rings)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('--year', type=int, default=2024)
    parser.add_argument('--fetch', action='store_true', help='download the inputs into INPUT_DIR first')
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent.parent / 'dist' / 'counties')
    args = parser.parse_args()
    if args.fetch:
        fetch(args.input, args.year)

    returns = load_returns(args.input / 'countypres.csv', args.year)
    if len(returns) < 3000:
        sys.exit(f'Only {len(returns)} counties with {args.year} returns; refusing to write a partial map.')

    states = defaultdict(list)
    shaped = set()
    for geoid, name, geometry in read_shapes(args.input):
        code = str(geoid).zfill(5)
        if code[:2] not in STATES or not geometry:
            continue
        rings = pack(geometry)
        if not rings:
            continue
        shaped.add(code)
        result = returns.get(code)
        county = {'fips': code, 'name': name, 'rings': rings}
        if result:
            cands = sorted(({'n': title(n), 'p': p, 'v': v} for n, (p, v) in result.items() if v > 0),
                           key=lambda c: -c['v'])
            county['cands'] = cands
            county['total'] = sum(c['v'] for c in cands)
        states[STATES[code[:2]]].append(county)

    args.out.mkdir(parents=True, exist_ok=True)
    index = {'year': args.year, 'office': 'President', 'status': 'historical', 'built': date.today().isoformat(),
             'sources': SOURCES, 'states': {}}
    for state, counties in sorted(states.items()):
        counties.sort(key=lambda c: c['fips'])
        unshaped = sorted(code for code in returns if code[:2] == next(k for k, v in STATES.items() if v == state)
                          and code not in shaped)
        gaps = [c['fips'] for c in counties if 'total' not in c]
        doc = {'state': state, 'year': args.year, 'office': 'President', 'status': 'historical',
               'precision': PRECISION, 'sources': SOURCES, 'gaps': gaps, 'unshapedReturns': len(unshaped),
               'counties': counties}
        (args.out / f'{state}.json').write_text(json.dumps(doc, separators=(',', ':')))
        index['states'][state] = {'counties': len(counties), 'gaps': len(gaps), 'unshapedReturns': len(unshaped)}
        if gaps or unshaped:
            print(f'{state}: {len(gaps)} counties without returns, {len(unshaped)} returns without a shape')
    (args.out / 'index.json').write_text(json.dumps(index, indent=1))
    print(f'Wrote {len(states)} states to {args.out}')


if __name__ == '__main__':
    main()
