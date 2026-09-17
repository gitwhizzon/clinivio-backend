import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSsoColumnsToUsers1789659876691 implements MigrationInterface {
  name = "AddSsoColumnsToUsers1789659876691";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."users"
      ADD COLUMN IF NOT EXISTS "sso_provider" text,
      ADD COLUMN IF NOT EXISTS "sso_subject" text
    `);

    // Partial unique index — allows unlimited NULLs (password-only accounts)
    // while still enforcing one Entra ID identity per linked account.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_sso_subject_unique"
      ON "public"."users" ("sso_subject")
      WHERE "sso_subject" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."idx_users_sso_subject_unique"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."users"
      DROP COLUMN IF EXISTS "sso_subject",
      DROP COLUMN IF EXISTS "sso_provider"
    `);
  }
}
