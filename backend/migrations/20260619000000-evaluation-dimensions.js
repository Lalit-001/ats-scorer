"use strict";

/** Add per-dimension rubric breakdown to evaluations. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("evaluations", "dimensions", {
      type: Sequelize.DataTypes.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("evaluations", "dimensions");
  },
};
