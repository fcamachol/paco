'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TeamBuilder } from '@/components/builder/builder';
import { Team, Gallery, Component, TeamConfig, AgentConfig, ModelConfig, ToolConfig, TerminationConfig, WorkbenchConfig } from '@/types/datamodel';
import { api, Workflow } from '@/lib/api';

// Default empty team for initial render
const createDefaultTeam = (): Team => ({
  id: 1,
  component: {
    provider: 'autogen_agentchat.teams.RoundRobinGroupChat',
    component_type: 'team',
    version: 1,
    label: 'My Team',
    description: 'A new team configuration',
    config: {
      participants: [],
    } as TeamConfig,
  },
});

// Default gallery with empty component arrays
const createDefaultGallery = (): Gallery => ({
  id: 1,
  config: {
    components: {
      agents: [] as Component<AgentConfig>[],
      models: [] as Component<ModelConfig>[],
      tools: [] as Component<ToolConfig>[],
      terminations: [] as Component<TerminationConfig>[],
      workbenches: [] as Component<WorkbenchConfig>[],
    },
  },
});

// Convert workflow to team format for builder
function workflowToTeam(workflow: Workflow): Team {
  return {
    id: 0, // Workflow uses UUID, Team uses number
    component: workflow.config as Component<TeamConfig>,
  };
}

function BuilderContent() {
  const searchParams = useSearchParams();
  const workflowId = searchParams.get('id');

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(!!workflowId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workflowId) {
      setLoading(true);
      api.getWorkflow(workflowId)
        .then(setWorkflow)
        .catch((err) => setError(err.detail || 'Failed to load workflow'))
        .finally(() => setLoading(false));
    }
  }, [workflowId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-gray-500">Loading workflow...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-red-500">
          <p className="text-lg font-medium">Error loading workflow</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const defaultGallery = createDefaultGallery();
  const team = workflow ? workflowToTeam(workflow) : createDefaultTeam();

  const handleChange = (team: Partial<Team>) => {
    console.log('Team changed:', team);
  };

  const handleDirtyStateChange = (isDirty: boolean) => {
    console.log('Dirty state:', isDirty);
  };

  return (
    <TeamBuilder
      team={team}
      workflowId={workflow?.id}
      onChange={handleChange}
      onDirtyStateChange={handleDirtyStateChange}
      selectedGallery={defaultGallery}
    />
  );
}

export default function BuilderPage() {
  return (
    <div className="h-full w-full">
      <Suspense fallback={
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      }>
        <BuilderContent />
      </Suspense>
    </div>
  );
}
