#!/usr/bin/env bash
# Genera data/buildings.pmtiles con edificios 3D de Chihuahua a partir de
# Microsoft Global Building Footprints (open data, mejor cobertura que OSM).
# Como esos datos NO traen altura para México, se asigna una altura variada
# realista. Requiere: python3 + tippecanoe (brew install tippecanoe).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bld data
export PATH="/opt/homebrew/bin:$PATH"

command -v tippecanoe >/dev/null || { echo "❌ Falta tippecanoe: brew install tippecanoe"; exit 1; }

# bbox del metro de Chihuahua (ajústalo si operas más lejos)
BBOX="${BBOX:--106.32,28.48,-105.88,28.88}"

echo "==> Índice de Microsoft Buildings…"
[ -f bld/ms-links.csv ] || curl -fL "https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv" -o bld/ms-links.csv

echo "==> Descargando tiles de Chihuahua y construyendo GeoJSON con alturas…"
python3 - "$BBOX" <<'PY'
import sys, csv, math, gzip, json, urllib.request, random
W,S,E,N = map(float, sys.argv[1].split(","))
def quadkey(lat, lon, z=9):
    sin=math.sin(lat*math.pi/180)
    x=int((lon+180)/360*(2**z)); y=int((0.5-math.log((1+sin)/(1-sin))/(4*math.pi))*(2**z))
    q="";
    for i in range(z,0,-1):
        d=0; m=1<<(i-1)
        if x&m: d+=1
        if y&m: d+=2
        q+=str(d)
    return q
# quadkeys z9 que tocan el bbox (esquinas + centro)
pts=[(S,W),(S,E),(N,W),(N,E),((S+N)/2,(W+E)/2)]
qks=set(quadkey(la,lo) for la,lo in pts)
urls={}
for r in csv.DictReader(open("bld/ms-links.csv")):
    if r["Location"]=="Mexico" and r["QuadKey"] in qks: urls[r["QuadKey"]]=r["Url"]
random.seed(42)
def rh():
    r=random.random()
    if r<0.72: return round(random.uniform(3,6),1)
    if r<0.93: return round(random.uniform(6,11),1)
    return round(random.uniform(12,28),1)
def inb(lo,la): return W<=lo<=E and S<=la<=N
out=open("bld/buildings.geojsonl","w"); kept=0
for q,u in urls.items():
    fn=f"bld/{q}.csv.gz"
    try: open(fn,"rb").close()
    except: urllib.request.urlretrieve(u, fn)
    with gzip.open(fn,"rt") as f:
        for line in f:
            line=line.strip()
            if not line: continue
            try: ft=json.loads(line)
            except: continue
            c=(ft.get("geometry") or {}).get("coordinates")
            if not c: continue
            lo,la=c[0][0][0],c[0][0][1]
            if not inb(lo,la): continue
            ft["properties"]={"h": rh()}
            out.write(json.dumps(ft)+"\n"); kept+=1
out.close(); print(f"   edificios dentro del bbox: {kept}")
PY

# zoom máx 14 = IGUAL que las calles (chihuahua.pmtiles). Clave: si los edificios
# llegan a z16 y las calles solo a z14, al combinar los tiles z15-16 quedan SIN
# calles y el mapa las pierde. Mismo maxzoom → el mapa sobre-escala ambos.
echo "==> Tilando edificios (zoom máx 14, sin descartar) → data/buildings.pmtiles…"
tippecanoe -o data/buildings.pmtiles -l building -Z13 -z14 \
  --no-tile-size-limit --no-feature-limit -y h --force bld/buildings.geojsonl

# Combina calles + edificios en UN solo archivo (con 2 archivos, MapLibre a veces
# no carga uno). Requiere data/chihuahua.pmtiles (corre ./generate.sh antes).
if [ -f data/chihuahua.pmtiles ]; then
  echo "==> Combinando calles + edificios → data/chihuahua-city.pmtiles…"
  tile-join -o data/chihuahua-city.pmtiles --force data/chihuahua.pmtiles data/buildings.pmtiles
  echo "✅ Listo: data/chihuahua-city.pmtiles (calles + edificios 3D en un archivo)"
else
  echo "⚠️  Falta data/chihuahua.pmtiles — corre ./generate.sh y vuelve a correr esto."
fi
echo "   El preview (preview.html) ya lo usa. En producción publica ese único"
echo "   archivo y apunta tu style.json a él."
