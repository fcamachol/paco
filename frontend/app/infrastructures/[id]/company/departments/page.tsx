"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Trash2, Users } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";

export default function CompanyDepartmentsPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["company-departments", id],
    queryFn: () => api.getCompanyDepartments(id),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["company-roles", id],
    queryFn: () => api.getCompanyRoles(id),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createCompanyDepartment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-departments", id] });
      setShowForm(false);
      setName("");
      setDisplayName("");
      setDescription("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (deptId: string) => api.deleteCompanyDepartment(id, deptId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-departments", id] }),
  });

  const getRolesForDept = (deptId: string) =>
    roles.filter((r: any) => r.department_id === deptId);

  return (
    <div>
      <Header title="Departments" description="Organizational structure" />
      <div className="p-6 space-y-6">
        <div className="flex justify-end">
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-lg bg-coral-500 text-white hover:bg-coral-600 text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Department
          </button>
        </div>

        {showForm && (
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold">Create Department</h3>
            <div className="grid grid-cols-2 gap-4">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Slug (e.g. engineering)" className="px-3 py-2 rounded-lg bg-background-secondary border border-transparent focus:border-coral-500 outline-none text-sm" />
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display Name" className="px-3 py-2 rounded-lg bg-background-secondary border border-transparent focus:border-coral-500 outline-none text-sm" />
            </div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="w-full px-3 py-2 rounded-lg bg-background-secondary border border-transparent focus:border-coral-500 outline-none text-sm" rows={2} />
            <div className="flex gap-2">
              <button onClick={() => createMutation.mutate({ name, display_name: displayName || undefined, description: description || undefined })} disabled={!name} className="px-4 py-2 rounded-lg bg-coral-500 text-white hover:bg-coral-600 text-sm font-medium disabled:opacity-50">
                Create
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-background-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-background-secondary rounded-lg" />)}
          </div>
        ) : departments.length === 0 ? (
          <div className="card p-12 text-center">
            <Building2 className="w-12 h-12 text-foreground-muted mx-auto mb-3" />
            <p className="text-foreground-muted">No departments yet. Create one to organize your agents.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {departments.map((dept: any) => {
              const deptRoles = getRolesForDept(dept.id);
              return (
                <div key={dept.id} className="card p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-coral-500/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-coral-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{dept.display_name || dept.name}</h3>
                        <p className="text-xs text-foreground-muted">{dept.name}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteMutation.mutate(dept.id)} className="p-1.5 rounded hover:bg-red-500/10 text-foreground-muted hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {dept.description && <p className="text-sm text-foreground-muted mt-3">{dept.description}</p>}
                  {deptRoles.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-background-secondary">
                      <div className="flex items-center gap-1.5 text-xs text-foreground-muted mb-2">
                        <Users className="w-3.5 h-3.5" /> {deptRoles.length} agent{deptRoles.length !== 1 ? "s" : ""}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {deptRoles.map((r: any) => (
                          <span key={r.id} className="px-2 py-0.5 bg-background-secondary rounded text-xs">{r.agent_slug}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
