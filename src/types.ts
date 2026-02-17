export interface Env {
  SANDBOX: DurableObjectNamespace;
  FILES: R2Bucket;
  SESSIONS: KVNamespace;
}

export interface SandboxState {
  userId: string;
  createdAt: number;
  lastActiveAt: number;
  files: Record<string, string>;
}
