import mongoose, { Schema, Document } from "mongoose";

export interface IAdminLog extends Document {
  adminEmail: string;
  adminFirebaseUid: string;
  action: string;
  targetType: "user" | "deposit" | "withdrawal" | "system";
  targetId?: string;
  targetEmail?: string;
  amount?: number;
  asset?: string;
  reason?: string;
  metadata?: Record<string, any>;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminLogSchema = new Schema<IAdminLog>(
  {
    adminEmail: { type: String, required: true, index: true },
    adminFirebaseUid: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    targetType: {
      type: String,
      enum: ["user", "deposit", "withdrawal", "system"],
      required: true,
      index: true,
    },
    targetId: { type: String, index: true },
    targetEmail: { type: String, index: true },
    amount: { type: Number },
    asset: { type: String },
    reason: { type: String },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: true }
);

const AdminLog =
  mongoose.models.AdminLog ||
  mongoose.model<IAdminLog>("AdminLog", AdminLogSchema);

export default AdminLog;
