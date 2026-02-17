import { Env, SandboxState } from "./types";

export class Sandbox implements DurableObject {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/sandbox\/[^/]+/, "");

    // WebSocket upgrade for live output streaming
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    switch (true) {
      case path === "/exec" && request.method === "POST":
        return this.handleExec(request);

      case path === "/files" && request.method === "GET":
        return this.handleListFiles();

      case path.startsWith("/files/") && request.method === "PUT":
        return this.handleWriteFile(path.slice(7), request);

      case path.startsWith("/files/") && request.method === "GET":
        return this.handleReadFile(path.slice(7));

      case path === "/status" && request.method === "GET":
        return this.handleStatus();

      default:
        return new Response("Not found", { status: 404 });
    }
  }

  async handleExec(request: Request): Promise<Response> {
    const { code, language = "javascript" } = await request.json() as { code: string; language?: string };

    // Update last active
    await this.state.storage.put("lastActiveAt", Date.now());

    try {
      let result: string;

      if (language === "javascript" || language === "typescript") {
        // Run in V8 isolate (current Worker context)
        // NOTE: this is a simplified eval — production would use a proper sandbox
        const fn = new Function("return (async () => { " + code + " })()");
        const output = await fn();
        result = String(output ?? "");
      } else {
        result = `Language '${language}' not supported in CF sandbox. Use spawnpoint (fly.io) for full Linux environments.`;
      }

      return Response.json({ ok: true, output: result });
    } catch (err) {
      return Response.json({ ok: false, error: String(err) }, { status: 400 });
    }
  }

  async handleListFiles(): Promise<Response> {
    const files = await this.state.storage.list({ prefix: "file:" });
    const names = [...files.keys()].map((k) => k.replace("file:", ""));
    return Response.json({ files: names });
  }

  async handleWriteFile(name: string, request: Request): Promise<Response> {
    const content = await request.text();
    await this.state.storage.put(`file:${name}`, content);
    // Also persist to R2 for larger files
    await this.env.FILES.put(`${this.state.id}/${name}`, content);
    return Response.json({ ok: true });
  }

  async handleReadFile(name: string): Promise<Response> {
    const content = await this.state.storage.get<string>(`file:${name}`);
    if (!content) return new Response("Not found", { status: 404 });
    return new Response(content, { headers: { "Content-Type": "text/plain" } });
  }

  async handleStatus(): Promise<Response> {
    const lastActiveAt = await this.state.storage.get<number>("lastActiveAt") ?? 0;
    const fileCount = (await this.state.storage.list({ prefix: "file:" })).size;
    return Response.json({
      id: this.state.id.toString(),
      lastActiveAt,
      fileCount,
    });
  }

  async handleWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
    // Echo for now — extend for streaming exec output
    ws.send(JSON.stringify({ echo: message }));
  }

  async webSocketClose(): Promise<void> {}
}
