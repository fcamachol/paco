"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading, error, clearError } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError("");

    if (password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setLocalError("Password must be at least 6 characters");
      return;
    }

    try {
      await register(email, password, name);
      router.push("/dashboard");
    } catch {
      // Error is handled by the store
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gradient mb-2">PACO</h1>
          <p className="text-foreground-muted">
            Pretty Advanced Cognitive Orchestrator
          </p>
        </div>

        {/* Register Card */}
        <div className="card p-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">
            Create your account
          </h2>

          {displayError && (
            <div className="mb-4 p-3 rounded-md bg-error/20 border border-error/30 text-error text-sm">
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="label block mb-1">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="Your name"
                required
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="email" className="label block mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="label block mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="label block mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary btn-md w-full"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Creating account...
                </span>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-foreground-muted text-sm">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="text-coral-500 hover:text-coral-400"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-foreground-muted text-sm mt-8">
          New accounts are created with viewer role
        </p>
      </div>
    </div>
  );
}
