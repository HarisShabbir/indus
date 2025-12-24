import React from 'react';
import { PhysicalWorksKPI } from '../components/productivity-v2/PhysicalWorksKPI';
import { DesignWorkOutput } from '../components/productivity-v2/DesignWorkOutput';
import { PreparatoryWorkOutput } from '../components/productivity-v2/PreparatoryWorkOutput';
import { ConstructionWorkOutput } from '../components/productivity-v2/ConstructionWorkOutput';
import { QualityPerformance } from '../components/productivity-v2/QualityPerformance';
import { SpiPerformance } from '../components/productivity-v2/SpiPerformance';
import { AccordionSection } from '../components/productivity-v2/AccordionSection';

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
  return (
    <aside
      className="project-productivity pp-rightPanel w-full max-w-[400px] bg-gradient-to-br from-white to-blue-50/30 border border-gray-200 rounded-3xl shadow-xl flex flex-col sticky top-4 max-h-[calc(100vh-32px)] overflow-hidden"
      aria-label="Project productivity insights"
    >
      <div className="shrink-0 p-4">
        <h3 className="text-lg font-bold pp-v2-text-primary mb-1">
          Project Productivity
        </h3>
        <span className="text-xs pp-v2-text-muted">
          Scope synced with all contracts · {staticData.designWork.length + staticData.preparatoryWork.length + staticData.constructionWork.length} datapoints
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 project-productivity-scroll">
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

          <AccordionSection title="Project Quality Performance" defaultOpen={true}>
            <QualityPerformance
              ncr={staticData.qualityPerformance.ncr}
              qaor={staticData.qualityPerformance.qaor}
              conformance={staticData.qualityPerformance.conformance}
            />
          </AccordionSection>

          <AccordionSection title="Schedule Performance Index (SPI)" defaultOpen={true}>
            <SpiPerformance
              projectName={staticData.spiPerformance.projectName}
              spi={staticData.spiPerformance.spi}
              month={staticData.spiPerformance.month}
              burnRate={staticData.spiPerformance.burnRate}
              runway={staticData.spiPerformance.runway}
              cashFlow={staticData.spiPerformance.cashFlow}
              tasks={staticData.spiPerformance.tasks}
            />
          </AccordionSection>
        </div>
      </div>
    </aside>
  );
}

