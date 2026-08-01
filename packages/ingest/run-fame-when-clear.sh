#!/usr/bin/env bash
# Waits out the Wikimedia rate limit with a cheap probe every 5 minutes,
# then scores the whole catalog with the batched resolver.
PROBE="https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Kylian_Mbapp%C3%A9/monthly/2025080100/2026080100"
UA="SiluetasGame/1.0 (educational project)"

for i in $(seq 1 24); do
  code=$(curl -s -m 20 -o /dev/null -w "%{http_code}" "$PROBE" -H "User-Agent: $UA")
  echo "probe $i: HTTP $code"
  if [ "$code" = "200" ]; then
    echo "rate limit cleared, scoring catalog"
    exec npx tsx --env-file-if-exists=.env src/fame.ts --refresh
  fi
  sleep 300
done
echo "still limited after 2 hours; run 'npm run fame -- --refresh' later"
