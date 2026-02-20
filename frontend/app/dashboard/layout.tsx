"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/ui/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { token, refreshUser } = useAuth();

  useEffect(() => {
    if (!token) {
      router.push("/auth/login");
    } else {
      refreshUser();
    }
  }, [token, router, refreshUser]);

  if (!token) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-64">{children}</main>
    </div>
  );
}
