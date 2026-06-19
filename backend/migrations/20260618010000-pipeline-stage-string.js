"use strict";

/**
 * Convert pipeline_runs.stage from an ENUM to VARCHAR so pipeline stages
 * (extract / structure / certificates / evaluate) can change without DB enum churn.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE "pipeline_runs" ALTER COLUMN "stage" TYPE VARCHAR(255) USING "stage"::text`,
    );
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_pipeline_runs_stage"`);
  },

  async down(queryInterface) {
    // Best-effort restore of the original enum (fails if rows hold newer stage values).
    await queryInterface.sequelize.query(
      `CREATE TYPE "enum_pipeline_runs_stage" AS ENUM ('extract','submodel_a','submodel_b','submodel_c','main_eval')`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE "pipeline_runs" ALTER COLUMN "stage" TYPE "enum_pipeline_runs_stage" USING "stage"::"enum_pipeline_runs_stage"`,
    );
  },
};
