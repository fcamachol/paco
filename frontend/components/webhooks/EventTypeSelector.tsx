"use client";

import { useQuery } from "@tanstack/react-query";
import { api, WebhookEventTypeInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

interface EventTypeSelectorProps {
  selected: string[];
  onChange: (events: string[]) => void;
}

export function EventTypeSelector({ selected, onChange }: EventTypeSelectorProps) {
  const { data: eventTypes, isLoading } = useQuery({
    queryKey: ["webhook-event-types"],
    queryFn: () => api.getWebhookEventTypes(),
  });

  if (isLoading) {
    return (
      <div className="h-8 flex items-center">
        <div className="animate-spin w-4 h-4 border-2 border-coral-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!eventTypes || eventTypes.length === 0) {
    return <p className="text-xs text-foreground-muted">No event types available.</p>;
  }

  // Group by category
  const grouped = eventTypes.reduce<Record<string, WebhookEventTypeInfo[]>>((acc, et) => {
    const cat = et.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(et);
    return acc;
  }, {});

  const toggle = (eventType: string) => {
    if (selected.includes(eventType)) {
      onChange(selected.filter((e) => e !== eventType));
    } else {
      onChange([...selected, eventType]);
    }
  };

  const toggleCategory = (category: string) => {
    const catEvents = grouped[category].map((e) => e.event_type);
    const allSelected = catEvents.every((e) => selected.includes(e));
    if (allSelected) {
      onChange(selected.filter((e) => !catEvents.includes(e)));
    } else {
      const newSelected = new Set([...selected, ...catEvents]);
      onChange(Array.from(newSelected));
    }
  };

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([category, events]) => {
        const catEvents = events.map((e) => e.event_type);
        const allSelected = catEvents.every((e) => selected.includes(e));
        const someSelected = catEvents.some((e) => selected.includes(e));

        return (
          <div key={category}>
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              role="checkbox"
              aria-checked={allSelected ? true : someSelected ? "mixed" : false}
              className="flex items-center gap-2 mb-1.5"
            >
              <div
                className={cn(
                  "w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px]",
                  allSelected
                    ? "bg-coral-500 border-coral-500 text-white"
                    : someSelected
                    ? "bg-coral-500/30 border-coral-500/50 text-coral-400"
                    : "border-border"
                )}
              >
                {allSelected ? "✓" : someSelected ? "−" : ""}
              </div>
              <span className="text-xs font-semibold text-foreground">{category}</span>
            </button>

            <div className="grid grid-cols-1 gap-1 pl-5">
              {events.map((et) => (
                <label
                  key={et.event_type}
                  className="flex items-start gap-2 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(et.event_type)}
                    onChange={() => toggle(et.event_type)}
                    className="mt-0.5 rounded border-border"
                  />
                  <div>
                    <span className="text-xs font-mono text-foreground group-hover:text-coral-400 transition-colors">
                      {et.event_type}
                    </span>
                    <p className="text-xs text-foreground-muted">{et.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
