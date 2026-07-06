"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AUTH_ROUTES } from "@/features/auth/routes";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess(false);

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    setIsSubmitting(true);
    window.setTimeout(() => {
      setIsSubmitting(false);
      setSuccess(true);
    }, 300);
  };

  return (
    <main className="min-h-screen bg-[#F6F8FB] px-4 py-10 text-gray-900">
      {success ? (
        <div className="fixed right-4 top-4 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-sm">
          Password reset link sent
        </div>
      ) : null}

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center">
        <section className="rounded-2xl border border-[#E5EAF0] bg-white p-8 shadow-sm sm:p-10">
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Account recovery</p>
            <h1 className="mt-3 text-2xl font-semibold text-gray-900">Forgot password</h1>
            <p className="mt-2 text-sm text-gray-500">Enter your email and we will send a mock reset link.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-gray-600">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="admin@example.com"
                required
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Send Reset Link"}
            </button>
          </form>

          <Link
            href={AUTH_ROUTES.login}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            Back to Login
          </Link>
        </section>
      </div>
    </main>
  );
}
