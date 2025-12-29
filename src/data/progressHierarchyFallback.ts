import type { ProgressHierarchyResponse } from '../api'

const projects: ProgressHierarchyResponse['projects'] = [
  {
    code: 'diamer-basha',
    name: 'Diamer Basha Dam Program',
    contracts: [
      {
        code: 'mw-01-main-dam',
        name: 'MW-01 Main Dam',
        sows: [
          {
            code: 'mw-01-rcc',
            name: 'RCC Dam Works',
            processes: [
              { code: 'mw-01-rcc-pouring', name: 'RCC Daily Pour' },
              { code: 'mw-01-batching', name: 'Batching Plant Ops' },
              { code: 'mw-01-dam-pit', name: 'Dam Pit Excavation' },
            ],
          },
          {
            code: 'mw-01-struct',
            name: 'Structural Works',
            processes: [
              { code: 'mw-01-formwork', name: 'Formwork & Rebar' },
              { code: 'mw-01-qaqc', name: 'QA/QC Closeout' },
            ],
          },
        ],
      },
      {
        code: 'mw-02-powerhouse',
        name: 'MW-02 Powerhouse',
        sows: [
          {
            code: 'mw-02-power',
            name: 'Powerhouse Works',
            processes: [
              { code: 'mw-02-tbm-launch', name: 'TBM Launch Chamber' },
              { code: 'mw-02-electro', name: 'Electromechanical Install' },
              { code: 'mw-02-commission', name: 'Commissioning Prep' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'mohmand-dam',
    name: 'Mohmand Dam Hydropower Project',
    contracts: [
      {
        code: 'cw-01-civil-works',
        name: 'CW-01 Civil Works',
        sows: [
          {
            code: 'cw-01-diversion',
            name: 'Diversion Tunnel Works',
            processes: [
              { code: 'cw-01-tunnel-exc', name: 'Tunnel Excavation' },
              { code: 'cw-01-lining', name: 'Tunnel Lining' },
            ],
          },
          {
            code: 'cw-01-embankment',
            name: 'Embankment Construction',
            processes: [
              { code: 'cw-01-fill', name: 'Zonated Fill Placement' },
              { code: 'cw-01-grouting', name: 'Foundation Grouting' },
            ],
          },
        ],
      },
      {
        code: 'em-01-electrical',
        name: 'EM-01 Power Systems',
        sows: [
          {
            code: 'em-01-switchyard',
            name: '132kV Switchyard',
            processes: [
              { code: 'em-01-equipment', name: 'Equipment Installation' },
              { code: 'em-01-testing', name: 'Protection Testing' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'dasu-hpp',
    name: 'Dasu Hydropower Project',
    contracts: [
      {
        code: 'mw-01-main-works',
        name: 'MW-01 Main Works',
        sows: [
          {
            code: 'mw-01-river-diversion',
            name: 'River Diversion',
            processes: [
              { code: 'mw-01-cofferdam', name: 'Cofferdam Construction' },
              { code: 'mw-01-diversion', name: 'Diversion Channel' },
            ],
          },
          {
            code: 'mw-01-spillway',
            name: 'Spillway Construction',
            processes: [
              { code: 'mw-01-gates', name: 'Radial Gate Fabrication' },
              { code: 'mw-01-powerhouse', name: 'Powerhouse Superstructure' },
            ],
          },
        ],
      },
      {
        code: 'mw-02-transmission',
        name: 'MW-02 Transmission',
        sows: [
          {
            code: 'mw-02-right-bank',
            name: 'Right Bank Towers',
            processes: [
              { code: 'mw-02-foundations', name: 'Tower Foundations' },
              { code: 'mw-02-stringing', name: 'Conductor Stringing' },
            ],
          },
        ],
      },
    ],
  },
]

export function getProgressHierarchyFallback(): ProgressHierarchyResponse {
  return {
    asOf: new Date().toISOString(),
    projects: JSON.parse(JSON.stringify(projects)),
  }
}
