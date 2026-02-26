"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Bot,
  Wrench,
  MessageSquare,
  ShieldCheck,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Copy,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import { StepTimeline } from "@/components/playground/StepTimeline";
import { StepEvent } from "@/components/playground/usePlayground";
import { api, SessionMessage } from "@/lib/api";
import {
  cn,
  formatDateTime,
  formatDuration,
  formatCost,
  formatTokens,
} from "@/lib/utils";

export default function SessionRunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set()
  );

  const { data: session, isLoading } = useQuery({
    queryKey: ["session-run", id],
    queryFn: () => api.getSessionRun(id),
    enabled: !!id,
  });

  const { data: integrity } = useQuery({
    queryKey: ["session-run-integrity", id],
    queryFn: () => api.verifySessionIntegrity(id),
    enabled: !!id,
  });

  const toggleExpand = (msgId: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const handleExport = async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    window.open(`${apiUrl}/api/session-runs/${id}/export`, "_blank");
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "user":
        return <User className="w-5 h-5 text-blue-400" />;
      case "assistant":
        return <Bot className="w-5 h-5 text-coral-500" />;
      case "system":
        return <MessageSquare className="w-5 h-5 text-purple-400" />;
      case "tool_use":
        return <Wrench className="w-5 h-5 text-yellow-400" />;
      case "tool_result":
        return <Wrench className="w-5 h-5 text-green-400" />;
      default:
        return <MessageSquare className="w-5 h-5 text-foreground-muted" />;
    }
  };

  const getRoleBg = (role: string) => {
    switch (role) {
      case "user":
        return "bg-blue-500/5 border-blue-500/20";
      case "assistant":
        return "bg-coral-500/5 border-coral-500/20";
      case "system":
        return "bg-purple-500/5 border-purple-500/20";
      case "tool_use":
        return "bg-yellow-500/5 border-yellow-500/20";
      case "tool_result":
        return "bg-green-500/5 border-green-500/20";
      default:
        return "bg-background-tertiary border-border";
    }
  };

  if (isLoading) {
    return (
      <div>
        <Header title="Session Run" description="Loading..." />
        <div className="p-6 flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div>
        <Header title="Session Run" description="Not found" />
        <div className="p-6 text-center text-foreground-muted py-20">
          Session not found.{" "}
          <Link href="/session-runs" className="text-coral-500 hover:underline">
            Back to sessions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Session Replay"
        description={session.title || "Untitled Session"}
      />

      <div className="p-6 space-y-6">
        {/* Back + Actions Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/session-runs")}
            className="btn-ghost btn-sm flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Sessions
          </button>

          <div className="flex items-center gap-2">
            {/* Integrity Badge */}
            {integrity && (
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm",
                  integrity.integrity_valid
                    ? "bg-green-500/10 text-green-400"
                    : "bg-red-500/10 text-red-400"
                )}
              >
                <ShieldCheck className="w-4 h-4" />
                {integrity.integrity_valid
                  ? "Integrity verified"
                  : "Integrity failed"}
              </div>
            )}
            <button
              onClick={handleExport}
              className="btn-secondary btn-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
          </div>
        </div>

        {/* Session Metadata */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-xs text-foreground-muted uppercase tracking-wide">
              Status
            </p>
            <p
              className={cn(
                "text-lg font-semibold capitalize",
                session.status === "completed" && "text-success",
                session.status === "error" && "text-error",
                session.status === "active" && "text-coral-500"
              )}
            >
              {session.status}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-foreground-muted uppercase tracking-wide">
              Messages
            </p>
            <p className="text-lg font-semibold text-foreground">
              {session.message_count}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-foreground-muted uppercase tracking-wide">
              Tokens
            </p>
            <p className="text-lg font-semibold text-foreground">
              {formatTokens(
                session.total_input_tokens + session.total_output_tokens
              )}
            </p>
            <p className="text-xs text-foreground-muted">
              {formatTokens(session.total_input_tokens)} in /{" "}
              {formatTokens(session.total_output_tokens)} out
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-foreground-muted uppercase tracking-wide">
              Cost
            </p>
            <p className="text-lg font-semibold text-foreground">
              {formatCost(session.total_cost)}
            </p>
          </div>
        </div>

        {/* Session Info */}
        <div className="card p-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-foreground-muted">Source:</span>{" "}
              <span className="text-foreground">{session.source}</span>
            </div>
            <div>
              <span className="text-foreground-muted">Model:</span>{" "}
              <span className="text-foreground">{session.model || "-"}</span>
            </div>
            <div>
              <span className="text-foreground-muted">Started:</span>{" "}
              <span className="text-foreground">
                {formatDateTime(session.started_at)}
              </span>
            </div>
            <div>
              <span className="text-foreground-muted">Duration:</span>{" "}
              <span className="text-foreground">
                {session.total_duration_ms
                  ? formatDuration(session.total_duration_ms)
                  : "-"}
              </span>
            </div>
          </div>
        </div>

        {/* System Prompt (collapsible) */}
        {session.system_prompt && (
          <details className="card">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-foreground-muted hover:text-foreground transition-colors">
              System Prompt
              <span className="text-xs ml-2 font-mono">
                (SHA-256: {session.system_prompt_hash?.slice(0, 12)}...)
              </span>
            </summary>
            <div className="px-4 pb-4">
              <pre className="text-sm text-foreground whitespace-pre-wrap bg-background-tertiary rounded-md p-4 max-h-64 overflow-y-auto">
                {session.system_prompt}
              </pre>
            </div>
          </details>
        )}

        {/* Conversation Messages */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground-muted">
            Conversation ({session.messages.length} messages)
          </h3>

          {session.messages.length === 0 ? (
            <div className="card p-8 text-center text-foreground-muted">
              No messages recorded in this session.
            </div>
          ) : (
            session.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                sessionId={id}
                expanded={expandedMessages.has(msg.id)}
                onToggle={() => toggleExpand(msg.id)}
                getRoleIcon={getRoleIcon}
                getRoleBg={getRoleBg}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  sessionId,
  expanded,
  onToggle,
  getRoleIcon,
  getRoleBg,
}: {
  message: SessionMessage;
  sessionId: string;
  expanded: boolean;
  onToggle: () => void;
  getRoleIcon: (role: string) => React.ReactNode;
  getRoleBg: (role: string) => string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = message.content_text || JSON.stringify(message.content_blocks, null, 2) || "";
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const roleLabel =
    message.role === "tool_use"
      ? `Tool Call: ${message.tool_name}`
      : message.role === "tool_result"
      ? `Tool Result: ${message.tool_name}`
      : message.role.charAt(0).toUpperCase() + message.role.slice(1);

  return (
    <div className={cn("card border", getRoleBg(message.role))}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {getRoleIcon(message.role)}
          <span className="text-sm font-medium text-foreground">
            {roleLabel}
          </span>
          <span className="text-xs text-foreground-muted">
            #{message.sequence_number}
          </span>
          {message.model && (
            <span className="text-xs text-foreground-muted font-mono">
              {message.model}
            </span>
          )}
          {message.latency_ms && (
            <span className="text-xs text-foreground-muted">
              {formatDuration(message.latency_ms)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(message.input_tokens || message.output_tokens) && (
            <span className="text-xs text-foreground-muted">
              {formatTokens((message.input_tokens || 0) + (message.output_tokens || 0))} tokens
            </span>
          )}
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-foreground-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-foreground-muted" />
          )}
        </div>
      </div>

      {/* Content (always show preview, expand for full) */}
      <div className="px-4 pb-3">
        {message.content_text ? (
          <div className="relative group">
            <pre
              className={cn(
                "text-sm text-foreground whitespace-pre-wrap",
                !expanded && "max-h-24 overflow-hidden"
              )}
            >
              {message.content_text}
            </pre>
            {!expanded && message.content_text.length > 300 && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background-secondary to-transparent" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity btn-ghost p-1 rounded"
              title="Copy content"
            >
              {copied ? (
                <CheckCircle className="w-3.5 h-3.5 text-success" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-foreground-muted" />
              )}
            </button>
          </div>
        ) : message.content_blocks ? (
          <pre
            className={cn(
              "text-sm text-foreground-muted font-mono whitespace-pre-wrap bg-background-tertiary rounded p-2",
              !expanded && "max-h-24 overflow-hidden"
            )}
          >
            {JSON.stringify(message.content_blocks, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-foreground-muted italic">
            (no content)
          </p>
        )}

        {/* Execution steps for assistant messages */}
        {message.role === 'assistant' && message.metadata?.steps?.length > 0 && (
          <div className="px-0 pb-2">
            <StepTimeline steps={message.metadata.steps as StepEvent[]} collapsed={true} />
          </div>
        )}

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              {message.input_tokens != null && (
                <div>
                  <span className="text-foreground-muted">Input:</span>{" "}
                  <span className="text-foreground">
                    {formatTokens(message.input_tokens)}
                  </span>
                </div>
              )}
              {message.output_tokens != null && (
                <div>
                  <span className="text-foreground-muted">Output:</span>{" "}
                  <span className="text-foreground">
                    {formatTokens(message.output_tokens)}
                  </span>
                </div>
              )}
              {message.cost != null && (
                <div>
                  <span className="text-foreground-muted">Cost:</span>{" "}
                  <span className="text-foreground">
                    {formatCost(message.cost)}
                  </span>
                </div>
              )}
              {message.stop_reason && (
                <div>
                  <span className="text-foreground-muted">Stop:</span>{" "}
                  <span className="text-foreground">
                    {message.stop_reason}
                  </span>
                </div>
              )}
            </div>
            {message.message_hash && (
              <p className="text-xs text-foreground-muted font-mono">
                Hash: {message.message_hash.slice(0, 24)}...
              </p>
            )}
            {message.thinking_content && (
              <details className="mt-2">
                <summary className="text-xs text-foreground-muted cursor-pointer hover:text-foreground">
                  Thinking trace
                </summary>
                <pre className="text-xs text-foreground-muted mt-1 whitespace-pre-wrap bg-background-tertiary rounded p-2 max-h-48 overflow-y-auto">
                  {message.thinking_content}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
