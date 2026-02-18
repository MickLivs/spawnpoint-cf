#!/usr/bin/env bash
# docker-shim.sh — compatibility shim for wrangler on Docker < 23.0 / buildx < 0.10
#
# wrangler 4 calls:
#   docker build --load -t <tag> --platform linux/amd64 --provenance=false -f - <ctx>
#
# Two problems on older installations:
#   1. `docker build` doesn't support --load  → rewrite to `docker buildx build`
#   2. buildx < 0.10 doesn't support --provenance → strip the flag
#
# Referenced via WRANGLER_DOCKER_BIN in the dev/deploy npm scripts.

REAL_DOCKER="/usr/local/bin/docker"

if [ "$1" = "build" ]; then
  shift
  # Strip any --provenance or --provenance=* flags that old buildx doesn't know.
  filtered=()
  skip_next=0
  for arg in "$@"; do
    if [ "$skip_next" = "1" ]; then
      skip_next=0
      continue
    fi
    case "$arg" in
      --provenance=*) ;;           # drop --provenance=false / --provenance=true
      --provenance)  skip_next=1;; # drop --provenance <value>
      *) filtered+=("$arg") ;;
    esac
  done
  exec "$REAL_DOCKER" buildx build "${filtered[@]}"
else
  exec "$REAL_DOCKER" "$@"
fi
