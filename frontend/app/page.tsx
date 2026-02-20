"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const { token, refreshUser } = useAuth();

  useEffect(() => {
    if (token) {
      refreshUser().then(() => {
        router.push("/dashboard");
      });
    } else {
      router.push("/auth/login");
    }
  }, [token, router, refreshUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin-slow">
        <svg
          className="w-12 h-12 text-coral-500"
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
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    </div>
  );
}
