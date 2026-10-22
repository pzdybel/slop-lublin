# Slop Lublin

Lublin w 3D, zbudowany z prawdziwych ulic, budynków, parków, drzew i trakcji trolejbusowej z OpenStreetMap.
Spaceruj po Starym Mieście, jedź taksówką przez Krakowskie Przedmieście, rowerem do Ogrodu Saskiego albo przeleć helikopterem nad Zamkiem.

**Remiks [Slop New York](https://github.com/mrdoob/slop-newyork) autorstwa [Mr.dooba](https://github.com/mrdoob)** — ten sam pomysł (miasto z prawdziwych danych, cztery tryby poruszania się, kamery filmowe, pora dnia, atlas z teleportem), przeniesiony z Manhattanu do Lublina. Oryginał też był vibecodowany, ten też. Dzięki, Mr.doob!

## Sterowanie

| | |
|---|---|
| `W A S D` / strzałki | ruch |
| `Shift` | sprint / turbo |
| `Spacja` / `C` | skok · w górę / w dół (helikopter) |
| `1` `2` `3` `4` | pieszo · taksówka · rower · helikopter |
| `5` `6` `7` / `V` | kamery: pościg · nisko · z oczu |
| `8` `9` `0` | widoki: Zamek · Brama Krakowska · Wieża Trynitarska |
| `M` | atlas ulic — klik = teleport, Shift+klik = trasa GPS |
| `N` | następna pora dnia |
| `H` | ukryj interfejs |
| mysz | przeciągnij = obrót kamery, kółko = zoom |

Na telefonie: wirtualny joystick + przyciski góra/dół.

## Uruchomienie

Czyste pliki statyczne — bez builda, bez backendu. three.js ładuje się z CDN (jsDelivr).

```bash
python3 -m http.server 8000   # potem http://localhost:8000
```

Na serwer: wrzuć `index.html`, `css/` i `js/` (np. FTP-em) albo włącz GitHub Pages dla repo.

## Dane

`js/lublin-data.js` jest generowany ze świeżych danych OSM:

```bash
mkdir -p data/raw && cd data/raw && ../../tools/fetch-osm.sh && cd ../..
python3 tools/build-geodata.py data/raw data/lublin
# potem owiń data/lublin.json w window.LUBLIN = … (patrz nagłówek js/lublin-data.js)
```

Obszar: centrum Lublina — Stare Miasto, Śródmieście, Zamek i Podzamcze, Plac Litewski, Ogród Saski, kampus UMCS/KUL, okolice dworca i Areny (ok. 3,5 × 3,3 km).
Układ świata: 1 jednostka = 1 m, x = wschód, z = południe, początek w Bramie Krakowskiej.

## Technologia

- [three.js](https://threejs.org/) r170, WebGLRenderer, cienie, bloom (UnrealBloomPass)
- okna budynków generowane proceduralnie w shaderze (wstrzyknięte do `MeshStandardMaterial`), nocą losowo zapalone
- ruch uliczny, trolejbusy i piesi poruszają się po grafie dróg z OSM; trasa GPS liczona A*
- dane: OpenStreetMap API → Python → jeden plik JS

## Licencja i dane

Kod: [MIT](LICENSE). Projekt jest pochodną [Slop New York](https://github.com/mrdoob/slop-newyork) (MIT, © 2026 Mr.doob).

Dane geograficzne: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).
