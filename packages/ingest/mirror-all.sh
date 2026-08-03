#!/usr/bin/env bash
# Mirrors every colour render, in batches, until none are left.
for i in $(seq 1 30); do
  out=$(BATCH=500 npx tsx --env-file-if-exists=.env src/mirror-renders.ts 2>&1)
  echo "$out" | tail -3
  if echo "$out" | grep -q "^0 jugadores sin imagen a color"; then
    echo "=== no queda ninguno ==="
    break
  fi
done
