import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Popolato dall'hook di autenticazione (lib/authGuard.ts) da un cookie di sessione
     * valido. `null` sulle rotte pubbliche (health, /auth/register, /auth/login). */
    user: { id: string; email: string; name: string } | null;
  }
}
