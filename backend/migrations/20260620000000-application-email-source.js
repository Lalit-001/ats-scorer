"use strict";

/**
 * Email-ingestion support on applications:
 *  - add `source` (web | email), default "web" so existing rows + the web route are unchanged
 *  - allow NULL `jobId` (orphan applications: an email we couldn't map to a job)
 *  - allow NULL `resumePath` (email with no PDF attachment — recorded via errorMessage)
 *  - add "orphan" to the status enum
 *
 * The existing unique index on ("jobId", lower("email")) keeps working: Postgres
 * treats NULL jobId as distinct, so multiple orphans never collide.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { ENUM } = Sequelize.DataTypes;

    await queryInterface.addColumn("applications", "source", {
      type: ENUM("web", "email"),
      allowNull: false,
      defaultValue: "web",
    });

    await queryInterface.sequelize.query(
      `ALTER TABLE "applications" ALTER COLUMN "jobId" DROP NOT NULL`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE "applications" ALTER COLUMN "resumePath" DROP NOT NULL`,
    );

    // Postgres enums grow via ALTER TYPE ADD VALUE (idempotent, no transaction needed).
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_applications_status" ADD VALUE IF NOT EXISTS 'orphan'`,
    );
  },

  async down(queryInterface) {
    // Re-tighten nullability. Email rows (null jobId/resumePath) would block this,
    // which is acceptable for a dev rollback.
    await queryInterface.sequelize.query(
      `ALTER TABLE "applications" ALTER COLUMN "jobId" SET NOT NULL`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE "applications" ALTER COLUMN "resumePath" SET NOT NULL`,
    );
    await queryInterface.removeColumn("applications", "source");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_applications_source"`);
    // Note: Postgres can't drop a single enum value, so "orphan" remains in
    // enum_applications_status. Harmless if `up` is re-run (ADD VALUE IF NOT EXISTS).
  },
};
