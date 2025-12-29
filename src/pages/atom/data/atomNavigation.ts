export type NavNode = {
  id: string
  label: string
  kind: 'category' | 'section' | 'item'
  children?: NavNode[]
  detailKey?: string
}

export const CATEGORY_ORDER: Array<{ id: string; label: string; tag: string }> = [
  { id: 'actors', label: 'People', tag: 'People' },
  { id: 'materials', label: 'Materials & Elements', tag: 'Materials' },
  { id: 'machinery', label: 'Machinery', tag: 'Machinery' },
  { id: 'consumables', label: 'Consumables', tag: 'Consumables' },
  { id: 'tools', label: 'Tools', tag: 'Tools' },
  { id: 'equipment', label: 'Equipment', tag: 'Equipment' },
  { id: 'systems', label: 'Systems', tag: 'Systems' },
  { id: 'technologies', label: 'Technologies', tag: 'Technologies' },
  { id: 'financials', label: 'Financials', tag: 'Financials' },
]

export const TAG_MAPPING: Record<string, string[]> = {
  People: ['actors'],
  Materials: ['materials'],
  Consumables: ['consumables'],
  Machinery: ['machinery'],
  Tools: ['tools'],
  Equipment: ['equipment'],
  Systems: ['systems'],
  Technologies: ['technologies'],
  Financials: ['financials'],
}

export const NAV_TREE: NavNode[] = [
  {
    id: 'actors',
    label: 'Actors',
    kind: 'category',
    children: [
      {
        id: 'actors-stakeholders',
        label: 'Stakeholders',
        kind: 'section',
        children: [
          {
            id: 'actors-stakeholders-client-wapda',
            label: 'Client · WAPDA',
            kind: 'item',
            detailKey: 'actors-stakeholders-client-wapda',
          },
          {
            id: 'actors-stakeholders-client-dest',
            label: 'Client · DEST',
            kind: 'item',
            detailKey: 'actors-stakeholders-client-dest',
          },
          {
            id: 'actors-stakeholders-contractor-1',
            label: 'Contractor · Aurora Build',
            kind: 'item',
            detailKey: 'actors-stakeholders-contractor-aurora',
          },
          {
            id: 'actors-stakeholders-contractor-2',
            label: 'Contractor · FWO',
            kind: 'item',
            detailKey: 'actors-stakeholders-contractor-frontier',
          },
        ],
      },
      { id: 'actors-teams', label: 'Teams', kind: 'section' },
      {
        id: 'actors-workforce',
        label: 'Workforce',
        kind: 'section',
        children: [
          {
            id: 'actors-workforce-professional',
            label: 'Professional',
            kind: 'section',
            children: [
              {
                id: 'actors-workforce-professional-electrical-engineer',
                label: 'Electrical Engineer',
                kind: 'item',
                detailKey: 'actors-workforce-professional-electrical-engineer',
              },
              {
                id: 'actors-workforce-professional-mechanical-engineer',
                label: 'Mechanical Engineer',
                kind: 'item',
                detailKey: 'actors-workforce-professional-mechanical-engineer',
              },
              {
                id: 'actors-workforce-professional-industrial-engineer',
                label: 'Industrial Engineer',
                kind: 'item',
                detailKey: 'actors-workforce-professional-industrial-engineer',
              },
              {
                id: 'actors-workforce-professional-civil-engineer',
                label: 'Civil Engineer',
                kind: 'item',
                detailKey: 'actors-workforce-professional-civil-engineer',
              },
            ],
          },
          {
            id: 'actors-workforce-labor',
            label: 'Labor',
            kind: 'section',
            children: [
              { id: 'actors-workforce-labor-plumber', label: 'Plumber', kind: 'item' },
              { id: 'actors-workforce-labor-electrician', label: 'Electrician', kind: 'item' },
              { id: 'actors-workforce-labor-turbine-mechanic', label: 'Turbine Mechanic', kind: 'item' },
              { id: 'actors-workforce-labor-excavator-operator', label: 'Excavator Operator', kind: 'item' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'materials',
    label: 'Materials & Elements',
    kind: 'category',
    children: [
      {
        id: 'materials-machinery',
        label: 'Machinery',
        kind: 'section',
        children: [
          {
            id: 'materials-machinery-earthmoving',
            label: 'Earthmoving',
            kind: 'section',
            children: [
              { id: 'materials-machinery-earthmoving-professional', label: 'Professional', kind: 'section' },
              {
                id: 'materials-machinery-earthmoving-excavator',
                label: 'Excavator',
                kind: 'section',
                detailKey: 'machinery-excavator-overview',
                children: [
                  {
                    id: 'materials-machinery-earthmoving-excavator-caterpillar',
                    label: 'Caterpillar',
                    kind: 'section',
                    detailKey: 'machinery-excavator-caterpillar',
                    children: [
                      {
                        id: 'materials-machinery-earthmoving-excavator-caterpillar-cat395',
                        label: 'CAT 395',
                        kind: 'item',
                        detailKey: 'machinery-excavator-caterpillar-cat395',
                      },
                      {
                        id: 'materials-machinery-earthmoving-excavator-caterpillar-cat374',
                        label: 'CAT 374',
                        kind: 'item',
                        detailKey: 'machinery-excavator-caterpillar-cat374',
                      },
                      {
                        id: 'materials-machinery-earthmoving-excavator-caterpillar-cat336',
                        label: 'CAT 336',
                        kind: 'item',
                        detailKey: 'machinery-excavator-caterpillar-cat336',
                      },
                    ],
                  },
                  {
                    id: 'materials-machinery-earthmoving-excavator-john-deere',
                    label: 'John Deere',
                    kind: 'section',
                    detailKey: 'machinery-excavator-john-deere',
                    children: [
                      {
                        id: 'materials-machinery-earthmoving-excavator-john-deere-870g',
                        label: '870G LC',
                        kind: 'item',
                        detailKey: 'machinery-excavator-john-deere-870g',
                      },
                    ],
                  },
                  {
                    id: 'materials-machinery-earthmoving-excavator-komatsu',
                    label: 'Komatsu',
                    kind: 'section',
                    detailKey: 'machinery-excavator-komatsu',
                    children: [
                      {
                        id: 'materials-machinery-earthmoving-excavator-komatsu-pc1250',
                        label: 'PC1250SP-11',
                        kind: 'item',
                        detailKey: 'machinery-excavator-komatsu-pc1250',
                      },
                    ],
                  },
                  {
                    id: 'materials-machinery-earthmoving-excavator-volvo',
                    label: 'Volvo',
                    kind: 'section',
                    detailKey: 'machinery-excavator-volvo',
                    children: [
                      {
                        id: 'materials-machinery-earthmoving-excavator-volvo-ec750e',
                        label: 'EC750E',
                        kind: 'item',
                        detailKey: 'machinery-excavator-volvo-ec750e',
                      },
                    ],
                  },
                ],
              },
              {
                id: 'materials-machinery-earthmoving-tbm',
                label: 'TBM',
                kind: 'section',
                children: [
                  {
                    id: 'materials-machinery-earthmoving-tbm-double-shield',
                    label: 'Double Shield TBM',
                    kind: 'item',
                  },
                ],
              },
              {
                id: 'materials-machinery-earthmoving-bulldozers',
                label: 'Bulldozers',
                kind: 'section',
                children: [
                  {
                    id: 'materials-machinery-earthmoving-bulldozers-d11',
                    label: 'CAT D11',
                    kind: 'item',
                    detailKey: 'machinery-bulldozer-catd11',
                  },
                  { id: 'materials-machinery-earthmoving-bulldozers-d9', label: 'CAT D9', kind: 'item' },
                ],
              },
              {
                id: 'materials-machinery-earthmoving-loaders',
                label: 'Loaders',
                kind: 'section',
                children: [
                  { id: 'materials-machinery-earthmoving-loaders-980', label: 'CAT 980', kind: 'item' },
                  { id: 'materials-machinery-earthmoving-loaders-l120', label: 'Volvo L120', kind: 'item' },
                ],
              },
              {
                id: 'materials-machinery-earthmoving-dump-trucks',
                label: 'Dump Trucks',
                kind: 'section',
                children: [
                  { id: 'materials-machinery-earthmoving-dump-trucks-cat777', label: 'CAT 777D', kind: 'item' },
                  { id: 'materials-machinery-earthmoving-dump-trucks-volvo', label: 'Volvo A60H', kind: 'item' },
                ],
              },
            ],
          },
          {
            id: 'materials-machinery-lifting',
            label: 'Lifting',
            kind: 'section',
            children: [
              { id: 'materials-machinery-lifting-tower-crane', label: 'Tower Crane', kind: 'item', detailKey: 'equipment-tower-crane' },
            ],
          },
        ],
      },
      {
        id: 'materials-consumables',
        label: 'Consumables',
        kind: 'section',
        children: [
          {
            id: 'materials-consumables-fuel',
            label: 'Fuel',
            kind: 'section',
            children: [
              { id: 'materials-consumables-fuel-diesel', label: 'Diesel Tank', kind: 'item' },
              { id: 'materials-consumables-fuel-gasoline', label: 'Gasoline', kind: 'item' },
              { id: 'materials-consumables-fuel-propane', label: 'Propane', kind: 'item' },
            ],
          },
          {
            id: 'materials-consumables-electricity',
            label: 'Electricity',
            kind: 'section',
            children: [
              { id: 'materials-consumables-electricity-hv', label: 'HV Feed', kind: 'item' },
              { id: 'materials-consumables-electricity-lv', label: 'LV Distribution', kind: 'item' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'machinery',
    label: 'Machinery',
    kind: 'category',
    children: [
      {
        id: 'machinery-plant',
        label: 'Plant',
        kind: 'section',
        children: [
          { id: 'machinery-plant-batch-plant', label: 'Batch Plant', kind: 'item', detailKey: 'equipment-batch-plant' },
        ],
      },
      {
        id: 'machinery-support',
        label: 'Support Fleet',
        kind: 'section',
        children: [
          { id: 'machinery-support-forklift', label: 'Telescopic Handler', kind: 'item' },
        ],
      },
    ],
  },
  {
    id: 'consumables',
    label: 'Consumables',
    kind: 'category',
    children: [
      {
        id: 'consumables-chemicals',
        label: 'Chemical Admixtures',
        kind: 'section',
        children: [
          { id: 'consumables-chemicals-water-reducer', label: 'Water Reducer', kind: 'item' },
          { id: 'consumables-chemicals-accelerator', label: 'Accelerator', kind: 'item' },
        ],
      },
      {
        id: 'consumables-metals',
        label: 'Metal Stock',
        kind: 'section',
        children: [
          { id: 'consumables-metals-rebar', label: 'Rebar Stockpile', kind: 'item' },
        ],
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    kind: 'category',
    children: [
      {
        id: 'tools-power',
        label: 'Power Tools',
        kind: 'section',
        children: [
          { id: 'tools-power-rotary-hammer', label: 'Rotary Hammer Drill', kind: 'item', detailKey: 'tools-rotary-hammer' },
          { id: 'tools-power-impact-wrench', label: 'Impact Wrench', kind: 'item', detailKey: 'tools-impact-wrench' },
        ],
      },
      {
        id: 'tools-rebar',
        label: 'Rebar Tools',
        kind: 'section',
        children: [
          { id: 'tools-rebar-tying', label: 'Rebar Tying Gun', kind: 'item', detailKey: 'tools-rebar-tying' },
        ],
      },
      {
        id: 'tools-survey',
        label: 'Survey Tools',
        kind: 'section',
        children: [
          { id: 'tools-survey-laser', label: 'Laser Level', kind: 'item', detailKey: 'tools-laser-level' },
          { id: 'tools-survey-total', label: 'Robotic Total Station', kind: 'item', detailKey: 'tools-total-station' },
        ],
      },
    ],
  },
  {
    id: 'equipment',
    label: 'Equipment',
    kind: 'category',
    children: [
      {
        id: 'equipment-concrete',
        label: 'Concrete Placement',
        kind: 'section',
        children: [
          { id: 'equipment-concrete-pump', label: 'Concrete Pump', kind: 'item' },
        ],
      },
      {
        id: 'equipment-hoisting',
        label: 'Hoisting',
        kind: 'section',
        children: [
          { id: 'equipment-hoisting-tower-crane', label: 'Tower Crane', kind: 'item', detailKey: 'equipment-tower-crane' },
        ],
      },
      {
        id: 'equipment-logistics',
        label: 'Logistics',
        kind: 'section',
        children: [
          { id: 'equipment-logistics-conveyor', label: 'Batch Conveyor', kind: 'item' },
        ],
      },
    ],
  },
  {
    id: 'systems',
    label: 'Systems',
    kind: 'category',
    children: [
      {
        id: 'systems-monitoring',
        label: 'Monitoring Systems',
        kind: 'section',
        children: [
          { id: 'systems-monitoring-vibration', label: 'Structural Vibration Nodes', kind: 'item', detailKey: 'systems-vibration-nodes' },
          { id: 'systems-monitoring-weather', label: 'Micro Weather Station', kind: 'item', detailKey: 'systems-weather-station' },
        ],
      },
      {
        id: 'systems-control',
        label: 'Control Systems',
        kind: 'section',
        children: [
          { id: 'systems-control-plc', label: 'PLC Cabinet', kind: 'item', detailKey: 'systems-plc' },
        ],
      },
    ],
  },
  {
    id: 'technologies',
    label: 'Technologies',
    kind: 'category',
    children: [
      {
        id: 'technologies-reality-capture',
        label: 'Reality Capture',
        kind: 'section',
        children: [
          {
            id: 'technologies-reality-capture-lidar',
            label: 'LiDAR Scanner',
            kind: 'item',
            detailKey: 'technologies-lidar',
          },
          {
            id: 'technologies-reality-capture-concrete-sensor',
            label: 'Concrete Temperature Sensor',
            kind: 'item',
            detailKey: 'technologies-concrete-temp-sensor',
          },
        ],
      },
      {
        id: 'technologies-digital-twin',
        label: 'Digital Twin',
        kind: 'section',
        children: [
          { id: 'technologies-digital-twin-platform', label: 'Digital Twin Platform', kind: 'item' },
        ],
      },
    ],
  },
  {
    id: 'financials',
    label: 'Financials',
    kind: 'category',
    children: [
      {
        id: 'financials-capex',
        label: 'Capital Programs',
        kind: 'section',
        children: [
          { id: 'financials-capex-equipment', label: 'Equipment Lease Pool', kind: 'item', detailKey: 'financials-lease-pool' },
          { id: 'financials-capex-fleet', label: 'Fleet Renewal Reserve', kind: 'item', detailKey: 'financials-fleet-reserve' },
        ],
      },
      {
        id: 'financials-opex',
        label: 'Operational Funds',
        kind: 'section',
        children: [
          { id: 'financials-opex-consumables', label: 'Consumable Replenishment', kind: 'item', detailKey: 'financials-consumable-fund' },
          { id: 'financials-opex-contingency', label: 'Risk Contingency', kind: 'item', detailKey: 'financials-contingency' },
        ],
      },
    ],
  },
]

const collectExpandableNodes = (nodes: NavNode[], acc: string[] = []) => {
  nodes.forEach((node) => {
    if (node.children && node.children.length) {
      acc.push(node.id)
      collectExpandableNodes(node.children, acc)
    }
  })
  return acc
}

export const DEFAULT_EXPANDED_IDS = collectExpandableNodes(NAV_TREE)

const buildCategoryMap = (nodes: NavNode[], parentCategory: string | null = null, map = new Map<string, string>()) => {
  nodes.forEach((node) => {
    const category = node.kind === 'category' ? node.id : parentCategory
    if (category) {
      map.set(node.id, category)
    }
    if (node.children) {
      buildCategoryMap(node.children, category ?? parentCategory, map)
    }
  })
  return map
}

export const NAV_CATEGORY_MAP = buildCategoryMap(NAV_TREE)

const buildParentMap = (nodes: NavNode[], parentId: string | null = null, map = new Map<string, string | null>()) => {
  nodes.forEach((node) => {
    map.set(node.id, parentId)
    if (node.children) {
      buildParentMap(node.children, node.id, map)
    }
  })
  return map
}

export const NAV_PARENT_MAP = buildParentMap(NAV_TREE)

export const findNavIdForCategory = (category: string): string | undefined => {
  for (const [nodeId, nodeCategory] of NAV_CATEGORY_MAP.entries()) {
    if (nodeCategory === category) {
      return nodeId
    }
  }
  return undefined
}

export const findNavNodeByDetailKey = (detailKey: string): { node: NavNode; path: string[] } | null => {
  const dfs = (nodes: NavNode[], ancestors: string[]): { node: NavNode; path: string[] } | null => {
    for (const node of nodes) {
      const nextAncestors = [...ancestors, node.id]
      if (node.detailKey === detailKey) {
        return { node, path: nextAncestors }
      }
      if (node.children) {
        const result = dfs(node.children, nextAncestors)
        if (result) {
          return result
        }
      }
    }
    return null
  }

  return dfs(NAV_TREE, [])
}
