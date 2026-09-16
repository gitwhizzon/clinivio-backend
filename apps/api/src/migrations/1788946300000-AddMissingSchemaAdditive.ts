import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written, purely additive migration.
 *
 * The auto-generated `migration:generate` output for this diff was rejected —
 * it dropped and recreated primary-key columns (e.g. `users.id`, `tenants.id`)
 * with fresh `uuid_generate_v4()` defaults, which would have discarded every
 * existing row's real ID and broken all foreign-key relationships. That
 * mismatch exists because the live schema was originally provisioned outside
 * TypeORM (a `prisma.service.ts` is still present in the compiled output),
 * so its column/constraint naming differs cosmetically from what TypeORM's
 * NamingStrategy expects — TypeORM's diff algorithm can't tell the difference
 * between "cosmetic drift" and "real change" and drops/recreates everything.
 *
 * This migration instead applies ONLY the genuinely new, missing pieces:
 *   - 12 new tables that don't exist yet in the live DB
 *   - A handful of new nullable/defaulted columns on existing tables
 * Nothing here drops or alters an existing column, constraint, or row.
 */
export class AddMissingSchemaAdditive1788946300000 implements MigrationInterface {
  name = 'AddMissingSchemaAdditive1788946300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── New tables ──────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "staff_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "tenant_id" uuid NOT NULL, "employee_id" character varying, "qualification" character varying, "registration_no" character varying, "department_id" uuid, "joining_date" date, "shift" character varying, "experience_years" integer, "specialization" character varying, "metadata" jsonb, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_223deb3f390b28562fad70eefed" UNIQUE ("user_id"), CONSTRAINT "PK_6d4c6c0b447e39147b4a6dcbede" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "patient_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "patient_id" uuid NOT NULL, "phone" character varying NOT NULL, "password_hash" character varying NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "tenant_patient_account_phone_unique" UNIQUE ("tenant_id", "phone"), CONSTRAINT "PK_9acdc69a7b4d35934d80e3ccb6b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_9fe3ab2cac21046c133f378480" ON "patient_accounts" ("tenant_id", "phone")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "pharmacy_purchases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "vendor_name" character varying NOT NULL, "invoice_no" character varying, "purchase_date" date NOT NULL, "total_amount" numeric(12,2) NOT NULL DEFAULT '0', "discount_amount" numeric(10,2) NOT NULL DEFAULT '0', "notes" character varying, "created_by" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a6d8d4b45726e8afae100b93f3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "pharmacy_purchase_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "purchase_id" uuid NOT NULL, "inventory_id" character varying, "medicine_name" character varying NOT NULL, "batch_no" character varying, "expiry_date" date, "quantity" integer NOT NULL DEFAULT '0', "free_qty" integer NOT NULL DEFAULT '0', "purchase_price" numeric(10,2) NOT NULL DEFAULT '0', "mrp" numeric(10,2), "selling_price" numeric(10,2), "discount_percent" numeric(5,2) NOT NULL DEFAULT '0', "gst_rate" numeric(5,2), "line_total" numeric(12,2) NOT NULL DEFAULT '0', CONSTRAINT "PK_8369e51c3f2faa464d5ac8e31e1" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "invoice_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "invoice_id" uuid NOT NULL, "amount" numeric(10,2) NOT NULL, "payment_method" character varying NOT NULL, "paid_at" TIMESTAMP WITH TIME ZONE NOT NULL, "collected_by_user_id" character varying, "notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e19c9ebfa432289f510de7b4e99" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_4e8bf7bc80d9dba3d9c3820922" ON "invoice_payments" ("tenant_id", "paid_at")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "billable_services" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "code" character varying NOT NULL, "category" character varying, "department_id" uuid, "price" numeric(10,2) NOT NULL, "duration_minutes" integer, "is_taxable" boolean NOT NULL DEFAULT true, "gst_percent" numeric(5,2), "description" text, "is_active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "tenant_billable_service_code_unique" UNIQUE ("tenant_id", "code"), CONSTRAINT "PK_eb511714e82c385fd173dd866e4" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "lab_reagents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "unit" character varying NOT NULL, "current_qty" numeric(10,2) NOT NULL DEFAULT '0', "reorder_level" numeric(10,2) NOT NULL DEFAULT '10', "unit_cost" numeric(10,2) NOT NULL DEFAULT '0', "manufacturer" character varying, "batch_no" character varying, "expiry_date" date, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_855f941e94818ad993672c87101" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "lab_reagent_usage" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "reagent_id" uuid NOT NULL, "lab_order_id" character varying, "quantity" numeric(10,2) NOT NULL, "type" character varying NOT NULL DEFAULT 'USE', "notes" text, "used_by" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4178a9461a1f4a6cad9f6d69249" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying, "userId" character varying, "userEmail" character varying, "userRole" character varying, "action" character varying NOT NULL, "entityType" character varying NOT NULL, "entityId" character varying, "description" character varying(500), "before" jsonb, "after" jsonb, "metadata" jsonb, "ipAddress" character varying(50), "success" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_889633a4291bcb0bf4680fff23" ON "audit_logs" ("tenantId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_b1242ad5160aac0feb5da4aa15" ON "audit_logs" ("tenantId", "entityType", "entityId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_f09b40d69c2488932373effd4e" ON "audit_logs" ("tenantId", "createdAt")`,
    );

    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "public"."ot_theaters_theater_type_enum" AS ENUM('GENERAL', 'CARDIAC', 'ORTHOPEDIC', 'OBSTETRIC', 'LAPAROSCOPY', 'NEUROLOGY', 'OPHTHALMOLOGY', 'ENT'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "public"."ot_theaters_status_enum" AS ENUM('AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "ot_theaters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "theater_type" "public"."ot_theaters_theater_type_enum" NOT NULL DEFAULT 'GENERAL', "status" "public"."ot_theaters_status_enum" NOT NULL DEFAULT 'AVAILABLE', "floor" character varying, "notes" character varying, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_98b87365f88dc27a7f475ddbf33" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_f6ce2b326b1c1706900bca7800" ON "ot_theaters" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_d546effc0d3f31b85652961f64" ON "ot_theaters" ("tenant_id")`,
    );

    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "public"."ot_schedules_status_enum" AS ENUM('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "public"."ot_schedules_priority_enum" AS ENUM('ELECTIVE', 'URGENT', 'EMERGENCY'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "public"."ot_schedules_anaesthesia_type_enum" AS ENUM('GENERAL', 'SPINAL', 'EPIDURAL', 'LOCAL', 'SEDATION'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "ot_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "theater_id" uuid NOT NULL, "patient_id" uuid NOT NULL, "surgeon_id" uuid NOT NULL, "anaesthetist_id" uuid, "assistant_ids" jsonb NOT NULL DEFAULT '[]', "scheduled_date" date NOT NULL, "start_time" character varying(5) NOT NULL, "estimated_duration_mins" integer NOT NULL, "actual_start_time" TIMESTAMP WITH TIME ZONE, "actual_end_time" TIMESTAMP WITH TIME ZONE, "procedure_name" character varying NOT NULL, "procedure_code" character varying, "diagnosis_notes" text, "status" "public"."ot_schedules_status_enum" NOT NULL DEFAULT 'SCHEDULED', "priority" "public"."ot_schedules_priority_enum" NOT NULL DEFAULT 'ELECTIVE', "anaesthesia_type" "public"."ot_schedules_anaesthesia_type_enum", "cancellation_reason" text, "ipd_admission_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_43a65f061b3f12ad57691b2a977" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_1d5fdb5479a8af0cf6ad1c7870" ON "ot_schedules" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_5a9716e65c4683dd1cf3bb1c44" ON "ot_schedules" ("tenant_id", "theater_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_248745f51139721afbed671bc8" ON "ot_schedules" ("tenant_id", "scheduled_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_6d0bd82e64423a8ae81c76d18b" ON "ot_schedules" ("tenant_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "ot_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "schedule_id" uuid NOT NULL, "pre_op_checklist" jsonb, "anaesthesia_notes" text, "intra_op_notes" text, "blood_loss_ml" integer, "fluid_input_ml" integer, "fluid_output_ml" integer, "specimens" text, "implants" jsonb, "post_op_instructions" text, "post_op_diagnosis" character varying, "complications" text, "recorded_by_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e2ccc2ccc1c7cd3adf08671d0d9" UNIQUE ("schedule_id"), CONSTRAINT "PK_97a35872b95837fa955784f153c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_31bb4e1daf12cd7b50a0459f0e" ON "ot_records" ("tenant_id")`,
    );

    // ── New columns on existing tables (all nullable or DEFAULT-ed — safe for populated tables) ──
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "allow_consult_before_payment" boolean NOT NULL DEFAULT false`,
    );

    // Fixes the live 500 on /auth/login — User entity has these columns, DB did not.
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_token" character varying(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_expiry" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "public"."invoices_discount_type_enum" AS ENUM('PERCENTAGE', 'FLAT'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "discount_type" "public"."invoices_discount_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "discount_value" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "amount_paid" numeric(10,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "balance_due" numeric(10,2) NOT NULL DEFAULT '0'`,
    );

    await queryRunner.query(
      `ALTER TABLE "lab_orders" ADD COLUMN IF NOT EXISTS "payment_status" character varying NOT NULL DEFAULT 'UNPAID'`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_orders" ADD COLUMN IF NOT EXISTS "amount_due" numeric(10,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_orders" ADD COLUMN IF NOT EXISTS "amount_paid" numeric(10,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_orders" ADD COLUMN IF NOT EXISTS "payment_method" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_orders" ADD COLUMN IF NOT EXISTS "payment_collected_at" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(
      `ALTER TABLE "lab_order_items" ADD COLUMN IF NOT EXISTS "is_outsourced" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_order_items" ADD COLUMN IF NOT EXISTS "external_lab_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_order_items" ADD COLUMN IF NOT EXISTS "external_reference" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_order_items" ADD COLUMN IF NOT EXISTS "outsourced_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lab_order_items" DROP COLUMN IF EXISTS "outsourced_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_order_items" DROP COLUMN IF EXISTS "external_reference"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_order_items" DROP COLUMN IF EXISTS "external_lab_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_order_items" DROP COLUMN IF EXISTS "is_outsourced"`,
    );

    await queryRunner.query(
      `ALTER TABLE "lab_orders" DROP COLUMN IF EXISTS "payment_collected_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_orders" DROP COLUMN IF EXISTS "payment_method"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_orders" DROP COLUMN IF EXISTS "amount_paid"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_orders" DROP COLUMN IF EXISTS "amount_due"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_orders" DROP COLUMN IF EXISTS "payment_status"`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "balance_due"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "amount_paid"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "discount_value"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "discount_type"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."invoices_discount_type_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "password_reset_expiry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "password_reset_token"`,
    );

    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN IF EXISTS "allow_consult_before_payment"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "ot_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ot_schedules"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."ot_schedules_anaesthesia_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."ot_schedules_priority_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."ot_schedules_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "ot_theaters"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."ot_theaters_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."ot_theaters_theater_type_enum"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lab_reagent_usage"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lab_reagents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "billable_services"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoice_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pharmacy_purchase_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pharmacy_purchases"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "patient_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_profiles"`);
  }
}
