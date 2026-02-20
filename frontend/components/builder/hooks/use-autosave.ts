import { useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Component, TeamConfig } from "@/types/datamodel";

interface UseAutoSaveOptions {
  workflowId: string | null;
  isDirty: boolean;
  getConfig: () => Component<TeamConfig> | null;
  onSaveSuccess?: () => void;
  onSaveError?: (error: any) => void;
  interval?: number; // milliseconds, default 30000 (30s)
  enabled?: boolean;
}

export function useAutoSave({
  workflowId,
  isDirty,
  getConfig,
  onSaveSuccess,
  onSaveError,
  interval = 30000,
  enabled = true,
}: UseAutoSaveOptions) {
  const lastSaveRef = useRef<number>(0);
  const isSavingRef = useRef(false);

  const autoSave = useCallback(async () => {
    // Skip if:
    // - No workflow ID (not yet saved)
    // - No unsaved changes
    // - Already saving
    // - Disabled
    if (!workflowId || !isDirty || isSavingRef.current || !enabled) {
      return;
    }

    const config = getConfig();
    if (!config) return;

    try {
      isSavingRef.current = true;
      await api.updateWorkflow(workflowId, { config });
      lastSaveRef.current = Date.now();
      onSaveSuccess?.();
    } catch (error) {
      onSaveError?.(error);
    } finally {
      isSavingRef.current = false;
    }
  }, [workflowId, isDirty, getConfig, onSaveSuccess, onSaveError, enabled]);

  useEffect(() => {
    if (!enabled || !workflowId) return;

    const timer = setInterval(() => {
      autoSave();
    }, interval);

    return () => clearInterval(timer);
  }, [autoSave, interval, enabled, workflowId]);

  return {
    lastSave: lastSaveRef.current,
    triggerSave: autoSave,
  };
}
