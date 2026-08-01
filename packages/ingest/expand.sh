#!/usr/bin/env bash
# Grow the catalog, then score and rank the newcomers.
set -u
echo "=== 1/3 catálogo (top $CATALOG_SIZE de EA) ==="
npx tsx --env-file-if-exists=.env src/index.ts --resume
echo
echo "=== 2/3 fama de los nuevos ==="
npx tsx --env-file-if-exists=.env src/fame.ts
echo
echo "=== 3/3 recalcular ranking de fama ==="
npx tsx --env-file-if-exists=.env src/refresh-ranks.ts
