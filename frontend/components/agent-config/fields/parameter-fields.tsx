'use client';

import React from 'react';
import { Control, Controller, useWatch } from 'react-hook-form';
import { Slider, InputNumber, Select } from 'antd';
import { AgentFormValues } from '../schemas/agent-schema';

interface ParameterFieldsProps {
  control: Control<AgentFormValues>;
}

/**
 * Temperature slider with marks for Focused/Balanced/Creative.
 */
export const TemperatureSlider: React.FC<ParameterFieldsProps> = ({ control }) => {
  const temperature = useWatch({ control, name: 'temperature' });

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-primary">Temperature</label>
        <span className="text-sm text-secondary">{temperature?.toFixed(1) ?? '1.0'}</span>
      </div>
      <Controller
        name="temperature"
        control={control}
        render={({ field }) => (
          <Slider
            {...field}
            min={0}
            max={2}
            step={0.1}
            marks={{
              0: { label: <span className="text-xs">Focused</span> },
              1: { label: <span className="text-xs">Balanced</span> },
              2: { label: <span className="text-xs">Creative</span> },
            }}
            tooltip={{ formatter: (value) => value?.toFixed(1) }}
          />
        )}
      />
    </div>
  );
};

/**
 * Max tokens input with placeholder for model default.
 */
export const MaxTokensInput: React.FC<ParameterFieldsProps> = ({ control }) => {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-primary">Max Tokens</label>
      <Controller
        name="maxTokens"
        control={control}
        render={({ field, fieldState }) => (
          <>
            <InputNumber
              {...field}
              className="w-full"
              min={1}
              max={200000}
              placeholder="Default (model-specific)"
              onChange={(value) => field.onChange(value ?? undefined)}
            />
            {fieldState.error && (
              <span className="text-red-500 text-xs">{fieldState.error.message}</span>
            )}
          </>
        )}
      />
    </div>
  );
};

/**
 * Top P (nucleus sampling) slider.
 */
export const TopPSlider: React.FC<ParameterFieldsProps> = ({ control }) => {
  const topP = useWatch({ control, name: 'topP' });

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-primary">Top P</label>
        <span className="text-sm text-secondary">{topP?.toFixed(2) ?? 'Default'}</span>
      </div>
      <Controller
        name="topP"
        control={control}
        render={({ field }) => (
          <Slider
            {...field}
            min={0}
            max={1}
            step={0.01}
            tooltip={{ formatter: (value) => value?.toFixed(2) }}
          />
        )}
      />
    </div>
  );
};

/**
 * Top K input for limiting token selection.
 */
export const TopKInput: React.FC<ParameterFieldsProps> = ({ control }) => {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-primary">Top K</label>
      <Controller
        name="topK"
        control={control}
        render={({ field, fieldState }) => (
          <>
            <InputNumber
              {...field}
              className="w-full"
              min={1}
              max={500}
              placeholder="Default (disabled)"
              onChange={(value) => field.onChange(value ?? undefined)}
            />
            {fieldState.error && (
              <span className="text-red-500 text-xs">{fieldState.error.message}</span>
            )}
          </>
        )}
      />
    </div>
  );
};

/**
 * Stop sequences input using tag mode.
 */
export const StopSequencesInput: React.FC<ParameterFieldsProps> = ({ control }) => {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-primary">Stop Sequences</label>
      <Controller
        name="stopSequences"
        control={control}
        render={({ field }) => (
          <Select
            {...field}
            mode="tags"
            className="w-full"
            placeholder="Type and press Enter to add"
            tokenSeparators={[',']}
            notFoundContent={null}
          />
        )}
      />
      <div className="text-xs text-secondary">
        Press Enter or use comma to add sequences
      </div>
    </div>
  );
};

/**
 * All parameter fields grouped together.
 * IMPORTANT: All fields visible by default (not collapsed) per user decision.
 */
export const ParameterFields: React.FC<ParameterFieldsProps> = ({ control }) => {
  return (
    <div className="space-y-6">
      <TemperatureSlider control={control} />
      <MaxTokensInput control={control} />

      {/* Advanced Parameters - visible by default, NOT collapsed */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-secondary border-b border-secondary/20 pb-1">
          Advanced Parameters
        </h4>
        <TopPSlider control={control} />
        <TopKInput control={control} />
        <StopSequencesInput control={control} />
      </div>
    </div>
  );
};
