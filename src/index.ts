import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/auth";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: ["https://bt-earn.xyz", "https://www.bt-earn.xyz", "http://localhost:3000"],
  credentials: true
}));

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI as string)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

app.get("/", (req, res) => {
  res.send("BT-Earn Backend is Live!");
});

app.use("/api/auth", authRoutes);

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});