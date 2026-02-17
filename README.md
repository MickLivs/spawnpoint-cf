# spawnpoint-cf

> Cloudflare-native version of [spawnpoint](https://github.com/MickLivs/spawnpoint).

Dev sandbox environments running on Cloudflare Workers + Durable Objects. Each user gets an isolated Durable Object that persists their session state, runs code via Cloudflare's V8 isolate sandbox, and proxies traffic through Workers.

## When to use this vs the others

| | spawnpoint | spawnpoint-k8s | spawnpoint-cf |
|---|---|---|---|
| Hosting | fly.io Sprites | Your k8s cluster | Cloudflare edge |
| Isolation | Firecracker VM | gVisor | V8 isolate |
| Persistent filesystem | Yes (S3-backed) | Yes (PVC) | Durable Object storage (limited) |
| Internal network access | No | Yes | No |
| Cold start | ~1-2s | ~seconds | ~0ms |
| Best for | B2C, indie users | B2B / on-prem | Lightweight tasks, global edge |

## Architecture

```
User (browser or terminal)
  └── Cloudflare Worker (entry point)
        └── Durable Object (per user, persistent state)
              ├── Code execution (V8 isolate)
              ├── KV storage (file system simulation)
              ├── R2 bucket (larger file storage)
              └── WebSocket (live output streaming)
```

## Limitations

Cloudflare Workers run in V8 isolates, not full Linux VMs. That means:
- No arbitrary binary execution (no `apt install`, no native modules)
- CPU time limit per request (30s on paid plan, extendable with Durable Objects)
- No persistent filesystem — use KV + R2 instead
- No direct access to internal networks

Best suited for: running JavaScript/TypeScript, Python (via Pyodide), or WebAssembly. Not suitable for running Claude Code directly — use spawnpoint or spawnpoint-k8s for that.

A realistic use case: lightweight code preview / REPL, or a Cloudflare Worker that *orchestrates* a Sprite (proxies requests to fly.io) with CF handling auth, routing, and edge caching.

## Structure

```
src/
├── worker.ts          # Entry Worker — routes requests per user
├── sandbox.ts         # Durable Object — per-user sandbox state
└── types.ts
wrangler.toml          # Cloudflare config
```

## Quick Start

```bash
npm install
npx wrangler login
npx wrangler deploy
```

## Status

POC / early exploration. Not production ready.
