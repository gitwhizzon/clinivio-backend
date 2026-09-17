import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantWhatsappAccessToken1789634222949
  implements MigrationInterface
{
  name = "AddTenantWhatsappAccessToken1789634222949";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      ADD COLUMN IF NOT EXISTS "whatsapp_access_token" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
      DROP COLUMN IF EXISTS "whatsapp_access_token"
    `);
  }
}
