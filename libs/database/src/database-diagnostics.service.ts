import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

type DbIdentityRow = {
  database?: string;
  user_name?: string;
  schema_name?: string;
};

@Injectable()
export class DatabaseDiagnosticsService implements OnModuleInit {
  private readonly logger = new Logger("DatabaseDiagnostics");

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    try {
      const rows = await this.dataSource.query(`
        SELECT
          current_database() AS database,
          current_user AS user_name,
          current_schema() AS schema_name
      `);
      const identity = (rows?.[0] ?? {}) as DbIdentityRow;

      this.logger.log(
        `Connected to Postgres database=${identity.database ?? "<unknown>"} user=${identity.user_name ?? "<unknown>"} schema=${identity.schema_name ?? "<unknown>"}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown diagnostics error";
      this.logger.warn(
        `Unable to confirm active Postgres database: ${message}`,
      );
    }
  }
}
