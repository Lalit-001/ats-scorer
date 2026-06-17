"use strict";

/** Baseline schema: job_descriptions, applications, pipeline_runs, extracted_images, evaluations. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, STRING, TEXT, INTEGER, JSONB, DATE, ENUM } = Sequelize.DataTypes;
    const uuidPk = {
      type: UUID,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
      primaryKey: true,
    };
    const fk = (table) => ({
      type: UUID,
      allowNull: false,
      references: { model: table, key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.createTable("job_descriptions", {
      id: uuidPk,
      title: { type: STRING, allowNull: false },
      slug: { type: STRING, allowNull: false, unique: true },
      description: { type: TEXT, allowNull: false },
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    });

    await queryInterface.createTable("applications", {
      id: uuidPk,
      jobId: fk("job_descriptions"),
      name: { type: STRING, allowNull: false },
      email: { type: STRING, allowNull: false },
      resumePath: { type: STRING, allowNull: false },
      status: {
        type: ENUM("uploaded", "processing", "completed", "failed"),
        allowNull: false,
        defaultValue: "uploaded",
      },
      errorStage: { type: STRING, allowNull: true },
      errorMessage: { type: TEXT, allowNull: true },
      basicDetails: { type: JSONB, allowNull: true },
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    });

    await queryInterface.createTable("pipeline_runs", {
      id: uuidPk,
      applicationId: fk("applications"),
      stage: {
        type: ENUM("extract", "submodel_a", "submodel_b", "submodel_c", "main_eval"),
        allowNull: false,
      },
      status: {
        type: ENUM("pending", "running", "done", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
      rawOutput: { type: JSONB, allowNull: true },
      structuredOutput: { type: JSONB, allowNull: true },
      error: { type: TEXT, allowNull: true },
      startedAt: { type: DATE, allowNull: true },
      finishedAt: { type: DATE, allowNull: true },
    });
    await queryInterface.addIndex("pipeline_runs", ["applicationId"]);

    await queryInterface.createTable("extracted_images", {
      id: uuidPk,
      applicationId: fk("applications"),
      imageIndex: { type: INTEGER, allowNull: false },
      imagePath: { type: STRING, allowNull: false },
      imageType: {
        type: ENUM("certificate", "profile_photo", "logo", "other"),
        allowNull: true,
      },
      details: { type: JSONB, allowNull: true },
    });
    await queryInterface.addIndex("extracted_images", ["applicationId"]);

    await queryInterface.createTable("evaluations", {
      id: uuidPk,
      applicationId: { ...fk("applications"), unique: true },
      matchScore: { type: INTEGER, allowNull: false },
      recommendation: {
        type: ENUM("strong_match", "good_match", "reject"),
        allowNull: false,
      },
      strengths: { type: JSONB, allowNull: false },
      gaps: { type: JSONB, allowNull: false },
      rawLlmJson: { type: JSONB, allowNull: false },
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("evaluations");
    await queryInterface.dropTable("extracted_images");
    await queryInterface.dropTable("pipeline_runs");
    await queryInterface.dropTable("applications");
    await queryInterface.dropTable("job_descriptions");

    // Drop the enum types Sequelize created, so re-running `up` stays clean.
    for (const t of [
      "enum_applications_status",
      "enum_pipeline_runs_stage",
      "enum_pipeline_runs_status",
      "enum_extracted_images_imageType",
      "enum_evaluations_recommendation",
    ]) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${t}"`);
    }
  },
};
