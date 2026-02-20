'use client';

import React, { useState, useCallback, useRef } from "react";
import { Button, Breadcrumb, message, Tooltip, Input } from "antd";
import { ChevronLeft, Code, FormInput, PlayCircle } from "lucide-react";
import {
  Component,
  ComponentConfig,
  AgentConfig,
  AssistantAgentConfig,
  StaticWorkbenchConfig,
  WorkbenchConfig,
} from "@/types/datamodel";
import {
  isTeamComponent,
  isAgentComponent,
  isModelComponent,
  isToolComponent,
  isWorkbenchComponent,
  isTerminationComponent,
  isAssistantAgent,
  isStaticWorkbench,
} from "@/types/guards";
import debounce from "lodash/debounce";

// TODO: Implement field components in Plan 03
// import { AgentFields } from "./fields/agent-fields";
// import { ModelFields } from "./fields/model-fields";
// import { TeamFields } from "./fields/team-fields";
// import { ToolFields } from "./fields/tool-fields";
// import { WorkbenchFields } from "./fields/workbench";
// import { TerminationFields } from "./fields/termination-fields";

// Helper function to normalize workbench format (handle both single object and array)
const normalizeWorkbenches = (
  workbench:
    | Component<WorkbenchConfig>[]
    | Component<WorkbenchConfig>
    | undefined
): Component<WorkbenchConfig>[] => {
  if (!workbench) return [];
  return Array.isArray(workbench) ? workbench : [workbench];
};

export interface EditPath {
  componentType: string;
  id: string;
  parentField: string;
  index?: number;
}

export interface ComponentEditorProps {
  component: Component<ComponentConfig>;
  onChange: (updatedComponent: Component<ComponentConfig>) => void;
  onClose?: () => void;
  navigationDepth?: boolean;
}

export const ComponentEditor: React.FC<ComponentEditorProps> = ({
  component,
  onChange,
  onClose,
  navigationDepth = false,
}) => {
  const [editPath, setEditPath] = useState<EditPath[]>([]);
  const [workingCopy, setWorkingCopy] = useState<Component<ComponentConfig>>(
    Object.assign({}, component)
  );
  const [isJsonEditing, setIsJsonEditing] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();

  const editorRef = useRef(null);

  // Reset working copy when component changes
  React.useEffect(() => {
    setWorkingCopy(component);
    setEditPath([]);
  }, [component]);

  const getCurrentComponent = useCallback(
    (root: Component<ComponentConfig>) => {
      return editPath.reduce<Component<ComponentConfig> | null>(
        (current, path) => {
          if (!current) return null;

          let field = current.config[
            path.parentField as keyof typeof current.config
          ] as
            | Component<ComponentConfig>[]
            | Component<ComponentConfig>
            | undefined;

          // Special handling for workbench field normalization
          if (path.parentField === "workbench" && field) {
            field = normalizeWorkbenches(
              field as Component<WorkbenchConfig>[] | Component<WorkbenchConfig>
            );
          }

          // Special handling for tools within workbenches
          if (path.parentField === "tools" && !field) {
            if (isAgentComponent(current) && isAssistantAgent(current)) {
              const agentConfig = current.config as AssistantAgentConfig;
              const workbenches = normalizeWorkbenches(agentConfig.workbench);
              const staticWorkbench = workbenches.find((wb) =>
                isStaticWorkbench(wb)
              );
              if (staticWorkbench) {
                field = (staticWorkbench.config as StaticWorkbenchConfig)
                  ?.tools;
              }
            }
          }

          if (Array.isArray(field)) {
            if (
              typeof path.index === "number" &&
              path.index >= 0 &&
              path.index < field.length
            ) {
              return field[path.index];
            }

            return (
              field.find(
                (item) =>
                  item.label === path.id ||
                  (item.config &&
                    "name" in item.config &&
                    item.config.name === path.id)
              ) || null
            );
          }

          return field || null;
        },
        root
      );
    },
    [editPath]
  );

  const handleComponentUpdate = useCallback(
    (updates: Partial<Component<ComponentConfig>>) => {
      const updatedComponent = {
        ...workingCopy,
        ...updates,
        config: {
          ...workingCopy.config,
          ...(updates.config || {}),
        },
      };

      setWorkingCopy(updatedComponent);
    },
    [workingCopy]
  );

  const handleNavigate = useCallback(
    (
      componentType: string,
      id: string,
      parentField: string,
      index?: number
    ) => {
      if (!navigationDepth) return;
      setEditPath((prev) => [
        ...prev,
        { componentType, id, parentField, index },
      ]);
    },
    [navigationDepth]
  );

  const handleNavigateBack = useCallback(() => {
    setEditPath((prev) => prev.slice(0, -1));
  }, []);

  const debouncedJsonUpdate = useCallback(
    debounce((value: string) => {
      try {
        const updatedComponent = JSON.parse(value);
        setWorkingCopy(updatedComponent);
      } catch (err) {
        console.error("Invalid JSON", err);
      }
    }, 500),
    []
  );

  const currentComponent = getCurrentComponent(workingCopy) || workingCopy;

  // Render placeholder fields for now - will be implemented in Plan 03
  const renderFields = useCallback(() => {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Label
          </label>
          <Input
            value={currentComponent.label || ""}
            onChange={(e) =>
              handleComponentUpdate({ label: e.target.value })
            }
            placeholder="Component label"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <Input.TextArea
            value={currentComponent.description || ""}
            onChange={(e) =>
              handleComponentUpdate({ description: e.target.value })
            }
            placeholder="Component description"
            rows={3}
          />
        </div>
        <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
          <p>Component type: {currentComponent.component_type}</p>
          <p>Provider: {currentComponent.provider}</p>
          <p className="mt-2 text-xs">
            Full form fields will be implemented in Plan 03.
          </p>
        </div>
      </div>
    );
  }, [currentComponent, handleComponentUpdate]);

  const breadcrumbItems = React.useMemo(
    () => [
      { title: workingCopy.label || "Root" },
      ...editPath.map((path) => ({
        title: path.id,
      })),
    ],
    [workingCopy.label, editPath]
  );

  const handleSave = useCallback(() => {
    console.log("working copy", workingCopy.config);
    onChange(workingCopy);
    onClose?.();
  }, [workingCopy, onChange, onClose]);

  // show test button only for model component
  const showTestButton = isModelComponent(currentComponent);

  return (
    <div className="flex flex-col h-full">
      {contextHolder}

      <div className="flex items-center gap-4 mb-6">
        {navigationDepth && editPath.length > 0 && (
          <Button
            onClick={handleNavigateBack}
            icon={<ChevronLeft className="w-4 h-4" />}
            type="text"
          />
        )}
        <div className="flex-1">
          <Breadcrumb items={breadcrumbItems} />
        </div>

        {/* Test Component Button */}
        {showTestButton && (
          <Tooltip title="Test Component">
            <Button
              onClick={() => messageApi.info("Testing not yet implemented")}
              loading={testLoading}
              type="default"
              className="flex items-center gap-2 text-xs mr-0"
              icon={<PlayCircle className="w-4 h-4 text-accent" />}
            >
              Test
            </Button>
          </Tooltip>
        )}

        <Button
          onClick={() => setIsJsonEditing((prev) => !prev)}
          type="default"
          className="flex text-accent items-center gap-2 text-xs"
        >
          {isJsonEditing ? (
            <>
              <FormInput className="w-4 text-accent h-4 mr-1 inline-block" />
              Form Editor
            </>
          ) : (
            <>
              <Code className="w-4 text-accent h-4 mr-1 inline-block" />
              JSON Editor
            </>
          )}
        </Button>
      </div>

      {isJsonEditing ? (
        <div className="flex-1 overflow-y-auto">
          <textarea
            value={JSON.stringify(workingCopy, null, 2)}
            onChange={(e) => debouncedJsonUpdate(e.target.value)}
            className="w-full h-full p-4 font-mono text-sm bg-gray-900 text-gray-100 rounded"
            style={{ minHeight: "400px" }}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">{renderFields()}</div>
      )}
      {onClose && (
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-secondary">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
};

export default ComponentEditor;
