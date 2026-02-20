'use client';

import React, { useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input, Radio, Space, Button, Slider, Collapse } from 'antd';
import { Plus, X, FileText, Globe } from 'lucide-react';
import debounce from 'lodash/debounce';

import {
  knowledgeSchema,
  KnowledgeFormValues,
  defaultKnowledgeValues,
} from './schemas/knowledge-schema';

interface KnowledgeFormProps {
  defaultValues: Partial<KnowledgeFormValues>;
  onChange: (values: KnowledgeFormValues) => void;
}

/**
 * Knowledge Base configuration form using React Hook Form + Zod validation.
 * Calls onChange with debounced updates whenever valid form values change.
 */
export const KnowledgeForm: React.FC<KnowledgeFormProps> = ({
  defaultValues,
  onChange,
}) => {
  const {
    control,
    register,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<KnowledgeFormValues>({
    resolver: zodResolver(knowledgeSchema),
    defaultValues: {
      ...defaultKnowledgeValues,
      ...defaultValues,
    },
    mode: 'onChange',
  });

  // Watch fields for conditional rendering
  const sourceType = watch('sourceType');
  const sources = watch('sources') || [];
  const chunkSize = watch('chunkSize');
  const overlapSize = watch('overlapSize');

  // Create debounced onChange handler
  const debouncedOnChange = useCallback(
    debounce((values: KnowledgeFormValues) => {
      onChange(values);
    }, 300),
    [onChange]
  );

  // Watch all form values and call onChange on changes
  const formValues = watch();

  useEffect(() => {
    // Only call onChange if form is valid
    if (isValid) {
      debouncedOnChange(formValues as KnowledgeFormValues);
    }

    // Cleanup debounce on unmount
    return () => {
      debouncedOnChange.cancel();
    };
  }, [formValues, isValid, debouncedOnChange]);

  // Handle adding new source
  const handleAddSource = () => {
    const currentSources = watch('sources') || [];
    setValue('sources', [...currentSources, ''], { shouldValidate: true });
  };

  // Handle removing source
  const handleRemoveSource = (index: number) => {
    const currentSources = watch('sources') || [];
    setValue(
      'sources',
      currentSources.filter((_, i) => i !== index),
      { shouldValidate: true }
    );
  };

  // Handle updating source
  const handleUpdateSource = (index: number, value: string) => {
    const currentSources = watch('sources') || [];
    const newSources = [...currentSources];
    newSources[index] = value;
    setValue('sources', newSources, { shouldValidate: true });
  };

  // Get placeholder text based on source type
  const getSourcePlaceholder = () => {
    if (sourceType === 'document') {
      return 'Path to document (e.g., /data/docs/manual.pdf)';
    }
    return 'URL (e.g., https://docs.example.com)';
  };

  // Get icon based on source type
  const SourceIcon = sourceType === 'document' ? FileText : Globe;

  return (
    <form className="space-y-6">
      {/* Knowledge Base Name */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-primary">
          Knowledge Base Name
        </label>
        <Input
          {...register('name')}
          placeholder="my_knowledge_base"
          status={errors.name ? 'error' : undefined}
        />
        {errors.name && (
          <span className="text-red-500 text-xs">{errors.name.message}</span>
        )}
      </div>

      {/* Source Type */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-primary">
          Source Type
        </label>
        <Controller
          name="sourceType"
          control={control}
          render={({ field }) => (
            <Radio.Group {...field} className="w-full">
              <Space direction="vertical" className="w-full">
                <Radio value="document" className="text-primary">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span className="font-medium">Document</span>
                  </div>
                  <span className="text-secondary text-xs ml-6">
                    Local files (PDF, TXT, MD, etc.)
                  </span>
                </Radio>
                <Radio value="url" className="text-primary">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    <span className="font-medium">URL</span>
                  </div>
                  <span className="text-secondary text-xs ml-6">
                    Web pages and online documents
                  </span>
                </Radio>
              </Space>
            </Radio.Group>
          )}
        />
      </div>

      {/* Sources List */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-primary">
          Sources ({sources.length})
        </label>
        {errors.sources && (
          <span className="text-red-500 text-xs">{errors.sources.message}</span>
        )}
        <div className="space-y-2">
          {sources.map((source, index) => (
            <div key={index} className="flex items-center gap-2">
              <SourceIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <Input
                value={source}
                onChange={(e) => handleUpdateSource(index, e.target.value)}
                placeholder={getSourcePlaceholder()}
                className="flex-1"
              />
              <Button
                type="text"
                icon={<X className="w-4 h-4" />}
                onClick={() => handleRemoveSource(index)}
                className="flex-shrink-0"
              />
            </div>
          ))}
          <Button
            type="dashed"
            onClick={handleAddSource}
            icon={<Plus className="w-4 h-4" />}
            className="w-full"
          >
            Add Source
          </Button>
        </div>
      </div>

      {/* Advanced Settings (Collapsible) */}
      <Collapse
        ghost
        items={[
          {
            key: 'advanced',
            label: (
              <span className="text-sm font-medium text-primary">
                Advanced Settings
              </span>
            ),
            children: (
              <div className="space-y-4 pt-2">
                {/* Chunk Size */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-sm text-primary">Chunk Size</label>
                    <span className="text-sm text-secondary">{chunkSize}</span>
                  </div>
                  <Controller
                    name="chunkSize"
                    control={control}
                    render={({ field }) => (
                      <Slider
                        {...field}
                        min={100}
                        max={10000}
                        step={100}
                        tooltip={{ formatter: (value) => `${value} chars` }}
                      />
                    )}
                  />
                  <p className="text-xs text-secondary">
                    Size of text chunks for processing (100-10000 characters)
                  </p>
                </div>

                {/* Overlap Size */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-sm text-primary">Overlap Size</label>
                    <span className="text-sm text-secondary">{overlapSize}</span>
                  </div>
                  <Controller
                    name="overlapSize"
                    control={control}
                    render={({ field }) => (
                      <Slider
                        {...field}
                        min={0}
                        max={1000}
                        step={50}
                        tooltip={{ formatter: (value) => `${value} chars` }}
                      />
                    )}
                  />
                  <p className="text-xs text-secondary">
                    Overlap between consecutive chunks (0-1000 characters)
                  </p>
                </div>
              </div>
            ),
          },
        ]}
      />

      {/* Info box */}
      <div className="p-3 bg-tertiary rounded-lg text-sm text-secondary">
        <p className="font-medium text-primary mb-1">About Knowledge Bases</p>
        <p>
          Knowledge bases allow agents to access and query document content for
          context-aware responses. Documents are processed, chunked, and indexed
          for efficient retrieval during conversations.
        </p>
      </div>
    </form>
  );
};

export default KnowledgeForm;
