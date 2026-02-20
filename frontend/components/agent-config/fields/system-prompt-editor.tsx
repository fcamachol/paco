'use client';

import React from 'react';
import { Control, Controller, useWatch } from 'react-hook-form';
import { Input } from 'antd';
import { AgentFormValues } from '../schemas/agent-schema';

const { TextArea } = Input;

interface SystemPromptEditorProps {
  control: Control<AgentFormValues>;
}

/**
 * System prompt editor with auto-expanding textarea and character count.
 * Uses Ant Design TextArea with autoSize for automatic height adjustment.
 */
export const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({ control }) => {
  const systemPrompt = useWatch({ control, name: 'systemPrompt' });
  const charCount = systemPrompt?.length || 0;

  // Format character count with commas for readability
  const formattedCount = charCount.toLocaleString();

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-primary">System Prompt</label>
      <Controller
        name="systemPrompt"
        control={control}
        render={({ field }) => (
          <TextArea
            {...field}
            autoSize={{ minRows: 3, maxRows: 15 }}
            placeholder="You are a helpful assistant..."
            className="resize-none"
          />
        )}
      />
      <div className="text-xs text-secondary text-right">
        {formattedCount} character{charCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
};
