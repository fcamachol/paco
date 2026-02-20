"use client";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-foreground-muted/20", text: "text-foreground-muted", label: "Draft" },
  generated: { bg: "bg-blue-500/20", text: "text-blue-400", label: "Generated" },
  building: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "Building" },
  running: { bg: "bg-success/20", text: "text-success", label: "Running" },
  stopped: { bg: "bg-foreground-muted/20", text: "text-foreground-muted", label: "Stopped" },
  error: { bg: "bg-error/20", text: "text-error", label: "Error" },
};

export function InfraStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.draft;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          status === "running" ? "animate-pulse bg-success" : style.text.replace("text-", "bg-")
        }`}
      />
      {style.label}
    </span>
  );
}
