import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import User from "./models/user.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { CohereClient } from "cohere-ai";

dotenv.config();
const app = express();
const PORT = 5000;

// Middlewares

app.use(cookieParser());
app.use(bodyParser.json());
app.use(cors({
   origin: "http://localhost:3000",  // allow your React app
    credentials: true,                // allow cookies to be sen
}));


// Initialize Cohere client
const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});



// User registration endpoint
app.post("/api/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

     if (!fullName||!email || !password) return res.status(400).json({ error: "FullName,Email and password required" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    // Check if user already exists
    const existingUser = await User.findOne({ email: email });
    if (existingUser) return res.status(400).json({ error: "User already exists" });
    
    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);
   
    // Create new user
   const user = await User.create({ fullName, email, passwordHash });
    
   // Generate JWT token
     const token = signToken({ userId: user._id, fullName: user.fullName, email: user.email });
       await user.save();

     // Set the token in a cookie
    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

 res.status(201).json({ user: { id: user._id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


app.post("/api/recommendation", async (req, res) => {
  try {
    const { question } = req.body;

    const response = await cohere.chat({
      model: "command-a-03-2025", // 
      preamble: "You respond in concise sentences.", // same as Python
      chat_history: [
        { role: "user", message: "Hello" },
        { role: "chatbot", message: "Hi, how can I help you today?" },
      ],
      message: question,
    });

    // Cohere responses have .text or .output_text depending on SDK version
    res.json({ recommendation: response.text || response.output_text });
  } catch (error) {
    console.error("Cohere API error:", error);
    res.status(500).json({ error: "Failed to fetch AI response" });
  }
});


//Login endpoint
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    // Find user by email
    const user = await User.findOne({ email: email });
    if (!user) return res.status(400).json({ error: "Invalid email or password" });

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) return res.status(400).json({ error: "Invalid email or password" });

    // Generate JWT token
    const token = signToken({ userId: user._id, email: user.email });

    // Set the token in a cookie
    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false, //process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user: { id: user._id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

//Logout endpoint
app.post("/api/logout", (req, res) => {
  res.clearCookie("auth_token");
  res.json({ message: "Logged out successfully" });
});


// --- AUTH HELPERS ---
// Helper function that creates a JWT (JSON Web Token) and is signedin with secrete key

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
}

function requireAuth(req, res, next) {
  const token = req.cookies["auth_token"];
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // store user info
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

//  Protected route to check if logged in
app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});




// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB is connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

  // Connect to server
app.listen(PORT, () =>
  console.log(`Server running with Cohere Chat API on http://localhost:${PORT}`)
);

