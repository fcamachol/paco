"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/ui/Sidebar";

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useAuth();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!token) {
      router.push("/auth/login");
    }
  }, [token, router]);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  if (!token) {
    return null;
  }

  return (
    <div className="h-screen overflow-hidden bg-background">
      <Sidebar />
      <main ref={mainRef} className="pl-64 h-screen overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
