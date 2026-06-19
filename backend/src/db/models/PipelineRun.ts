import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
} from "sequelize";
import { sequelize } from "../sequelize.js";

export type Stage = "extract" | "structure" | "certificates" | "evaluate";
export type RunStatus = "pending" | "running" | "done" | "failed";

export class PipelineRun extends Model<
  InferAttributes<PipelineRun>,
  InferCreationAttributes<PipelineRun>
> {
  declare id: CreationOptional<string>;
  declare applicationId: string;
  declare stage: Stage;
  declare status: CreationOptional<RunStatus>;
  declare rawOutput: CreationOptional<unknown | null>;
  declare structuredOutput: CreationOptional<unknown | null>;
  declare error: CreationOptional<string | null>;
  declare startedAt: CreationOptional<Date | null>;
  declare finishedAt: CreationOptional<Date | null>;
}

PipelineRun.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    applicationId: { type: DataTypes.UUID, allowNull: false },
    // Plain string (not an enum) so pipeline stages can evolve without DB enum churn.
    stage: { type: DataTypes.STRING, allowNull: false },
    status: {
      type: DataTypes.ENUM("pending", "running", "done", "failed"),
      allowNull: false,
      defaultValue: "pending",
    },
    rawOutput: { type: DataTypes.JSONB, allowNull: true },
    structuredOutput: { type: DataTypes.JSONB, allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    finishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, modelName: "PipelineRun", tableName: "pipeline_runs", timestamps: false },
);
