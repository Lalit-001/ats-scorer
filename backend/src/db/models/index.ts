/** Model registry: wires associations and exposes the models + initDb. */
import { sequelize } from "../sequelize.js";
import { JobDescription } from "./JobDescription.js";
import { Application } from "./Application.js";
import { PipelineRun } from "./PipelineRun.js";
import { ExtractedImage } from "./ExtractedImage.js";
import { Evaluation } from "./Evaluation.js";

JobDescription.hasMany(Application, { foreignKey: "jobId", as: "applications", onDelete: "CASCADE" });
Application.belongsTo(JobDescription, { foreignKey: "jobId", as: "job" });

Application.hasMany(PipelineRun, { foreignKey: "applicationId", as: "pipelineRuns", onDelete: "CASCADE" });
PipelineRun.belongsTo(Application, { foreignKey: "applicationId" });

Application.hasMany(ExtractedImage, {
  foreignKey: "applicationId",
  as: "extractedImages",
  onDelete: "CASCADE",
});
ExtractedImage.belongsTo(Application, { foreignKey: "applicationId" });

Application.hasOne(Evaluation, { foreignKey: "applicationId", as: "evaluation", onDelete: "CASCADE" });
Evaluation.belongsTo(Application, { foreignKey: "applicationId" });

export { sequelize, JobDescription, Application, PipelineRun, ExtractedImage, Evaluation };

/** Verify the DB connection. Schema is owned by migrations, never by sync. */
export async function initDb(): Promise<void> {
  await sequelize.authenticate();
}
