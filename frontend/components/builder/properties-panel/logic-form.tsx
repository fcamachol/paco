'use client';

import React, { useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input, Radio, Space, InputNumber } from 'antd';
import { GitBranch, RefreshCw, Layers, UserCheck } from 'lucide-react';
import debounce from 'lodash/debounce';

import {
  logicSchema,
  LogicFormValues,
  defaultLogicValues,
} from './schemas/logic-schema';

interface LogicFormProps {
  defaultValues: Partial<LogicFormValues>;
  onChange: (values: LogicFormValues) => void;
}

/**
 * Logic node configuration form using React Hook Form + Zod validation.
 * Calls onChange with debounced updates whenever valid form values change.
 */
export const LogicForm: React.FC<LogicFormProps> = ({
  defaultValues,
  onChange,
}) => {
  const {
    control,
    register,
    watch,
    formState: { errors, isValid },
  } = useForm<LogicFormValues>({
    resolver: zodResolver(logicSchema),
    defaultValues: {
      ...defaultLogicValues,
      ...defaultValues,
    },
    mode: 'onChange',
  });

  // Watch fields for conditional rendering
  const logicType = watch('logicType');
  const maxIterations = watch('maxIterations');

  // Create debounced onChange handler
  const debouncedOnChange = useCallback(
    debounce((values: LogicFormValues) => {
      onChange(values);
    }, 300),
    [onChange]
  );

  // Watch all form values and call onChange on changes
  const formValues = watch();

  useEffect(() => {
    // Only call onChange if form is valid
    if (isValid) {
      debouncedOnChange(formValues as LogicFormValues);
    }

    // Cleanup debounce on unmount
    return () => {
      debouncedOnChange.cancel();
    };
  }, [formValues, isValid, debouncedOnChange]);

  // Logic type options with icons
  const logicTypeOptions = [
    {
      value: 'condition',
      label: 'Condition',
      description: 'Branch based on a condition',
      icon: GitBranch,
    },
    {
      value: 'loop',
      label: 'Loop',
      description: 'Repeat until condition or max iterations',
      icon: RefreshCw,
    },
    {
      value: 'parallel',
      label: 'Parallel',
      description: 'Execute multiple branches simultaneously',
      icon: Layers,
    },
    {
      value: 'approval',
      label: 'Approval',
      description: 'Wait for human approval before continuing',
      icon: UserCheck,
    },
  ];

  return (
    <form className="space-y-6">
      {/* Logic Node Name */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-primary">
          Logic Node Name
        </label>
        <Input
          {...register('name')}
          placeholder="my_condition"
          status={errors.name ? 'error' : undefined}
        />
        {errors.name && (
          <span className="text-red-500 text-xs">{errors.name.message}</span>
        )}
      </div>

      {/* Logic Type */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-primary">
          Logic Type
        </label>
        <Controller
          name="logicType"
          control={control}
          render={({ field }) => (
            <Radio.Group {...field} className="w-full">
              <Space direction="vertical" className="w-full">
                {logicTypeOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <Radio key={option.value} value={option.value} className="text-primary">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        <span className="font-medium">{option.label}</span>
                      </div>
                      <span className="text-secondary text-xs ml-6">
                        {option.description}
                      </span>
                    </Radio>
                  );
                })}
              </Space>
            </Radio.Group>
          )}
        />
      </div>

      {/* Condition (shown for condition and loop types) */}
      {(logicType === 'condition' || logicType === 'loop') && (
        <div className="space-y-1">
          <label className="block text-sm font-medium text-primary">
            Condition Expression
          </label>
          <Input.TextArea
            {...register('condition')}
            placeholder="e.g., response.status === 'approved' or iteration < 5"
            rows={3}
          />
          <p className="text-xs text-secondary">
            JavaScript expression that evaluates to true or false
          </p>
        </div>
      )}

      {/* Max Iterations (shown for loop type) */}
      {logicType === 'loop' && (
        <div className="space-y-1">
          <div className="flex justify-between">
            <label className="text-sm font-medium text-primary">
              Max Iterations
            </label>
            <span className="text-sm text-secondary">{maxIterations}</span>
          </div>
          <Controller
            name="maxIterations"
            control={control}
            render={({ field }) => (
              <InputNumber
                {...field}
                min={1}
                max={1000}
                className="w-full"
                placeholder="Maximum number of loop iterations"
              />
            )}
          />
          <p className="text-xs text-secondary">
            Safety limit to prevent infinite loops (1-1000)
          </p>
        </div>
      )}

      {/* Info box */}
      <div className="p-3 bg-tertiary rounded-lg text-sm text-secondary">
        <p className="font-medium text-primary mb-1">About Logic Nodes</p>
        <p>
          Logic nodes control workflow execution flow. Use conditions to branch,
          loops to repeat, parallel to run multiple paths, or approval gates
          for human-in-the-loop workflows.
        </p>
      </div>
    </form>
  );
};

export default LogicForm;
