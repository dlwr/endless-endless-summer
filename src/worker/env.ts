export type Env = {
  KV: KVNamespace;
  TUMBLR_CLIENT_ID: string;
  TUMBLR_CLIENT_SECRET: string;
};

export type AppEnv = {
  Bindings: Env;
  Variables: { session: unknown; sid: string };
};
