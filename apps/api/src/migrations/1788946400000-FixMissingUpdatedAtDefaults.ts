import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Purely additive fix: 21 tables were missing `DEFAULT now()` on their
 * `updated_at` column (found via information_schema audit — `created_at`
 * was fine everywhere, only `updated_at` was affected). TypeORM's
 * `@UpdateDateColumn()` relies on the DB default when it emits `DEFAULT`
 * in an INSERT, so any insert touching these tables without an explicit
 * `updatedAt` fails with a NOT NULL violation (this is what broke staff
 * onboarding — POST /users failed inserting into doctor_profiles).
 *
 * SET DEFAULT only changes future inserts; it does not touch existing rows.
 */
export class FixMissingUpdatedAtDefaults1788946400000 implements MigrationInterface {
  name = 'FixMissingUpdatedAtDefaults1788946400000';

  private readonly tables = [
    'appointments',
    'beds',
    'consultations',
    'departments',
    'discharge_advice',
    'discharge_summaries',
    'doctor_profiles',
    'doctor_slots',
    'invoices',
    'ipd_admissions',
    'ipd_procedures',
    'ipd_treatments',
    'lab_order_items',
    'lab_orders',
    'lab_tests',
    'patient_families',
    'patients',
    'pharmacy_inventory',
    'pharmacy_orders',
    'prescriptions',
    'rooms',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "updated_at" SET DEFAULT now()`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "updated_at" DROP DEFAULT`,
      );
    }
  }
}
