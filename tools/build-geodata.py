#!/usr/bin/env python3
"""Convert raw OSM tiles of central Lublin into a compact game data file (lublin-data.js).
World frame: 1 unit = 1 m, x = east, z = south, origin at Brama Krakowska."""
import glob, json, math, sys, re
import xml.etree.ElementTree as ET

RAW = sys.argv[1]
OUT = sys.argv[2]
LAT0, LON0 = 51.24785, 22.56640  # Brama Krakowska
R = 6378137.0
KX = math.cos(math.radians(LAT0)) * math.pi / 180 * R
KZ = math.pi / 180 * R

def w(lat, lon):
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)

nodes, ways, rels = {}, {}, {}
for f in sorted(glob.glob(RAW + '/t_*.osm')):
    for ev, el in ET.iterparse(f, events=('end',)):
        t = el.tag
        if t == 'node':
            i = int(el.get('id'))
            if i not in nodes:
                tags = {c.get('k'): c.get('v') for c in el if c.tag == 'tag'}
                nodes[i] = (float(el.get('lat')), float(el.get('lon')), tags or None)
        elif t == 'way':
            i = int(el.get('id'))
            if i not in ways:
                ways[i] = ([int(c.get('ref')) for c in el if c.tag == 'nd'], {c.get('k'): c.get('v') for c in el if c.tag == 'tag'})
        elif t == 'relation':
            i = int(el.get('id'))
            if i not in rels:
                rels[i] = ([(c.get('type'), int(c.get('ref')), c.get('role')) for c in el if c.tag == 'member'],
                           {c.get('k'): c.get('v') for c in el if c.tag == 'tag'})
        if t in ('way', 'relation'):
            el.clear()
print('nodes', len(nodes), 'ways', len(ways), 'rels', len(rels), file=sys.stderr)

XMIN, XMAX, ZMIN, ZMAX = -2200, 1350, -1150, 2200
def inb(x, z, m=0):
    return XMIN - m <= x <= XMAX + m and ZMIN - m <= z <= ZMAX + m

def pts(refs):
    out = []
    for r in refs:
        n = nodes.get(r)
        if n is None:
            continue
        out.append(w(n[0], n[1]))
    return out

def q(v):
    return round(v, 1)

def flat(p):
    return [c for xz in p for c in (q(xz[0]), q(xz[1]))]

def area(p):
    a = 0
    for i in range(len(p)):
        x0, z0 = p[i]; x1, z1 = p[(i + 1) % len(p)]
        a += x0 * z1 - x1 * z0
    return a / 2

def centroid(p):
    return (sum(x for x, _ in p) / len(p), sum(z for _, z in p) / len(p))

def simplify(p, eps):
    if len(p) < 3:
        return p
    def d(pt, a, b):
        ax, az = a; bx, bz = b; px, pz = pt
        dx, dz = bx - ax, bz - az
        L = dx * dx + dz * dz
        if L == 0: return math.hypot(px - ax, pz - az)
        t = max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L))
        return math.hypot(px - ax - t * dx, pz - az - t * dz)
    def rec(s, e, keep):
        mx, mi = 0, -1
        for i in range(s + 1, e):
            dd = d(p[i], p[s], p[e])
            if dd > mx: mx, mi = dd, i
        if mx > eps:
            keep[mi] = True; rec(s, mi, keep); rec(mi, e, keep)
    keep = [False] * len(p); keep[0] = keep[-1] = True
    rec(0, len(p) - 1, keep)
    return [p[i] for i in range(len(p)) if keep[i]]

def ring(refs):
    p = pts(refs)
    if len(p) > 1 and p[0] == p[-1]:
        p = p[:-1]
    p = simplify(p + [p[0]], 0.35)[:-1] if len(p) > 3 else p
    if len(p) < 3:
        return None
    if area(p) < 0:  # make CCW in x/z (screen) orientation consistent
        p = p[::-1]
    return p

def stitch(wids):
    segs = [list(ways[i][0]) for i in wids if i in ways]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for s in segs:
                if s[0] == cur[-1]: cur += s[1:]
                elif s[-1] == cur[-1]: cur += s[::-1][1:]
                elif s[-1] == cur[0]: cur = s + cur[1:]
                elif s[0] == cur[0]: cur = s[::-1] + cur[1:]
                else: continue
                segs.remove(s); changed = True; break
        if cur[0] == cur[-1]:
            rings.append(cur)
    return rings

def num(v, d=None):
    if not v: return d
    m = re.match(r'\s*([0-9]+(?:[.,][0-9]+)?)', v)
    return float(m.group(1).replace(',', '.')) if m else d

# ---------------------------------------------------------------- buildings
BUILD_DEFAULT = {'house': 2, 'detached': 2, 'garage': 1, 'garages': 1, 'shed': 1, 'roof': 1, 'kiosk': 1,
                 'church': 4, 'cathedral': 6, 'apartments': 5, 'residential': 4, 'commercial': 4, 'retail': 2,
                 'office': 6, 'university': 4, 'school': 3, 'hospital': 5, 'industrial': 2, 'warehouse': 2,
                 'hotel': 6, 'public': 4, 'civic': 4, 'train_station': 2, 'service': 1, 'chapel': 2, 'yes': 3}
buildings = []
used_way_ids = set()

def add_building(rg, tags, holes=None):
    if not rg: return
    c = centroid(rg)
    if not inb(*c): return
    a = abs(area(rg))
    if a < 6: return
    bt = tags.get('building') or tags.get('building:part') or 'yes'
    h = num(tags.get('height'))
    lv = num(tags.get('building:levels'))
    mh = num(tags.get('min_height'), 0) or 0
    if h is None:
        if lv is None:
            lv = BUILD_DEFAULT.get(bt, 3)
            if bt in ('yes', 'apartments', 'residential') and a > 900: lv = 5
        h = lv * 3.2 + (1.2 if lv > 1 else 0.6)
    if mh == 0 and tags.get('building:min_level'):
        mh = num(tags.get('building:min_level'), 0) * 3.2
    roof = tags.get('roof:shape', '')
    rh = num(tags.get('roof:height'))
    if roof in ('gabled', 'hipped', 'pyramidal', 'dome', 'onion', 'gambrel', 'mansard') and rh is None:
        rh = min(6, max(2, math.sqrt(a) * 0.3))
    b = {'p': flat(rg), 'h': round(h, 1)}
    if mh: b['m'] = round(mh, 1)
    if roof in ('gabled', 'hipped', 'pyramidal', 'dome', 'onion', 'gambrel', 'mansard', 'skillion'):
        b['r'] = roof[0:3]; b['rh'] = round(rh or 2, 1)
    col = tags.get('building:colour') or tags.get('colour')
    if col: b['c'] = col
    rc = tags.get('roof:colour')
    if rc: b['rc'] = rc
    t = bt if bt in ('church', 'cathedral', 'chapel', 'house', 'garage', 'garages', 'industrial', 'apartments',
                     'university', 'office', 'commercial', 'retail', 'train_station', 'roof', 'shed') else None
    if tags.get('amenity') == 'place_of_worship' or tags.get('building') in ('church', 'cathedral'): t = 'church'
    if tags.get('historic') in ('castle', 'city_gate', 'tower') or tags.get('man_made') == 'tower': t = 'hist'
    if t: b['t'] = t
    mat = tags.get('building:material')
    if mat: b['mat'] = mat
    if tags.get('name'): b['n'] = tags['name']
    if holes: b['holes'] = [flat(hh) for hh in holes]
    buildings.append(b)

# parts first: if a building has parts, prefer the parts (they model towers)
has_parts_outline = set()
for wid, (refs, tags) in ways.items():
    if 'building:part' in tags and tags['building:part'] != 'no':
        add_building(ring(refs), tags); used_way_ids.add(wid)
for rid, (mem, tags) in rels.items():
    if tags.get('type') == 'building':
        for typ, ref, role in mem:
            if role == 'outline' and typ == 'way': has_parts_outline.add(ref)
for rid, (mem, tags) in rels.items():
    if tags.get('type') == 'multipolygon' and ('building' in tags or 'building:part' in tags):
        outers = stitch([r for t, r, ro in mem if t == 'way' and ro == 'outer'])
        inners = stitch([r for t, r, ro in mem if t == 'way' and ro == 'inner'])
        hr = [ring(i) for i in inners]
        for o in outers:
            if rid not in has_parts_outline:
                add_building(ring(o), tags, [h for h in hr if h])
        for t, r, ro in mem:
            used_way_ids.add(r)
# outlines that contain building:parts are replaced by their parts (avoids coplanar z-fighting)
part_pts = [centroid(ring(r) or [(1e9, 1e9)]) for wid, (r, t) in ways.items() if 'building:part' in t and t['building:part'] != 'no']
def pip(x, z, poly):
    ins = False; j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]; xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi: ins = not ins
        j = i
    return ins
skipped = 0
for wid, (refs, tags) in ways.items():
    if wid in used_way_ids or wid in has_parts_outline: continue
    if 'building' in tags and tags['building'] != 'no' and len(refs) > 3 and refs[0] == refs[-1]:
        rg = ring(refs)
        if not rg: continue
        xs = [p[0] for p in rg]; zs = [p[1] for p in rg]
        if any(min(xs) <= px <= max(xs) and min(zs) <= pz <= max(zs) and pip(px, pz, rg) for px, pz in part_pts):
            skipped += 1; continue
        add_building(rg, tags)
print('outlines replaced by parts', skipped, file=sys.stderr)
print('buildings', len(buildings), file=sys.stderr)

# ---------------------------------------------------------------- roads
RW = {'motorway': 16, 'trunk': 14, 'primary': 13, 'secondary': 11, 'tertiary': 9.5, 'unclassified': 7,
      'residential': 6.5, 'living_street': 5.5, 'service': 4.5, 'pedestrian': 7, 'footway': 2.6, 'path': 2.2,
      'cycleway': 2.4, 'steps': 2.6, 'track': 3.5, 'motorway_link': 7, 'trunk_link': 7, 'primary_link': 7,
      'secondary_link': 6.5, 'tertiary_link': 6}
CLS = {'motorway': 0, 'trunk': 0, 'primary': 1, 'secondary': 1, 'tertiary': 2, 'unclassified': 3, 'residential': 3,
       'living_street': 4, 'service': 4, 'pedestrian': 5, 'footway': 6, 'path': 6, 'cycleway': 7, 'steps': 8,
       'track': 6}
roads = []
for wid, (refs, tags) in ways.items():
    hw = tags.get('highway')
    if not hw: continue
    base = hw.replace('_link', '') if hw.endswith('_link') else hw
    if base not in CLS: continue
    if tags.get('area') == 'yes': continue
    if tags.get('footway') in ('sidewalk', 'crossing') and base == 'footway':
        continue  # sidewalks are generated from roads
    p = pts(refs)
    if len(p) < 2: continue
    if not any(inb(x, z, 50) for x, z in p): continue
    p = simplify(p, 0.4)
    lanes = num(tags.get('lanes'))
    wd = num(tags.get('width'))
    if wd is None:
        wd = RW.get(hw, RW.get(base, 6))
        if lanes and CLS[base] <= 3: wd = max(wd * 0.6, lanes * 3.3)
    r = {'p': flat(p), 'k': CLS[base], 'w': round(wd, 1)}
    if tags.get('name'): r['n'] = tags['name']
    if tags.get('oneway') in ('yes', '1'): r['o'] = 1
    if tags.get('oneway') == '-1': r['o'] = -1
    if tags.get('bridge') and tags['bridge'] != 'no': r['b'] = 1
    if tags.get('tunnel') and tags['tunnel'] != 'no': r['tu'] = 1
    ly = num(tags.get('layer'))
    if ly: r['l'] = int(ly) if tags.get('layer', '').lstrip('-').isdigit() else 0
    if tags.get('layer', '').startswith('-'): r['l'] = -int(num(tags['layer'][1:], 1))
    sf = tags.get('surface')
    if sf in ('sett', 'cobblestone', 'paving_stones', 'unhewn_cobblestone'): r['s'] = 'c'
    if tags.get('trolley_wire') == 'yes': r['tw'] = 1
    roads.append(r)
print('roads', len(roads), file=sys.stderr)

# ---------------------------------------------------------------- areas
AREA = []
def kind(tags):
    if tags.get('natural') == 'water' or tags.get('waterway') == 'riverbank' or tags.get('landuse') in ('reservoir', 'basin'): return 'water'
    if tags.get('leisure') in ('park', 'garden') : return 'park'
    if tags.get('landuse') in ('grass', 'meadow', 'village_green', 'recreation_ground', 'flowerbed') or tags.get('natural') in ('grassland', 'scrub', 'heath'): return 'grass'
    if tags.get('natural') == 'wood' or tags.get('landuse') == 'forest': return 'wood'
    if tags.get('landuse') == 'cemetery' or tags.get('amenity') == 'grave_yard': return 'cemetery'
    if tags.get('leisure') in ('pitch', 'stadium', 'track', 'playground', 'sports_centre'): return 'pitch'
    if tags.get('amenity') == 'parking' and tags.get('parking', 'surface') == 'surface': return 'parking'
    if (tags.get('highway') == 'pedestrian' and tags.get('area') == 'yes') or tags.get('place') == 'square' or tags.get('area:highway') == 'pedestrian': return 'plaza'
    if tags.get('landuse') == 'railway': return 'rail'
    return None

for wid, (refs, tags) in ways.items():
    k = kind(tags)
    if not k or len(refs) < 4 or refs[0] != refs[-1]: continue
    rg = ring(refs)
    if not rg or not any(inb(x, z, 100) for x, z in rg): continue
    AREA.append({'k': k, 'p': flat(rg), 'a': abs(area(rg)), **({'n': tags['name']} if tags.get('name') else {})})
for rid, (mem, tags) in rels.items():
    if tags.get('type') != 'multipolygon': continue
    k = kind(tags)
    if not k: continue
    for o in stitch([r for t, r, ro in mem if t == 'way' and ro == 'outer']):
        rg = ring(o)
        if rg and any(inb(x, z, 100) for x, z in rg):
            AREA.append({'k': k, 'p': flat(rg), 'a': abs(area(rg)), **({'n': tags['name']} if tags.get('name') else {})})
AREA.sort(key=lambda a: -a['a'])
for a in AREA: a.pop('a')
print('areas', len(AREA), file=sys.stderr)

# waterways / rail lines
lines = []
for wid, (refs, tags) in ways.items():
    if tags.get('waterway') in ('river', 'stream', 'canal'):
        p = simplify(pts(refs), 0.8)
        if len(p) > 1 and any(inb(x, z, 100) for x, z in p):
            lines.append({'k': 'river', 'w': num(tags.get('width'), 18 if tags['waterway'] == 'river' else 3), 'p': flat(p), **({'n': tags['name']} if tags.get('name') else {})})
    if tags.get('railway') in ('rail', 'tram') and tags.get('service') not in ('yard', 'siding', 'spur'):
        p = simplify(pts(refs), 0.5)
        if len(p) > 1 and any(inb(x, z, 50) for x, z in p):
            lines.append({'k': 'rail', 'p': flat(p), **({'b': 1} if tags.get('bridge') else {})})
    if tags.get('barrier') in ('city_wall', 'wall') and tags.get('historic') == 'citywalls' or tags.get('barrier') == 'city_wall':
        p = pts(refs)
        if len(p) > 1 and any(inb(x, z) for x, z in p):
            lines.append({'k': 'wall', 'p': flat(p), 'h': num(tags.get('height'), 7)})

# ---------------------------------------------------------------- point features
trees, lamps, pois = [], [], []
for nid, (lat, lon, tags) in nodes.items():
    if not tags: continue
    x, z = w(lat, lon)
    if not inb(x, z): continue
    if tags.get('natural') == 'tree':
        trees.append(q(x)); trees.append(q(z))
    elif tags.get('highway') == 'street_lamp':
        lamps.append(q(x)); lamps.append(q(z))
    elif tags.get('highway') == 'traffic_signals':
        pois.append({'k': 'sig', 'x': q(x), 'z': q(z)})
    elif tags.get('highway') == 'bus_stop' or tags.get('public_transport') == 'platform':
        if tags.get('name'): pois.append({'k': 'bus', 'x': q(x), 'z': q(z), 'n': tags['name']})
    elif tags.get('amenity') == 'bench':
        pois.append({'k': 'bench', 'x': q(x), 'z': q(z)})
    elif tags.get('amenity') == 'fountain':
        pois.append({'k': 'fount', 'x': q(x), 'z': q(z)})
    elif tags.get('historic') in ('memorial', 'monument') and tags.get('name'):
        pois.append({'k': 'mon', 'x': q(x), 'z': q(z), 'n': tags['name']})
# tree rows
for wid, (refs, tags) in ways.items():
    if tags.get('natural') == 'tree_row':
        p = pts(refs)
        for i in range(len(p) - 1):
            (x0, z0), (x1, z1) = p[i], p[i + 1]
            L = math.hypot(x1 - x0, z1 - z0)
            for s in range(int(L // 8) + 1):
                t = s * 8 / L if L else 0
                x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
                if inb(x, z): trees += [q(x), q(z)]
print('trees', len(trees) // 2, 'lamps', len(lamps) // 2, 'pois', len(pois), file=sys.stderr)

json.dump({'b': buildings, 'r': roads, 'a': AREA, 'l': lines, 't': trees, 'lp': lamps, 'poi': pois,
           'bounds': [XMIN, XMAX, ZMIN, ZMAX], 'origin': [LAT0, LON0]},
          open(OUT + '.json', 'w'), separators=(',', ':'), ensure_ascii=False)
# named features for landmark lookup
names = {}
for b in buildings:
    if 'n' in b:
        p = b['p']; names.setdefault(b['n'], (round(sum(p[0::2]) / (len(p) / 2)), round(sum(p[1::2]) / (len(p) / 2)), b['h']))
for a in AREA:
    if 'n' in a:
        p = a['p']; names.setdefault(a['n'], (round(sum(p[0::2]) / (len(p) / 2)), round(sum(p[1::2]) / (len(p) / 2)), 0))
json.dump(names, open(OUT + '.names.json', 'w'), ensure_ascii=False, indent=0)
