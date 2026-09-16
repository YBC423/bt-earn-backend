import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
  // PROFESSIONAL WALLETS
  wallets: {
    usdt: { type: Number, default: 0 },
    btc: { type: Number, default: 0 },
    eth: { type: Number, default: 0 },
    ngn: { type: Number, default: 0 },
  },
  balance: { type: Number, default: 0 }, // total USDT value

  // FULL CONTROL
  deposits: [{
    type: { type: String, default: "deposit" },
    amount: Number,
    currency: String,
    status: { type: String, default: "pending" },
    description: String,
    date: { type: Date, default: Date.now }
  }],

  withdrawals: [{
    type: { type: String, default: "withdrawal" },
    amount: Number,
    currency: String,
    status: { type: String, default: "pending" },
    date: { type: Date, default: Date.now }
  }],

  trades: [{
    pair: String,
    amount: Number,
    profit: Number,
    type: String,
    date: { type: Date, default: Date.now }
  }],

  loginHistory: [{
    ip: String,
    date: { type: Date, default: Date.now }
  }],

  totalProfit: { type: Number, default: 0 },
  status: { type: String, default: "active" }

}, { timestamps: true });

export default mongoose.model("User", UserSchema);