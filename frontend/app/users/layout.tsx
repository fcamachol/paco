"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/ui/Sidebar";

export default function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { token } = useAuth();

  useEffect(() => {
    if (!token) {
      router.push("/auth/login");
    }
  }, [token, router]);

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
