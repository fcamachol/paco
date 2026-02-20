"use client";

import { Building2, User, ChevronRight } from "lucide-react";

interface Department {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  parent_id: string | null;
  manager_agent_slug: string | null;
  children?: Department[];
  agents?: Role[];
}

interface Role {
  id: string;
  agent_slug: string;
  title: string;
  role_type: string;
  department_id: string | null;
}

interface OrgChartProps {
  departments: Department[];
  roles: Role[];
}

function buildTree(departments: Department[], roles: Role[]): Department[] {
  const deptMap = new Map<string, Department>();
  departments.forEach((d) => deptMap.set(d.id, { ...d, children: [], agents: [] }));

  // Attach roles to departments
  roles.forEach((r) => {
    if (r.department_id && deptMap.has(r.department_id)) {
      deptMap.get(r.department_id)!.agents!.push(r);
    }
  });

  // Build hierarchy
  const roots: Department[] = [];
  deptMap.forEach((dept) => {
    if (dept.parent_id && deptMap.has(dept.parent_id)) {
      deptMap.get(dept.parent_id)!.children!.push(dept);
    } else {
      roots.push(dept);
    }
  });

  return roots;
}

function DepartmentNode({ dept, depth = 0 }: { dept: Department; depth?: number }) {
  return (
    <div className={depth > 0 ? "ml-6 border-l border-background-secondary pl-4" : ""}>
      <div className="flex items-center gap-3 p-3 bg-background-secondary rounded-lg mb-2">
        <Building2 className="w-5 h-5 text-coral-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold">{dept.display_name || dept.name}</p>
          {dept.description && (
            <p className="text-xs text-foreground-muted truncate">{dept.description}</p>
          )}
        </div>
        {dept.manager_agent_slug && (
          <span className="text-xs bg-coral-500/10 text-coral-500 px-2 py-0.5 rounded">
            Mgr: {dept.manager_agent_slug}
          </span>
        )}
      </div>

      {/* Agents in this department */}
      {dept.agents && dept.agents.length > 0 && (
        <div className="ml-6 mb-2 space-y-1">
          {dept.agents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-background-secondary/50">
              <User className="w-4 h-4 text-foreground-muted flex-shrink-0" />
              <span className="text-sm">{agent.agent_slug}</span>
              <ChevronRight className="w-3 h-3 text-foreground-muted" />
              <span className="text-xs text-foreground-muted">{agent.title}</span>
              <span className="text-xs bg-background-secondary px-1.5 py-0.5 rounded ml-auto capitalize">
                {agent.role_type}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Child departments */}
      {dept.children && dept.children.map((child) => (
        <DepartmentNode key={child.id} dept={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function OrgChart({ departments, roles }: OrgChartProps) {
  const tree = buildTree(departments, roles);

  if (tree.length === 0) {
    return (
      <div className="text-center py-8">
        <Building2 className="w-10 h-10 text-foreground-muted mx-auto mb-2" />
        <p className="text-sm text-foreground-muted">No departments configured</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tree.map((dept) => (
        <DepartmentNode key={dept.id} dept={dept} />
      ))}
    </div>
  );
}
