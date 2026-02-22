"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";

interface SecretDisplayProps {
  value: string;
  label?: string;
}

export function SecretDisplay({ value, label }: SecretDisplayProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
      {label && (
        <p className="text-xs font-medium text-amber-400 mb-1">{label}</p>
      )}
      <div className="flex items-center gap-2">
        <code className="flex-1 text-sm font-mono text-foreground break-all">
          {visible ? value : "•".repeat(Math.min(value.length, 40))}
        </code>
        <button
          onClick={() => setVisible(!visible)}
          className="p-1 text-foreground-muted hover:text-foreground"
          title={visible ? "Hide" : "Show"}
        >
          {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={handleCopy}
          className="p-1 text-foreground-muted hover:text-foreground"
          title="Copy"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      <p className="text-xs text-amber-400/70 mt-1">
        This will only be shown once. Save it now.
      </p>
    </div>
  );
}
