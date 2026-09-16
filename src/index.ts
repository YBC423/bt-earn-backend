import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";

dotenv.config();

const app = express();

// Professional CORS - only your website can talk to API
app.use(cors({
  origin: ["https://bt-earn.xyz", "https://www.bt-earn.xyz", "http://localhost:3000"],
  credentials: true
}));

app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes); // Your power control

app.get("/", (req, res) => {
  res.json({ 
    status: "BT-Earn API is LIVE - Professional",
    version: "2.0 - MongoDB Enterprise",
    time: new Date()
  });
});

// Connect MongoDB and Start
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI as string).then(() => {
  console.log("✅ MongoDB Atlas Connected - Professional");
  app.listen(PORT, () => console.log(`🚀 API running on ${PORT}`));
}).catch(err => console.error("MongoDB Error:", err));