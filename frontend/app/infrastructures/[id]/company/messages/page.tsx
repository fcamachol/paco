"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  MessageSquare,
  Send,
  Mail,
  MailOpen,
  ArrowRight,
  Filter,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";

export default function CompanyMessagesPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [filterType, setFilterType] = useState<string>("");
  const [filterSender, setFilterSender] = useState<string>("");
  const [showComposer, setShowComposer] = useState(false);
  const [newMessage, setNewMessage] = useState({
    sender_slug: "",
    recipient_slug: "",
    message_type: "direct",
    subject: "",
    content: "",
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["company-messages", id, filterType, filterSender],
    queryFn: () =>
      api.getCompanyMessages(id, {
        ...(filterType ? { message_type: filterType } : {}),
        ...(filterSender ? { sender: filterSender } : {}),
      }),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["company-roles", id],
    queryFn: () => api.getCompanyRoles(id).catch(() => []),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      api.sendCompanyMessage(id, {
        sender_slug: newMessage.sender_slug,
        recipient_slug: newMessage.recipient_slug || undefined,
        message_type: newMessage.message_type,
        subject: newMessage.subject || undefined,
        content: newMessage.content,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-messages", id] });
      setShowComposer(false);
      setNewMessage({ sender_slug: "", recipient_slug: "", message_type: "direct", subject: "", content: "" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (messageId: string) => api.markCompanyMessageRead(id, messageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-messages", id] }),
  });

  const messageTypes = ["direct", "broadcast", "task_request", "task_result", "escalation"];

  const typeColor = (type: string) => {
    switch (type) {
      case "direct": return "bg-blue-500/10 text-blue-500";
      case "broadcast": return "bg-purple-500/10 text-purple-500";
      case "task_request": return "bg-orange-500/10 text-orange-500";
      case "task_result": return "bg-green-500/10 text-green-500";
      case "escalation": return "bg-red-500/10 text-red-500";
      default: return "bg-background-secondary text-foreground-muted";
    }
  };

  const statusIcon = (status: string) => {
    return status === "read" ? (
      <MailOpen className="w-4 h-4 text-foreground-muted" />
    ) : (
      <Mail className="w-4 h-4 text-coral-500" />
    );
  };

  return (
    <div>
      <Header title="Messages" description="Inter-agent communication" />

      <div className="p-6 space-y-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Filter className="w-4 h-4 text-foreground-muted" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-background-secondary border border-border rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All types</option>
              {messageTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={filterSender}
              onChange={(e) => setFilterSender(e.target.value)}
              className="bg-background-secondary border border-border rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All agents</option>
              {roles.map((r: any) => (
                <option key={r.agent_slug} value={r.agent_slug}>{r.agent_slug}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowComposer(!showComposer)}
            className="px-4 py-2 rounded-lg bg-coral-500 text-white hover:bg-coral-600 text-sm font-medium flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> Compose
          </button>
        </div>

        {/* Composer */}
        {showComposer && (
          <div className="card p-6 space-y-4">
            <h3 className="text-lg font-semibold">New Message</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-foreground-muted block mb-1">From</label>
                <select
                  value={newMessage.sender_slug}
                  onChange={(e) => setNewMessage({ ...newMessage, sender_slug: e.target.value })}
                  className="w-full bg-background-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select sender...</option>
                  {roles.map((r: any) => (
                    <option key={r.agent_slug} value={r.agent_slug}>{r.agent_slug}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-foreground-muted block mb-1">To</label>
                <select
                  value={newMessage.recipient_slug}
                  onChange={(e) => setNewMessage({ ...newMessage, recipient_slug: e.target.value })}
                  className="w-full bg-background-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Broadcast (all)</option>
                  {roles.map((r: any) => (
                    <option key={r.agent_slug} value={r.agent_slug}>{r.agent_slug}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-foreground-muted block mb-1">Type</label>
                <select
                  value={newMessage.message_type}
                  onChange={(e) => setNewMessage({ ...newMessage, message_type: e.target.value })}
                  className="w-full bg-background-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  {messageTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-foreground-muted block mb-1">Subject</label>
                <input
                  type="text"
                  value={newMessage.subject}
                  onChange={(e) => setNewMessage({ ...newMessage, subject: e.target.value })}
                  placeholder="Optional subject..."
                  className="w-full bg-background-secondary border border-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-foreground-muted block mb-1">Content</label>
              <textarea
                value={newMessage.content}
                onChange={(e) => setNewMessage({ ...newMessage, content: e.target.value })}
                rows={3}
                placeholder="Message content..."
                className="w-full bg-background-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowComposer(false)}
                className="px-4 py-2 rounded-lg bg-background-secondary text-foreground-muted hover:text-foreground text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => sendMutation.mutate()}
                disabled={!newMessage.sender_slug || !newMessage.content || sendMutation.isPending}
                className="px-4 py-2 rounded-lg bg-coral-500 text-white hover:bg-coral-600 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4" /> {sendMutation.isPending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        )}

        {/* Messages list */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-foreground-muted" /> Messages ({messages.length})
          </h3>
          {isLoading ? (
            <p className="text-sm text-foreground-muted text-center py-8">Loading...</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-foreground-muted text-center py-8">No messages yet.</p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg: any) => (
                <div key={msg.id} className="p-4 bg-background-secondary rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{statusIcon(msg.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{msg.sender_slug}</span>
                        <ArrowRight className="w-3 h-3 text-foreground-muted" />
                        <span className="text-sm font-medium">{msg.recipient_slug || "all"}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${typeColor(msg.message_type)}`}>
                          {msg.message_type}
                        </span>
                      </div>
                      {msg.subject && (
                        <p className="text-sm font-medium mt-1">{msg.subject}</p>
                      )}
                      <p className="text-sm text-foreground-muted mt-1 whitespace-pre-wrap line-clamp-3">{msg.content}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-foreground-muted">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                        {msg.status !== "read" && (
                          <button
                            onClick={() => markReadMutation.mutate(msg.id)}
                            className="text-xs text-coral-500 hover:text-coral-400"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
