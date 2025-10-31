export type AtomDetailInfo = {
  atomId: string
  atomName: string
  provider: string
  owner: string
  description: string
  mainClass: string
  subClass1: string
  subClass2: string
  image: string
}

export type AtomDetailContent = {
  info: AtomDetailInfo
  attributes?: Array<{ label: string; value: string }>
  mobilization?: Array<{ location: string; window: string; status: string; metadata?: Record<string, string> }>
  adaptiveLayer?: {
    sensors: string[]
    telemetry: string[]
    maintenance: string[]
  }
  collaboration?: Array<{ team: string; role: string; contact: string }>
  manifestationSource?: { vendor: string; machineType: string; model: string }
}

export type AtomDetailKey = keyof typeof ATOM_DETAIL_LIBRARY

export const ATOM_DETAIL_LIBRARY: Record<string, AtomDetailContent> = {
  'machinery-excavator-overview': {
    info: {
      atomId: 'EXC-PORTFOLIO',
      atomName: 'Excavator Fleet Overview',
      provider: 'Multiple OEMs',
      owner: 'HydroBuild Operations',
      description:
        'Tracked excavators deployed across the Diamer Basha packages for mass excavation, bench cutting, and cofferdam shaping. Fleet spans high-production 90t class machines down to agile trim excavators for final shaping.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Excavator',
      image: '/images/jpg_output/excavator.jpg',
    },
    mobilization: [
      { location: 'Dam pit excavation', window: 'Oct 2024 – present', status: 'Engaged' },
      { location: 'Spillway excavation', window: 'Aug 2024 – Mar 2025', status: 'Engaged' },
    ],
    adaptiveLayer: {
      sensors: ['Machine control GNSS receivers', 'Payload scales integrated to Progress Twin'],
      telemetry: ['VisionLink + JDLink feeds unified into Operations console', 'Cycle counts synced nightly to scheduling adapter'],
      maintenance: ['Greasing every 50 hrs via auto-lube', 'Oil sampling at 500 hr intervals'],
    },
  },
  'machinery-excavator-caterpillar': {
    info: {
      atomId: 'CAT395T4-001',
      atomName: 'CAT 395 - Tier 4',
      provider: 'Caterpillar Inc.',
      owner: 'Nevada Heavy Equipment Rentals',
      description:
        'The CAT 395 is a high-production excavator built for large-scale earthmoving. A CAT C18 engine with advanced hydraulics delivers precise control and 10% lower fuel burn than previous models while meeting Tier 4 Final emissions.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Excavator',
      image: '/images/jpg_output/excavator_1.jpg',
    },
    attributes: [
      { label: 'Operating weight', value: '94,500 kg' },
      { label: 'Engine', value: 'CAT C18, 543 kW' },
      { label: 'Bucket capacity', value: '5.0 m³ rock bucket' },
      { label: 'Hydraulic flow', value: '2 × 410 L/min' },
      { label: 'Telematics', value: 'VisionLink + Payload Assist' },
    ],
    mobilization: [
      { location: 'RCC Pour Yard', window: 'Apr 2025 – present', status: 'Engaged' },
      { location: 'River Diversion Cut', window: 'Jan 2025 – Mar 2025', status: 'Completed' },
    ],
    adaptiveLayer: {
      sensors: ['Boom strain gauges', 'Real-time payload cells', 'Proximity lidar for swing radius'],
      telemetry: ['Fuel efficiency trending 8% better than baseline', 'Auto idle + hydraulic smart mode active'],
      maintenance: ['Grease circuits every 50 hrs', 'Engine service interval 500 hrs', 'Next oil analysis due 20 May 2025'],
    },
    collaboration: [
      { team: 'Earthworks JV', role: 'Lead operator', contact: 'Samantha Pruitt' },
      { team: 'Digital Twin Group', role: 'Telemetry analyst', contact: 'Luis Marquez' },
      { team: 'Safety & Access', role: 'Permit coordinator', contact: 'Mira Chen' },
    ],
  },
  'machinery-excavator-caterpillar-cat395': {
    info: {
      atomId: 'CAT395T4-PRIME',
      atomName: 'CAT 395 Tier 4 Production Excavator',
      provider: 'Caterpillar Inc.',
      owner: 'Nevada Heavy Equipment Rentals',
      description:
        'Production-class excavator configured for high-output bench loading with Payload Assist and on-board auto-lube. Supports 5 m³ rock buckets and VisionLink telematics for cycle analytics.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Excavator',
      image: '/images/jpg_output/excavator.jpg',
    },
    mobilization: [
      { location: 'Dam pit east wall', window: 'Mar 2025 – present', status: 'Engaged' },
      { location: 'River diversion cut', window: 'Nov 2024 – Feb 2025', status: 'Completed' },
    ],
    adaptiveLayer: {
      sensors: ['Payload assist boom sensors', 'VisionLink telemetry gateway', '360° camera suite'],
      telemetry: ['Cycle efficiency reported to Progress Twin nightly', 'Fuel burn variance alerts forwarded to plant & fleet'],
      maintenance: ['Automatic grease refill every 48 hours', 'Hydraulic oil analysis every 500 hours'],
    },
    manifestationSource: { vendor: 'Caterpillar', machineType: 'Excavator', model: '395' },
  },
  'machinery-excavator-caterpillar-cat374': {
    info: {
      atomId: 'CAT374-CORE',
      atomName: 'CAT 374 Next Gen Excavator',
      provider: 'Caterpillar Inc.',
      owner: 'High Sierra Logistics',
      description:
        '74-ton class excavator balancing mass excavation performance with transport flexibility. Boom and stick sensors coordinate with 2D E-fence for bench safety.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Excavator',
      image: '/images/jpg_output/excavator_2.jpg',
    },
    mobilization: [
      { location: 'Left abutment benches', window: 'Feb 2025 – present', status: 'Engaged' },
      { location: 'Spillway approach trimming', window: 'Oct 2024 – Jan 2025', status: 'Completed' },
    ],
    adaptiveLayer: {
      sensors: ['2D E-fence with GNSS receivers', 'Onboard payload estimator'],
      telemetry: ['Cycle assist data synced to BIM 360 nightly'],
      maintenance: ['Undercarriage inspection scheduled every 750 hours'],
    },
    manifestationSource: { vendor: 'Caterpillar', machineType: 'Excavator', model: '374' },
  },
  'machinery-excavator-caterpillar-cat336': {
    info: {
      atomId: 'CAT336-GRADE',
      atomName: 'CAT 336 Smart Excavator',
      provider: 'Caterpillar Inc.',
      owner: 'SiteWorks Partners',
      description:
        '36-ton excavator equipped with factory-integrated Cat Grade, swing priority modes, and cold-weather package for year-round trim excavation.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Excavator',
      image: '/images/jpg_output/excavator_operator.jpg',
    },
    mobilization: [
      { location: 'Intake structure trimming', window: 'Apr 2025 – present', status: 'Engaged' },
      { location: 'Batch plant utility trenching', window: 'Dec 2024 – Mar 2025', status: 'Completed' },
    ],
    adaptiveLayer: {
      sensors: ['Cat Grade 2D system', 'Cold-weather monitoring sensors'],
      telemetry: ['Grade assist logs exported weekly for QA/QC'],
      maintenance: ['Swing bearing inspection every 1,000 hours'],
    },
    manifestationSource: { vendor: 'Caterpillar', machineType: 'Excavator', model: '336' },
  },
  'machinery-excavator-john-deere': {
    info: {
      atomId: 'JD870G-014',
      atomName: 'John Deere 870G LC',
      provider: 'John Deere Construction & Forestry',
      owner: 'Frontier Earthworks JV',
      description:
        'The 870G LC delivers precise mass excavation with a high-efficiency hydraulic system. Integrated grade guidance and Auto-IDLE features keep cycle times tight while reducing operating cost.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Excavator',
      image: '/images/jpg_output/excavator_2.jpg',
    },
    attributes: [
      { label: 'Operating weight', value: '84,000 kg' },
      { label: 'Engine', value: 'Isuzu 15.7 L, 470 kW' },
      { label: 'Boom reach', value: '11.3 m mass excavation boom' },
      { label: 'Grade control', value: 'SmartGrade ready with dual GNSS' },
      { label: 'Service interval', value: 'Oil change every 500 hrs' },
    ],
    mobilization: [
      { location: 'Bench excavation package', window: 'Jan 2025 – present', status: 'Engaged' },
      { location: 'Spillway cofferdam shaping', window: 'Aug 2024 – Nov 2024', status: 'Completed' },
    ],
    adaptiveLayer: {
      sensors: ['SmartGrade dual GNSS', 'Payload monitoring'],
      telemetry: ['JDLink data exported nightly'],
      maintenance: ['Filter service every 500 hours'],
    },
  },
  'machinery-excavator-john-deere-870g': {
    info: {
      atomId: 'JD870G-PORT',
      atomName: 'John Deere 870G LC Production',
      provider: 'John Deere Construction & Forestry',
      owner: 'Frontier Earthworks JV',
      description:
        'Production excavator configured with 6.5 m³ rock bucket and SmartGrade control. Supports remote health monitoring and Auto-Grease for extended duty shifts.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Excavator',
      image: '/images/jpg_output/excavator_2.jpg',
    },
    mobilization: [
      { location: 'Dam pit haul', window: 'Feb 2025 – present', status: 'Engaged' },
      { location: 'Spillway access bench', window: 'Oct 2024 – Jan 2025', status: 'Completed' },
    ],
    adaptiveLayer: {
      sensors: ['SmartGrade GNSS', 'Payload sensors'],
      telemetry: ['JDLink telematics integrated with ACCS'],
      maintenance: ['Auto-grease system service every 45 days'],
    },
    manifestationSource: { vendor: 'John Deere', machineType: 'Excavator', model: '870G' },
  },
  'machinery-excavator-komatsu': {
    info: {
      atomId: 'KMT-PC1250-01',
      atomName: 'Komatsu PC1250-11',
      provider: 'Komatsu Mining',
      owner: 'Summit Plant & Fleet',
      description:
        '125-ton class mass excavator with advanced hydraulic monitoring and KOMTRAX Plus telematics. High-pressure system supports rock buckets for dam excavation.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Excavator',
      image: '/images/jpg_output/excavator.jpg',
    },
    attributes: [
      { label: 'Operating weight', value: '115,000 kg' },
      { label: 'Engine', value: 'Komatsu SDA12V159, 578 kW' },
      { label: 'Bucket capacity', value: '6.7 m³ rock bucket' },
      { label: 'Hydraulic flow', value: '3 × 330 L/min' },
      { label: 'Telematics', value: 'KOMTRAX Plus' },
    ],
    mobilization: [
      { location: 'Right bank excavation', window: 'Dec 2024 – present', status: 'Engaged' },
      { location: 'Cofferdam shaping', window: 'Aug 2024 – Nov 2024', status: 'Completed' },
    ],
    adaptiveLayer: {
      sensors: ['Boom pressure sensors', 'Swing torque monitoring'],
      telemetry: ['KOMTRAX Plus feeds to plant dashboard'],
      maintenance: ['Hydraulic inspection every 400 hours'],
    },
    manifestationSource: { vendor: 'Komatsu', machineType: 'Excavator', model: 'PC1250' },
  },
  'machinery-excavator-komatsu-pc1250': {
    info: {
      atomId: 'KMT-PC1250SP-11',
      atomName: 'Komatsu PC1250SP-11',
      provider: 'Komatsu Mining',
      owner: 'Summit Plant & Fleet',
      description:
        'Super performance configuration of the PC1250 optimized for high-density rock excavation with reinforced boom and bucket linkage.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Excavator',
      image: '/images/jpg_output/excavator.jpg',
    },
    mobilization: [
      { location: 'Diversion tunnel portal', window: 'Jan 2025 – present', status: 'Engaged' },
      { location: 'Spoil pile shaping', window: 'Sep 2024 – Dec 2024', status: 'Completed' },
    ],
    adaptiveLayer: {
      sensors: ['Boom pressure sensors', 'Swing torque monitoring'],
      telemetry: ['KOMTRAX Plus feeds to plant dashboard'],
      maintenance: ['Hydraulic inspection every 400 hours'],
    },
    manifestationSource: { vendor: 'Komatsu', machineType: 'Excavator', model: 'PC1250' },
  },
  'machinery-excavator-volvo': {
    info: {
      atomId: 'VOL-EC750E-01',
      atomName: 'Volvo EC750E',
      provider: 'Volvo Construction Equipment',
      owner: 'Nordic Plant & Fleet',
      description:
        'High-production excavator with Volvo Co-Pilot Dig Assist guidance, Stage V engine, and electro-hydraulic control for fuel-efficient heavy excavation.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Excavator',
      image: '/images/jpg_output/excavator_2.jpg',
    },
    attributes: [
      { label: 'Operating weight', value: '73,500 kg' },
      { label: 'Engine', value: 'Volvo D16J, 374 kW' },
      { label: 'Bucket capacity', value: '5.7 m³' },
      { label: 'Telematics', value: 'Volvo CareTrack + Dig Assist' },
      { label: 'Hydraulic system', value: 'Intelligent electro-hydraulic control' },
    ],
    mobilization: [
      { location: 'Powerhouse excavation', window: 'Nov 2024 – present', status: 'Engaged' },
      { location: 'Spoil handling', window: 'Aug 2024 – Oct 2024', status: 'Completed' },
    ],
    adaptiveLayer: {
      sensors: ['Dig Assist GNSS', 'Payload system'],
      telemetry: ['CareTrack telematics to ACCS'],
      maintenance: ['Engine diagnostics every 250 hours'],
    },
    manifestationSource: { vendor: 'Volvo', machineType: 'Excavator', model: 'EC750E' },
  },
  'machinery-excavator-volvo-ec750e': {
    info: {
      atomId: 'VOL-EC750E-PRO',
      atomName: 'Volvo EC750E High Reach',
      provider: 'Volvo Construction Equipment',
      owner: 'Nordic Plant & Fleet',
      description:
        'Configured EC750E for mass excavation and high-reach trimming with Dig Assist 3D guidance, enabling precision bench shaping.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Excavator',
      image: '/images/jpg_output/excavator_2.jpg',
    },
    mobilization: [
      { location: 'Right bank bench trimming', window: 'Jan 2025 – present', status: 'Engaged' },
      { location: 'Spillway plug excavation', window: 'Sep 2024 – Dec 2024', status: 'Completed' },
    ],
    adaptiveLayer: {
      sensors: ['Dig Assist 3D', 'Payload sensors'],
      telemetry: ['CareTrack telematics integrated with Operations hub'],
      maintenance: ['Hydraulic filter change every 400 hours'],
    },
    manifestationSource: { vendor: 'Volvo', machineType: 'Excavator', model: 'EC750E' },
  },
  'machinery-bulldozer-catd11': {
    info: {
      atomId: 'CATD11-RIPPER',
      atomName: 'CAT D11 Dozer · Production Ripper',
      provider: 'Caterpillar Inc.',
      owner: 'Frontier Earthworks JV',
      description:
        'Flagship production dozer configured with dual-shank ripper, impact-resistant blade, and auto-carry. Assigned to quarry prep and main dam benches with VisionLink telemetry for load management.',
      mainClass: 'Machinery',
      subClass1: 'Earthmoving',
      subClass2: 'Bulldozer',
      image: '/images/jpg_output/excavator_2.jpg',
    },
    attributes: [
      { label: 'Operating weight', value: '115,000 kg' },
      { label: 'Blade capacity', value: '43.6 m³', },
      { label: 'Ripper shank', value: 'Dual, automated depth control' },
      { label: 'Traction control', value: 'Terrain-for-Dozers active' },
    ],
    mobilization: [
      {
        location: 'Quarry high wall',
        window: 'Jan 2025 – present',
        status: 'Engaged',
        metadata: { node: 'Fuel level', action: 'Auto refuel trigger', readiness: 'Night shift' },
      },
      {
        location: 'Borrow pit ripping',
        window: 'Oct 2024 – Dec 2024',
        status: 'Completed',
        metadata: { node: 'Ripper depth plan', outcome: 'Trials complete' },
      },
    ],
    adaptiveLayer: {
      sensors: ['Blade load strain network', 'GNSS dual-antenna grade control', 'Transmission temp monitor'],
      telemetry: ['Auto carry tuning pushed from fleet HQ', 'Cycle payload linked to production planning'],
      maintenance: ['Undercarriage inspection every 250 hrs', 'Ripper shank change-out logged automatically'],
    },
    manifestationSource: { vendor: 'Caterpillar', machineType: 'Bulldozer', model: 'D11' },
  },
  'actors-stakeholders-client-wapda': {
    info: {
      atomId: 'f0000000-0000-0000-0000-000000000600',
      atomName: 'Water & Power Development Authority',
      provider: 'Owner Representative',
      owner: 'Government of Pakistan',
      description:
        'Primary client overseeing hydropower delivery. Provides approvals, compliance oversight, and interface to federal funding channels.',
      mainClass: 'People',
      subClass1: 'Stakeholders',
      subClass2: 'Client',
      image: '/images/jpg_output/contractor.jpg',
    },
    mobilization: [
      {
        location: 'Owner site office',
        window: 'Jul 2023 – present',
        status: 'Engaged',
        metadata: { node: 'Approval SLA', value: '48h', trigger: 'Change control' },
      },
      {
        location: 'Islamabad HQ',
        window: 'Jan 2023 – Jun 2023',
        status: 'Completed',
        metadata: { node: 'Governance review', cadence: 'Quarterly' },
      },
    ],
    adaptiveLayer: {
      sensors: ['Reporting cadence: weekly progress board', 'Financial drawdown tracker'],
      telemetry: ['Issue resolution SLA 48h', 'Change approvals integrated with contract tools'],
      maintenance: ['Annual audit and governance review', 'Stakeholder alignment workshop every quarter'],
    },
  },
  'actors-stakeholders-client-dest': {
    info: {
      atomId: 'CLIENT-DEST',
      atomName: 'Diamer Earthworks Special Team',
      provider: 'Owner Representative',
      owner: 'DEST Program Office',
      description:
        'Owner’s technical steering committee coordinating geotechnical, structural, and environmental compliance streams.',
      mainClass: 'People',
      subClass1: 'Stakeholders',
      subClass2: 'Client',
      image: '/images/jpg_output/construction_crew_workers.jpg',
    },
    mobilization: [
      {
        location: 'DEST technical suite',
        window: 'Mar 2024 – present',
        status: 'Engaged',
        metadata: { node: 'Design readiness index', cadence: 'Bi-weekly' },
      },
      {
        location: 'Geotech remote lab',
        window: 'Sep 2023 – Feb 2024',
        status: 'Completed',
        metadata: { node: 'Core sample KPI', result: 'Completed' },
      },
    ],
    adaptiveLayer: {
      sensors: ['Design review workflow', 'Risk radar board'],
      telemetry: ['Bi-weekly design readiness score', 'Permit action tracker'],
      maintenance: ['Independent peer review every 6 months', 'Owner alignment meetings monthly'],
    },
  },
  'actors-stakeholders-contractor-aurora': {
    info: {
      atomId: 'f0000000-0000-0000-0000-000000000500',
      atomName: 'Aurora Build Consortium',
      provider: 'Civil Works Contractor',
      owner: 'Aurora Build',
      description:
        'Prime contractor executing concrete, structural, and finish scopes for main dam. Integrated telemetry for workforce hours and equipment readiness.',
      mainClass: 'People',
      subClass1: 'Stakeholders',
      subClass2: 'Contractor',
      image: '/images/jpg_output/construction engineer.jpg',
    },
    mobilization: [
      {
        location: 'Main dam benches',
        window: 'Apr 2024 – present',
        status: 'Engaged',
        metadata: { node: 'Crew utilization', value: '78%' },
      },
      {
        location: 'Batch plant erection',
        window: 'Jan 2024 – Mar 2024',
        status: 'Completed',
        metadata: { node: 'Commissioning milestone', status: 'Complete' },
      },
    ],
    adaptiveLayer: {
      sensors: ['Daily manpower check-in', 'HSSE permit dashboard'],
      telemetry: ['Crew utilization piped to CCC', 'Equipment readiness handshake with Plant & Fleet'],
      maintenance: ['Weekly coordination with client controls', 'Monthly safety stand-down'],
    },
    manifestationSource: { vendor: 'Aurora Build', machineType: 'Contractor', model: 'Aurora Build Consortium' },
  },
  'actors-stakeholders-contractor-frontier': {
    info: {
      atomId: 'f0000000-0000-0000-0000-000000000501',
      atomName: 'Frontier Civil Partners',
      provider: 'Heavy Civils Contractor',
      owner: 'Frontier Civil Partners',
      description:
        'Specialist contractor managing quarry development, haul roads, and heavy plant logistics. Provides live telemetry on truck cycles and crew fatigue.',
      mainClass: 'People',
      subClass1: 'Stakeholders',
      subClass2: 'Contractor',
      image: '/images/jpg_output/excavator_operator.jpg',
    },
    mobilization: [
      {
        location: 'Quarry haul network',
        window: 'Dec 2023 – present',
        status: 'Engaged',
        metadata: { node: 'Cycle time', target: '18 min' },
      },
      {
        location: 'River diversion access',
        window: 'Aug 2023 – Nov 2023',
        status: 'Completed',
        metadata: { node: 'Logistics lead time', value: '3 weeks' },
      },
    ],
    adaptiveLayer: {
      sensors: ['Haul cycle tracking', 'Fatigue management alerts'],
      telemetry: ['Truck turnaround variance trending', 'Fuel burn shared with client every 4 hours'],
      maintenance: ['Bi-weekly logistics review', 'Maintenance pre-shift briefings'],
    },
    manifestationSource: { vendor: 'Frontier Civil Partners', machineType: 'Contractor', model: 'Frontier Civil Partners' },
  },
  'actors-workforce-professional-electrical-engineer': {
    info: {
      atomId: 'ENG-EE-042',
      atomName: 'Lead Electrical Engineer · Grid Integration',
      provider: 'HydroGrid Talent Network',
      owner: 'Aurora Build JV',
      description:
        'High-voltage specialist orchestrating commissioning of the 500 kV switchyard, digital protection relays, and power quality monitoring for the Diamer Basha program.',
      mainClass: 'People',
      subClass1: 'Workforce',
      subClass2: 'Professional',
      image: '/images/jpg_output/construction engineer.jpg',
    },
    attributes: [
      { label: 'Specialisation', value: 'HV substation & protection coordination' },
      { label: 'Licensure', value: 'Professional Engineer (Punjab) · NFPA 70E qualified' },
      { label: 'Digital footprint', value: 'Owner of the switchyard digital twin and relay logic library' },
      { label: 'Readiness index', value: '0.92 · updated weekly from competence matrix' },
    ],
    mobilization: [
      {
        location: 'MW-01 Main Dam switchyard',
        window: 'Feb 2025 – present',
        status: 'Engaged',
        metadata: { readinessKpi: 'Energised circuits signed-off: 9 / 10', shift: 'Days' },
      },
      {
        location: 'MW-02 powerhouse GIS hall',
        window: 'Sep 2024 – Jan 2025',
        status: 'Completed',
        metadata: { readinessKpi: 'Commissioning punchlist cleared: 96%' },
      },
    ],
    adaptiveLayer: {
      sensors: ['Daily crew sentiment pulse survey', 'Competence matrix paired with LMS completions'],
      telemetry: ['Live relay settings variance flagged in Operations Hub', 'Incident-free hours: 480 and counting'],
      maintenance: ['Bi-weekly knowledge share with protection OEM', 'Quarterly FAT witness refresher'],
    },
    collaboration: [
      { team: 'Grid Interface PMO', role: 'Commissioning lead', contact: 'farah.ahmed@aurorajv.com' },
      { team: 'Operations Control Centre', role: 'Protection analyst', contact: 'controlcentre@hydrobuild.com' },
    ],
    manifestationSource: { vendor: 'Professional Registry', machineType: 'Human capital', model: 'Electrical Engineer · Level 5' },
  },
  'actors-workforce-professional-mechanical-engineer': {
    info: {
      atomId: 'ENG-ME-019',
      atomName: 'Mechanical Engineer · Heavy Plant Reliability',
      provider: 'Plant Reliability Collective',
      owner: 'HydroBuild Operations',
      description:
        'Leads predictive maintenance and shutdown planning for batching plants, penstock fabrication, and lifting systems. Blends vibration analytics with field mentoring.',
      mainClass: 'People',
      subClass1: 'Workforce',
      subClass2: 'Professional',
      image: '/images/jpg_output/construction_crew_workers.jpg',
    },
    attributes: [
      { label: 'Core focus', value: 'Rotating equipment reliability & fluid systems' },
      { label: 'Toolstack', value: 'Azure IoT, Maximo, handheld vib analyzers' },
      { label: 'Certifications', value: 'API 673 · SKF Category II Analyst' },
      { label: 'Readiness index', value: '0.88 · tracked via competency and fatigue model' },
    ],
    mobilization: [
      {
        location: 'Batch Plant Alpha',
        window: 'Apr 2025 – present',
        status: 'Engaged',
        metadata: { readinessKpi: 'Mean time between alarms: 480 hrs', shift: 'Days' },
      },
      {
        location: 'Penstock fabrication yard',
        window: 'Nov 2024 – Mar 2025',
        status: 'Completed',
        metadata: { readinessKpi: 'Critical lift readiness: 100% with no delays' },
      },
    ],
    adaptiveLayer: {
      sensors: ['Vibration signature tracker', 'Thermal imaging rounds ingested to Power BI'],
      telemetry: ['MTBF trend shared with plant & fleet', 'Auto-generated spares burn-down each Monday'],
      maintenance: ['Root cause clinics bi-monthly', 'Mentors technicians on lockout-tagout refinements'],
    },
    collaboration: [
      { team: 'Asset Performance Cell', role: 'Reliability engineer', contact: 'sohail.malik@hydrobuild.com' },
      { team: 'Site Operations', role: 'Plant superintendent', contact: 'plantops@hydrobuild.com' },
    ],
    manifestationSource: { vendor: 'Talent Cloud', machineType: 'Human capital', model: 'Mechanical Engineer · Reliability' },
  },
  'actors-workforce-professional-industrial-engineer': {
    info: {
      atomId: 'ENG-IE-027',
      atomName: 'Industrial Engineer · Lean Delivery Strategist',
      provider: 'FlowWorks Advisory',
      owner: 'Aurora Build JV',
      description:
        'Designs takt plans, labor models, and visual management systems to drive predictable productivity across tunneling, batching, and ancillary works.',
      mainClass: 'People',
      subClass1: 'Workforce',
      subClass2: 'Professional',
      image: '/images/jpg_output/construction_worker.jpeg',
    },
    attributes: [
      { label: 'Focus streams', value: 'Lean construction · constraint removal · digital adoption' },
      { label: 'Analytics stack', value: 'PowerBI, AnyLogic simulation, Obeya boards' },
      { label: 'Certifications', value: 'Lean Six Sigma Black Belt · PMI-SP' },
      { label: 'Readiness index', value: '0.95 · validated via skills radar & wellness score' },
    ],
    mobilization: [
      {
        location: 'Turbine installation workface',
        window: 'Jan 2025 – present',
        status: 'Engaged',
        metadata: { readinessKpi: 'Crew takt adherence: 93%', cadence: 'Weekly Obeya' },
      },
      {
        location: 'Aggregate logistics stream',
        window: 'Aug 2024 – Dec 2024',
        status: 'Completed',
        metadata: { readinessKpi: 'Queue time reduction: 26%' },
      },
    ],
    adaptiveLayer: {
      sensors: ['Digital gemba walks feeding constraint log', 'Wearable fatigue trackers aggregated nightly'],
      telemetry: ['Flow efficiency dashboard with early-warning alerts', 'Sprint retros sync with resource planning'],
      maintenance: ['Quarterly capability refresh workshops', 'Shadow-coaching for section engineers'],
    },
    collaboration: [
      { team: 'Integrated Planning Office', role: 'Lean facilitator', contact: 'lean.office@aurorajv.com' },
      { team: 'HR Capability Cell', role: 'Skills architect', contact: 'capability@hydrobuild.com' },
    ],
    manifestationSource: { vendor: 'Talent Cloud', machineType: 'Human capital', model: 'Industrial Engineer · Lean Strategist' },
  },
  'actors-workforce-professional-civil-engineer': {
    info: {
      atomId: 'ENG-CE-034',
      atomName: 'Senior Civil Engineer · RCC Structures',
      provider: 'FWO Engineering Corps',
      owner: 'FWO',
      description:
        'Multi-discipline civil engineer directing RCC pour sequencing, structural QA/QC, and field engineering interface between design house and construction crews.',
      mainClass: 'People',
      subClass1: 'Workforce',
      subClass2: 'Professional',
      image: '/images/jpg_output/civic_engineer1.jpg',
    },
    attributes: [
      { label: 'Discipline focus', value: 'Mass concrete & structural works' },
      { label: 'Experience', value: '12 years · RCC dams & hydropower tunnels' },
      { label: 'Education', value: 'MS Civil Engineering · UET Lahore' },
      { label: 'Professional credentials', value: 'PEC Registered Engineer · ACI Concrete Field Testing Grade 1' },
      { label: 'Contact', value: '+92-300-555-8921 · civil.engineer@fwo.pk' },
      { label: 'Digital toolchain', value: 'BIM 360 · Primavera · FieldVu for QA checklists' },
    ],
    mobilization: [
      {
        location: 'RCC Pour Yard · Lift L14',
        window: 'Mar 2025 – present',
        status: 'Engaged',
        metadata: {
          readinessKpi: 'Thermal control compliance 98%',
          crewReadiness: 'Supervisory roster fully staffed',
          shift: 'Day',
        },
      },
      {
        location: 'Cofferdam buttress remediation',
        window: 'Nov 2024 – Feb 2025',
        status: 'Completed',
        metadata: {
          readinessKpi: 'Non-conformance closeout 100%',
          lessonsLearned: 'Rebar congestion review updated to BIM',
        },
      },
    ],
    adaptiveLayer: {
      sensors: ['Wellness & fatigue survey pulse', 'Competence matrix tracking speciality skills', 'Daily QA digital checklist completion'],
      telemetry: [
        'Hydration plan adherence piped to construction command centre',
        'Structural RFIs turnaround 12h average (target 16h)',
        'Concrete maturity dashboard integrates with engineer approvals',
      ],
      maintenance: [
        'Monthly technical deep-dives with design consultant',
        'Quarterly professional development on latest RCC specs',
        'Mentorship pairing with junior field engineers',
      ],
    },
    collaboration: [
      { team: 'Design House Interface Office', role: 'Field design coordinator', contact: 'interface.office@fwo.pk' },
      { team: 'Construction Command Centre', role: 'Structural QA/QC lead', contact: 'ccc.structures@aurorajv.com' },
      { team: 'Digital Twin Cell', role: 'Model update reviewer', contact: 'digital.twin@hydrobuild.com' },
    ],
    manifestationSource: { vendor: 'FWO Talent Pool', machineType: 'CivilEngineer', model: 'RCC Specialist' },
  },
  'technologies-concrete-temp-sensor': {
    info: {
      atomId: 'SEN-CTS-500',
      atomName: 'Concrete Temperature Sensor Array · CTS-500',
      provider: 'ThermoSense Analytics',
      owner: 'Digital Twin Group',
      description:
        'Wireless sensor string embedded in mass concrete lifts to monitor hydration heat, differential, and maturity. Feeds alerts into thermal control dashboard.',
      mainClass: 'Technologies',
      subClass1: 'Reality Capture',
      subClass2: 'Sensing',
      image: '/images/jpg_output/cons_temp_sen2.jpg',
    },
    attributes: [
      { label: 'Sensor nodes', value: '12 per array' },
      { label: 'Sampling interval', value: '1 minute rolling average' },
      { label: 'Ingress rating', value: 'IP68 encapsulated' },
      { label: 'Gateway', value: 'LoRaWAN + LTE failover' },
    ],
    mobilization: [
      {
        location: 'RCC block lift L12',
        window: 'May 2025 – present',
        status: 'Engaged',
        metadata: { node: 'Temperature differential', threshold: '20°C' },
      },
      {
        location: 'Test pour mock-up',
        window: 'Apr 2025',
        status: 'Completed',
        metadata: { node: 'Calibration batch', result: 'Validated' },
      },
    ],
    adaptiveLayer: {
      sensors: ['Thermistor chain ±0.2°C', 'Humidity probe', 'Battery health telemetry'],
      telemetry: ['Real-time feed to thermal dashboard', 'Threshold alerts integrated with control center'],
      maintenance: ['Calibration before each pour cycle', 'Gateway battery check 48h'],
    },
    manifestationSource: { vendor: 'ThermoSense Analytics', machineType: 'Sensor', model: 'CTS-500' },
  },
}

export const hasAtomDetail = (key: string): key is AtomDetailKey => Boolean(ATOM_DETAIL_LIBRARY[key])
