import React, { useState } from "react";
import { SemiCircularGauge } from "./SemiCircularGauge";

interface QualityPerformanceProps {
  ncr: {
    closed: number;
    open: number;
    issued: number;
    percentage: number;
  };
  qaor: {
    closed: number;
    open: number;
    issued: number;
    percentage: number;
  };
  conformance: {
    label: string;
    value: string;
  };
}

export function QualityPerformance({
  ncr,
  qaor,
  conformance,
}: QualityPerformanceProps) {
  const [ncrOpen, setNcrOpen] = useState(true);
  const [qaorOpen, setQaorOpen] = useState(true);
  const [excavationTolerance, setExcavationTolerance] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        {/* NCR Collapsible */}
        <div className={`productivity-accordion ${ncrOpen ? "open" : ""}`}>
          <div
            className="productivity-accordion__header"
            onClick={() => setNcrOpen((prev) => !prev)}
            role="button"
            tabIndex={0}
            aria-expanded={ncrOpen}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setNcrOpen((prev) => !prev);
              }
            }}
          >
            <div className="productivity-accordion__title">NCR</div>
            <div className="productivity-accordion__toggle">
              <span className="sr-only">Toggle NCR</span>
              <span className="productivity-accordion__icon">
                {ncrOpen ? "−" : "+"}
              </span>
            </div>
          </div>
          {ncrOpen && (
            <div className="productivity-accordion__content">
              <SemiCircularGauge
                value={ncr.percentage}
                closed={ncr.closed}
                open={ncr.open}
                issued={ncr.issued}
                label="NCR"
              />
            </div>
          )}
        </div>

        {/* QAOR Collapsible */}
        <div className={`productivity-accordion ${qaorOpen ? "open" : ""}`}>
          <div
            className="productivity-accordion__header"
            onClick={() => setQaorOpen((prev) => !prev)}
            role="button"
            tabIndex={0}
            aria-expanded={qaorOpen}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setQaorOpen((prev) => !prev);
              }
            }}
          >
            <div className="productivity-accordion__title">QAOR</div>
            <div className="productivity-accordion__toggle">
              <span className="sr-only">Toggle QAOR</span>
              <span className="productivity-accordion__icon">
                {qaorOpen ? "−" : "+"}
              </span>
            </div>
          </div>
          {qaorOpen && (
            <div className="productivity-accordion__content">
              <SemiCircularGauge
                value={qaor.percentage}
                closed={qaor.closed}
                open={qaor.open}
                issued={qaor.issued}
                label="QAOR"
              />
            </div>
          )}
        </div>
      </div>
      <div className="pp-v2-card rounded-lg p-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <div className="relative w-5 h-5">
            <input
              type="checkbox"
              checked={excavationTolerance}
              onChange={(e) => setExcavationTolerance(e.target.checked)}
              className="sr-only"
            />
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                excavationTolerance
                  ? "border-orange-500 bg-orange-500"
                  : "border-orange-500 bg-transparent"
              }`}
            >
              {excavationTolerance && (
                <svg
                  className="w-3 h-3 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold pp-v2-text-primary">
              Excavation Tolerance
            </div>
            <div className="text-xs pp-v2-text-muted">{conformance.value}</div>
          </div>
        </label>
      </div>
    </div>
  );
}
