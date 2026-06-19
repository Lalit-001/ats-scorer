"use strict";

/**
 * Enforce one application per (job, email), case-insensitive.
 * Removes pre-existing duplicates (keeping the earliest; child rows cascade)
 * before adding the unique index so the migration is safe on existing data.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM "applications" a
      USING "applications" b
      WHERE a."jobId" = b."jobId"
        AND lower(a."email") = lower(b."email")
        AND a."createdAt" > b."createdAt"
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX "applications_job_email_unique"
      ON "applications" ("jobId", lower("email"))
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "applications_job_email_unique"`);
  },
};
