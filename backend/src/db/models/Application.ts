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

export type ApplicationStatus = "uploaded" | "processing" | "completed" | "failed" | "orphan";

/** Where the application came from: the web portal or an inbound email. */
export type ApplicationSource = "web" | "email";

export interface BasicDetails {
  name_guess: string | null;
  location_guess?: string | null;
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
  // Null for orphan applications: an inbound email we couldn't map to a job.
  declare jobId: string | null;
  declare name: string;
  declare email: string;
  // Null when an email arrived without a PDF attachment (see errorMessage).
  declare resumePath: string | null;
  declare source: CreationOptional<ApplicationSource>;
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
    jobId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    resumePath: { type: DataTypes.STRING, allowNull: true },
    source: {
      type: DataTypes.ENUM("web", "email"),
      allowNull: false,
      defaultValue: "web",
    },
    status: {
      type: DataTypes.ENUM("uploaded", "processing", "completed", "failed", "orphan"),
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
