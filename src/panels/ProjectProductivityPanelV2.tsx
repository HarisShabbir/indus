import React, { useState, useRef, useEffect } from 'react';
import { PhysicalWorksKPI } from '../components/productivity-v2/PhysicalWorksKPI';
import { DesignWorkOutput } from '../components/productivity-v2/DesignWorkOutput';
import { PreparatoryWorkOutput } from '../components/productivity-v2/PreparatoryWorkOutput';
import { ConstructionWorkOutput } from '../components/productivity-v2/ConstructionWorkOutput';
import { QualityPerformance } from '../components/productivity-v2/QualityPerformance';
import { SpiPerformance } from '../components/productivity-v2/SpiPerformance';
import { AccordionSection } from '../components/productivity-v2/AccordionSection';
import SvgIcon from '../components/SvgIcon';

export type ProjectProductivityPanelV2Props = {
  projectId: string;
  initialContractId?: string;
};

// Static data matching the images
const staticData = {
  physicalWorks: {
    actual: 20,
    planned: 59.3,
  },
  designWork: [
    {
      id: '1',
      name: 'HM-1 Tender Drawings',
      status: 'Completed' as const,
    },
    {
      id: '2',
      name: 'MW-1 CFD Modelling Stage 3',
      status: 'In Progress' as const,
    },
  ],
  preparatoryWork: [
    {
      id: '1',
      name: 'MW-1 RCC-Facilities',
      status: 'In Progress' as const,
      milestones: [
        {
          id: '1',
          name: 'Milestone A & B',
          current: 2,
          total: 2,
          status: 'Completed' as const,
        },
        {
          id: '2',
          name: 'Milestone C',
          current: 9,
          total: 10,
          status: 'Delayed' as const,
        },
        {
          id: '3',
          name: 'Milestone D',
          current: 8,
          total: 11,
          status: 'In Progress' as const,
        },
      ],
    },
  ],
  constructionWork: [
    {
      id: '1',
      name: 'MW-1 Dam Pit Excavation',
      status: 'Delayed' as const,
      actualPercent: 74,
      plannedPercent: 82,
      actualVolume: 4482486,
      plannedVolume: 4982756,
      totalVolume: 6076532,
      unit: 'm³',
    },
    {
      id: '2',
      name: 'MW-1 Right Bank Abutment',
      status: 'In Progress' as const,
      actualPercent: 62,
      plannedPercent: 62,
      actualVolume: 1562936,
      plannedVolume: 1562936,
      totalVolume: 2520865,
      unit: 'm³',
    },
  ],
  qualityPerformance: {
    ncr: {
      closed: 122,
      open: 34,
      issued: 156,
      percentage: 78, // (122/156) * 100
    },
    qaor: {
      closed: 169,
      open: 40,
      issued: 209,
      percentage: 81, // (169/209) * 100
    },
    conformance: {
      label: 'Excavation Tolerance',
      value: 'Within +/- 0.5%',
    },
  },
  spiPerformance: {
    projectName: 'DBD Project',
    spi: 0.75,
    month: 'July',
    burnRate: '47 Days',
    runway: '47 Days',
    cashFlow: '+$483,848',
    tasks: [
      {
        id: '1',
        name: 'Main Facilities for RCC',
        impact: '5%',
        status: 'In Progress' as const,
      },
      {
        id: '2',
        name: 'Dam Pit Excavation',
        impact: '4.8%',
        status: 'Delayed' as const,
        overrun: 'Overrun 35 Days',
        plannedDate: '27 Oct 2025',
        estimatedDate: '30 Nov 2025',
        impactEvents: 4,
        events: [
          'Foundation Treatment',
          'Dental Concreting',
          'Grouting',
          'RCC Works Commencement',
        ],
      },
      {
        id: '3',
        name: 'MW-2 Commencement',
        impact: '10%',
        status: 'In Progress' as const,
      },
      {
        id: '4',
        name: 'HM-1 Commencement',
        impact: '10%',
        status: 'In Progress' as const,
      },
    ],
  },
};

export default function ProjectProductivityPanelV2({
  projectId,
  initialContractId,
}: ProjectProductivityPanelV2Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [firstBoxHeight, setFirstBoxHeight] = useState<number | null>(null);
  const [secondBoxHeight, setSecondBoxHeight] = useState<number | null>(null);
  const [isResizingFirst, setIsResizingFirst] = useState(false);
  const [isResizingSecond, setIsResizingSecond] = useState(false);
  const resizeSnapshot = useRef<{ startY: number; startHeight: number; which: 'first' | 'second' }>({
    startY: 0,
    startHeight: 0,
    which: 'first',
  });

  // Initialize equal heights
  useEffect(() => {
    if (containerRef.current && firstBoxHeight === null) {
      const containerHeight = containerRef.current.getBoundingClientRect().height;
      const resizeHandleHeight = 14;
      const availableHeight = containerHeight - (resizeHandleHeight * 2);
      const equalHeight = Math.max(200, availableHeight / 3);
      setFirstBoxHeight(equalHeight);
      setSecondBoxHeight(equalHeight);
    }
  }, [firstBoxHeight]);

  const handleResizeStart = (which: 'first' | 'second') => (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (which === 'first') {
      setIsResizingFirst(true);
      resizeSnapshot.current = {
        startY: event.clientY,
        startHeight: firstBoxHeight || 0,
        which: 'first',
      };
    } else {
      setIsResizingSecond(true);
      resizeSnapshot.current = {
        startY: event.clientY,
        startHeight: secondBoxHeight || 0,
        which: 'second',
      };
    }
  };

  useEffect(() => {
    if (!isResizingFirst && !isResizingSecond) return;

    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientY - resizeSnapshot.current.startY;
      const proposed = resizeSnapshot.current.startHeight + delta;
      
      if (containerRef.current) {
        const containerHeight = containerRef.current.getBoundingClientRect().height;
        const resizeHandleHeight = 14;
        const minHeight = 200;
        
        if (resizeSnapshot.current.which === 'first') {
          const maxHeight = containerHeight - (secondBoxHeight || 0) - (resizeHandleHeight * 2) - minHeight;
          const next = Math.max(minHeight, Math.min(maxHeight, proposed));
          setFirstBoxHeight(next);
        } else {
          const maxHeight = containerHeight - (firstBoxHeight || 0) - (resizeHandleHeight * 2) - minHeight;
          const next = Math.max(minHeight, Math.min(maxHeight, proposed));
          setSecondBoxHeight(next);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizingFirst(false);
      setIsResizingSecond(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingFirst, isResizingSecond, firstBoxHeight, secondBoxHeight]);

  return (
    <aside
      ref={containerRef}
      className="pp-rightPanel w-full max-w-[400px] flex flex-col gap-0 sticky top-4 max-h-[calc(100vh-32px)] overflow-hidden"
      aria-label="Project productivity insights"
    >
      {/* Project Productivity Box */}
      <div 
        className="pp-v2-card shadow-xl flex flex-col overflow-hidden"
        style={{ 
          height: firstBoxHeight ? `${firstBoxHeight}px` : undefined,
          minHeight: '200px',
          flex: firstBoxHeight ? '0 0 auto' : '1 1 0',
          borderRadius: '12px 12px 0 0'
        }}
      >
        <div className="shrink-0 p-4">
          <h3 className="text-lg font-bold pp-v2-text-primary mb-1">
            Project Productivity
          </h3>
          <span className="text-xs pp-v2-text-muted">
            Scope synced with all contracts · {staticData.designWork.length + staticData.preparatoryWork.length + staticData.constructionWork.length} datapoints
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="space-y-4">
            <PhysicalWorksKPI
              actual={staticData.physicalWorks.actual}
              planned={staticData.physicalWorks.planned}
            />

            <AccordionSection title="Design Work Output" defaultOpen={true}>
              <DesignWorkOutput tasks={staticData.designWork} />
            </AccordionSection>

            <AccordionSection title="Preparatory Work Output" defaultOpen={true}>
              <PreparatoryWorkOutput tasks={staticData.preparatoryWork} />
            </AccordionSection>

            <AccordionSection title="Construction Work Output" defaultOpen={true}>
              <ConstructionWorkOutput tasks={staticData.constructionWork} />
            </AccordionSection>
          </div>
        </div>
      </div>

      {/* First Resize Handle */}
      <div
        className={`resize-bar ${isResizingFirst ? 'dragging' : ''}`}
        onMouseDown={handleResizeStart('first')}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Adjust first and second box heights"
      >
        <SvgIcon name="resize-bar" width={26} height={11} />
      </div>

      {/* Project Quality Performance Box */}
      <div 
        className="pp-v2-card shadow-xl flex flex-col overflow-hidden"
        style={{ 
          height: secondBoxHeight ? `${secondBoxHeight}px` : undefined,
          minHeight: '200px',
          flex: secondBoxHeight ? '0 0 auto' : '1 1 0'
        }}
      >
        <div className="shrink-0 p-4">
          <h3 className="text-lg font-bold pp-v2-text-primary mb-1">
            Project Quality Performance
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <QualityPerformance
            ncr={staticData.qualityPerformance.ncr}
            qaor={staticData.qualityPerformance.qaor}
            conformance={staticData.qualityPerformance.conformance}
          />
        </div>
      </div>

      {/* Second Resize Handle */}
      <div
        className={`resize-bar ${isResizingSecond ? 'dragging' : ''}`}
        onMouseDown={handleResizeStart('second')}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Adjust second and third box heights"
      >
        <SvgIcon name="resize-bar" width={26} height={11} />
      </div>

      {/* SPI Box */}
      <div 
        className="pp-v2-card shadow-xl flex flex-col overflow-hidden"
        style={{ 
          minHeight: '200px', 
          flex: '1 1 0',
          borderRadius: '0 0 12px 12px'
        }}
      >
        <div className="shrink-0 p-4">
          <h3 className="text-lg font-bold pp-v2-text-primary mb-1">
            SPI
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <SpiPerformance
            projectName={staticData.spiPerformance.projectName}
            spi={staticData.spiPerformance.spi}
            month={staticData.spiPerformance.month}
            burnRate={staticData.spiPerformance.burnRate}
            runway={staticData.spiPerformance.runway}
            cashFlow={staticData.spiPerformance.cashFlow}
            tasks={staticData.spiPerformance.tasks}
          />
        </div>
      </div>
    </aside>
  );
}

