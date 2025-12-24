import React from 'react';

interface DesignTask {
  id: string;
  name: string;
  status: 'Completed' | 'In Progress' | 'Delayed' | 'Not Started';
}

interface DesignWorkOutputProps {
  tasks: DesignTask[];
}

function StatusPill({ status }: { status: DesignTask['status'] }) {
  const styles = {
    Completed: 'pp-v2-status-completed',
    'In Progress': 'pp-v2-status-progress',
    Delayed: 'pp-v2-status-delayed',
    'Not Started': 'pp-v2-status-not-started',
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-[11px] font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function DesignWorkOutput({ tasks }: DesignWorkOutputProps) {
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="flex items-center justify-between p-3 pp-v2-card-bg rounded-lg"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold pp-v2-text-primary truncate">
              {task.name}
            </div>
          </div>
          <StatusPill status={task.status} />
        </div>
      ))}
    </div>
  );
}

