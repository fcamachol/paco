'use client';

import React, { useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from 'antd';
import debounce from 'lodash/debounce';

import { agentSchema, AgentFormValues, defaultAgentValues } from './schemas/agent-schema';
import { ModelSelector } from './fields/model-selector';
import { SystemPromptEditor } from './fields/system-prompt-editor';
import { ParameterFields } from './fields/parameter-fields';
import { EnvVarsEditor } from './fields/env-vars-editor';

interface AgentConfigFormProps {
  defaultValues: Partial<AgentFormValues>;
  onChange: (values: AgentFormValues) => void;
}

/**
 * Agent configuration form using React Hook Form + Zod validation.
 * Calls onChange with debounced updates whenever valid form values change.
 */
export const AgentConfigForm: React.FC<AgentConfigFormProps> = ({
  defaultValues,
  onChange,
}) => {
  const {
    control,
    register,
    watch,
    formState: { errors, isValid },
  } = useForm<AgentFormValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      ...defaultAgentValues,
      ...defaultValues,
    },
    mode: 'onChange',
  });

  // Create debounced onChange handler
  const debouncedOnChange = useCallback(
    debounce((values: AgentFormValues) => {
      onChange(values);
    }, 300),
    [onChange]
  );

  // Watch all form values and call onChange on changes
  const formValues = watch();

  useEffect(() => {
    // Only call onChange if form is valid
    if (isValid) {
      debouncedOnChange(formValues as AgentFormValues);
    }

    // Cleanup debounce on unmount
    return () => {
      debouncedOnChange.cancel();
    };
  }, [formValues, isValid, debouncedOnChange]);

  return (
    <form className="space-y-6">
      {/* Agent Name */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-primary">
          Agent Name
        </label>
        <Input
          {...register('name')}
          placeholder="my_agent"
          status={errors.name ? 'error' : undefined}
        />
        {errors.name && (
          <span className="text-red-500 text-xs">{errors.name.message}</span>
        )}
      </div>

      {/* Model Selector */}
      <ModelSelector control={control} />

      {/* System Prompt */}
      <SystemPromptEditor control={control} />

      {/* Parameter Fields (Temperature, Max Tokens, Advanced) */}
      <ParameterFields control={control} />

      {/* Credentials & Environment Variables */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-secondary border-b border-secondary/20 pb-1 select-none">
          Credentials &amp; Environment Variables
        </summary>
        <div className="pt-3">
          <EnvVarsEditor control={control} />
        </div>
      </details>
    </form>
  );
};

export default AgentConfigForm;
