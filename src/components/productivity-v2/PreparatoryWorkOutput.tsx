import React from 'react';
import { CircularProgress } from './CircularProgress';

interface Milestone {
  id: string;
  name: string;
  current: number;
  total: number;
  status: 'Completed' | 'In Progress' | 'Delayed' | 'Not Started';
}

interface PreparatoryTask {
  id: string;
  name: string;
  status: 'Completed' | 'In Progress' | 'Delayed' | 'Not Started';
  milestones: Milestone[];
}

interface PreparatoryWorkOutputProps {
  tasks: PreparatoryTask[];
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

export function PreparatoryWorkOutput({ tasks }: PreparatoryWorkOutputProps) {
  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="p-3 pp-v2-card-bg rounded-lg space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold pp-v2-text-primary truncate">
                {task.name}
              </div>
            </div>
            <StatusPill status={task.status} />
          </div>
          <div className="space-y-2 pl-2">
            {task.milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-center gap-3 justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium pp-v2-text-primary truncate" title={milestone.name}>
                    {milestone.name}
                  </div>
                </div>
                {milestone.status!=='Completed' && <CircularProgress
                  current={milestone.current}
                  total={milestone.total}
                  size={40}
                  strokeWidth={5}
                />}
                <StatusPill status={milestone.status} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

