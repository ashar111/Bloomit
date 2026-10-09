export interface BloomEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ALLOWED_ORIGIN?: string
  TURNSTILE_SECRET_KEY?: string
}

export interface PagesContext<Env = BloomEnv> {
  request: Request
  env: Env
  params: Record<string, string | undefined>
}

export type PagesFunction<Env = BloomEnv> = (context: PagesContext<Env>) => Response | Promise<Response>
