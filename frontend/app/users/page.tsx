"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Shield, Eye, Wrench, MoreVertical, Trash2 } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api, User } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import { useIsAdmin } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function UsersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Redirect non-admins
  useEffect(() => {
    if (isAdmin === false) {
      router.push("/dashboard");
    }
  }, [isAdmin, router]);

  // Fetch users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.getUsers(),
    enabled: isAdmin === true,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  // Filter users
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());

    const matchesRole = roleFilter === "all" || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Shield className="w-4 h-4 text-coral-500" />;
      case "operator":
        return <Wrench className="w-4 h-4 text-warning" />;
      default:
        return <Eye className="w-4 h-4 text-foreground-muted" />;
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div>
      <Header
        title="Users"
        description="Manage user accounts and roles"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{users.length}</p>
            <p className="text-sm text-foreground-muted">Total Users</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-coral-500">
              {users.filter((u) => u.role === "admin").length}
            </p>
            <p className="text-sm text-foreground-muted">Admins</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-warning">
              {users.filter((u) => u.role === "operator").length}
            </p>
            <p className="text-sm text-foreground-muted">Operators</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-foreground-muted">
              {users.filter((u) => u.role === "viewer").length}
            </p>
            <p className="text-sm text-foreground-muted">Viewers</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9 w-64"
              />
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="input w-40"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <button className="btn-primary btn-md">
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </button>
        </div>

        {/* Users Table */}
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    User
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Created
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Last Login
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex justify-center">
                        <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
                      </div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-foreground-muted"
                    >
                      {search || roleFilter !== "all"
                        ? "No users match your filters"
                        : "No users found"}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-border hover:bg-background-secondary transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-coral-500/20 flex items-center justify-center">
                            <span className="text-coral-500 font-medium text-sm">
                              {user.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {user.name}
                            </p>
                            <p className="text-sm text-foreground-muted">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getRoleIcon(user.role)}
                          <span className="text-sm capitalize text-foreground">
                            {user.role}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-xs font-medium",
                            user.is_active
                              ? "bg-success/20 text-success border border-success/30"
                              : "bg-error/20 text-error border border-error/30"
                          )}
                        >
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        {formatDateTime(user.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        {user.last_login
                          ? formatDateTime(user.last_login)
                          : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button className="btn-ghost btn-sm p-1">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete user ${user.name}? This cannot be undone.`
                                )
                              ) {
                                deleteMutation.mutate(user.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="btn-ghost btn-sm p-1 text-error hover:bg-error/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
