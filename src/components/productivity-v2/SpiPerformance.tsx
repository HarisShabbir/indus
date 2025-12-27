import React, { useState } from 'react';

interface SpiTask {
  id: string;
  name: string;
  impact: string;
  status: 'In Progress' | 'Delayed' | 'Completed';
  overrun?: string;
  plannedDate?: string;
  estimatedDate?: string;
  impactEvents?: number;
  events?: string[];
}

interface SpiPerformanceProps {
  projectName: string;
  spi: number;
  month: string;
  burnRate: string;
  runway: string;
  cashFlow: string;
  tasks: SpiTask[];
}

function StatusPill({ status }: { status: string }) {
  const styles = {
    Completed: 'pp-v2-status-completed',
    'In Progress': 'pp-v2-status-progress',
    Delayed: 'pp-v2-status-delayed',
  };

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${styles[status as keyof typeof styles] || styles['In Progress']}`}
    >
      {status}
    </span>
  );
}

function TaskCollapsible({ task }: { task: SpiTask }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`productivity-accordion ${open ? 'open' : ''}`}>
      <div
        className="productivity-accordion__header"
        onClick={() => setOpen((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        <div className="productivity-accordion__title">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate" title={task.name}>
              {task.name}
            </div>
            <div className="text-xs pp-v2-text-muted mt-0.5">
              Impact: {task.impact}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px',flexShrink:0 }}>
          <StatusPill status={task.status} />
          <div className="productivity-accordion__toggle">
            <span className="sr-only">Toggle {task.name}</span>
            <span className="productivity-accordion__icon">
              {open ? '−' : '+'}
            </span>
          </div>
        </div>
      </div>
      {open && (
        <div className="productivity-accordion__content">
          {task.overrun && (
            <div className="p-2 pp-v2-impact-card rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold pp-v2-impact-text">
                  Completion
                </span>
                <span className="px-2 py-1 pp-v2-badge-red rounded-full text-xs font-semibold">
                  {task.overrun}
                </span>
              </div>
              {task.plannedDate && (
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="pp-v2-text-muted">Planned</span>
                  <span className="pp-v2-spi-high font-medium">
                    {task.plannedDate}
                  </span>
                </div>
              )}
              {task.estimatedDate && (
                <div className="flex items-center justify-between text-xs">
                  <span className="pp-v2-text-muted">Estimated Completion</span>
                  <span className="pp-v2-spi-low font-medium">
                    {task.estimatedDate}
                  </span>
                </div>
              )}
            </div>
          )}

          {task.impactEvents !== undefined && task.impactEvents > 0 && (
            <div className="mt-3 p-2 pp-v2-impact-card rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold pp-v2-impact-text">
                  Impact Events
                </span>
                <span className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">
                  {task.impactEvents}
                </span>
              </div>
              {task.events && task.events.length > 0 && (
                <div className="space-y-1">
                  {task.events.map((event, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full" />
                      <span className="text-xs pp-v2-text-secondary">{event}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SpiPerformance({
  projectName,
  spi,
  month,
  burnRate,
  runway,
  cashFlow,
  tasks,
}: SpiPerformanceProps) {
  const spiColor =
    spi >= 0.9
      ? 'pp-v2-spi-high'
      : spi >= 0.7
      ? 'pp-v2-spi-medium'
      : 'pp-v2-spi-low';

  return (
    <div className="space-y-4">
      {/* Main SPI Card */}
      <div className="pp-v2-card rounded-lg p-4">
        {/* <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold pp-v2-text-secondary">SPI</span>
        </div> */}
        <div className="mb-3">
          <div className="text-sm font-semibold pp-v2-text-primary mb-2">
            {projectName}
          </div>
          {/* Progress Bar */}
          <div className="relative h-2 pp-v2-progress-bg rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${(spi / 1.0) * 100}%` }}
            />
          </div>
          <div className={`text-sm font-semibold ${spiColor}`}>
            SPI : {spi.toFixed(2)} ({month})
          </div>
        </div>
        <div className="flex flex-col gap-3 mt-4">
          <div className='flex items-center justify-between gap-2'>
            <div className="text-xs pp-v2-text-muted mb-1">Burn Rate</div>
            <div className="text-sm font-bold pp-v2-text-primary">{burnRate}</div>
          </div>
          <div className='flex items-center justify-between gap-2'>
            <div className="text-xs pp-v2-text-muted mb-1">Runway</div>
            <div className="text-sm font-bold pp-v2-text-primary">{runway}</div>
          </div>
          <div className='flex items-center justify-between gap-2'>
            <div className="text-xs pp-v2-text-muted mb-1">Cash Flow</div>
            <div className="text-sm font-bold pp-v2-spi-high">{cashFlow}</div>
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCollapsible key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

