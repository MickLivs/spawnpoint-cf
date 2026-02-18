# AGENTS.md — spawnpoint-cf

> Guidance for AI coding agents working in this repository.

---

## What this project is

**spawnpoint-cf** is a Cloudflare-native developer sandbox service.  
It lets users spin up isolated, full Linux containers (not V8 isolates) on the Cloudflare edge, each with a persistent filesystem, shell access, public preview URLs, and Claude Code pre-installed.

It is the Cloudflare variant of a family of sandbox projects:

| Variant | Hosting | Isolation |
|---|---|---|
| spawnpoint | fly.io Sprites | Firecracker VM |
| spawnpoint-k8s | Self-hosted k8s | gVisor |
| **spawnpoint-cf** | **Cloudflare edge** | **Container (Durable Object)** |

**Status:** POC / early exploration — not production-ready.

---

## Repository layout

```
spawnpoint-cf/
├── src/
│   └── index.ts        # Cloudflare Worker entry point + all HTTP route handlers
├── Dockerfile          # Container image built into the Durable Object (Ubuntu 24.04 + Node + Claude Code + Vercel CLI)
├── wrangler.jsonc      # Cloudflare deployment config (Worker, Container, Durable Object bindings)
├── package.json        # Scripts + dependencies
├── tsconfig.json       # TypeScript (ES2022, bundler resolution, strict)
└── README.md           # Human-facing docs
```

There is only **one source file** (`src/index.ts`). Keep it that way unless the codebase clearly needs to grow.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (TypeScript) |
| Sandbox primitive | `@cloudflare/sandbox` SDK |
| Container orchestration | Cloudflare Containers (Durable Objects) |
| Container image | Custom Dockerfile (Ubuntu 24.04) |
| Build/deploy tool | Wrangler v3 |
| Language | TypeScript 5, strict mode |

---

## Key concepts

### Sandbox (Durable Object + Container)
Each user gets their own `Sandbox` instance, identified by a **userId** string.  
`getSandbox(env.Sandbox, userId)` returns a Durable Object stub backed by a running container.  
The container is defined by `Dockerfile` and is configured in `wrangler.jsonc` under `"containers"`.

### Routing
All routes follow the pattern `/sandbox/:userId/:action`.  
The Worker parses this with a single regex and dispatches to the appropriate `sandbox.*` SDK call.

### Container image
The `Dockerfile` installs:
- Ubuntu 24.04 base
- curl, git, build-essential
- Node.js LTS (via nvm)
- `@anthropic-ai/claude-code` (global npm)
- `vercel` CLI (global npm)
- Working directory: `/workspace`

---

## API surface (`src/index.ts`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/sandbox/:userId/exec` | Run a shell command. Body: `{ "command": "..." }`. Returns `{ stdout, stderr, exitCode, success }`. |
| `GET` | `/sandbox/:userId/files?path=...` | List directory contents (runs `ls -la <path>`). Defaults to `/workspace`. |
| `GET` | `/sandbox/:userId/file?path=...` | Read a file. Returns `{ content }`. |
| `PUT` | `/sandbox/:userId/file?path=...` | Write a file. Body is raw text content. Returns `{ ok: true }`. |
| `POST` | `/sandbox/:userId/preview` | Expose a container port and get a public URL. Body: `{ "port": 3000 }`. Returns `{ url }`. |
| `GET` | `/sandbox/:userId/status` | Return container uptime + disk + memory info. |

Any unmatched route returns `404 { "error": "Not found" }` or `{ "error": "Unknown action" }`.

---

## Environment / configuration

### `wrangler.jsonc`
- **`containers[].class_name`** — must match the exported `Sandbox` class name.
- **`containers[].image`** — points to `./Dockerfile`; Wrangler builds and pushes it on deploy.
- **`containers[].instance_type`** — `"lite"` by default; change for more resources.
- **`containers[].max_instances`** — defaults to `10`; increase for more concurrent users.
- **`migrations[].new_sqlite_classes`** — required by the Durable Objects runtime for SQLite-backed classes.

### Env type (`src/index.ts`)
```ts
type Env = {
  Sandbox: DurableObjectNamespace<Sandbox>;
};
```
Add any new Cloudflare bindings (KV, R2, secrets, etc.) to this type and to `wrangler.jsonc`.

---

## Development commands

```bash
npm install          # Install dependencies (wrangler, @cloudflare/sandbox, etc.)
npm run dev          # Local dev via wrangler dev (builds Docker image on first run, ~2-3 min)
npm run deploy       # Deploy to Cloudflare (wrangler deploy)
npm run types        # Re-generate wrangler type definitions
```

### Testing locally
```bash
# Execute a command in a sandbox for user "user-123"
curl http://localhost:8787/sandbox/user-123/exec \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"command": "node --version"}'

# Check sandbox status
curl http://localhost:8787/sandbox/user-123/status
```

---

## Conventions and patterns

- **One Worker, one file.** All HTTP handling lives in `src/index.ts`. Don't split unless the file becomes unmanageable (>~300 lines of substantive logic).
- **userId is the only isolation boundary.** Each unique string passed as `:userId` gets its own container. Do not reuse userIds across tenants.
- **No auth is implemented.** This is a POC. If adding auth, gate it at the Worker level before the `getSandbox` call.
- **TypeScript strict mode is on.** All types must be explicit; `noUnusedLocals` and `noUnusedParameters` are enforced.
- **JSON responses everywhere.** All route handlers return `Response.json(...)` or `new Response(JSON.stringify(...), { headers: { "Content-Type": "application/json" } })`.
- **Error handling is minimal.** The POC does not wrap SDK calls in try/catch. When hardening, add error boundaries around every `sandbox.*` call and return structured error responses.

---

## Common gotchas

1. **Docker must be running locally** for `npm run dev` — wrangler builds the container image on the first run.
2. **First deploy is slow (~2-3 min)** because the Docker image is built and pushed to Cloudflare's registry.
3. **Preview URLs require a custom domain with wildcard DNS.** `exposePort()` will not work without this configured on your Cloudflare zone.
4. **`max_instances` limits concurrency.** If all 10 container slots are busy, new sandbox requests will fail. Raise the limit in `wrangler.jsonc` before scaling.
5. **`new_sqlite_classes` migration tag must not be changed** once deployed, or you will need a new migration entry.
6. **nvm symlinks in the Dockerfile** — the `ln -s` commands depend on there being exactly one Node version directory under `$NVM_DIR/versions/node/`. If you install multiple versions, the glob `$(ls ...)` will break. Pin the version explicitly if needed.

---

## Where to add things

| What | Where |
|---|---|
| New HTTP routes | `src/index.ts` — add another `if (action === "..." && request.method === "...")` block |
| New container tools | `Dockerfile` — add `apt-get install` or `npm install -g` lines |
| New Cloudflare bindings (KV, R2, etc.) | `wrangler.jsonc` + `Env` type in `src/index.ts` |
| Auth middleware | Top of the `fetch` handler in `src/index.ts`, before the route match |
| New config knobs | `wrangler.jsonc` `vars` section, then read via `env.MY_VAR` |

---

## External references

- [Cloudflare Sandbox SDK](https://sandbox.cloudflare.com/)
- [Cloudflare Sandbox SDK — GitHub](https://github.com/cloudflare/sandbox-sdk)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Containers Docs](https://developers.cloudflare.com/sandbox/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [Original spawnpoint repo](https://github.com/MickLivs/spawnpoint)
