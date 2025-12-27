import React from 'react';

interface PhysicalWorksKPIProps {
  actual: number;
  planned: number;
}

export function PhysicalWorksKPI({ actual, planned }: PhysicalWorksKPIProps) {
  return (
    <div className="pp-v2-card rounded-xl p-4 mb-4">
      <h4
        className="text-sm font-semibold pp-v2-text-primary mb-3 tracking-wide text-nowrap overflow-hidden text-ellipsis"
        title="Physical Works Completed"
      >
        Physical Works Completed
      </h4>
      <div className="grid! grid-cols-2 gap-3">
        <div className="pp-v2-metric-card text-center rounded-lg p-3 ">
          <div className="text-xs font-medium opacity-90 mb-1 ">Actual</div>
          <div className="text-2xl font-bold">{actual}%</div>
        </div>
        <div className="pp-v2-metric-card rounded-lg p-3 text-center">
          <div className="text-xs font-medium pp-v2-metric-label mb-1">Planned</div>
          <div className="text-2xl font-bold pp-v2-metric-value">{planned}%</div>
        </div>
      </div>
    </div>
  );
}

