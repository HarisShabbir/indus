import React from 'react';

interface SemiCircularGaugeProps {
  value: number; // 0-100
  closed: number;
  open: number;
  issued: number;
  label: string;
}

export function SemiCircularGauge({
  value,
  closed,
  open,
  issued,
  label,
}: SemiCircularGaugeProps) {
  // Calculate percentages based on issued - these should add up to 100%
  const closedPercentage = issued > 0 ? (closed / issued) * 100 : 0;
  const openPercentage = issued > 0 ? (open / issued) * 100 : 0;

  // Use the value prop directly as it's already calculated as percentage
  const percentage = Math.min(100, Math.max(0, value));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full flex justify-center" style={{ height: '80px' }}>
        <svg
          viewBox="0 0 250 100"
          className="w-full h-full max-w-[160px]"
          style={{ 
            overflow: 'visible',
            '--value': closedPercentage
          } as React.CSSProperties}
        >
          {/* Background (open/red portion) - positioned after green */}
          <path
            d="M10 100 A90 90 0 0 1 190 100"
            fill="none"
            stroke="#ef4444"
            strokeWidth="20"
            pathLength="100"
            strokeDasharray={`${openPercentage} 100`}
            strokeDashoffset={-closedPercentage}
          />

          {/* Progress (closed/green portion) - from start */}
          <path
            d="M10 100 A90 90 0 0 1 190 100"
            fill="none"
            stroke="#22c55e"
            strokeWidth="20"
            pathLength="100"
            strokeDasharray={`${closedPercentage} 100`}
          />

          {/* Labels */}
          <text x="30" y="90" fill="currentColor" fontSize="22" fontWeight="600" className="pp-v2-gauge-text">
            {Math.round(closedPercentage)}%
          </text>
          <text x="129" y="90" fill="currentColor" fontSize="22" fontWeight="600" className="pp-v2-gauge-text">
            {Math.round(openPercentage)}%
          </text>
        </svg>
        {/* <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-center">
          <div className="text-xl font-bold pp-v2-gauge-text">
            {Math.round(percentage)}%
          </div>
        </div> */}
      </div>
      <div className="flex gap-2 flex-col flex-wrap">
        <div className='flex justify-between items-center gap-2'>
            <span className='text-xs font-semibold pp-v2-text-muted'>Closed</span>
            <div className='px-4 py-1 rounded-full pp-v2-badge-green text-xs font-semibold w-15 text-center'>{closed}</div>
        </div>
        <div className='flex justify-between items-center gap-2'>
            <span className='text-xs font-semibold pp-v2-text-muted'>Open</span>
            <div className='px-4 py-1 rounded-full pp-v2-badge-red text-xs font-semibold w-15 text-center'>{open}</div>
        </div>
        <div className='flex justify-between items-center gap-2'>
            <span className='text-xs font-semibold pp-v2-text-muted'>Issued</span>
            <div className='px-4 py-1 rounded-full pp-v2-badge-orange text-xs font-semibold w-15 text-center'>{issued}</div>
        </div>
      </div>
    </div>
  );
}

