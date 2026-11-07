import { defineConfig } from 'drizzle-kit';
export default defineConfig({ schema:'./api/src/schema.ts', out:'./api/migrations', dialect:'postgresql', dbCredentials:{ url:process.env.DATABASE_URL! } });
