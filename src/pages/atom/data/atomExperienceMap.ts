import { ATOM_DETAIL_LIBRARY, type AtomDetailContent } from './atomDetailLibrary'

export type AtomExperienceConfig = {
  slug: string
  atomUuid?: string
  image?: string
  description?: string
  heroLabel?: string
}

const BASE_CONFIG: Record<string, Partial<AtomExperienceConfig>> = {
  'machinery-excavator-caterpillar-cat395': {
    atomUuid: 'd0000000-0000-0000-0000-000000000010',
    image: '/images/jpg_output/excavator.jpg',
  },
  'machinery-excavator-caterpillar-cat336': {
    atomUuid: 'd0000000-0000-0000-0000-000000000010',
    image: '/images/jpg_output/excavator_2.jpg',
  },
  'machinery-excavator-caterpillar-cat374': {
    atomUuid: 'd0000000-0000-0000-0000-000000000011',
    image: '/images/jpg_output/excavator_1.jpg',
  },
  'machinery-bulldozer-catd11': {
    atomUuid: 'synthetic::bulldozer-catd11',
    image: '/images/jpg_output/excavator_2.jpg',
  },
  'machinery-excavator-volvo-ec750e': {
    atomUuid: 'd0000000-0000-0000-0000-000000000010',
  },
  'actors-workforce-labor-plumber': {
    atomUuid: 'd0000000-0000-0000-0000-000000000001',
    heroLabel: 'Crew profile',
  },
  'actors-workforce-labor-turbine-mechanic': {
    atomUuid: 'd0000000-0000-0000-0000-000000000003',
    heroLabel: 'Specialist technician',
  },
  'actors-workforce-professional-electrical-engineer': {
    atomUuid: 'synthetic::workforce-electrical-engineer',
    image: '/images/jpg_output/construction engineer.jpg',
    heroLabel: 'Senior engineer profile',
  },
  'actors-workforce-professional-mechanical-engineer': {
    atomUuid: 'synthetic::workforce-mechanical-engineer',
    image: '/images/jpg_output/construction_crew_workers.jpg',
    heroLabel: 'Reliability lead overview',
  },
  'actors-workforce-professional-industrial-engineer': {
    atomUuid: 'synthetic::workforce-industrial-engineer',
    image: '/images/jpg_output/construction_worker.jpeg',
    heroLabel: 'Lean strategist dashboard',
  },
  'actors-workforce-professional-civil-engineer': {
    atomUuid: 'd0000000-0000-0000-0000-000000000007',
    image: '/images/jpg_output/civic_engineer1.jpg',
    heroLabel: 'Field engineering mission control',
  },
  'actors-stakeholders-client-wapda': {
    atomUuid: 'f0000000-0000-0000-0000-000000000600',
    image: '/images/jpg_output/contractor.jpg',
  },
  'actors-stakeholders-client-dest': {
    atomUuid: 'synthetic::stakeholder-dest',
    image: '/images/jpg_output/construction_crew_workers.jpg',
  },
  'actors-stakeholders-contractor-aurora': {
    atomUuid: 'f0000000-0000-0000-0000-000000000500',
    image: '/images/jpg_output/construction engineer.jpg',
  },
  'actors-stakeholders-contractor-frontier': {
    atomUuid: 'f0000000-0000-0000-0000-000000000501',
    image: '/images/jpg_output/excavator_operator.jpg',
  },
  'tools-survey-drone': {
    atomUuid: 'd0000000-0000-0000-0000-000000000050',
    image: '/images/jpg_output/construction_worker.jpeg',
  },
  'consumables-fuel-yard': {
    atomUuid: 'd0000000-0000-0000-0000-000000000020',
  },
  'technologies-concrete-temp-sensor': {
    atomUuid: 'f0000000-0000-0000-0000-000000000700',
    image: '/images/jpg_output/cons_temp_sen2.jpg',
  },
}

export type AtomExperienceResolvedConfig = {
  slug: string
  atomUuid: string | null
  library: AtomDetailContent | null
  image: string | null
  description: string | null
  heroLabel?: string
}

export function resolveAtomExperienceConfig(slug: string | null | undefined): AtomExperienceResolvedConfig {
  if (!slug) {
    return { slug: '', atomUuid: null, library: null, image: null, description: null }
  }
  const library = ATOM_DETAIL_LIBRARY[slug] ?? null
  const base = BASE_CONFIG[slug] ?? {}
  const image = base.image ?? library?.info.image ?? null
  const description = base.description ?? library?.info.description ?? null
  const fallbackId = library?.info.atomId ?? null
  const fallbackUuid = fallbackId && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12}$/.test(fallbackId)
    ? fallbackId
    : null
  return {
    slug,
    atomUuid: base.atomUuid ?? fallbackUuid,
    library,
    image,
    description,
    heroLabel: base.heroLabel,
  }
}
