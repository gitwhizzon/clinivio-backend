import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The app's core tables (users, patients, invoices, departments, ...) were
 * converted from `uuid` to `text` id/FK columns at some point without the
 * TypeORM entity decorators being updated to match (they still declared
 * `@PrimaryGeneratedColumn('uuid')`). Every table built afterwards inherited
 * that `uuid` declaration — for a table's own PK, and for any `@ManyToOne`
 * FK column TypeORM infers from the referenced entity's PK type — so those
 * newer tables ended up `uuid`-typed while the tables they join against are
 * `text`. Any JOIN or FK constraint across the two fails with
 * "operator does not exist: uuid = text".
 *
 * This migration converts every affected column to `text` to match the rest
 * of the schema. All are safe: no table has a real FK constraint depending on
 * these columns' current type at migration time, and every affected value is
 * already a valid UUID string, so the ::text cast is lossless.
 */
export class FixUuidTextColumnMismatch1788963943253 implements MigrationInterface {
  name = "FixUuidTextColumnMismatch1788963943253";

  private readonly columnsByTable: Record<string, string[]> = {
    staff_profiles: ["id", "user_id", "department_id", "tenant_id"],
    billable_services: ["id", "tenant_id", "department_id"],
    invoice_payments: ["id", "tenant_id", "invoice_id"],
    patient_accounts: ["id", "tenant_id", "patient_id"],
    ot_theaters: ["id", "tenant_id"],
    ot_schedules: [
      "id",
      "tenant_id",
      "patient_id",
      "surgeon_id",
      "anaesthetist_id",
      "theater_id",
    ],
    ot_records: ["id", "tenant_id", "schedule_id", "recorded_by_id"],
    lab_reagents: ["id", "tenant_id"],
    lab_reagent_usage: ["id", "tenant_id", "reagent_id"],
    pharmacy_purchases: ["id", "tenant_id"],
    pharmacy_purchase_items: ["id", "purchase_id"],
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, columns] of Object.entries(this.columnsByTable)) {
      const tableExists = await queryRunner.hasTable(table);
      if (!tableExists) continue;
      for (const column of columns) {
        await queryRunner.query(`
          ALTER TABLE "public"."${table}"
          ALTER COLUMN "${column}" TYPE text USING "${column}"::text
        `);
      }
    }
  }

  public async down(): Promise<void> {
    // Intentionally a no-op: reverting to `uuid` would reintroduce the
    // cross-table type mismatch this migration exists to fix.
  }
}
