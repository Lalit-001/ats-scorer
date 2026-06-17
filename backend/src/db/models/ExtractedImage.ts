import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
} from "sequelize";
import { sequelize } from "../sequelize.js";

export type ImageType = "certificate" | "profile_photo" | "logo" | "other";

export class ExtractedImage extends Model<
  InferAttributes<ExtractedImage>,
  InferCreationAttributes<ExtractedImage>
> {
  declare id: CreationOptional<string>;
  declare applicationId: string;
  declare imageIndex: number;
  declare imagePath: string;
  declare imageType: CreationOptional<ImageType | null>;
  declare details: CreationOptional<Record<string, unknown> | null>;
}

ExtractedImage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    applicationId: { type: DataTypes.UUID, allowNull: false },
    imageIndex: { type: DataTypes.INTEGER, allowNull: false },
    imagePath: { type: DataTypes.STRING, allowNull: false },
    imageType: {
      type: DataTypes.ENUM("certificate", "profile_photo", "logo", "other"),
      allowNull: true,
    },
    details: { type: DataTypes.JSONB, allowNull: true },
  },
  { sequelize, modelName: "ExtractedImage", tableName: "extracted_images", timestamps: false },
);
