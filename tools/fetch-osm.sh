#!/bin/bash
# lon 22.535..22.585 step .01, lat 51.228..51.263 step .007
fetch(){ f="t_$1_$2.osm"; [ -s "$f" ] && grep -q "</osm>" "$f" && return; for i in 1 2 3 4; do curl -s -m 120 -A "slop-lublin/1.0" -o "$f" "https://api.openstreetmap.org/api/0.6/map?bbox=$1,$2,$3,$4" && grep -q "</osm>" "$f" && { echo ok $f; return; }; sleep 3; done; echo FAIL $f; }
export -f fetch
for lo in 0 1 2 3 4; do for la in 0 1 2 3 4; do
 L=$(python3 -c "print(f'{22.535+$lo*0.01:.3f} {51.228+$la*0.007:.3f} {22.545+$lo*0.01:.3f} {51.235+$la*0.007:.3f}')"); echo $L; done; done | xargs -P 5 -L 1 bash -c 'fetch $0 $1 $2 $3'
