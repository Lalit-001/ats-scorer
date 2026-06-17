import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
} from "sequelize";
import { sequelize } from "../sequelize.js";

export type Recommendation = "strong_match" | "good_match" | "reject";

export class Evaluation extends Model<
  InferAttributes<Evaluation>,
  InferCreationAttributes<Evaluation>
> {
  declare id: CreationOptional<string>;
  declare applicationId: string;
  declare matchScore: number;
  declare recommendation: Recommendation;
  declare strengths: string[];
  declare gaps: string[];
  declare rawLlmJson: unknown;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Evaluation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    applicationId: { type: DataTypes.UUID, allowNull: false, unique: true },
    matchScore: { type: DataTypes.INTEGER, allowNull: false },
    recommendation: {
      type: DataTypes.ENUM("strong_match", "good_match", "reject"),
      allowNull: false,
    },
    strengths: { type: DataTypes.JSONB, allowNull: false },
    gaps: { type: DataTypes.JSONB, allowNull: false },
    rawLlmJson: { type: DataTypes.JSONB, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "Evaluation", tableName: "evaluations" },
);
