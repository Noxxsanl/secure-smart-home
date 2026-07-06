import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import routes from "./routes";

dotenv.config();

const app = express();

// HTTP security headers (XSS, clickjacking, MIME sniffing, etc.)
app.use(helmet());

// CORS – only allow the Next.js frontend origin
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Limit JSON body size to prevent payload-based DoS
app.use(express.json({ limit: "10kb" }));
app.use(morgan("dev"));

// Rate limiter: /api/auth/login – 10 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", detail: "Too many login attempts, try again later" },
});

// Rate limiter: /api/device/data – 60 requests per minute per IP
const deviceDataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", detail: "Device data rate limit exceeded" },
});

// Rate limiter: all other admin API routes – 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  // Device data has its own limiter with a higher per-minute budget; skip it here
  skip: (req: Request) => req.originalUrl.startsWith("/api/device/data"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", detail: "API rate limit exceeded" },
});

app.use("/api/auth/login", authLimiter);
app.use("/api/device/data", deviceDataLimiter);
app.use("/api", apiLimiter);

app.use("/api", routes);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    status: "error",
    message: err.message || "Internal Server Error",
  });
});

export default app;
