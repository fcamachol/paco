"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FileCode, FolderOpen, ChevronRight } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";

export default function FilesPage() {
  const { id } = useParams<{ id: string }>();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const { data: infra } = useQuery({
    queryKey: ["infrastructure", id],
    queryFn: () => api.getInfrastructure(id),
  });

  const { data: files = [] } = useQuery({
    queryKey: ["infra-files", id],
    queryFn: () => api.getInfraFiles(id),
  });

  const { data: fileContent } = useQuery({
    queryKey: ["infra-file", id, selectedFile],
    queryFn: () => api.getInfraFile(id, selectedFile!),
    enabled: !!selectedFile,
  });

  // Group files by directory
  const fileTree: Record<string, string[]> = {};
  (files as string[]).forEach((f) => {
    const parts = f.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    if (!fileTree[dir]) fileTree[dir] = [];
    fileTree[dir].push(f);
  });

  const dirs = Object.keys(fileTree).sort();

  const getLanguage = (path: string): string => {
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
    if (path.endsWith(".sql")) return "sql";
    if (path.endsWith(".txt")) return "text";
    if (path.endsWith(".sh")) return "bash";
    return "text";
  };

  return (
    <div>
      <Header
        title="Generated Files"
        description={infra?.display_name || "Infrastructure source code"}
      />

      <div className="p-6">
        {(files as string[]).length === 0 ? (
          <div className="card p-12 text-center">
            <FileCode className="w-12 h-12 text-foreground-muted mx-auto mb-4" />
            <p className="text-foreground-muted">
              No files generated yet. Generate the infrastructure first.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-6">
            {/* File tree sidebar */}
            <div className="col-span-4 lg:col-span-3">
              <div className="card p-4 sticky top-6 max-h-[calc(100vh-8rem)] overflow-y-auto">
                <h3 className="text-sm font-semibold mb-3">
                  {(files as string[]).length} files
                </h3>
                <div className="space-y-1">
                  {dirs.map((dir) => (
                    <div key={dir}>
                      <div className="flex items-center gap-1.5 text-xs text-foreground-muted font-medium py-1">
                        <FolderOpen className="w-3.5 h-3.5" />
                        {dir === "." ? "root" : dir}
                      </div>
                      {fileTree[dir].map((f) => {
                        const filename = f.split("/").pop();
                        return (
                          <button
                            key={f}
                            onClick={() => setSelectedFile(f)}
                            className={`w-full text-left pl-5 py-1 text-xs rounded hover:bg-background-secondary ${
                              selectedFile === f
                                ? "bg-coral-500/10 text-coral-500 font-medium"
                                : "text-foreground"
                            }`}
                          >
                            {filename}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* File content */}
            <div className="col-span-8 lg:col-span-9">
              {selectedFile ? (
                <div className="card">
                  <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-sm">
                    <FileCode className="w-4 h-4 text-foreground-muted" />
                    <span className="font-mono text-xs">{selectedFile}</span>
                    <span className="text-xs text-foreground-muted ml-auto">
                      {getLanguage(selectedFile)}
                    </span>
                  </div>
                  <div className="p-4 max-h-[calc(100vh-12rem)] overflow-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {fileContent?.content || "Loading..."}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="card p-12 text-center">
                  <ChevronRight className="w-8 h-8 text-foreground-muted mx-auto mb-2" />
                  <p className="text-sm text-foreground-muted">
                    Select a file to view its content
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
