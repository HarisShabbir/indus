import React, { useEffect, useMemo, useState } from "react";
import { loadSOW } from "../data/sowAdapter";
import { SOWItem, WorkStream } from "../data/seedSOW";
import {
  SOWFilters,
  computeQuality,
  computeSPI,
  computeTotals,
  filterSOW,
  getAvailableContracts,
  getAvailableWorkStreams,
  groupByComponent,
} from "../selectors/sowSelectors";
import { FilterBar, FilterState } from "../components/productivity/FilterBar";
import { AccordionSection } from "../components/productivity/AccordionSection";
import { PhysicalWorkKPI } from "../components/productivity/KpiHeader";
import { ComponentProgressList } from "../components/productivity/ComponentProgressList";
import { QualitySection } from "../components/productivity/QualitySection";
import { SpiSection } from "../components/productivity/SpiSection";
import ContractRightPanel from "../components/right-panel/ContractRightPanel";
import { FEATURE_CONTRACT_RIGHT_PANEL_ECHARTS } from "../config";

export type ProjectProductivityPanelProps = {
  projectId: string;
  initialContractId?: string;
};

const initialFilter: FilterState = {
  contractId: "ALL",
  timeRange: "60",
  workStreams: [],
};

export default function ProjectProductivityPanel({
  projectId,
  initialContractId,
}: ProjectProductivityPanelProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SOWItem[]>([]);
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...initialFilter,
    contractId: initialContractId ?? "ALL",
  }));

  useEffect(() => {
    let mounted = true;
    loadSOW().then((data) => {
      if (!mounted) return;
      const projectItems = data.filter((item) => item.projectId === projectId);
      setItems(projectItems);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [projectId]);

  const availableContracts = useMemo(
    () => getAvailableContracts(items),
    [items]
  );
  const availableWorkStreams = useMemo(
    () => getAvailableWorkStreams(items),
    [items]
  );

  useEffect(() => {
    if (filters.workStreams.length === 0 && availableWorkStreams.length) {
      setFilters((prev) => ({ ...prev, workStreams: availableWorkStreams }));
    }
  }, [availableWorkStreams]);

  const filteredItems = useMemo(() => {
    const activeFilters: SOWFilters = {
      contractId: filters.contractId,
      timeRange: filters.timeRange,
      workStreams: filters.workStreams,
    };
    return filterSOW(items, activeFilters);
  }, [items, filters]);

  const totals = useMemo(() => computeTotals(filteredItems), [filteredItems]);
  const grouped = useMemo(
    () => groupByComponent(filteredItems),
    [filteredItems]
  );
  const designItems = grouped.filter((item) => item.workStream === "Design");
  const prepItems = grouped.filter((item) => item.workStream === "Preparatory");
  const constructionItems = grouped.filter(
    (item) => item.workStream === "Construction"
  );
  const quality = useMemo(() => computeQuality(filteredItems), [filteredItems]);
  const spi = useMemo(() => computeSPI(filteredItems), [filteredItems]);

  const plannedPercent = totals.plannedQty === 0 ? 0 : 100;
  const actualPercent =
    totals.plannedQty === 0 ? 0 : (totals.actualQty / totals.plannedQty) * 100;
  const quantityVariance = actualPercent - plannedPercent;
  const valuePercent =
    totals.plannedValue === 0
      ? 0
      : (totals.actualValue / totals.plannedValue) * 100;
  const valueVariance = valuePercent - 100;
  const valueDelta = totals.actualValue - totals.plannedValue;
  const activeContractId = useMemo(() => {
    if (filters.contractId && filters.contractId !== "ALL") {
      return filters.contractId;
    }
    return initialContractId ?? availableContracts[0] ?? null;
  }, [filters.contractId, initialContractId, availableContracts]);

  if (FEATURE_CONTRACT_RIGHT_PANEL_ECHARTS) {
    return <ContractRightPanel contractId={activeContractId} />;
  }

  return (
    <aside
      className="project-productivity pp-rightPanel"
      aria-label="Project productivity insights"
    >
      {loading ? (
        <div className="productivity-skeleton">
          <div className="skeleton skeleton--header" />
          <div className="skeleton skeleton--card" />
          <div className="skeleton skeleton--card" />
          <div className="skeleton skeleton--card" />
        </div>
      ) : (
        <React.Fragment>
          <div className="productivity-heading pt-6 px-6">
            <h3>Project Productivity</h3>
            <span>
              Scope synced with{" "}
              {filters.contractId === "ALL"
                ? "all contracts"
                : filters.contractId}{" "}
              · {filteredItems.length} datapoints
            </span>
          </div>
          <div className="overflow-y-auto project-productivity-scroll px-6">
            <FilterBar
              contracts={availableContracts}
              availableWorkStreams={availableWorkStreams as WorkStream[]}
              state={filters}
              onChange={setFilters}
            />
            <div>
              <PhysicalWorkKPI
                plannedPercent={plannedPercent}
                actualPercent={actualPercent}
                quantityVariance={quantityVariance}
                valueVariance={valueVariance}
                valueDelta={valueDelta}
              />

              <AccordionSection title="Design Work Output">
                <ComponentProgressList items={designItems} />
              </AccordionSection>

              <AccordionSection title="Preparatory Work Output">
                <ComponentProgressList items={prepItems} />
              </AccordionSection>

              <AccordionSection title="Construction Work Output">
                <ComponentProgressList items={constructionItems} />
              </AccordionSection>

              <AccordionSection title="Project Quality Performance">
                <QualitySection data={quality} />
              </AccordionSection>

              <AccordionSection title="Schedule Performance Index (SPI)">
                <SpiSection data={spi} />
              </AccordionSection>
            </div>
          </div>
        </React.Fragment>
      )}
    </aside>
  );
}
