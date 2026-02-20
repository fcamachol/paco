'use client';

import React from 'react';
import { Control, Controller, useWatch } from 'react-hook-form';
import { Select, Input } from 'antd';
import { AgentFormValues } from '../schemas/agent-schema';

/**
 * Flat list of all model options with group metadata.
 */
export const MODEL_OPTIONS = [
  // Anthropic Claude (current)
  { label: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5-20250929', group: 'Anthropic' },
  { label: 'Claude Opus 4.5', value: 'claude-opus-4-5-20251101', group: 'Anthropic' },
  { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001', group: 'Anthropic' },

  // Anthropic Claude (legacy)
  { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514', group: 'Anthropic Legacy' },
  { label: 'Claude Opus 4', value: 'claude-opus-4-20250514', group: 'Anthropic Legacy' },

  // OpenAI GPT
  { label: 'GPT-5.2', value: 'gpt-5.2', group: 'OpenAI' },
  { label: 'GPT-5.1', value: 'gpt-5.1', group: 'OpenAI' },
  { label: 'GPT-5', value: 'gpt-5', group: 'OpenAI' },
  { label: 'GPT-4.1', value: 'gpt-4.1', group: 'OpenAI Legacy' },

  // Google Gemini
  { label: 'Gemini 3 Pro', value: 'gemini-3-pro-preview', group: 'Google' },
  { label: 'Gemini 3 Flash', value: 'gemini-3-flash-preview', group: 'Google' },
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash', group: 'Google' },

  // Custom option
  { label: 'Custom Model...', value: 'custom', group: 'Other' },
];

/**
 * Grouped options for Ant Design Select component.
 */
export const GROUPED_MODEL_OPTIONS = Object.entries(
  MODEL_OPTIONS.reduce((acc, opt) => {
    const group = opt.group || 'Other';
    if (!acc[group]) acc[group] = [];
    acc[group].push({ label: opt.label, value: opt.value });
    return acc;
  }, {} as Record<string, { label: string; value: string }[]>)
).map(([label, options]) => ({
  label: <span className="font-semibold text-xs text-secondary">{label}</span>,
  title: label,
  options,
}));

interface ModelSelectorProps {
  control: Control<AgentFormValues>;
}

/**
 * Model selector dropdown with grouped options and custom model input.
 * Shows a text input when "Custom Model..." is selected.
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({ control }) => {
  const selectedModel = useWatch({ control, name: 'model' });
  const isCustomModel = selectedModel === 'custom';

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-primary">Model</label>
      <Controller
        name="model"
        control={control}
        render={({ field, fieldState }) => (
          <>
            <Select
              {...field}
              className="w-full"
              placeholder="Select model"
              options={GROUPED_MODEL_OPTIONS}
              status={fieldState.error ? 'error' : undefined}
              showSearch
              optionFilterProp="label"
            />
            {fieldState.error && (
              <span className="text-red-500 text-xs">{fieldState.error.message}</span>
            )}
          </>
        )}
      />

      {isCustomModel && (
        <Controller
          name="customModel"
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              className="mt-2"
              placeholder="Enter model ID (e.g., claude-sonnet-4-5-20250929)"
            />
          )}
        />
      )}
    </div>
  );
};
