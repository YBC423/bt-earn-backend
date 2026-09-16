import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });
    
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashed });
    
    res.json({ message: "Registered successfully", userId: user._id });
  } catch (err: any) { 
    res.status(500).json({ message: err.message }); 
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, { expiresIn: "7d" });
    
    res.json({ token, user: { email: user.email, balance: user.balance } });
  } catch (err: any) { 
    res.status(500).json({ message: err.message }); 
  }
});

router.get('/test', (req, res) => {
  res.json({ message: 'Auth route working!' });
});

export default router;