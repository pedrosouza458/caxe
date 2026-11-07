import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
export type Bindings = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  APP_ORIGIN: string;
};
export function createAuth(env: Bindings) {
  return betterAuth({
    database: drizzleAdapter(drizzle(neon(env.DATABASE_URL), { schema }), {
      provider: "pg",
      schema,
    }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: ["caxe://", "caxe://*", env.APP_ORIGIN],
    plugins: [expo()],
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    rateLimit: { enabled: true },
  });
}
