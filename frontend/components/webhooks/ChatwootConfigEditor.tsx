"use client";

import { useState, useEffect } from "react";
import { MessageSquare, ChevronDown, ChevronRight, Info } from "lucide-react";

export interface ChatwootConfig {
  url: string;
  account_id: number;
  filter_open_conversations: boolean;
  multi_message_delay_ms: number;
  media_processing: {
    audio_transcription: boolean;
    image_analysis: boolean;
    video_analysis: boolean;
  };
}

interface ChatwootConfigEditorProps {
  webhookConfig: Record<string, any>;
  onSave: (webhookConfig: Record<string, any>) => void;
  saving?: boolean;
}

const DEFAULT_CONFIG: ChatwootConfig = {
  url: "",
  account_id: 1,
  filter_open_conversations: true,
  multi_message_delay_ms: 1500,
  media_processing: {
    audio_transcription: true,
    image_analysis: true,
    video_analysis: true,
  },
};

export function ChatwootConfigEditor({
  webhookConfig,
  onSave,
  saving,
}: ChatwootConfigEditorProps) {
  const existingChatwoot = webhookConfig?.chatwoot;
  const [enabled, setEnabled] = useState(!!existingChatwoot);
  const [config, setConfig] = useState<ChatwootConfig>(() => {
    if (existingChatwoot) {
      return {
        url: existingChatwoot.url || "",
        account_id: existingChatwoot.account_id ?? 1,
        filter_open_conversations: existingChatwoot.filter_open_conversations ?? true,
        multi_message_delay_ms: existingChatwoot.multi_message_delay_ms ?? 1500,
        media_processing: {
          audio_transcription: existingChatwoot.media_processing?.audio_transcription ?? true,
          image_analysis: existingChatwoot.media_processing?.image_analysis ?? true,
          video_analysis: existingChatwoot.media_processing?.video_analysis ?? true,
        },
      };
    }
    return { ...DEFAULT_CONFIG };
  });
  const [mediaExpanded, setMediaExpanded] = useState(true);
  const [dirty, setDirty] = useState(false);

  // Sync from parent when webhookConfig changes externally
  useEffect(() => {
    const cw = webhookConfig?.chatwoot;
    setEnabled(!!cw);
    if (cw) {
      setConfig({
        url: cw.url || "",
        account_id: cw.account_id ?? 1,
        filter_open_conversations: cw.filter_open_conversations ?? true,
        multi_message_delay_ms: cw.multi_message_delay_ms ?? 1500,
        media_processing: {
          audio_transcription: cw.media_processing?.audio_transcription ?? true,
          image_analysis: cw.media_processing?.image_analysis ?? true,
          video_analysis: cw.media_processing?.video_analysis ?? true,
        },
      });
    }
    setDirty(false);
  }, [webhookConfig]);

  const handleSave = () => {
    const updated = { ...webhookConfig };
    if (enabled) {
      updated.chatwoot = {
        url: config.url,
        account_id: config.account_id,
        filter_open_conversations: config.filter_open_conversations,
        multi_message_delay_ms: config.multi_message_delay_ms,
        media_processing: config.media_processing,
      };
    } else {
      delete updated.chatwoot;
    }
    onSave(updated);
    setDirty(false);
  };

  const updateConfig = (patch: Partial<ChatwootConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const updateMedia = (patch: Partial<ChatwootConfig["media_processing"]>) => {
    setConfig((prev) => ({
      ...prev,
      media_processing: { ...prev.media_processing, ...patch },
    }));
    setDirty(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-md font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Chatwoot Direct Integration
        </h3>
        <button
          onClick={() => {
            setEnabled(!enabled);
            setDirty(true);
          }}
          className={
            "w-9 h-5 rounded-full relative transition-colors " +
            (enabled ? "bg-emerald-500" : "bg-foreground-muted/30")
          }
          title={enabled ? "Disable Chatwoot" : "Enable Chatwoot"}
        >
          <span
            className={
              "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform " +
              (enabled ? "left-[18px]" : "left-0.5")
            }
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-4">
          {/* Chatwoot URL */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Chatwoot URL
            </label>
            <input
              type="text"
              value={config.url}
              onChange={(e) => updateConfig({ url: e.target.value })}
              placeholder="https://app.chatwoot.com"
              className="input w-full"
            />
          </div>

          {/* Account ID + Delay */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Account ID
              </label>
              <input
                type="number"
                value={config.account_id}
                onChange={(e) =>
                  updateConfig({ account_id: parseInt(e.target.value) || 1 })
                }
                min={1}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Multi-Message Delay (ms)
              </label>
              <input
                type="number"
                value={config.multi_message_delay_ms}
                onChange={(e) =>
                  updateConfig({
                    multi_message_delay_ms: parseInt(e.target.value) || 1500,
                  })
                }
                min={0}
                step={100}
                className="input w-full"
              />
            </div>
          </div>

          {/* Filter Open Conversations */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={config.filter_open_conversations}
              onChange={(e) =>
                updateConfig({ filter_open_conversations: e.target.checked })
              }
              className="w-4 h-4 rounded border-border accent-coral-500"
            />
            <span className="text-foreground">
              Skip open conversations (human-handled)
            </span>
          </label>

          {/* Media Processing Section */}
          <div className="border border-border rounded-lg">
            <button
              onClick={() => setMediaExpanded(!mediaExpanded)}
              className="w-full flex items-center justify-between p-3 text-sm font-medium text-foreground hover:bg-background-tertiary rounded-lg transition-colors"
            >
              <span>Media Processing</span>
              {mediaExpanded ? (
                <ChevronDown className="w-4 h-4 text-foreground-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-foreground-muted" />
              )}
            </button>
            {mediaExpanded && (
              <div className="px-3 pb-3 space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.media_processing.audio_transcription}
                    onChange={(e) =>
                      updateMedia({ audio_transcription: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-border accent-coral-500"
                  />
                  <span className="text-foreground">
                    Audio Transcription (OpenAI Whisper)
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.media_processing.image_analysis}
                    onChange={(e) =>
                      updateMedia({ image_analysis: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-border accent-coral-500"
                  />
                  <span className="text-foreground">
                    Image Analysis (Claude Vision)
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.media_processing.video_analysis}
                    onChange={(e) =>
                      updateMedia({ video_analysis: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-border accent-coral-500"
                  />
                  <span className="text-foreground">
                    Video Analysis (Gemini)
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Note about env vars */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Set <code className="font-mono text-xs">CHATWOOT_TOKEN</code>,{" "}
              <code className="font-mono text-xs">OPENAI_API_KEY</code>,{" "}
              <code className="font-mono text-xs">GEMINI_API_KEY</code> in the
              Configuration &rarr; Credentials section.
            </span>
          </div>

          {/* Save button */}
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary btn-sm"
            >
              {saving ? "Saving..." : "Save Chatwoot Config"}
            </button>
          )}
        </div>
      )}

      {!enabled && (
        <p className="text-sm text-foreground-muted">
          Enable to configure direct Chatwoot webhook integration with message
          filtering, media processing, and multi-message responses.
        </p>
      )}

      {/* Save when toggling off */}
      {!enabled && dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary btn-sm mt-4"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      )}
    </div>
  );
}
