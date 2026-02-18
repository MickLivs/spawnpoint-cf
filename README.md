# spawnpoint-cf

> Cloudflare-native version of [spawnpoint](https://github.com/MickLivs/spawnpoint).

Dev sandbox environments using [Cloudflare Sandbox SDK](https://sandbox.cloudflare.com/) — full containers (not V8 isolates) with persistent filesystem, shell access, preview URLs, and Claude Code support. Built on Cloudflare Workers + Containers + Durable Objects.

## When to use this vs the others

| | spawnpoint | spawnpoint-k8s | spawnpoint-cf |
|---|---|---|---|
| Hosting | fly.io Sprites | Your k8s cluster | Cloudflare edge |
| Isolation | Firecracker VM | gVisor | Container (Durable Object backed) |
| Persistent filesystem | Yes (S3-backed) | Yes (PVC) | Yes (container storage) |
| Internal network access | No | Yes | No |
| Cold start | ~1-2s | ~seconds | 2-3min first deploy, fast after |
| Preview URLs | `*.sprites.app` | `kubectl port-forward` | Custom domain required |
| Best for | B2C, indie users | B2B / on-prem | CF-native stack |

## Architecture

```
User (browser or terminal)
  └── Cloudflare Worker (entry point, routes by user ID)
        └── Sandbox (Durable Object + Container, per user)
              ├── Full Linux container (your Dockerfile)
              ├── Persistent filesystem
              ├── exec() — run any shell command
              ├── readFile() / writeFile()
              ├── exposePort() — public preview URLs
              └── Claude Code (pre-installed in container)
```

## Prerequisites

- Cloudflare account
- Node.js
- Docker running locally (for `wrangler dev` and `wrangler deploy`)
- Custom domain with wildcard DNS (for preview URLs)

## Quick Start

```bash
npm install

# Local dev (builds Docker image first time, ~2-3 min)
npm run dev

# Test
curl http://localhost:8787/sandbox/user-123/exec \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"command": "node --version"}'

# Deploy
npm run deploy
```

## Structure

```
src/
└── index.ts          # Worker entry + sandbox routes
Dockerfile            # Container image with Claude Code + dev tools
wrangler.jsonc        # Cloudflare config
```

## Docs

- https://developers.cloudflare.com/sandbox/
- https://github.com/cloudflare/sandbox-sdk

## Status

POC / early exploration. Not production ready.
