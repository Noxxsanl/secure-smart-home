import dotenv from "dotenv";

dotenv.config();

const REQUIRED_ENV_VARS = [
  "DB_HOST",
  "DB_USER",
  "DB_PASS",
  "DB_NAME",
  "JWT_SECRET",
  "PORT",
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    console.error(`[startup] Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  if (process.env.JWT_SECRET!.trim().length < 32) {
    console.error("[startup] JWT_SECRET must be at least 32 characters");
    process.exit(1);
  }
}

// Validate immediately on module load so any import of this file triggers the check
validateEnv();
