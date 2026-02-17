import { Env } from "./types";

export { Sandbox } from "./sandbox";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route: /sandbox/:userId/*
    const match = url.pathname.match(/^\/sandbox\/([^/]+)(\/.*)?$/);
    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const userId = match[1];
    const id = env.SANDBOX.idFromName(userId);
    const sandbox = env.SANDBOX.get(id);

    // Forward to the user's Durable Object
    return sandbox.fetch(request);
  },
};
