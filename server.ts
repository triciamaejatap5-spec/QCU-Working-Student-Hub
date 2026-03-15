import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import Database from "better-sqlite3";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database for OTPs
const db = new Database("auth.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS otps (
    email TEXT PRIMARY KEY,
    otp TEXT NOT NULL,
    expires_at DATETIME NOT NULL
  )
`);

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // OTP Endpoints
  app.post("/api/auth/send-otp", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    try {
      // Store OTP in database
      const upsert = db.prepare(`
        INSERT INTO otps (email, otp, expires_at) 
        VALUES (?, ?, ?) 
        ON CONFLICT(email) DO UPDATE SET otp=excluded.otp, expires_at=excluded.expires_at
      `);
      upsert.run(email, otp, expiresAt);

      // Configure nodemailer
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });

      const mailOptions = {
        from: `"ShiftStudy Guide" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: "Your Verification Code - ShiftStudy Guide",
        text: `Your one-time verification code is: ${otp}. It will expire in 10 minutes.`,
        html: `
          <div style="font-family: sans-serif; max-width: 400px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #059669; text-align: center;">ShiftStudy Guide</h2>
            <p>Hello,</p>
            <p>Use the following code to verify your identity. This code is valid for <b>10 minutes</b>.</p>
            <div style="background: #f3f4f6; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #111827; border-radius: 8px; margin: 20px 0;">
              ${otp}
            </div>
            <p style="font-size: 12px; color: #6b7280; text-align: center;">If you didn't request this code, you can safely ignore this email.</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      res.json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error("Error sending OTP:", error);
      res.status(500).json({ error: "Failed to send OTP. Please check server configuration." });
    }
  });

  app.post("/api/auth/verify-otp", (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

    const row = db.prepare("SELECT * FROM otps WHERE email = ?").get(email) as any;

    if (!row) {
      return res.status(400).json({ error: "No OTP found for this email" });
    }

    if (new Date(row.expires_at) < new Date()) {
      db.prepare("DELETE FROM otps WHERE email = ?").run(email);
      return res.status(400).json({ error: "OTP has expired" });
    }

    if (row.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Success - Delete OTP after use
    db.prepare("DELETE FROM otps WHERE email = ?").run(email);
    res.json({ success: true, message: "OTP verified successfully" });
  });

  // OAuth Callback Handler
  // This route is used by the popup to handle the redirect from the OAuth provider
  app.get("/auth/callback", (req, res) => {
    res.send(`
      <html>
        <head>
          <title>Authentication Successful</title>
        </head>
        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; background-color: #f9fafb; color: #111827;">
          <div style="background: white; padding: 2rem; border-radius: 1rem; shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center;">
            <h1 style="color: #059669; margin-bottom: 1rem;">Success!</h1>
            <p>Authentication complete. This window will close automatically.</p>
            <script>
              if (window.opener) {
                // Send message to the main app window
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                // Close the popup
                setTimeout(() => window.close(), 1000);
              } else {
                // Fallback if not in a popup
                window.location.href = '/';
              }
            </script>
          </div>
        </body>
      </html>
    `);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
