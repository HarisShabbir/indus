import React from 'react';

interface ConstructionTask {
  id: string;
  name: string;
  status: 'Completed' | 'In Progress' | 'Delayed' | 'Not Started';
  actualPercent: number;
  plannedPercent: number;
  actualVolume: number;
  plannedVolume: number;
  totalVolume: number;
  unit: string;
}

interface ConstructionWorkOutputProps {
  tasks: ConstructionTask[];
}

function StatusPill({ status }: { status: string }) {
  const styles = {
    Completed: 'pp-v2-status-completed',
    'In Progress': 'pp-v2-status-progress',
    Delayed: 'pp-v2-status-delayed',
    'Not Started': 'pp-v2-status-not-started',
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-[11px] font-semibold ${styles[status as keyof typeof styles] || styles['Not Started']}`}
    >
      {status}
    </span>
  );
}

function formatVolume(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function ConstructionWorkOutput({ tasks }: ConstructionWorkOutputProps) {
  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="p-4 pp-v2-card-bg rounded-lg space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold pp-v2-text-primary truncate">
                {task.name}
              </div>
            </div>
            <StatusPill status={task.status} />
          </div>

          {/* Progress Bar */}
          <div className="relative">
            <div className="h-3 pp-v2-progress-bg rounded-full overflow-hidden">
              {/* Actual progress (green) */}
              <div
                className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full"
                style={{ width: `${task.actualPercent}%` }}
              />
              {/* Planned indicator (red line) */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                style={{ left: `${task.plannedPercent}%` }}
              />
            </div>
            {task.actualPercent !== task.plannedPercent && (
              <div className="mt-1 text-xs pp-v2-text-muted">
                Actual: {task.actualPercent}% | Planned: {task.plannedPercent}%
              </div>
            )}
            {task.actualPercent === task.plannedPercent && (
              <div className="mt-1 text-xs pp-v2-text-muted">
                Actual & Planned: {task.actualPercent}%
              </div>
            )}
          </div>

          {/* Volume Metrics */}
          <div className="flex flex-col gap-2">
            <div className="pp-v2-badge-green flex items-center gap-2 justify-between rounded-lg p-2">
              <div className="text-xs font-medium mb-1">
                Actual
              </div>
              <div className="text-sm font-bold">
                {formatVolume(task.actualVolume)} {task.unit}
              </div>
            </div>
            <div className="pp-v2-badge-red flex items-center gap-2 justify-between rounded-lg p-2">
              <div className="text-xs font-medium mb-1">
                Planned
              </div>
              <div className="text-sm font-bold">
                {formatVolume(task.plannedVolume)} {task.unit}
              </div>
            </div>
            <div className="pp-v2-badge-orange flex items-center gap-2 justify-between rounded-lg p-2">
              <div className="text-xs font-medium mb-1">
                Total
              </div>
              <div className="text-sm font-bold">
                {formatVolume(task.totalVolume)} {task.unit}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

