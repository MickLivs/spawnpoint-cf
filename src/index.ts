import { getSandbox, type Sandbox } from "@cloudflare/sandbox";

export { Sandbox } from "@cloudflare/sandbox";

type Env = {
  Sandbox: DurableObjectNamespace<Sandbox>;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route: /sandbox/:userId/:action
    const match = url.pathname.match(/^\/sandbox\/([^/]+)(?:\/(.*))?$/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = match[1];
    const action = match[2] ?? "";
    const sandbox = getSandbox(env.Sandbox, userId);

    // POST /sandbox/:userId/exec — run a shell command
    if (action === "exec" && request.method === "POST") {
      const { command } = await request.json() as { command: string };
      const result = await sandbox.exec(command);
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
      const result = await sandbox.exec(`ls -la ${path}`);
      return Response.json({ output: result.stdout });
    }

    // GET /sandbox/:userId/file?path=...
    if (action === "file" && request.method === "GET") {
      const path = url.searchParams.get("path");
      if (!path) return new Response("Missing path", { status: 400 });
      const file = await sandbox.readFile(path);
      return Response.json({ content: file.content });
    }

    // PUT /sandbox/:userId/file?path=... — write a file
    if (action === "file" && request.method === "PUT") {
      const path = url.searchParams.get("path");
      if (!path) return new Response("Missing path", { status: 400 });
      const content = await request.text();
      await sandbox.writeFile(path, content);
      return Response.json({ ok: true });
    }

    // POST /sandbox/:userId/preview — expose a port and get a public URL
    if (action === "preview" && request.method === "POST") {
      const { port = 3000 } = await request.json() as { port?: number };
      const previewUrl = await sandbox.exposePort(port);
      return Response.json({ url: previewUrl });
    }

    // GET /sandbox/:userId/status
    if (action === "status" && request.method === "GET") {
      const result = await sandbox.exec("uptime && df -h / && free -h");
      return Response.json({ info: result.stdout });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
};
