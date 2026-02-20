'use client';
//team/builder/builder.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Background,
  MiniMap,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button, Form, Input, Layout, message, Modal, Switch, Tooltip } from "antd";
import {
  Cable,
  CheckCircle,
  XCircle,
  Code2,
  Download,
  FileCode,
  FolderOpen,
  ListChecks,
  PlayCircle,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useTeamBuilderStore } from "./store";
import { ComponentLibrary } from "./library";
import { Component, ComponentTypes, Gallery, Team, TeamConfig } from "@/types/datamodel";
import { CustomNode, CustomEdge, DragItem } from "./types";
import { edgeTypes, nodeTypes } from "./nodes";

// import builder css
import "./builder.css";
import TeamBuilderToolbar from "./toolbar";
// TODO: Create MonacoEditor component
// import { MonacoEditor } from "@/components/monaco";
import debounce from "lodash/debounce";
import TestDrawer from "./testdrawer";
// Workflow validation
import { validateWorkflow, ValidationResult } from "./validation";
import { ValidationErrors } from "./validation-errors";
import PropertiesPanel from "./properties-panel";
import { api, Workflow } from "@/lib/api";
import { useAutoSave } from "./hooks/use-autosave";
import { ExportModal } from "./export";

// Legacy validation response type (for compatibility with existing validate button)
interface LegacyValidationResponse {
  is_valid: boolean;
  errors: Array<{ field: string; error: string; suggestion?: string }>;
  warnings: Array<{ field: string; error: string; suggestion?: string }>;
}

const { Content } = Layout;
interface DragItemData {
  type: ComponentTypes;
  config: any;
  label: string;
  icon: React.ReactNode;
}

interface TeamBuilderProps {
  team: Team;
  workflowId?: string | null;
  onChange?: (team: Partial<Team>) => void;
  onDirtyStateChange?: (isDirty: boolean) => void;
  selectedGallery?: Gallery | null;
}

export const TeamBuilder: React.FC<TeamBuilderProps> = ({
  team,
  workflowId: initialWorkflowId,
  onChange,
  onDirtyStateChange,
  selectedGallery,
}) => {
  // Replace store state with React Flow hooks
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CustomEdge>([]);
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const editorRef = useRef(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [activeDragItem, setActiveDragItem] = useState<DragItemData | null>(
    null
  );
  const [legacyValidationResults, setLegacyValidationResults] =
    useState<LegacyValidationResponse | null>(null);

  const [validationLoading, setValidationLoading] = useState(false);

  // New workflow validation state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const [testDrawerVisible, setTestDrawerVisible] = useState(false);

  // Workflow save state
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(initialWorkflowId || null);
  const [workflowName, setWorkflowName] = useState(team?.component?.label || "");
  const [workflowDescription, setWorkflowDescription] = useState(team?.component?.description || "");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Workflow list state
  const [loadModalVisible, setLoadModalVisible] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [deletingWorkflowId, setDeletingWorkflowId] = useState<string | null>(null);

  const {
    undo,
    redo,
    loadFromJson,
    syncToJson,
    addNode,
    layoutNodes,
    resetHistory,
    history,
    updateNode,
    selectedNodeId,
    setSelectedNode,
    setNodeUserPositioned,
  } = useTeamBuilderStore();

  const currentHistoryIndex = useTeamBuilderStore(
    (state) => state.currentHistoryIndex
  );

  // Compute isDirty based on the store value
  const isDirty = currentHistoryIndex > 0;

  // Compute undo/redo capability from history state
  const canUndo = currentHistoryIndex > 0;
  const canRedo = currentHistoryIndex < history.length - 1;

  // Auto-save hook - saves every 30s when dirty and workflow has an ID
  useAutoSave({
    workflowId,
    isDirty,
    getConfig: syncToJson,
    onSaveSuccess: () => {
      resetHistory();
      messageApi.info("Auto-saved", 1);
    },
    onSaveError: (error) => {
      console.error("Auto-save failed:", error);
      // Don't show error toast for auto-save failures (too noisy)
    },
    interval: 30000, // 30 seconds
    enabled: true,
  });

  // Handle import from JSON file
  const handleImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const config = JSON.parse(content);

        // Validate it looks like a team config
        if (!config.component_type || config.component_type !== "team") {
          messageApi.error("Invalid workflow file: must be a team configuration");
          return;
        }

        loadFromJson(config, true);
        messageApi.success("Workflow imported");

        // Clear workflow ID since this is a new import
        setWorkflowId(null);
        setWorkflowName("");
        setWorkflowDescription("");
      } catch {
        messageApi.error("Failed to parse JSON file");
      }
    };
    reader.readAsText(file);

    // Reset file input so same file can be imported again
    event.target.value = "";
  }, [loadFromJson, messageApi]);

  // Fetch workflow list when modal opens
  const fetchWorkflows = useCallback(async () => {
    setLoadingWorkflows(true);
    try {
      const data = await api.getWorkflows();
      setWorkflows(data);
    } catch (error) {
      console.error("Failed to fetch workflows:", error);
      messageApi.error("Failed to load workflows");
    } finally {
      setLoadingWorkflows(false);
    }
  }, [messageApi]);

  // Open load modal and fetch workflows
  const handleOpenLoadModal = useCallback(() => {
    setLoadModalVisible(true);
    fetchWorkflows();
  }, [fetchWorkflows]);

  // Load a workflow from the list
  const handleLoadWorkflow = useCallback(async (workflow: Workflow) => {
    try {
      // Load the config into the canvas
      if (workflow.config && workflow.config.component_type === "team") {
        // Cast to the expected type - API returns Record<string, any> but we validate component_type
        loadFromJson(workflow.config as Component<TeamConfig>, true);
        setWorkflowId(workflow.id);
        setWorkflowName(workflow.name);
        setWorkflowDescription(workflow.description || "");
        setLoadModalVisible(false);
        messageApi.success(`Loaded "${workflow.name}"`);

        // Update URL without full navigation
        window.history.pushState({}, "", `/builder?id=${workflow.id}`);
      } else {
        messageApi.error("Invalid workflow configuration");
      }
    } catch (error) {
      console.error("Failed to load workflow:", error);
      messageApi.error("Failed to load workflow");
    }
  }, [loadFromJson, messageApi]);

  // Delete a workflow
  const handleDeleteWorkflow = useCallback(async (workflowIdToDelete: string) => {
    setDeletingWorkflowId(workflowIdToDelete);
    try {
      await api.deleteWorkflow(workflowIdToDelete);
      setWorkflows((prev) => prev.filter((w) => w.id !== workflowIdToDelete));
      messageApi.success("Workflow deleted");

      // If we deleted the currently loaded workflow, clear the state
      if (workflowId === workflowIdToDelete) {
        setWorkflowId(null);
        setWorkflowName("");
        setWorkflowDescription("");
        window.history.pushState({}, "", "/builder");
      }
    } catch (error) {
      console.error("Failed to delete workflow:", error);
      messageApi.error("Failed to delete workflow");
    } finally {
      setDeletingWorkflowId(null);
    }
  }, [messageApi, workflowId]);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds: CustomEdge[]) => addEdge(params, eds)),
    [setEdges]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Need to notify parent whenever isDirty changes
  React.useEffect(() => {
    onDirtyStateChange?.(isDirty);
  }, [isDirty, onDirtyStateChange]);

  // Add beforeunload handler when dirty
  React.useEffect(() => {
    if (isDirty) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () =>
        window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  }, [isDirty]);

  // Load initial config
  React.useEffect(() => {
    if (team?.component) {
      const { nodes: initialNodes, edges: initialEdges } = loadFromJson(
        team.component,
        true,
        team.id?.toString()
      );
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
    // handleValidate();

    return () => {
      setLegacyValidationResults(null);
      setValidationResult(null);
    };
  }, [team, setNodes, setEdges]);

  // Handle JSON changes
  const handleJsonChange = useCallback(
    debounce((value: string) => {
      try {
        const config = JSON.parse(value);
        loadFromJson(config, false, team?.id?.toString());
        useTeamBuilderStore.getState().addToHistory();
      } catch (error) {
        console.error("Invalid JSON:", error);
      }
    }, 1000),
    [loadFromJson, team?.id]
  );

  // Cleanup debounced function
  useEffect(() => {
    return () => {
      handleJsonChange.cancel();
      setLegacyValidationResults(null);
      setValidationResult(null);
    };
  }, [handleJsonChange]);

  // Run validation on current workflow
  const runValidation = useCallback(() => {
    const result = validateWorkflow(nodes, edges);
    setValidationResult(result);
    return result;
  }, [nodes, edges]);

  const handleValidate = useCallback(async () => {
    try {
      setValidationLoading(true);
      const result = runValidation();

      if (result.valid && result.warnings.length === 0) {
        messageApi.success("Workflow is valid");
      } else if (result.valid && result.warnings.length > 0) {
        messageApi.warning(`Workflow valid with ${result.warnings.length} warning(s)`);
      } else {
        messageApi.error(`Workflow has ${result.errors.length} error(s)`);
      }
    } catch (error) {
      console.error("Validation error:", error);
      messageApi.error("Validation failed");
    } finally {
      setValidationLoading(false);
    }
  }, [runValidation, messageApi]);

  // Handle save - either update existing or show modal for new
  const handleSave = useCallback(async () => {
    const component = syncToJson();
    if (!component) {
      messageApi.error("Unable to generate valid configuration");
      return;
    }

    // Run validation before saving (non-blocking - show errors but allow save)
    const result = runValidation();
    if (!result.valid) {
      // Show validation errors but continue with save
      messageApi.warning(`Saving with ${result.errors.length} validation error(s)`);
    }

    // If no workflow ID, show save modal for name/description
    if (!workflowId) {
      setSaveModalVisible(true);
      return;
    }

    // Update existing workflow
    try {
      setIsSaving(true);
      await api.updateWorkflow(workflowId, { config: component });
      resetHistory();
      messageApi.success("Workflow saved");
    } catch (error: any) {
      messageApi.error(error.detail || "Failed to save workflow");
    } finally {
      setIsSaving(false);
    }
  }, [syncToJson, workflowId, resetHistory, messageApi, runValidation]);

  // Handle save new workflow
  const handleSaveNew = useCallback(async () => {
    const component = syncToJson();
    if (!component || !workflowName.trim()) {
      messageApi.error("Name is required");
      return;
    }

    try {
      setIsSaving(true);
      const workflow = await api.createWorkflow({
        name: workflowName.trim(),
        description: workflowDescription.trim() || undefined,
        config: component,
      });
      setWorkflowId(workflow.id);
      resetHistory();
      setSaveModalVisible(false);
      messageApi.success("Workflow created");

      // Update URL to include workflow ID (for refresh persistence)
      window.history.replaceState(null, "", `/builder?id=${workflow.id}`);
    } catch (error: any) {
      messageApi.error(error.detail || "Failed to create workflow");
    } finally {
      setIsSaving(false);
    }
  }, [syncToJson, workflowName, workflowDescription, resetHistory, messageApi]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  React.useEffect(() => {
    if (!isFullscreen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isFullscreen]);

  React.useEffect(() => {
    const unsubscribe = useTeamBuilderStore.subscribe((state) => {
      setNodes(state.nodes);
      setEdges(state.edges);
    });
    return unsubscribe;
  }, [setNodes, setEdges]);

  const validateDropTarget = (
    draggedType: ComponentTypes,
    targetType: ComponentTypes
  ): boolean => {
    const validTargets: Record<ComponentTypes, ComponentTypes[]> = {
      model: ["team", "agent"],
      tool: ["agent"],
      agent: ["team"],
      team: [],
      termination: ["team"],
      workbench: ["agent"],
      // PACO types
      "mcp-server": ["agent"],  // MCP servers connect to agents
      knowledge: ["agent"],
      logic: ["workflow"],
      workflow: [],
    };
    return validTargets[draggedType]?.includes(targetType) || false;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    // Clear all visual feedback classes first (immutably via setNodes)
    setNodes((prevNodes) =>
      prevNodes.map((node) =>
        node.className ? { ...node, className: undefined } : node
      )
    );

    if (!over?.id || !active.data.current) return;

    const draggedType = active.data.current.type;

    // DroppableZone IDs use format "nodeId@@@zone-name", extract the node ID
    const overIdStr = over.id as string;
    const [nodeId] = overIdStr.split("@@@");

    const targetNode = nodes.find((node) => node.id === nodeId);
    if (!targetNode) return;

    const isValid = validateDropTarget(
      draggedType,
      targetNode.data.component.component_type
    );

    // Update visual feedback immutably through React state
    setNodes((prevNodes) =>
      prevNodes.map((node) =>
        node.id === nodeId
          ? { ...node, className: isValid ? "drop-target-valid" : "drop-target-invalid" }
          : node
      )
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Always clear visual feedback classes on drag end
    setNodes((prevNodes) =>
      prevNodes.map((node) =>
        node.className ? { ...node, className: undefined } : node
      )
    );

    if (!over || !active.data?.current) {
      setActiveDragItem(null);
      return;
    }

    const draggedItem = active.data.current;
    const dropZoneId = over.id as string;

    const [nodeId] = dropZoneId.split("@@@");
    // Find target node
    const targetNode = nodes.find((node) => node.id === nodeId);
    if (!targetNode) {
      setActiveDragItem(null);
      return;
    }

    // Validate drop
    const isValid = validateDropTarget(
      draggedItem.type,
      targetNode.data.component.component_type
    );
    if (!isValid) {
      setActiveDragItem(null);
      return;
    }

    const position = {
      x: event.delta.x,
      y: event.delta.y,
    };

    // Pass both new node data AND target node id
    addNode(position, draggedItem.config, nodeId);
    setActiveDragItem(null);
  };

  const handleTestDrawerClose = () => {
    setTestDrawerVisible(false);
  };

  const teamValidated = validationResult ? validationResult.valid : (legacyValidationResults ? legacyValidationResults.is_valid : false);

  const onDragStart = (item: DragItem) => {
    // We can add any drag start logic here if needed
  };
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current) {
      setActiveDragItem(active.data.current as DragItemData);
    }
  };
  return (
    <div>
      {contextHolder}

      <div className="flex gap-2 text-xs rounded border-dashed border p-2 mb-2 items-center">
        <div className="flex-1">
          <Switch
            onChange={() => {
              setIsJsonMode(!isJsonMode);
            }}
            className="mr-2"
            defaultChecked={!isJsonMode}
            checkedChildren=<div className=" text-xs">
              <Cable className="w-3 h-3 inline-block mt-1 mr-1" />
            </div>
            unCheckedChildren=<div className=" text-xs">
              <Code2 className="w-3 h-3 mt-1 inline-block mr-1" />
            </div>
          />
          {isJsonMode ? "View JSON" : <>Visual Builder</>}{" "}
        </div>

        <div className="flex items-center">
          {validationResult && !validationResult.valid && (
            <div className="inline-block mr-2">
              <span className="text-red-500 text-xs">
                {validationResult.errors.length} error{validationResult.errors.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {/* Hidden file input for import */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".json"
            onChange={handleImport}
            style={{ display: "none" }}
          />

          <Tooltip title="Open Workflow">
            <Button
              type="text"
              icon={<FolderOpen size={18} />}
              className="p-1.5 hover:bg-primary/10 rounded-md text-primary/75 hover:text-primary"
              onClick={handleOpenLoadModal}
            />
          </Tooltip>

          <Tooltip title="Import Workflow">
            <Button
              type="text"
              icon={<Upload size={18} />}
              className="p-1.5 hover:bg-primary/10 rounded-md text-primary/75 hover:text-primary"
              onClick={() => fileInputRef.current?.click()}
            />
          </Tooltip>

          <Tooltip title="Download Team">
            <Button
              type="text"
              icon={<Download size={18} />}
              className="p-1.5 hover:bg-primary/10 rounded-md text-primary/75 hover:text-primary"
              onClick={() => {
                const json = JSON.stringify(syncToJson(), null, 2);
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "team-config.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
            />
          </Tooltip>

          <Tooltip title="Export Code">
            <Button
              type="text"
              icon={<FileCode size={18} />}
              className="p-1.5 hover:bg-primary/10 rounded-md text-primary/75 hover:text-primary"
              onClick={() => setExportModalVisible(true)}
            />
          </Tooltip>

          {workflowId && isDirty && (
            <span className="text-xs text-gray-400 mr-2">Auto-save enabled</span>
          )}

          <Tooltip title="Save Changes">
            <Button
              type="text"
              loading={isSaving}
              icon={
                <div className="relative">
                  <Save size={18} />
                  {isDirty && (
                    <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></div>
                  )}
                </div>
              }
              className="p-1.5 hover:bg-primary/10 rounded-md text-primary/75 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSave}
            />
          </Tooltip>

          <Tooltip
            title=<div>
              Validate Team
              {validationResult && (
                <div className="text-xs text-center my-1">
                  {teamValidated ? (
                    <span>
                      <CheckCircle className="w-3 h-3 text-green-500 inline-block mr-1" />
                      success
                    </span>
                  ) : (
                    <div className="">
                      <XCircle className="w-3 h-3 text-red-500 inline-block mr-1" />
                      errors
                    </div>
                  )}
                </div>
              )}
            </div>
          >
            <Button
              type="text"
              loading={validationLoading}
              icon={
                <div className="relative">
                  <ListChecks size={18} />
                  {validationResult && (
                    <div
                      className={` ${
                        teamValidated ? "bg-green-500" : "bg-red-500"
                      } absolute top-0 right-0 w-2 h-2  rounded-full`}
                    ></div>
                  )}
                </div>
              }
              className="p-1.5 hover:bg-primary/10 rounded-md text-primary/75 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleValidate}
            />
          </Tooltip>

          <Tooltip title="Run Team">
            <Button
              type="primary"
              icon={<PlayCircle size={18} />}
              className="p-1.5 ml-2 px-2.5 hover:bg-primary/10 rounded-md text-primary/75 hover:text-primary"
              onClick={() => {
                setTestDrawerVisible(true);
              }}
            >
              Run
            </Button>
          </Tooltip>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
      >
        <Layout className=" relative bg-primary  h-[calc(100vh-239px)] rounded">
          {!isJsonMode && selectedGallery && (
            <ComponentLibrary defaultGallery={selectedGallery} />
          )}

          <Layout className="bg-primary rounded">
            <Content className="relative rounded bg-tertiary  ">
              <div
                className={`w-full h-full transition-all duration-200 ${
                  isFullscreen
                    ? "fixed inset-4 z-50 shadow bg-tertiary  backdrop-blur-sm"
                    : ""
                }`}
              >
                {isJsonMode ? (
                  // TODO: Replace with MonacoEditor component
                  <textarea
                    value={JSON.stringify(syncToJson(), null, 2)}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    className="w-full h-full p-4 font-mono text-sm bg-gray-900 text-gray-100"
                  />
                ) : (
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeDragStop={(_, node) => {
                      // Mark node as user-positioned when dragged
                      setNodeUserPositioned(node.id, node.position);
                    }}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onDrop={(event) => event.preventDefault()}
                    onDragOver={(event) => event.preventDefault()}
                    // Disable pan/zoom during library drag to prevent ReactFlow
                    // from stealing pointer events from dnd-kit
                    panOnDrag={!activeDragItem}
                    zoomOnScroll={!activeDragItem}
                    className="rounded"
                    fitView
                    fitViewOptions={{ padding: 10 }}
                  >
                    {showGrid && <Background />}
                    {showMiniMap && <MiniMap />}
                  </ReactFlow>
                )}
              </div>
              {isFullscreen && (
                <div
                  className="fixed inset-0 -z-10 bg-background bg-opacity-80 backdrop-blur-sm"
                  onClick={handleToggleFullscreen}
                />
              )}
              <TeamBuilderToolbar
                isJsonMode={isJsonMode}
                isFullscreen={isFullscreen}
                showGrid={showGrid}
                onToggleMiniMap={() => setShowMiniMap(!showMiniMap)}
                canUndo={canUndo}
                canRedo={canRedo}
                isDirty={isDirty}
                onToggleView={() => setIsJsonMode(!isJsonMode)}
                onUndo={undo}
                onRedo={redo}
                onSave={handleSave}
                onToggleGrid={() => setShowGrid(!showGrid)}
                onToggleFullscreen={handleToggleFullscreen}
                onAutoLayout={layoutNodes}
              />
            </Content>
          </Layout>

          {/* Properties Panel - Fixed right sidebar */}
          {selectedNodeId && (
            <PropertiesPanel onClose={() => setSelectedNode(null)} />
          )}

          {/* Validation Errors Panel */}
          {validationResult && (validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
            <ValidationErrors
              result={validationResult}
              onClose={() => setValidationResult(null)}
            />
          )}
        </Layout>
        <DragOverlay
          dropAnimation={{
            duration: 250,
            easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
          }}
        >
          {activeDragItem ? (
            <div className="p-2 text-primary h-full     rounded    ">
              <div className="flex items-center gap-2">
                {activeDragItem.icon}
                <span className="text-sm">{activeDragItem.label}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Save Workflow Modal */}
      <Modal
        title="Save Workflow"
        open={saveModalVisible}
        onOk={handleSaveNew}
        onCancel={() => setSaveModalVisible(false)}
        confirmLoading={isSaving}
        okText="Save"
      >
        <Form layout="vertical">
          <Form.Item label="Name" required>
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="My Workflow"
            />
          </Form.Item>
          <Form.Item label="Description">
            <Input.TextArea
              value={workflowDescription}
              onChange={(e) => setWorkflowDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Load Workflow Modal */}
      <Modal
        title="Open Workflow"
        open={loadModalVisible}
        onCancel={() => setLoadModalVisible(false)}
        footer={null}
        width={600}
      >
        {loadingWorkflows ? (
          <div className="text-center py-8 text-gray-500">Loading workflows...</div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No saved workflows found. Create one by clicking Save.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="flex items-center justify-between p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer group"
                onClick={() => handleLoadWorkflow(workflow)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-primary truncate">
                    {workflow.name}
                    {workflow.id === workflowId && (
                      <span className="ml-2 text-xs text-green-600">(current)</span>
                    )}
                  </div>
                  {workflow.description && (
                    <div className="text-sm text-gray-500 truncate">
                      {workflow.description}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    Updated {new Date(workflow.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<Trash2 size={14} />}
                  loading={deletingWorkflowId === workflow.id}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    Modal.confirm({
                      title: "Delete Workflow",
                      content: `Are you sure you want to delete "${workflow.name}"?`,
                      okText: "Delete",
                      okType: "danger",
                      onOk: () => handleDeleteWorkflow(workflow.id),
                    });
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Modal>

      {testDrawerVisible && (
        <TestDrawer
          isVisble={testDrawerVisible}
          team={team}
          onClose={() => handleTestDrawerClose()}
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
        />
      )}

      {/* Export Code Modal */}
      <ExportModal
        open={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        nodes={nodes}
        edges={edges}
        workflowName={workflowName || team?.component?.label || 'My Agent'}
        workflowDescription={workflowDescription || team?.component?.description}
      />
    </div>
  );
};
