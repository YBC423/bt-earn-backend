import express from "express";
import User from "../models/User";
const router = express.Router();

router.get("/users", async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users);
});

router.post("/add-balance", async (req, res) => {
  const { email, amount, currency } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: "User not found" });
  const curr = currency || "usdt";
  user.wallets[curr] = (user.wallets[curr] || 0) + Number(amount);
  user.balance += Number(amount);
  user.deposits.push({ amount: Number(amount), currency: curr, status: "approved", description: "Admin added" });
  await user.save();
  res.json({ success: true, user });
});

router.post("/reduce-balance", async (req, res) => {
  const { email, amount, currency } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: "User not found" });
  const curr = currency || "usdt";
  user.wallets[curr] = (user.wallets[curr] || 0) - Number(amount);
  user.balance -= Number(amount);
  await user.save();
  res.json({ success: true, user });
});

router.post("/block-user", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  user.status = "blocked";
  await user.save();
  res.json({ success: true });
});

export default router;