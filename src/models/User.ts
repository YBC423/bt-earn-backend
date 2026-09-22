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
    [key: string]: number;
  };

  deposits: Array<{
    id: number;
    amount: number;
    asset: string;
    address: string;
    network: string;
    status: string;
    dateTime: string;
    txId: string;
  }>;

  withdrawals: Array<{
    id: number;
    amount: number;
    asset: string;
    address: string;
    network: string;
    txId: string;
    fee: number;
    status: string;
    dateTime: string;
  }>;

  converts: Array<{
    id: number;
    fromSymbol: string;
    toSymbol: string;
    fromAmount: number;
    toAmount: number;
    usdValue: number;
    fee: number;
    dateTime: string;
  }>;

  trades: Array<{
    id: number;
    botName: string;
    asset: string;
    profit: number;
    timestamp: string;
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

    balance: { type: Number, default: 0 },

    wallets: {
      type: Schema.Types.Mixed,
      default: { usdt: 0, btc: 0, eth: 0, ngn: 0 },
    },

    deposits: [
      {
        id: Number,
        amount: Number,
        asset: String,
        address: String,
        network: String,
        status: { type: String, default: "Pending" },
        dateTime: String,
        txId: String,
      },
    ],

    withdrawals: [
      {
        id: Number,
        amount: Number,
        asset: String,
        address: String,
        network: String,
        txId: String,
        fee: Number,
        status: { type: String, default: "Pending" },
        dateTime: String,
      },
    ],

    converts: [
      {
        id: Number,
        fromSymbol: String,
        toSymbol: String,
        fromAmount: Number,
        toAmount: Number,
        usdValue: Number,
        fee: Number,
        dateTime: String,
      },
    ],

    trades: [
      {
        id: Number,
        botName: String,
        asset: String,
        profit: Number,
        timestamp: String,
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
