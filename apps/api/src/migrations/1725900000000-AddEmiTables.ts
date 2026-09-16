import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmiTables1725900000000 implements MigrationInterface {
  name = "AddEmiTables1725900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'emi_plans_frequency_enum') THEN
          CREATE TYPE "public"."emi_plans_frequency_enum" AS ENUM('WEEKLY', 'MONTHLY');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'emi_plans_status_enum') THEN
          CREATE TYPE "public"."emi_plans_status_enum" AS ENUM('ACTIVE', 'COMPLETED', 'CANCELLED');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'emi_installments_status_enum') THEN
          CREATE TYPE "public"."emi_installments_status_enum" AS ENUM('PENDING', 'PAID');
        END IF;
      END
      $$;
    `);

    // id/tenant_id/invoice_id/patient_id are declared as `text` (not `uuid`) to match
    // the rest of this schema — the app's core tables (users, patients, invoices, ...)
    // were converted from uuid to text at some point without their entity decorators
    // being updated to match, so every table's FK/PK columns must be `text` or a
    // FOREIGN KEY / JOIN against them fails with "operator does not exist: uuid = text".
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "emi_plans" (
        "id" text NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" text NOT NULL,
        "invoice_id" text NOT NULL,
        "patient_id" text NOT NULL,
        "total_amount" numeric(10,2) NOT NULL,
        "advance_amount" numeric(10,2) NOT NULL,
        "number_of_installments" integer NOT NULL,
        "installment_amount" numeric(10,2) NOT NULL,
        "frequency" "public"."emi_plans_frequency_enum" NOT NULL DEFAULT 'MONTHLY',
        "start_date" date NOT NULL,
        "status" "public"."emi_plans_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "notes" text,
        "created_by_user_id" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_emi_plans_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "emi_installments" (
        "id" text NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" text NOT NULL,
        "emi_plan_id" text NOT NULL,
        "installment_number" integer NOT NULL,
        "due_date" date NOT NULL,
        "amount_due" numeric(10,2) NOT NULL,
        "amount_paid" numeric(10,2) NOT NULL DEFAULT '0',
        "status" "public"."emi_installments_status_enum" NOT NULL DEFAULT 'PENDING',
        "payment_method" character varying,
        "paid_at" TIMESTAMP WITH TIME ZONE,
        "receipt_number" character varying,
        "collected_by_user_id" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_emi_installments_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_emi_plans_patient_id'
        ) THEN
          ALTER TABLE "emi_plans"
          ADD CONSTRAINT "FK_emi_plans_patient_id"
          FOREIGN KEY ("patient_id") REFERENCES "patients"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_emi_plans_invoice_id'
        ) THEN
          ALTER TABLE "emi_plans"
          ADD CONSTRAINT "FK_emi_plans_invoice_id"
          FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_emi_installments_emi_plan_id'
        ) THEN
          ALTER TABLE "emi_installments"
          ADD CONSTRAINT "FK_emi_installments_emi_plan_id"
          FOREIGN KEY ("emi_plan_id") REFERENCES "emi_plans"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emi_plans_tenant_status" ON "emi_plans" ("tenant_id", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emi_plans_invoice_id" ON "emi_plans" ("invoice_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emi_installments_plan_number" ON "emi_installments" ("emi_plan_id", "installment_number");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emi_installments_tenant_status_due_date" ON "emi_installments" ("tenant_id", "status", "due_date");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_emi_installments_tenant_status_due_date";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_emi_installments_plan_number";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_emi_plans_invoice_id";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_emi_plans_tenant_status";
    `);

    await queryRunner.query(`
      ALTER TABLE "emi_installments" DROP CONSTRAINT IF EXISTS "FK_emi_installments_emi_plan_id";
    `);
    await queryRunner.query(`
      ALTER TABLE "emi_plans" DROP CONSTRAINT IF EXISTS "FK_emi_plans_invoice_id";
    `);
    await queryRunner.query(`
      ALTER TABLE "emi_plans" DROP CONSTRAINT IF EXISTS "FK_emi_plans_patient_id";
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "emi_installments";
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "emi_plans";
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."emi_installments_status_enum";
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."emi_plans_status_enum";
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."emi_plans_frequency_enum";
    `);
  }
}
