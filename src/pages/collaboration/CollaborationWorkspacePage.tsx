import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import TopBar from '../../layout/TopBar'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { SidebarNav, ACCS_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import type { BreadcrumbItem } from '../../components/breadcrumbs/Breadcrumbs'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'
import { generateClientId } from '../../utils/id'
import {
  acknowledgeAlert,
  createCollaborationMember,
  createProcessHistorianEntry,
  fetchCollaborationMembers,
  requestCollaborationAi,
  type CollaborationAiResponse,
  type CollaborationMember,
} from '../../api'

type WorkspaceAlarmPayload = {
  alarmId: string
  type: string
  severity: string
  processCode?: string | null
  scope: {
    process_id?: string | null
    sow_id?: string | null
    contract_id?: string | null
    project_id?: string | null
    portfolio_id?: string | null
    process_name?: string | null
    sow_name?: string | null
    contract_name?: string | null
    project_name?: string | null
  }
  message: string
  kpis?: { coveragePct?: number | null; bufferDays?: number | null; nextDelivery?: string | null }
  links?: { scheduleTaskId?: string | null; scmPO?: string | null; shipment?: string | null }
  raisedAt?: string | null
  owner?: string | null
  status?: string | null
}

type PageContextPayload = {
  title: string
  path: string
  timestamp: string
  scope?: Record<string, unknown> | null
  filters?: Record<string, unknown> | null
}

type WorkspaceContext =
  | { kind: 'alarm'; payload: WorkspaceAlarmPayload }
  | { kind: 'page'; payload: PageContextPayload }

type CollaborationLocationState = {
  context?: WorkspaceContext
  origin?: { path?: string; label?: string; chain?: string[]; state?: unknown }
  threadId?: string
  title?: string
}

type ThreadParticipant = {
  id: string
  name: string
  role: string
  presence: 'online' | 'away'
  color: string
  persona?: PersonaKey
  historyAccess?: 'full' | 'current'
  joinedAt?: string
}

type ThreadMessage = {
  id: string
  author: string
  role: string
  persona: 'human' | 'system' | 'ai'
  timestamp: string
  body: string
  contextAttached?: boolean
  mentions?: string[]
  attachmentLabel?: string
  attachmentContent?: string
  reactions?: string[]
  audience?: 'team' | 'ai' | 'both' | 'private'
}

type ThreadEvent = {
  id: string
  label: string
  timestamp: string
}

type CollaborationThread = {
  id: string
  title: string
  status: 'open' | 'in_review' | 'resolved'
  messages: ThreadMessage[]
  participants: ThreadParticipant[]
  timeline: ThreadEvent[]
  notifications: string[]
  privacy: { teamOnly: boolean; confidential: boolean }
  lastUpdated: string
  context?: WorkspaceContext | null
  owner?: string | null
}

type ComposerIntent = 'notify' | 'advise' | 'both'

type InviteFormState = { name: string; role: string; persona: PersonaKey; historyAccess: 'full' | 'current' }

const STORAGE_KEY = 'dipgos.collaboration.threads'

const DEFAULT_INVITE_FORM: InviteFormState = {
  name: '',
  role: '',
  persona: 'scm',
  historyAccess: 'full',
}

const PERSONA_DEFAULTS: Record<PersonaKey, { name: string; role: string; color: string }> = {
  pm: { name: 'Project Manager', role: 'PM', color: '#f97316' },
  engineer: { name: 'Engineer (You)', role: 'Engineer', color: '#38bdf8' },
  scm: { name: 'SCM', role: 'SCM Coordinator', color: '#34d399' },
  supervisor: { name: 'Supervisor', role: 'Supervisor', color: '#fcd34d' },
  crew: { name: 'Crew', role: 'Crew Lead', color: '#f472b6' },
  ai: { name: 'AI Assistant', role: 'AI Assistant', color: '#a855f7' },
}

const PERSONA_PRESETS: Record<PersonaKey, string[]> = {
  pm: ['Faraz Khan', 'Laila Mumtaz'],
  engineer: ['Irtaza Syed', 'Aaliya Rahman'],
  scm: ['Sadia Rehman', 'Omar Jatoi'],
  supervisor: ['Kamran Malik', 'Rashid Ali'],
  crew: ['Crew Cell Alpha', 'Crew Cell Bravo'],
  ai: ['AI Assistant'],
}

const DEFAULT_PARTICIPANTS: ThreadParticipant[] = [
  { id: 'pm', name: PERSONA_DEFAULTS.pm.name, role: PERSONA_DEFAULTS.pm.role, presence: 'online', color: PERSONA_DEFAULTS.pm.color, persona: 'pm' },
  { id: 'eng', name: PERSONA_DEFAULTS.engineer.name, role: PERSONA_DEFAULTS.engineer.role, presence: 'online', color: PERSONA_DEFAULTS.engineer.color, persona: 'engineer' },
  { id: 'scm', name: PERSONA_DEFAULTS.scm.name, role: PERSONA_DEFAULTS.scm.role, presence: 'online', color: PERSONA_DEFAULTS.scm.color, persona: 'scm' },
  { id: 'sup', name: PERSONA_DEFAULTS.supervisor.name, role: PERSONA_DEFAULTS.supervisor.role, presence: 'away', color: PERSONA_DEFAULTS.supervisor.color, persona: 'supervisor' },
  { id: 'crew', name: PERSONA_DEFAULTS.crew.name, role: PERSONA_DEFAULTS.crew.role, presence: 'online', color: PERSONA_DEFAULTS.crew.color, persona: 'crew' },
  { id: 'ai', name: PERSONA_DEFAULTS.ai.name, role: PERSONA_DEFAULTS.ai.role, presence: 'online', color: PERSONA_DEFAULTS.ai.color, persona: 'ai' },
]

const PARTICIPANT_ORDER = DEFAULT_PARTICIPANTS.reduce<Record<string, number>>((acc, participant, index) => {
  acc[participant.id] = index
  return acc
}, {})

const ensureParticipantRoster = (participants: ThreadParticipant[]) => {
  const roster = [...participants]
  DEFAULT_PARTICIPANTS.forEach((participant) => {
    if (!roster.some((existing) => existing.id === participant.id)) {
      roster.push(participant)
    }
  })
  return roster.sort((a, b) => (PARTICIPANT_ORDER[a.id] ?? 99) - (PARTICIPANT_ORDER[b.id] ?? 99))
}

const mapMemberToParticipant = (member: CollaborationMember): ThreadParticipant => {
  const persona = (member.persona as PersonaKey) || 'engineer'
  const defaults = PERSONA_DEFAULTS[persona] ?? PERSONA_DEFAULTS.engineer
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    presence: 'online',
    color: defaults.color,
    persona,
    historyAccess: member.historyAccess,
    joinedAt: member.createdAt,
  }
}

type PersonaTarget = 'pm' | 'supervisor' | 'scm' | 'crew' | 'ai'
type PersonaKey = 'engineer' | PersonaTarget

type PersonaConfig = {
  apiPersona: 'pm' | 'assistant'
  author: string
  role: string
  styleHint: string
  autoNotifyTeam?: boolean
}

const NATURAL_TONE_HINT =
  'Respond in a natural, human tone in one to two sentences. Skip pleasantries such as "Thanks for the update" unless the engineer explicitly shares news, and never repeat earlier replies verbatim.'

const PERSONA_BEHAVIOUR: Record<PersonaTarget, PersonaConfig> = {
  pm: {
    apiPersona: 'pm',
    author: 'Project Manager',
    role: 'Project Manager',
    styleHint:
      'You are the human project manager covering a high-risk dam program. Give decisive approvals or pushback, referencing current coverage/buffer or CR status, and state the next action plainly.',
    autoNotifyTeam: true,
  },
  supervisor: {
    apiPersona: 'assistant',
    author: 'Supervisor',
    role: 'Supervisor',
    styleHint:
      'You report directly to the engineer and manage crews. Respond as a subordinate giving concise field updates, flagging readiness risks, and confirming the actions you will take.',
    autoNotifyTeam: true,
  },
  scm: {
    apiPersona: 'assistant',
    author: 'SCM Lead',
    role: 'SCM Coordinator',
    styleHint:
      'You represent the supply-chain/logistics pod that partners with the engineer. Reply with procurement/readiness updates, cite deliveries or suppliers, and outline how you will keep materials flowing.',
    autoNotifyTeam: true,
  },
  crew: {
    apiPersona: 'assistant',
    author: 'Crew Lead',
    role: 'Crew Lead',
    styleHint:
      'You report to the supervisor and handle crews on the ground. Give short status updates about manpower, equipment, and immediate blockers. Confirm the actions you will take when directed.',
    autoNotifyTeam: false,
  },
  ai: {
    apiPersona: 'assistant',
    author: 'AI Assistant',
    role: 'AI Assistant',
    styleHint: 'You are the embedded AI collaborator. Offer concise, context-aware help that keeps the team unblocked.',
    autoNotifyTeam: false,
  },
}

const PERSONA_MENTION_MAP: Record<string, PersonaTarget> = {
  '@pm': 'pm',
  '@projectmanager': 'pm',
  '@supervisor': 'supervisor',
  '@sup': 'supervisor',
  '@scm': 'scm',
  '@procurement': 'scm',
  '@crew': 'crew',
  '@field': 'crew',
  '@ai': 'ai',
  '@assistant': 'ai',
}

const PARTICIPANT_PERSONA_MAP: Record<string, PersonaKey> = {
  eng: 'engineer',
  pm: 'pm',
  sup: 'supervisor',
  scm: 'scm',
  crew: 'crew',
  ai: 'ai',
}

const PERSONA_ORDER: PersonaKey[] = ['pm', 'engineer', 'scm', 'supervisor', 'crew', 'ai']

const PERSONA_HIERARCHY_LABEL: Record<PersonaKey, string> = {
  pm: 'Program lead',
  engineer: 'Engineer',
  scm: 'SCM',
  supervisor: 'Field',
  crew: 'Crew',
  ai: 'Assistant',
}

const truncateText = (value: string, max = 200) => {
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max)}…` : value
}

const formatTimestamp = (ts: string) =>
  new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

const readStoredThreads = (): Record<string, CollaborationThread> => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, CollaborationThread>
  } catch {
    return {}
  }
}

const persistThread = (thread: CollaborationThread) => {
  if (typeof window === 'undefined') return
  const all = readStoredThreads()
  all[thread.id] = thread
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore storage errors in local dev
  }
}

const buildSeedMessages = (context: WorkspaceContext | null): ThreadMessage[] => [
  {
    id: generateClientId(),
    author: 'Engineer (You)',
    role: 'Engineer',
    persona: 'human',
    timestamp: new Date().toISOString(),
    body:
      context?.kind === 'alarm'
        ? `Raising ${context.payload.alarmId}: ${context.payload.message}`
        : 'Opening thread to coordinate next steps for the current view.',
    contextAttached: true,
    mentions: ['@PM', '@Supervisor'],
    audience: 'team',
  },
  {
    id: generateClientId(),
    author: 'AI Assistant',
    role: 'AI Assistant',
    persona: 'ai',
    timestamp: new Date().toISOString(),
    body:
      'Options:\n1. Expedite PO-22114 (ETA Oct 29 → Oct 28, +6% cost).\n2. Re-sequence spillway block B by +1 day. Impact summary attached.',
    attachmentLabel: 'Impact summary',
    attachmentContent: '- Coverage: 62%\n- Buffer: -2 days\n- Next delivery: Oct 29 09:00Z',
    contextAttached: true,
    audience: 'team',
  },
  {
    id: generateClientId(),
    author: 'Supervisor',
    role: 'Supervisor',
    persona: 'human',
    timestamp: new Date().toISOString(),
    body: 'Field can shift pour by 1 day without knock-on effects.',
    reactions: ['👍'],
    audience: 'team',
  },
  {
    id: generateClientId(),
    author: 'Project Manager',
    role: 'PM',
    persona: 'human',
    timestamp: new Date().toISOString(),
    body: 'Approve expedite if cost delta ≤ $1.8k; otherwise re-sequence. Assigning owner to Supervisor.',
    audience: 'team',
  },
  {
    id: generateClientId(),
    author: 'System',
    role: 'System',
    persona: 'system',
    timestamp: new Date().toISOString(),
    body: 'Alarm acknowledged. Owner set to Supervisor. Draft CR created (CR-0127).',
    audience: 'team',
  },
  {
    id: generateClientId(),
    author: 'AI Assistant',
    role: 'AI Assistant',
    persona: 'ai',
    timestamp: new Date().toISOString(),
    body:
      'Draft CR-0127 prepared: need_date +1 day, expedite flag optional; predicted schedule variance 0d if expedite succeeds; otherwise +1d.',
    audience: 'team',
  },
]

const buildTimeline = (context: WorkspaceContext | null): ThreadEvent[] => [
  {
    id: generateClientId(),
    label: context?.kind === 'alarm' ? `${context.payload.alarmId} raised` : 'Thread created',
    timestamp: new Date().toISOString(),
  },
  {
    id: generateClientId(),
    label: 'Alarm acknowledged',
    timestamp: new Date().toISOString(),
  },
  {
    id: generateClientId(),
    label: 'Owner assigned to Supervisor',
    timestamp: new Date().toISOString(),
  },
  {
    id: generateClientId(),
    label: 'Draft CR-0127 prepared',
    timestamp: new Date().toISOString(),
  },
]

const buildInitialThread = (threadId: string, context: WorkspaceContext | null, forcedTitle?: string): CollaborationThread => {
  const baseTitle =
    forcedTitle ??
    (context?.kind === 'alarm' ? `${context.payload.alarmId} · ${context.payload.message}` : 'Collaboration workspace thread')
  return {
    id: threadId,
    title: baseTitle,
    status: 'open',
    messages: buildSeedMessages(context),
    participants: DEFAULT_PARTICIPANTS,
    timeline: buildTimeline(context),
    notifications: ['Live updates enabled'],
    privacy: { teamOnly: true, confidential: false },
    lastUpdated: new Date().toISOString(),
    context,
    owner: context?.kind === 'alarm' ? context.payload.owner ?? 'Supervisor' : 'Supervisor',
  }
}

const statusLabel = (status: CollaborationThread['status']) => {
  if (status === 'resolved') return 'Resolved'
  if (status === 'in_review') return 'In Review'
  return 'Open'
}

const scopeChips = (context: WorkspaceContext | null) => {
  if (context?.kind !== 'alarm') return []
  const scope = context.payload.scope
  return [
    { label: scope.process_name ?? 'Process', value: scope.process_id ?? '—' },
    { label: scope.sow_name ?? 'SOW', value: scope.sow_id ?? '—' },
    { label: scope.contract_name ?? 'Contract', value: scope.contract_id ?? '—' },
    { label: scope.project_name ?? 'Project', value: scope.project_id ?? '—' },
    { label: 'Portfolio', value: scope.portfolio_id ?? 'PF-01' },
  ]
}

const extractMentions = (text: string) => {
  const matches = text.match(/@([\w\s]+)/g)
  if (!matches) return []
  return matches.map((item) => item.trim())
}

const getTopBarScope = (context: WorkspaceContext | null) => {
  if (context?.kind === 'alarm') {
    return {
      projectId: context.payload.scope.project_id ?? null,
      projectName: context.payload.scope.project_name ?? null,
      contractId: context.payload.scope.contract_id ?? null,
      contractName: context.payload.scope.contract_name ?? null,
      sowId: context.payload.scope.sow_id ?? null,
      sowName: context.payload.scope.sow_name ?? null,
      processId: context.payload.scope.process_id ?? null,
      processName: context.payload.scope.process_name ?? null,
    }
  }
  return {
    projectId: null,
    contractId: null,
    sowId: null,
    processId: null,
  }
}

const contextJson = (context: WorkspaceContext | null) => {
  if (!context) return '{}'
  return JSON.stringify(context.payload, null, 2)
}

const describeAlarmContext = (context: WorkspaceContext | null) => {
  if (context?.kind !== 'alarm') return ''
  const scope = context.payload.scope ?? {}
  const kpis = context.payload.kpis ?? {}
  const parts: string[] = []
  if (context.payload.message) {
    parts.push(`Alarm: ${context.payload.message}`)
  }
  if (scope.process_name) {
    parts.push(`Process: ${scope.process_name}`)
  }
  if (scope.contract_name) {
    parts.push(`Contract: ${scope.contract_name}`)
  }
  const coverage = typeof kpis.coveragePct === 'number' ? `${kpis.coveragePct}%` : null
  const bufferDays = typeof kpis.bufferDays === 'number' ? `${kpis.bufferDays} days` : null
  if (coverage || bufferDays) {
    parts.push(`KPIs: ${coverage ? `coverage ${coverage}` : ''}${coverage && bufferDays ? ', ' : ''}${bufferDays ? `buffer ${bufferDays}` : ''}`.trim())
  }
  return parts.join('\n')
}

export default function CollaborationWorkspacePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const locationState = (location.state as CollaborationLocationState | null) ?? null
  const incomingContext = locationState?.context ?? null

  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const [attachContext, setAttachContext] = useState(true)
  const [contextPanelOpen, setContextPanelOpen] = useState(true)
  const [composerValue, setComposerValue] = useState('')
  const [notifyTeam, setNotifyTeam] = useState(true)
  const [requestPmGuidance, setRequestPmGuidance] = useState(false)
  const [aiPersona, setAiPersona] = useState<'pm' | 'assistant'>('pm')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [activeParticipantId, setActiveParticipantId] = useState<string>('eng')
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState<InviteFormState>(DEFAULT_INVITE_FORM)

  const storedThreads = useMemo(() => readStoredThreads(), [])
  const derivedThreadId = useMemo(() => {
    if (locationState?.threadId) return locationState.threadId
    if (incomingContext?.kind === 'alarm' && incomingContext.payload.alarmId) {
      return incomingContext.payload.alarmId
    }
    return generateClientId()
  }, [incomingContext, locationState?.threadId])

  const initialThread = useMemo(() => {
    if (storedThreads[derivedThreadId]) {
      const existing = storedThreads[derivedThreadId]
      return {
        ...existing,
        participants: ensureParticipantRoster(existing.participants),
      }
    }
    return buildInitialThread(derivedThreadId, incomingContext ?? null, locationState?.title)
  }, [storedThreads, derivedThreadId, incomingContext, locationState?.title])

  const [thread, setThread] = useState<CollaborationThread>(initialThread)
  const effectiveContext = useMemo(() => thread.context ?? incomingContext ?? null, [thread.context, incomingContext])
  const activeParticipant = useMemo(
    () => thread.participants.find((participant) => participant.id === activeParticipantId) ?? thread.participants[0],
    [thread.participants, activeParticipantId],
  )
  const activePersona = (activeParticipant?.persona ?? 'engineer') as PersonaKey
  const personaPriority = useMemo(() => {
    const map = new Map<PersonaKey, number>()
    PERSONA_ORDER.forEach((key, index) => map.set(key, index))
    return map
  }, [])
  const orderedParticipants = useMemo(
    () =>
      [...thread.participants].sort((a, b) => {
        const personaA = (a.persona as PersonaKey) ?? 'engineer'
        const personaB = (b.persona as PersonaKey) ?? 'engineer'
        const scoreA = personaPriority.get(personaA) ?? 99
        const scoreB = personaPriority.get(personaB) ?? 99
        if (scoreA !== scoreB) return scoreA - scoreB
        return (a.name ?? '').localeCompare(b.name ?? '')
      }),
    [thread.participants, personaPriority],
  )

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    persistThread(thread)
  }, [thread])

  useEffect(() => {
    let cancelled = false
    fetchCollaborationMembers(derivedThreadId)
      .then((records) => {
        if (cancelled) return
        setThread((prev) => ({
          ...prev,
          participants: ensureParticipantRoster([...DEFAULT_PARTICIPANTS, ...records.map(mapMemberToParticipant)]),
        }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [derivedThreadId])

  useEffect(() => {
    if (!thread.participants.some((participant) => participant.id === activeParticipantId) && thread.participants[0]) {
      setActiveParticipantId(thread.participants[0].id)
    }
  }, [activeParticipantId, thread.participants])

  useEffect(() => {
    const node = messagesContainerRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: thread.messages.length > 1 ? 'smooth' : 'auto' })
  }, [thread.messages.length])

  const breadcrumbs: BreadcrumbItem[] = useMemo(() => {
    const chain = locationState?.origin?.chain ?? (incomingContext?.kind === 'alarm' ? ['Alarms', incomingContext.payload.alarmId] : ['Workspace'])
    const originPath = locationState?.origin?.path
    const originState = locationState?.origin?.state
    const items: BreadcrumbItem[] = chain.map((label, index) => {
      const isLast = index === chain.length - 1
      const canNavigateBack = originPath && !isLast
      return {
        label,
        onClick: canNavigateBack ? () => navigate(originPath, { state: originState }) : undefined,
      }
    })
    items.push({ label: 'Collaboration', isCurrent: true })
    return items
  }, [incomingContext, locationState?.origin?.chain, locationState?.origin?.path, locationState?.origin?.state, navigate])

  const addMessage = useCallback((message: ThreadMessage) => {
    const normalisedMessage: ThreadMessage = { ...message, audience: message.audience ?? 'team' }
    setThread((prev) => ({
      ...prev,
      messages: [...prev.messages, normalisedMessage],
      lastUpdated: normalisedMessage.timestamp,
    }))
  }, [])

  const addTimelineEvent = useCallback((label: string) => {
    setThread((prev) => ({
      ...prev,
      timeline: [...prev.timeline, { id: generateClientId(), label, timestamp: new Date().toISOString() }],
    }))
  }, [])

  const postSystemMessage = useCallback(
    (body: string) => {
      addMessage({
        id: generateClientId(),
        author: 'System',
        role: 'System',
        persona: 'system',
        timestamp: new Date().toISOString(),
        body,
      })
    },
    [addMessage],
  )

  const handlePersonaSelect = useCallback(
    (participantId: string) => {
      const participant = thread.participants.find((item) => item.id === participantId)
      if (!participant) return
      const persona = (participant.persona as PersonaKey) ?? 'engineer'
      setActiveParticipantId(participantId)
      if (persona === 'engineer') {
        setRequestPmGuidance(false)
        return
      }
      const behaviour = PERSONA_BEHAVIOUR[persona as PersonaTarget]
      if (behaviour) {
        setRequestPmGuidance(true)
        setAiPersona(behaviour.apiPersona)
        if (typeof behaviour.autoNotifyTeam === 'boolean') {
          setNotifyTeam(behaviour.autoNotifyTeam)
        }
      }
    },
    [setAiPersona, setNotifyTeam, setRequestPmGuidance, thread.participants],
  )

  const handleInviteFieldChange = useCallback((field: keyof InviteFormState, value: string) => {
    setInviteForm((prev) => {
      if (field === 'persona') {
        const persona = value as PersonaKey
        const suggestion = PERSONA_PRESETS[persona]?.[0] ?? ''
        return {
          ...prev,
          persona,
          name: prev.name || suggestion,
          role: prev.role || PERSONA_DEFAULTS[persona]?.role || prev.role,
        }
      }
      return {
        ...prev,
        [field]: value,
      }
    })
  }, [])

  const closeInviteModal = useCallback(() => {
    setInviteForm(DEFAULT_INVITE_FORM)
    setInviteModalOpen(false)
  }, [])

  const buildHistoryForAi = useCallback(
    () =>
      thread.messages.slice(-6).map((msg) => ({
        role: msg.persona === 'ai' ? 'assistant' : msg.persona === 'system' ? 'system' : 'user',
        content: `${msg.author}: ${msg.body}`,
      })),
    [thread.messages],
  )

  const runAiHelper = useCallback(
    (mode: 'summarize' | 'impact' | 'nextstep') => {
      const context = thread.context ?? incomingContext ?? null
      let body = ''
      if (mode === 'summarize') {
        body =
          'Summary:\n- Alarm acknowledged, owner Supervisor.\n- Expedite PO optional if <$1.8k.\n- Draft CR-0127 prepared, monitoring buffer recovery.\nDecisions: keep pour shift ready + confirm expedite cost.'
      } else if (mode === 'impact') {
        const coverage = context?.kind === 'alarm' ? context.payload.kpis?.coveragePct ?? 62 : 65
        const buffer = context?.kind === 'alarm' ? context.payload.kpis?.bufferDays ?? -2 : -1
        body = `Impact snapshot:\n- Coverage ${coverage}%.\n- Buffer ${buffer} days.\n- Next delivery ${
          context?.kind === 'alarm' ? context.payload.kpis?.nextDelivery ?? 'Pending' : 'Pending'
        }.\nTime/cost risk: +1 day if expedite fails, +$1.8k if approved.`
      } else {
        body = 'Next steps:\n1. Confirm expedite quote.\n2. Supervisor to log pour shift plan.\n3. PM to approve CR-0127 by 18:00.\n4. AI to summarize on closure.'
      }
      addMessage({
        id: generateClientId(),
        author: 'AI Assistant',
        role: 'AI Assistant',
        persona: 'ai',
        timestamp: new Date().toISOString(),
        body,
        contextAttached: attachContext,
      })
    },
    [attachContext, addMessage, incomingContext, thread.context],
  )

  const saveHistorianEntry = useCallback(
    async (action: string, notes: string) => {
      const context = thread.context ?? incomingContext
      if (context?.kind !== 'alarm') return
      try {
        await createProcessHistorianEntry({
          recordId: context.payload.alarmId,
          alarmId: context.payload.alarmId,
          recordType: action === 'change' ? 'change' : 'alarm',
          action: action as 'acknowledge' | 'collaborate' | 'change',
          projectId: context.payload.scope.project_id ?? null,
          projectName: context.payload.scope.project_name ?? null,
          contractId: context.payload.scope.contract_id ?? null,
          contractName: context.payload.scope.contract_name ?? null,
          sowId: context.payload.scope.sow_id ?? null,
          sowName: context.payload.scope.sow_name ?? null,
          processId: context.payload.scope.process_id ?? null,
          processName: context.payload.scope.process_name ?? null,
          title: context.payload.message,
          severity: context.payload.severity,
          payload: {
            context: context.payload,
            notes,
          },
          notes,
        })
      } catch (err) {
        console.warn('Unable to persist collaboration history', err)
      }
    },
    [incomingContext, thread.context],
  )

  const handleInviteSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const persona = inviteForm.persona
      const defaults = PERSONA_DEFAULTS[persona] ?? { name: 'Guest', role: 'Contributor', color: '#94a3b8' }
      try {
        const remoteParticipant = await createCollaborationMember({
          threadId: derivedThreadId,
          persona,
          name: inviteForm.name.trim() || defaults.name,
          role: inviteForm.role.trim() || defaults.role,
          historyAccess: inviteForm.historyAccess,
          createdBy: 'collaboration',
        })
        const participant = mapMemberToParticipant(remoteParticipant)
        setThread((prev) => ({
          ...prev,
          participants: [...prev.participants, participant],
        }))
        addTimelineEvent(
          `${participant.name} added as ${participant.role} (${inviteForm.historyAccess === 'full' ? 'full history' : 'current message'} access)`,
        )
        void saveHistorianEntry(
          'collaborate',
          `${participant.name} invited (${inviteForm.historyAccess === 'full' ? 'full history' : 'current only'} access).`,
        )
        setInviteForm(DEFAULT_INVITE_FORM)
        setInviteModalOpen(false)
      } catch (error) {
        console.error('Failed to add collaborator', error)
        postSystemMessage('Unable to add collaborator right now.')
        setInviteModalOpen(false)
      }
    },
    [addTimelineEvent, derivedThreadId, inviteForm, postSystemMessage, saveHistorianEntry],
  )

  const triggerAiReply = useCallback(
    async (
      prompt: string,
      intent: ComposerIntent,
      audience: ThreadMessage['audience'],
      personaOverride?: PersonaTarget,
      personaVoice?: ThreadParticipant | null,
    ) => {
      const contextPayload = effectiveContext ? JSON.parse(JSON.stringify(effectiveContext)) : {}
      const fallbackPersona: PersonaTarget = aiPersona === 'pm' ? 'pm' : 'ai'
      const personaKey =
        personaOverride ?? ((personaVoice?.persona ?? activePersona) !== 'engineer'
          ? ((personaVoice?.persona ?? activePersona) as PersonaTarget)
          : fallbackPersona)
      const personaConfig = PERSONA_BEHAVIOUR[personaKey] ?? PERSONA_BEHAVIOUR.pm
      const speaker = personaVoice ?? activeParticipant
      const speakerName = speaker?.name ?? personaConfig.author
      const speakerRole = speaker?.role ?? personaConfig.role
      const lastPersonaReply = [...thread.messages]
        .reverse()
        .find((message) => message.persona === 'ai' && message.author === speakerName)
      const repetitionGuard = lastPersonaReply
        ? `Your previous ${speakerRole} reply was "${truncateText(lastPersonaReply.body)}". Do not repeat or paraphrase it—address the engineer's new request directly.`
        : `You are ${speakerName}, ${speakerRole}. Respond once, clearly, and focus on the engineer request.`
      const contextSnippet = describeAlarmContext(effectiveContext)
      const styledPrompt = [
        personaConfig.styleHint,
        NATURAL_TONE_HINT,
        repetitionGuard,
        contextSnippet ? `Situation:\n${contextSnippet}` : '',
        `Engineer request:\n${prompt}`,
      ]
        .filter(Boolean)
        .join('\n\n')
      setAiLoading(true)
      setAiError(null)
      try {
        const historyPayload = buildHistoryForAi()
        const response = await requestCollaborationAi({
          prompt: styledPrompt,
          persona: personaConfig.apiPersona,
          intent,
          context: contextPayload,
          history: [...historyPayload, { role: 'user', content: `Engineer: ${prompt}` }],
        })
        const now = new Date().toISOString()
        addMessage({
          id: generateClientId(),
          author: speakerName,
          role: speakerRole,
          persona: 'ai',
          timestamp: now,
          body: response.reply,
          contextAttached: attachContext,
          attachmentLabel: response.suggested_actions?.length ? 'Suggested actions' : undefined,
          attachmentContent: response.suggested_actions?.length
            ? response.suggested_actions.map((item, index) => `${index + 1}. ${item}`).join('\n')
            : undefined,
          mentions: response.escalate ? ['Escalate to human reviewer'] : undefined,
          audience: audience === 'team' ? 'team' : 'ai',
        })
        if (response.escalate) {
          addTimelineEvent('PM flagged human follow-up')
        }
        if (effectiveContext?.kind === 'alarm') {
          await saveHistorianEntry('collaborate', `${speakerName} reply: ${response.reply}`)
        }
      } catch (error) {
        console.error('Failed to fetch collaboration AI reply', error)
        setAiError('AI project manager is unavailable. Try again in a moment.')
        postSystemMessage('AI assistant could not respond. Please retry or proceed manually.')
      } finally {
        setAiLoading(false)
      }
    },
    [
      activeParticipant,
      activePersona,
      addMessage,
      addTimelineEvent,
      aiPersona,
      attachContext,
      buildHistoryForAi,
      effectiveContext,
      postSystemMessage,
      saveHistorianEntry,
      thread.messages,
    ],
  )

  const handleAcknowledgeAlarm = async () => {
    if (thread.context?.kind === 'alarm') {
      try {
        await acknowledgeAlert(thread.context.payload.alarmId)
      } catch (err) {
        console.warn('Failed to acknowledge alarm', err)
      }
    }
    setThread((prev) => ({ ...prev, status: 'in_review' }))
    postSystemMessage('Alarm acknowledged by Engineer.')
    addTimelineEvent('Alarm acknowledged')
    await saveHistorianEntry('acknowledge', 'Alarm acknowledged from collaboration workspace.')
  }

  const handleAssignOwner = (owner: string) => {
    setThread((prev) => ({
      ...prev,
      owner,
      messages: [
        ...prev.messages,
        {
          id: generateClientId(),
          author: 'Project Manager',
          role: 'PM',
          persona: 'human',
          timestamp: new Date().toISOString(),
          body: `Assigning owner to ${owner}.`,
        },
      ],
    }))
    addTimelineEvent(`Owner set to ${owner}`)
    saveHistorianEntry('collaborate', `Owner set to ${owner}`)
  }

  const handleCreateChangeRequest = () => {
    const scope = getTopBarScope(thread.context ?? incomingContext ?? null)
    postSystemMessage('Opening Change Management workspace…')
    addTimelineEvent('Change management workspace opened')
    void saveHistorianEntry('change', 'Change management workspace opened from collaboration thread.')
    navigate('/change-management', {
      state: {
        projectId: scope.projectId,
        projectName: scope.projectName,
        contractId: scope.contractId,
        contractName: scope.contractName,
        sowId: scope.sowId,
        sowName: scope.sowName,
        processId: scope.processId,
        processName: scope.processName,
      },
    })
  }

  const handleMarkResolved = () => {
    setThread((prev) => ({ ...prev, status: 'resolved' }))
    postSystemMessage('Thread marked as resolved.')
    addTimelineEvent('Thread resolved')
    runAiHelper('summarize')
    saveHistorianEntry('change', 'Thread closed with summary.')
  }

  const handleSendMessage = useCallback(async () => {
    const trimmed = composerValue.trim()
  if (!trimmed) return
    if (trimmed.startsWith('/')) {
      const command = trimmed.toLowerCase()
      if (command.startsWith('/summarize')) {
        runAiHelper('summarize')
      } else if (command.startsWith('/impact')) {
        runAiHelper('impact')
      } else if (command.startsWith('/nextstep')) {
        runAiHelper('nextstep')
      } else if (command.startsWith('/ack')) {
        void handleAcknowledgeAlarm()
      } else if (command.startsWith('/assign')) {
        handleAssignOwner('Supervisor')
      } else if (command.startsWith('/create')) {
        handleCreateChangeRequest()
      } else if (command.startsWith('/resolve')) {
        handleMarkResolved()
      }
      setComposerValue('')
      return
    }
    const mentions = extractMentions(trimmed)
    const normalizedMentions = mentions.map((mention) => mention.toLowerCase())
    const mentionPersona =
      normalizedMentions
        .map((mention) => PERSONA_MENTION_MAP[mention])
        .find((value): value is PersonaTarget => Boolean(value)) ?? null
    const personaFromSelection: PersonaTarget | null =
      activePersona !== 'engineer' ? (activePersona as PersonaTarget) : null
    const personaFromDropdown: PersonaTarget | null =
      requestPmGuidance && !mentionPersona && !personaFromSelection ? (aiPersona === 'pm' ? 'pm' : 'ai') : null
    const personaForReply = mentionPersona ?? personaFromSelection ?? personaFromDropdown
    const wantsGuidance = Boolean(personaForReply)
    const intent: ComposerIntent = notifyTeam && wantsGuidance ? 'both' : notifyTeam ? 'notify' : wantsGuidance ? 'advise' : 'notify'
    const audience: ThreadMessage['audience'] = notifyTeam ? (wantsGuidance ? 'both' : 'team') : wantsGuidance ? 'ai' : 'private'
    addMessage({
      id: generateClientId(),
      author: 'Engineer (You)',
      role: notifyTeam ? 'Engineer' : 'Engineer · private note',
      persona: 'human',
      timestamp: new Date().toISOString(),
      body: trimmed,
      contextAttached: attachContext,
      mentions,
      audience,
    })
    void saveHistorianEntry('collaborate', trimmed)
    if (personaForReply) {
      const personaVoice =
        personaForReply === activeParticipant?.persona
          ? activeParticipant
          : orderedParticipants.find((participant) => participant.persona === personaForReply) ?? null
      void triggerAiReply(trimmed, intent, audience, personaForReply, personaVoice)
    }
    setComposerValue('')
  }, [
    activeParticipant,
    activePersona,
    addMessage,
    aiPersona,
    attachContext,
    composerValue,
    orderedParticipants,
    notifyTeam,
    requestPmGuidance,
    saveHistorianEntry,
    triggerAiReply,
  ])

  const scopeChipsData = scopeChips(thread.context ?? incomingContext ?? null)
  const topBarScope = getTopBarScope(thread.context ?? incomingContext ?? null)
  const contextString = useMemo(() => contextJson(thread.context ?? incomingContext ?? null), [incomingContext, thread.context])

  return (
    <div className="collaboration-route" data-theme={theme}>
      <SidebarNav
        activeIndex={activeNavIndex}
        onSelect={(index) => setActiveNavIndex(index)}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => toggleThemeValue(prev))}
      />
      <div className="app-shell topbar-layout">
        <TopBar breadcrumbs={breadcrumbs} actions={<TopBarGlobalActions theme={theme} onToggleTheme={() => setTheme((prev) => toggleThemeValue(prev))} scope={topBarScope} />} />
        <div className="collaboration-workspace">
          <section className="collaboration-main">
            <header className="collaboration-header">
              <div>
                <p>Collaborate Workroom</p>
                <h1>{thread.title}</h1>
                <div className="collaboration-chips">
                  {scopeChipsData.map((chip) => (
                    <span key={`${chip.label}-${chip.value}`} className="collaboration-chip">
                      <strong>{chip.label}</strong>
                      <span>{chip.value ?? '—'}</span>
                    </span>
                  ))}
                  <span className={`collaboration-status collaboration-status--${thread.status}`}>{statusLabel(thread.status)}</span>
                </div>
              </div>
              <div className="collaboration-header-actions">
                <div className="privacy-controls">
                  <label>
                    <input
                      type="checkbox"
                      checked={thread.privacy.teamOnly}
                      onChange={(event) =>
                        setThread((prev) => ({ ...prev, privacy: { ...prev.privacy, teamOnly: event.target.checked } }))
                      }
                    />
                    Team-only
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={thread.privacy.confidential}
                      onChange={(event) =>
                        setThread((prev) => ({ ...prev, privacy: { ...prev.privacy, confidential: event.target.checked } }))
                      }
                    />
                    Confidential
                  </label>
                </div>
                <div className="header-buttons">
                  <button type="button" onClick={handleAcknowledgeAlarm}>
                    Acknowledge
                  </button>
                  <button type="button" onClick={() => handleAssignOwner('Supervisor')}>
                    Assign owner
                  </button>
                  <button type="button" onClick={handleCreateChangeRequest}>
                    Create change request
                  </button>
                  <button type="button" className="secondary" onClick={handleMarkResolved}>
                    Mark resolved
                  </button>
                </div>
              </div>
            </header>
            <div className="persona-ribbon">
              {orderedParticipants.map((participant) => {
                const personaKey = (participant.persona as PersonaKey) ?? 'engineer'
                const isActive = activeParticipantId === participant.id
                return (
                  <button
                    key={participant.id}
                    type="button"
                    className={`persona-chip${isActive ? ' is-active' : ''}`}
                    onClick={() => handlePersonaSelect(participant.id)}
                    aria-pressed={isActive}
                  >
                    <span className="persona-chip__initial" style={{ background: participant.color }}>
                      {participant.name.charAt(0)}
                    </span>
                    <span className="persona-chip__meta">
                      <span className="persona-chip__hierarchy">{PERSONA_HIERARCHY_LABEL[personaKey] ?? 'Contributor'}</span>
                      <span className="persona-chip__label">{participant.name}</span>
                    </span>
                  </button>
                )
              })}
              <button type="button" className="persona-chip invite-chip" onClick={() => setInviteModalOpen(true)}>
                + Add
              </button>
            </div>
            <div className="collaboration-thread">
              <div className="collaboration-messages" ref={messagesContainerRef}>
                {thread.messages.map((message) => (
                  <article key={message.id} className={`collaboration-message collaboration-message--${message.persona}`}>
                    <header>
                      <strong>{message.author}</strong>
                      <span>{formatTimestamp(message.timestamp)}</span>
                      <span className="role-pill">{message.role}</span>
                    </header>
                    {message.audience && message.audience !== 'team' ? (
                      <span className={`message-audience message-audience--${message.audience}`}>
                        {message.audience === 'private'
                          ? 'Private note'
                          : message.audience === 'ai'
                            ? 'AI visibility only'
                            : 'Shared with AI review'}
                      </span>
                    ) : null}
                    <p>{message.body}</p>
                    {message.mentions?.length ? (
                      <div className="mention-chips">
                        {message.mentions.map((mention) => (
                          <span key={mention}>{mention}</span>
                        ))}
                      </div>
                    ) : null}
                    {message.attachmentLabel && message.attachmentContent ? (
                      <div className="workspace-attachment">
                        <strong>{message.attachmentLabel}</strong>
                        <pre>{message.attachmentContent}</pre>
                      </div>
                    ) : null}
                    {message.contextAttached ? <small className="context-indicator">Context attached</small> : null}
                    {message.reactions?.length ? (
                      <div className="message-reactions">
                        {message.reactions.map((reaction) => (
                          <span key={reaction}>{reaction}</span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              <div className="collaboration-composer">
                <textarea
                  value={composerValue}
                  onChange={(event) => setComposerValue(event.target.value)}
                  placeholder="Share next action, @mention teammates, or use /summarize, /impact, /nextstep…"
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      handleSendMessage()
                    }
                  }}
                />
                <div className="composer-flags">
                  <label>
                    <input type="checkbox" checked={notifyTeam} onChange={(event) => setNotifyTeam(event.target.checked)} />
                    Notify PM & Supervisor
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={requestPmGuidance}
                      onChange={(event) => setRequestPmGuidance(event.target.checked)}
                    />
                    Ask AI project manager
                  </label>
                  <select value={aiPersona} onChange={(event) => setAiPersona(event.target.value as 'pm' | 'assistant')} disabled={!requestPmGuidance}>
                    <option value="pm">PM persona</option>
                    <option value="assistant">AI assistant</option>
                  </select>
                </div>
                {aiLoading ? <div className="ai-status">PM is reviewing your note…</div> : null}
                {aiError ? (
                  <div className="ai-status ai-status--error">
                    {aiError}
                    <button type="button" onClick={() => setAiError(null)}>
                      Dismiss
                    </button>
                  </div>
                ) : null}
                <div className="composer-controls">
                  <label>
                    <input type="checkbox" checked={attachContext} onChange={(event) => setAttachContext(event.target.checked)} /> Attach
                    context payload
                  </label>
                  <div className="composer-actions">
                    <button type="button" onClick={() => runAiHelper('summarize')}>
                      /summarize
                    </button>
                    <button type="button" onClick={() => runAiHelper('impact')}>
                      /impact
                    </button>
                    <button type="button" onClick={() => runAiHelper('nextstep')}>
                      /nextstep
                    </button>
                    <button type="button" onClick={handleSendMessage}>
                      Send update
                    </button>
                  </div>
                </div>
              </div>
              <div className="activity-ribbon">
                <span>
                  Live: {thread.participants.filter((p) => p.presence === 'online').map((p) => p.role).join(' · ')}
                </span>
                <span>Typing: {composerValue ? 'Engineer…' : '—'}</span>
                <span>Last updated {formatTimestamp(thread.lastUpdated)}</span>
              </div>
            </div>
          </section>

          <aside className={`collaboration-context ${contextPanelOpen ? 'is-open' : 'is-collapsed'}`}>
            <button type="button" className="collapse-toggle" onClick={() => setContextPanelOpen((prev) => !prev)}>
              {contextPanelOpen ? 'Hide context' : 'Show context'}
            </button>
            {contextPanelOpen ? (
              <>
                <div className="context-panel">
                  <h3>Attached context</h3>
                  <div className="context-actions">
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof navigator?.clipboard !== 'undefined') {
                          navigator.clipboard.writeText(contextString).catch(() => null)
                        }
                      }}
                    >
                      Copy JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([contextString], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const anchor = document.createElement('a')
                        anchor.href = url
                        anchor.download = 'context.json'
                        anchor.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      Download
                    </button>
                  </div>
                  <pre className="context-json">{contextString}</pre>
                </div>
                <div className="context-panel">
                  <h3>Key KPIs</h3>
                  <ul className="kpi-grid">
                    <li>
                      <span>Coverage</span>
                      <strong>
                        {thread.context?.kind === 'alarm'
                          ? `${thread.context.payload.kpis?.coveragePct ?? 62}%`
                          : incomingContext?.kind === 'alarm'
                            ? `${incomingContext.payload.kpis?.coveragePct ?? 62}%`
                            : '—'}
                      </strong>
                    </li>
                    <li>
                      <span>Buffer days</span>
                      <strong>
                        {thread.context?.kind === 'alarm'
                          ? thread.context.payload.kpis?.bufferDays ?? -2
                          : incomingContext?.kind === 'alarm'
                            ? incomingContext.payload.kpis?.bufferDays ?? -2
                            : '—'}
                      </strong>
                    </li>
                    <li>
                      <span>Next delivery</span>
                      <strong>
                        {thread.context?.kind === 'alarm'
                          ? thread.context.payload.kpis?.nextDelivery ?? 'Pending'
                          : incomingContext?.kind === 'alarm'
                            ? incomingContext.payload.kpis?.nextDelivery ?? 'Pending'
                            : 'Pending'}
                      </strong>
                    </li>
                  </ul>
                  <div className="shortcut-buttons">
                    <button type="button" onClick={handleAcknowledgeAlarm}>
                      Acknowledge alarm
                    </button>
                    <button type="button" onClick={() => handleAssignOwner('Supervisor')}>
                      Assign owner
                    </button>
                    <button type="button" onClick={handleCreateChangeRequest}>
                      Create CR
                    </button>
                    <button type="button" onClick={() => addMessage({
                      id: generateClientId(),
                      author: 'AI Assistant',
                      role: 'AI Assistant',
                      persona: 'ai',
                      timestamp: new Date().toISOString(),
                      body: 'Checklist started: confirm expedite quote, log pour shift, update DPPR.',
                    })}>
                      Add checklist
                    </button>
                    <button type="button" onClick={() => addTimelineEvent('Follow-up scheduled')}>
                      Schedule follow-up
                    </button>
                  </div>
                </div>
                <div className="context-panel">
                  <h3>Activity</h3>
                  <ul className="timeline-list">
                    {thread.timeline.map((event) => (
                      <li key={event.id}>
                        <strong>{event.label}</strong>
                        <span>{formatTimestamp(event.timestamp)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </aside>
        </div>
      </div>
      {inviteModalOpen ? (
        <div className="invite-modal-backdrop">
          <div className="invite-modal" role="dialog" aria-modal="true" aria-label="Invite collaborator">
            <header>
              <h3>Invite collaborator</h3>
              <button type="button" onClick={closeInviteModal} aria-label="Close invite form">
                ✕
              </button>
            </header>
            <form onSubmit={handleInviteSubmit}>
              <label>
                <span>Full name</span>
                <input
                  value={inviteForm.name}
                  onChange={(event) => handleInviteFieldChange('name', event.target.value)}
                  placeholder="Jamie Rivera"
                />
              </label>
              <label>
                <span>Role / title</span>
                <input
                  value={inviteForm.role}
                  onChange={(event) => handleInviteFieldChange('role', event.target.value)}
                  placeholder="SCM Lead"
                />
              </label>
              <label>
                <span>Persona alignment</span>
                <select value={inviteForm.persona} onChange={(event) => handleInviteFieldChange('persona', event.target.value)}>
                  {PERSONA_ORDER.map((persona) => (
                    <option key={persona} value={persona}>
                      {PERSONA_HIERARCHY_LABEL[persona]} · {PERSONA_DEFAULTS[persona]?.role ?? PERSONA_DEFAULTS.engineer.role}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>History access</legend>
                <label>
                  <input
                    type="radio"
                    name="history-access"
                    value="full"
                    checked={inviteForm.historyAccess === 'full'}
                    onChange={(event) => handleInviteFieldChange('historyAccess', event.target.value)}
                  />
                  Share previous conversation
                </label>
                <label>
                  <input
                    type="radio"
                    name="history-access"
                    value="current"
                    checked={inviteForm.historyAccess === 'current'}
                    onChange={(event) => handleInviteFieldChange('historyAccess', event.target.value)}
                  />
                  Share from current message only
                </label>
              </fieldset>
              <div className="invite-modal-actions">
                <button type="button" className="secondary" onClick={closeInviteModal}>
                  Cancel
                </button>
                <button type="submit">Send invite</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
