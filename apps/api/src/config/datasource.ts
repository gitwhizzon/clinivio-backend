/**
 * TypeORM DataSource - used by the TypeORM CLI for migrations.
 *
 * Preferred commands:
 *   pnpm db:migrate
 *   pnpm db:migration:show
 *
 * Raw TypeORM CLI usage:
 *   pnpm typeorm migration:generate apps/api/src/migrations/AddFoo
 *   pnpm typeorm migration:run
 */
import "reflect-metadata";
import { DataSource } from "typeorm";
import { ALL_ENTITIES } from "@mediflow/database";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const isProduction = process.env.NODE_ENV === "production";

export default new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: ALL_ENTITIES,
  migrations: ["apps/api/src/migrations/*.ts"],
  synchronize: false,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  extra: {
    max: 5,
    min: 1,
    idleTimeoutMillis: 30000,
  },
});
