import { getSandbox, type Sandbox } from "@cloudflare/sandbox";

export { Sandbox } from "@cloudflare/sandbox";

type Env = {
  Sandbox: DurableObjectNamespace<Sandbox>;
  // Set via [vars] in wrangler.jsonc — required for exposePort() to build preview URLs.
  PREVIEW_HOSTNAME: string;
};

const KNOWN_ACTIONS = new Set(["exec", "files", "file", "preview", "status"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.PREVIEW_HOSTNAME) {
      // Fail fast on misconfiguration rather than letting exposePort() crash opaquely.
      console.error("PREVIEW_HOSTNAME is not set. Add it to [vars] in wrangler.jsonc.");
    }
    const url = new URL(request.url);

    // Route: /sandbox/:userId/:action
    const match = url.pathname.match(/^\/sandbox\/([^/]+)(?:\/(.*))?$/);
    if (!match) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const userId = match[1];
    const action = match[2] ?? "";
    const sandbox = getSandbox(env.Sandbox, userId);

    try {
      // POST /sandbox/:userId/exec — run a shell command
      if (action === "exec" && request.method === "POST") {
        const body = await request.json() as { command?: unknown };
        if (!body.command || typeof body.command !== "string") {
          return Response.json({ error: "Missing or invalid 'command'" }, { status: 400 });
        }
        const result = await sandbox.exec(body.command);
        return Response.json({
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          success: result.success,
        });
      }

      // GET /sandbox/:userId/files?path=/workspace/...
      if (action === "files" && request.method === "GET") {
        const path = url.searchParams.get("path") ?? "/workspace";
        // Single-quote the path to prevent shell injection; escape embedded single quotes.
        const safePath = path.replace(/'/g, "'\\''");
        const result = await sandbox.exec(`ls -la -- '${safePath}'`);
        return Response.json({ output: result.stdout });
      }

      // GET /sandbox/:userId/file?path=...
      if (action === "file" && request.method === "GET") {
        const path = url.searchParams.get("path");
        if (!path) return Response.json({ error: "Missing path" }, { status: 400 });
        const file = await sandbox.readFile(path);
        return Response.json({ content: file.content });
      }

      // PUT /sandbox/:userId/file?path=... — write a file
      if (action === "file" && request.method === "PUT") {
        const path = url.searchParams.get("path");
        if (!path) return Response.json({ error: "Missing path" }, { status: 400 });
        const content = await request.text();
        await sandbox.writeFile(path, content);
        return Response.json({ ok: true });
      }

      // POST /sandbox/:userId/preview — expose a port and get a public URL
      if (action === "preview" && request.method === "POST") {
        if (!env.PREVIEW_HOSTNAME) {
          return Response.json({ error: "PREVIEW_HOSTNAME is not configured" }, { status: 503 });
        }
        const { port = 3000 } = await request.json() as { port?: number };
        const result = await sandbox.exposePort(port, { hostname: env.PREVIEW_HOSTNAME });
        return Response.json({ url: result.url, port: result.port });
      }

      // GET /sandbox/:userId/status
      if (action === "status" && request.method === "GET") {
        const result = await sandbox.exec("uptime && df -h / && free -h");
        return Response.json({ info: result.stdout });
      }

      // Known action but wrong HTTP method
      if (KNOWN_ACTIONS.has(action)) {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }

      return Response.json({ error: "Unknown action" }, { status: 404 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      return Response.json({ error: message }, { status: 500 });
    }
  },
};
