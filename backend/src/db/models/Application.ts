import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type NonAttribute,
} from "sequelize";
import { sequelize } from "../sequelize.js";
import type { JobDescription } from "./JobDescription.js";
import type { PipelineRun } from "./PipelineRun.js";
import type { ExtractedImage } from "./ExtractedImage.js";
import type { Evaluation } from "./Evaluation.js";

export type ApplicationStatus = "uploaded" | "processing" | "completed" | "failed";

export interface BasicDetails {
  name_guess: string | null;
  emails: string[];
  phones: string[];
  links: string[];
  text_preview: string;
}

export class Application extends Model<
  InferAttributes<Application>,
  InferCreationAttributes<Application>
> {
  declare id: CreationOptional<string>;
  declare jobId: string;
  declare name: string;
  declare email: string;
  declare resumePath: string;
  declare status: CreationOptional<ApplicationStatus>;
  declare errorStage: CreationOptional<string | null>;
  declare errorMessage: CreationOptional<string | null>;
  declare basicDetails: CreationOptional<BasicDetails | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare job?: NonAttribute<JobDescription>;
  declare pipelineRuns?: NonAttribute<PipelineRun[]>;
  declare extractedImages?: NonAttribute<ExtractedImage[]>;
  declare evaluation?: NonAttribute<Evaluation | null>;
}

Application.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    jobId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    resumePath: { type: DataTypes.STRING, allowNull: false },
    status: {
      type: DataTypes.ENUM("uploaded", "processing", "completed", "failed"),
      allowNull: false,
      defaultValue: "uploaded",
    },
    errorStage: { type: DataTypes.STRING, allowNull: true },
    errorMessage: { type: DataTypes.TEXT, allowNull: true },
    basicDetails: { type: DataTypes.JSONB, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "Application", tableName: "applications" },
);
