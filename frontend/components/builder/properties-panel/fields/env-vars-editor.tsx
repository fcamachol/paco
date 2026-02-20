'use client';

import React, { useState } from 'react';
import { Control, Controller } from 'react-hook-form';
import { Plus, Trash2, Eye, EyeOff, Key } from 'lucide-react';
import { AgentFormValues } from '../schemas/agent-schema';

interface EnvVarsEditorProps {
  control: Control<AgentFormValues>;
}

const PRESET_KEYS = [
  { label: 'Anthropic API Key', key: 'ANTHROPIC_API_KEY' },
  { label: 'OpenAI API Key', key: 'OPENAI_API_KEY' },
];

const SENSITIVE_PATTERNS = ['API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'CREDENTIAL'];

function isSensitiveKey(key: string): boolean {
  const upper = key.toUpperCase();
  return SENSITIVE_PATTERNS.some((p) => upper.includes(p));
}

interface EnvVarRowProps {
  envKey: string;
  value: string;
  onKeyChange: (newKey: string) => void;
  onValueChange: (newValue: string) => void;
  onRemove: () => void;
}

const EnvVarRow: React.FC<EnvVarRowProps> = ({
  envKey,
  value,
  onKeyChange,
  onValueChange,
  onRemove,
}) => {
  const sensitive = isSensitiveKey(envKey);
  const [showValue, setShowValue] = useState(!sensitive);

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={envKey}
        onChange={(e) => onKeyChange(e.target.value)}
        placeholder="KEY_NAME"
        className="input flex-1 font-mono text-sm"
      />
      <div className="relative flex-1">
        <input
          type={showValue ? 'text' : 'password'}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={sensitive ? '••••••••' : 'value'}
          className="input w-full font-mono text-sm pr-8"
        />
        {sensitive && (
          <button
            type="button"
            onClick={() => setShowValue(!showValue)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
          >
            {showValue ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-foreground-muted hover:text-error rounded"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

/**
 * Key-value editor for per-agent environment variables.
 * Sensitive keys use password input with show/hide toggle.
 */
export const EnvVarsEditor: React.FC<EnvVarsEditorProps> = ({ control }) => {
  return (
    <Controller
      name="envVars"
      control={control}
      render={({ field }) => {
        const envVars: Record<string, string> = field.value || {};
        const entries = Object.entries(envVars);

        const updateEntries = (newEntries: [string, string][]) => {
          const obj: Record<string, string> = {};
          for (const [k, v] of newEntries) {
            if (k) obj[k] = v;
          }
          field.onChange(obj);
        };

        const addRow = (key = '', value = '') => {
          updateEntries([...entries, [key, value]]);
        };

        const removeRow = (index: number) => {
          const next = entries.filter((_, i) => i !== index);
          updateEntries(next);
        };

        const updateKey = (index: number, newKey: string) => {
          const next = entries.map(([k, v], i) =>
            i === index ? [newKey, v] as [string, string] : [k, v] as [string, string]
          );
          updateEntries(next);
        };

        const updateValue = (index: number, newValue: string) => {
          const next = entries.map(([k, v], i) =>
            i === index ? [k, newValue] as [string, string] : [k, v] as [string, string]
          );
          updateEntries(next);
        };

        const existingKeys = new Set(entries.map(([k]) => k));

        return (
          <div className="space-y-3">
            {entries.length === 0 ? (
              <p className="text-sm text-foreground-muted italic">
                Using global default API keys
              </p>
            ) : (
              <div className="space-y-2">
                {entries.map(([key, value], index) => (
                  <EnvVarRow
                    key={index}
                    envKey={key}
                    value={value}
                    onKeyChange={(newKey) => updateKey(index, newKey)}
                    onValueChange={(newValue) => updateValue(index, newValue)}
                    onRemove={() => removeRow(index)}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => addRow()}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-foreground-muted hover:text-foreground hover:border-foreground/30"
              >
                <Plus className="w-3 h-3" />
                Add Variable
              </button>

              {PRESET_KEYS.filter((p) => !existingKeys.has(p.key)).map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => addRow(preset.key, '')}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-foreground-muted hover:text-foreground hover:border-foreground/30"
                >
                  <Key className="w-3 h-3" />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        );
      }}
    />
  );
};

export default EnvVarsEditor;
