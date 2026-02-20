"use client";

import { useBuilderStore, ArtifactTab } from "./store";

const TABS: { id: ArtifactTab; label: string; icon: string }[] = [
  { id: "agent", label: "Agente", icon: "🤖" },
  { id: "tools", label: "Tools", icon: "🔧" },
  { id: "skills", label: "Skills", icon: "📚" },
  { id: "prompt", label: "Prompt", icon: "💬" },
  { id: "flow", label: "Flujo", icon: "📋" },
  { id: "knowledge", label: "KB", icon: "🧠" },
  { id: "test", label: "Test", icon: "🧪" },
];

function TabButton({
  tab,
  active,
  pulse,
  onClick,
  hasContent,
}: {
  tab: (typeof TABS)[0];
  active: boolean;
  pulse: boolean;
  onClick: () => void;
  hasContent: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
        active
          ? "text-white border-b-2 border-blue-500"
          : "text-gray-500 hover:text-gray-300"
      }`}
    >
      <span className="mr-1">{tab.icon}</span>
      {tab.label}
      {/* Status dot */}
      <span
        className={`absolute top-1 right-0.5 w-1.5 h-1.5 rounded-full ${
          hasContent ? "bg-green-500" : "bg-gray-700"
        } ${pulse ? "animate-ping" : ""}`}
      />
    </button>
  );
}

function AgentConfigView() {
  const { artifacts } = useBuilderStore();
  const agent = artifacts?.agent;

  if (!agent) {
    return (
      <EmptyState
        icon="🤖"
        message="El agente se mostrará aquí cuando sea creado"
      />
    );
  }

  return (
    <div className="p-4 space-y-4">
      <Field label="Nombre" value={agent.name} />
      <Field label="Nombre visible" value={agent.display_name} />
      <Field label="Descripción" value={agent.description} />
      <Field label="Modelo" value={agent.model} />
      <Field
        label="Estado"
        value={
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
              agent.status === "draft"
                ? "bg-yellow-500/10 text-yellow-400"
                : agent.status === "stopped"
                ? "bg-green-500/10 text-green-400"
                : "bg-gray-500/10 text-gray-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                agent.status === "draft"
                  ? "bg-yellow-400"
                  : agent.status === "stopped"
                  ? "bg-green-400"
                  : "bg-gray-400"
              }`}
            />
            {agent.status}
          </span>
        }
      />
    </div>
  );
}

function ToolsView() {
  const { artifacts } = useBuilderStore();
  const tools = artifacts?.tools || [];

  if (tools.length === 0) {
    return (
      <EmptyState
        icon="🔧"
        message="Las herramientas aparecerán aquí cuando sean creadas"
      />
    );
  }

  return (
    <div className="p-4 space-y-3">
      {tools.map((tool) => (
        <div
          key={tool.id}
          className="p-3 bg-[#12121a] border border-gray-800 rounded-lg"
        >
          <div className="font-medium text-sm mb-1">{tool.name}</div>
          {tool.description && (
            <div className="text-xs text-gray-500 mb-2">
              {tool.description}
            </div>
          )}
          {tool.input_schema && Object.keys(tool.input_schema).length > 0 && (
            <details className="text-xs">
              <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
                Input Schema
              </summary>
              <pre className="mt-1 p-2 bg-[#0a0a0f] rounded text-gray-500 overflow-x-auto max-h-24 overflow-y-auto">
                {JSON.stringify(tool.input_schema, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function SkillsView() {
  const { artifacts } = useBuilderStore();
  const skills = artifacts?.skills || [];

  if (skills.length === 0) {
    return (
      <EmptyState
        icon="📚"
        message="Los skills aparecerán aquí cuando sean creados o vinculados"
      />
    );
  }

  return (
    <div className="p-4 space-y-3">
      {skills.map((skill) => (
        <div
          key={skill.id}
          className="p-3 bg-[#12121a] border border-gray-800 rounded-lg"
        >
          <div className="flex items-center gap-2 mb-1">
            <code className="text-xs bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">
              {skill.code}
            </code>
            <span className="font-medium text-sm">{skill.name}</span>
          </div>
          {skill.description && (
            <div className="text-xs text-gray-500">{skill.description}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function SystemPromptView() {
  const { artifacts } = useBuilderStore();
  const prompt = artifacts?.agent?.system_prompt;

  if (!prompt) {
    return (
      <EmptyState
        icon="💬"
        message="El system prompt se mostrará aquí cuando sea configurado"
      />
    );
  }

  return (
    <div className="p-4">
      <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-[#12121a] border border-gray-800 rounded-lg p-4 overflow-y-auto max-h-[calc(100vh-200px)]">
        {prompt}
      </pre>
    </div>
  );
}

function ProcessFlowView() {
  const { artifacts } = useBuilderStore();
  const steps = artifacts?.process_flow;

  if (!steps || steps.length === 0) {
    return (
      <EmptyState
        icon="📋"
        message="El flujo del proceso se mostrará aquí cuando sea definido"
      />
    );
  }

  return (
    <div className="p-4 space-y-2">
      {steps.map((step, i) => (
        <div
          key={i}
          className="flex gap-3 p-3 bg-[#12121a] border border-gray-800 rounded-lg"
        >
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-medium">
            {step.step || i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{step.title}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {step.description}
            </div>
            {step.action && (
              <div className="text-xs text-blue-400/70 mt-1">
                → {step.action}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function KnowledgeBaseView() {
  const { artifacts } = useBuilderStore();
  const kb = artifacts?.knowledge_base;

  if (!kb) {
    return (
      <EmptyState
        icon="🧠"
        message="La base de conocimiento se mostrará aquí"
      />
    );
  }

  return (
    <div className="p-4 space-y-4">
      {kb.faqs && kb.faqs.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Preguntas Frecuentes
          </h3>
          <div className="space-y-2">
            {kb.faqs.map((faq, i) => (
              <div
                key={i}
                className="p-3 bg-[#12121a] border border-gray-800 rounded-lg"
              >
                <div className="text-sm font-medium mb-1">
                  {faq.question}
                </div>
                <div className="text-xs text-gray-500">{faq.answer}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {kb.requirements && kb.requirements.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Requisitos
          </h3>
          <ul className="space-y-1">
            {kb.requirements.map((req, i) => (
              <li
                key={i}
                className="text-xs text-gray-300 flex items-start gap-2"
              >
                <span className="text-gray-600 mt-0.5">•</span>
                {req}
              </li>
            ))}
          </ul>
        </div>
      )}

      {kb.costs && kb.costs.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Costos
          </h3>
          <div className="space-y-1">
            {kb.costs.map((cost, i) => (
              <div
                key={i}
                className="flex justify-between text-xs p-2 bg-[#12121a] border border-gray-800 rounded"
              >
                <span className="text-gray-300">{cost.concept}</span>
                <span className="text-green-400 font-medium">
                  {cost.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {kb.links && kb.links.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Enlaces
          </h3>
          <div className="space-y-1">
            {kb.links.map((link, i) => (
              <div key={i} className="text-xs text-blue-400 truncate">
                {link}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TestConsoleView() {
  return (
    <EmptyState
      icon="🧪"
      message="La consola de prueba estará disponible cuando el agente esté configurado. Usa el chat para pedirle al builder que ejecute pruebas."
    />
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex items-center justify-center h-64 text-center p-8">
      <div>
        <div className="text-3xl mb-3">{icon}</div>
        <p className="text-xs text-gray-500 max-w-48">{message}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <div className="text-sm text-gray-200">
        {value || (
          <span className="text-gray-600 italic">No configurado</span>
        )}
      </div>
    </div>
  );
}

export function ArtifactPanel() {
  const { activeTab, tabPulse, artifacts, setActiveTab } = useBuilderStore();

  function hasContent(tab: ArtifactTab): boolean {
    if (!artifacts) return false;
    switch (tab) {
      case "agent":
        return !!artifacts.agent;
      case "tools":
        return artifacts.tools.length > 0;
      case "skills":
        return artifacts.skills.length > 0;
      case "prompt":
        return !!artifacts.agent?.system_prompt;
      case "flow":
        return !!artifacts.process_flow && artifacts.process_flow.length > 0;
      case "knowledge":
        return !!artifacts.knowledge_base;
      case "test":
        return false;
      default:
        return false;
    }
  }

  function renderTabContent() {
    switch (activeTab) {
      case "agent":
        return <AgentConfigView />;
      case "tools":
        return <ToolsView />;
      case "skills":
        return <SkillsView />;
      case "prompt":
        return <SystemPromptView />;
      case "flow":
        return <ProcessFlowView />;
      case "knowledge":
        return <KnowledgeBaseView />;
      case "test":
        return <TestConsoleView />;
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d14]">
      {/* Tabs */}
      <div className="flex border-b border-gray-800 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={activeTab === tab.id}
            pulse={tabPulse === tab.id}
            onClick={() => setActiveTab(tab.id)}
            hasContent={hasContent(tab.id)}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">{renderTabContent()}</div>
    </div>
  );
}
