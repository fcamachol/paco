'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input, Radio, Space, Button, Checkbox } from 'antd';
import { Plus, X, RefreshCw } from 'lucide-react';
import debounce from 'lodash/debounce';

import {
  mcpServerSchema,
  McpServerFormValues,
  defaultMcpServerValues,
} from './schemas/mcp-server-schema';
import { api, Tool } from '@/lib/api';

interface McpServerFormProps {
  defaultValues: Partial<McpServerFormValues>;
  onChange: (values: McpServerFormValues) => void;
  serverId?: string; // ID of MCP server in PACO registry (if linked)
}

/**
 * MCP Server configuration form using React Hook Form + Zod validation.
 * Calls onChange with debounced updates whenever valid form values change.
 */
export const McpServerForm: React.FC<McpServerFormProps> = ({
  defaultValues,
  onChange,
  serverId,
}) => {
  const {
    control,
    register,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<McpServerFormValues>({
    resolver: zodResolver(mcpServerSchema),
    defaultValues: {
      ...defaultMcpServerValues,
      ...defaultValues,
    },
    mode: 'onChange',
  });

  // Tool fetching state
  const [tools, setTools] = useState<Tool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);

  // Watch server type to conditionally show fields
  const serverType = watch('serverType');
  const args = watch('args') || [];
  const enabledTools = watch('enabledTools') || [];

  // Create debounced onChange handler
  const debouncedOnChange = useCallback(
    debounce((values: McpServerFormValues) => {
      onChange(values);
    }, 300),
    [onChange]
  );

  // Watch all form values and call onChange on changes
  const formValues = watch();

  useEffect(() => {
    // Only call onChange if form is valid
    if (isValid) {
      debouncedOnChange(formValues as McpServerFormValues);
    }

    // Cleanup debounce on unmount
    return () => {
      debouncedOnChange.cancel();
    };
  }, [formValues, isValid, debouncedOnChange]);

  // Fetch tools when serverId is available
  useEffect(() => {
    if (!serverId) {
      setTools([]);
      return;
    }

    const fetchTools = async () => {
      setLoadingTools(true);
      setToolsError(null);
      try {
        const fetchedTools = await api.getTools(serverId);
        setTools(fetchedTools);
      } catch (error) {
        setToolsError('Failed to load tools');
        console.error('Failed to fetch tools:', error);
      } finally {
        setLoadingTools(false);
      }
    };

    fetchTools();
  }, [serverId]);

  // Handle syncing tools from server
  const handleSyncTools = async () => {
    if (!serverId) return;
    setLoadingTools(true);
    setToolsError(null);
    try {
      await api.syncToolsFromServer(serverId);
      const fetchedTools = await api.getTools(serverId);
      setTools(fetchedTools);
    } catch (error) {
      setToolsError('Failed to sync tools');
      console.error('Failed to sync tools:', error);
    } finally {
      setLoadingTools(false);
    }
  };

  // Handle adding new argument
  const handleAddArg = () => {
    const currentArgs = watch('args') || [];
    setValue('args', [...currentArgs, ''], { shouldValidate: true });
  };

  // Handle removing argument
  const handleRemoveArg = (index: number) => {
    const currentArgs = watch('args') || [];
    setValue(
      'args',
      currentArgs.filter((_, i) => i !== index),
      { shouldValidate: true }
    );
  };

  // Handle updating argument
  const handleUpdateArg = (index: number, value: string) => {
    const currentArgs = watch('args') || [];
    const newArgs = [...currentArgs];
    newArgs[index] = value;
    setValue('args', newArgs, { shouldValidate: true });
  };

  // Handle tool selection
  const handleToolChange = (checkedValues: string[]) => {
    setValue('enabledTools', checkedValues, { shouldValidate: true });
  };

  // Handle Select All / Clear All
  const handleSelectAllTools = () => {
    setValue('enabledTools', tools.map(t => t.id), { shouldValidate: true });
  };

  const handleClearAllTools = () => {
    setValue('enabledTools', [], { shouldValidate: true });
  };

  return (
    <form className="space-y-6">
      {/* Server Name */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-primary">
          Server Name
        </label>
        <Input
          {...register('name')}
          placeholder="my_mcp_server"
          status={errors.name ? 'error' : undefined}
        />
        {errors.name && (
          <span className="text-red-500 text-xs">{errors.name.message}</span>
        )}
      </div>

      {/* Server Type */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-primary">
          Server Type
        </label>
        <Controller
          name="serverType"
          control={control}
          render={({ field }) => (
            <Radio.Group {...field} className="w-full">
              <Space direction="vertical" className="w-full">
                <Radio value="stdio" className="text-primary">
                  <span className="font-medium">Stdio</span>
                  <span className="text-secondary text-xs ml-2">
                    Local command-based server
                  </span>
                </Radio>
                <Radio value="sse" className="text-primary">
                  <span className="font-medium">SSE</span>
                  <span className="text-secondary text-xs ml-2">
                    Remote streaming server
                  </span>
                </Radio>
                <Radio value="http" className="text-primary">
                  <span className="font-medium">HTTP</span>
                  <span className="text-secondary text-xs ml-2">
                    HTTP-based server
                  </span>
                </Radio>
              </Space>
            </Radio.Group>
          )}
        />
      </div>

      {/* Stdio Fields */}
      {serverType === 'stdio' && (
        <>
          {/* Command */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-primary">
              Command
            </label>
            <Input
              {...register('command')}
              placeholder="npx"
              status={errors.command ? 'error' : undefined}
            />
            {errors.command && (
              <span className="text-red-500 text-xs">
                {errors.command.message}
              </span>
            )}
            <p className="text-xs text-secondary">
              The command to execute (e.g., npx, python, node)
            </p>
          </div>

          {/* Arguments */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-primary">
              Arguments
            </label>
            <div className="space-y-2">
              {args.map((arg, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={arg}
                    onChange={(e) => handleUpdateArg(index, e.target.value)}
                    placeholder={`Argument ${index + 1}`}
                    className="flex-1"
                  />
                  <Button
                    type="text"
                    icon={<X className="w-4 h-4" />}
                    onClick={() => handleRemoveArg(index)}
                    className="flex-shrink-0"
                  />
                </div>
              ))}
              <Button
                type="dashed"
                onClick={handleAddArg}
                icon={<Plus className="w-4 h-4" />}
                className="w-full"
              >
                Add Argument
              </Button>
            </div>
            <p className="text-xs text-secondary">
              Command line arguments (e.g., -y, @modelcontextprotocol/server-example)
            </p>
          </div>
        </>
      )}

      {/* SSE/HTTP Fields */}
      {(serverType === 'sse' || serverType === 'http') && (
        <div className="space-y-1">
          <label className="block text-sm font-medium text-primary">
            URL
          </label>
          <Input
            {...register('url')}
            placeholder="https://example.com/mcp"
            status={errors.url ? 'error' : undefined}
          />
          {errors.url && (
            <span className="text-red-500 text-xs">{errors.url.message}</span>
          )}
          <p className="text-xs text-secondary">
            The URL of the MCP server endpoint
          </p>
        </div>
      )}

      {/* Tools Section - only show if server is linked to PACO registry */}
      {serverId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-primary">Available Tools</label>
            <Button
              size="small"
              onClick={handleSyncTools}
              loading={loadingTools}
              icon={<RefreshCw className="w-3 h-3" />}
            >
              Sync
            </Button>
          </div>

          {toolsError && (
            <div className="text-sm text-red-500">{toolsError}</div>
          )}

          {loadingTools ? (
            <div className="text-sm text-gray-500 p-2">Loading tools...</div>
          ) : tools.length === 0 ? (
            <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded">
              No tools available. Click Sync to discover tools.
            </div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto border rounded p-2">
              <Checkbox.Group
                value={enabledTools}
                onChange={(checkedValues) => handleToolChange(checkedValues as string[])}
                className="flex flex-col gap-1"
              >
                {tools.map((tool) => (
                  <Checkbox key={tool.id} value={tool.id} className="!ml-0">
                    <div className="flex flex-col">
                      <span className="text-sm">{tool.name}</span>
                      {tool.description && (
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </div>
          )}

          {tools.length > 0 && (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={handleSelectAllTools}
                className="text-blue-500 hover:underline"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleClearAllTools}
                className="text-blue-500 hover:underline"
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      )}

      {/* For template servers (no serverId), show placeholder */}
      {!serverId && (
        <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded">
          Tools will be discovered when this server is connected.
          Register this server in PACO to enable tool selection.
        </div>
      )}

      {/* Refinement error (for cross-field validation) */}
      {errors.root && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
          {errors.root.message}
        </div>
      )}

      {/* Info box */}
      <div className="p-3 bg-tertiary rounded-lg text-sm text-secondary">
        <p className="font-medium text-primary mb-1">About MCP Servers</p>
        <p>
          MCP (Model Context Protocol) servers provide tools and resources to
          Claude agents. Connect to local commands (stdio) or remote endpoints
          (SSE/HTTP).
        </p>
      </div>
    </form>
  );
};

export default McpServerForm;
