import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  country: string;
  firebaseUid: string;

  balance: number;

  wallets: {
    usdt: number;
    btc: number;
    eth: number;
    ngn: number;
  };

  deposits: Array<{
    type: string;
    amount: number;
    currency: string;
    status: string;
    description?: string;
    date: Date;
  }>;

  withdrawals: Array<{
    type: string;
    amount: number;
    currency: string;
    status: string;
    date: Date;
  }>;

  trades: Array<{
    pair: string;
    amount: number;
    profit: number;
    type: string;
    date: Date;
  }>;

  tradeBots: Array<{
    name: string;
    asset: string;
    amountPerTrade: number;
    active: boolean;
    totalProfit: number;
    totalTrades: number;
    createdAt: Date;
  }>;

  loginHistory: Array<{
    ip?: string;
    date: Date;
  }>;

  lastLogin: Date | null;
  totalProfit: number;
  status: string;

  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    // ===== Identity =====
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    country: { type: String, required: true, trim: true },
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // NOTE: NO password field — Firebase Auth owns passwords.
    // MongoDB never sees the user's password.

    // ===== Money =====
    balance: { type: Number, default: 0 },

    wallets: {
      usdt: { type: Number, default: 0 },
      btc: { type: Number, default: 0 },
      eth: { type: Number, default: 0 },
      ngn: { type: Number, default: 0 },
    },

    // ===== History / activity =====
    deposits: [
      {
        type: { type: String, default: "deposit" },
        amount: Number,
        currency: String,
        status: { type: String, default: "pending" },
        description: String,
        date: { type: Date, default: Date.now },
      },
    ],

    withdrawals: [
      {
        type: { type: String, default: "withdrawal" },
        amount: Number,
        currency: String,
        status: { type: String, default: "pending" },
        date: { type: Date, default: Date.now },
      },
    ],

    trades: [
      {
        pair: String,
        amount: Number,
        profit: Number,
        type: String,
        date: { type: Date, default: Date.now },
      },
    ],

    tradeBots: [
      {
        name: String,
        asset: String,
        amountPerTrade: Number,
        active: { type: Boolean, default: false },
        totalProfit: { type: Number, default: 0 },
        totalTrades: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    loginHistory: [
      {
        ip: String,
        date: { type: Date, default: Date.now },
      },
    ],

    lastLogin: { type: Date, default: null },
    totalProfit: { type: Number, default: 0 },
    status: { type: String, default: "active" },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;