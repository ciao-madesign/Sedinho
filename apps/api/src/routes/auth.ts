import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  generateSessionToken,
  hashPassword,
  verifyPassword,
} from "../lib/auth.js";

function publicUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

/** Rotte di autenticazione (richiesta esplicitamente dall'utente, non in spec): più utenti
 * possono avere un account, ma condividono gli stessi dati (una sola League, sez. 5 "singola
 * lega attiva") — questa non è multi-tenancy, serve solo a impedire che chiunque trovi l'URL
 * pubblico possa vedere/modificare la lega. Sessioni come righe DB referenziate da un token
 * opaco nel cookie httpOnly (vedi lib/auth.ts sul perché non JWT). */
export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string; password: string; name: string; inviteCode: string } }>(
    "/auth/register",
    async (request, reply) => {
      const { email, password, name, inviteCode } = request.body ?? {};
      const signupCode = process.env.SIGNUP_CODE;
      if (!signupCode) {
        return reply.code(503).send({
          error: "Registrazione non configurata: manca SIGNUP_CODE nelle variabili d'ambiente.",
        });
      }
      if (inviteCode !== signupCode) {
        return reply.code(403).send({ error: "Codice di invito non valido." });
      }
      if (!email?.trim() || !password || password.length < 8 || !name?.trim()) {
        return reply.code(400).send({
          error: "Email, nome e password (almeno 8 caratteri) sono richiesti.",
        });
      }

      const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
      if (existing) {
        return reply.code(409).send({ error: "Un account con questa email esiste già." });
      }

      const user = await prisma.user.create({
        data: {
          email: email.trim(),
          name: name.trim(),
          passwordHash: await hashPassword(password),
        },
      });

      const token = generateSessionToken();
      await prisma.session.create({
        data: { token, userId: user.id, expiresAt: new Date(Date.now() + SESSION_DURATION_MS) },
      });
      reply.setCookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_DURATION_MS / 1000,
      });

      return reply.code(201).send(publicUser(user));
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    "/auth/login",
    async (request, reply) => {
      const { email, password } = request.body ?? {};
      if (!email || !password) {
        return reply.code(400).send({ error: "Email e password richieste." });
      }

      const user = await prisma.user.findUnique({ where: { email: email.trim() } });
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return reply.code(401).send({ error: "Email o password non corretti." });
      }

      const token = generateSessionToken();
      await prisma.session.create({
        data: { token, userId: user.id, expiresAt: new Date(Date.now() + SESSION_DURATION_MS) },
      });
      reply.setCookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_DURATION_MS / 1000,
      });

      return publicUser(user);
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      await prisma.session.deleteMany({ where: { token } });
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return { loggedOut: true };
  });

  app.get("/auth/me", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Non autenticato" });
    return publicUser(request.user);
  });
}
