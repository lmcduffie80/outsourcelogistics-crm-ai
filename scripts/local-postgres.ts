/**
 * Runs a real Postgres server for local development without Docker.
 * Data persists in ./.pgdata. Set DATABASE_URL=postgres://crm:crm@localhost:5433/crm to use it.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dataDir = "./.pgdata";
const firstRun = !existsSync(dataDir);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "crm",
  password: "crm",
  port: Number(process.env.LOCAL_PG_PORT ?? 5433),
  persistent: true,
});

if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase("crm");

console.log(`Postgres running at postgres://crm:crm@localhost:${process.env.LOCAL_PG_PORT ?? 5433}/crm (Ctrl+C to stop)`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
