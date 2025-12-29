import { API_URL } from '../config'
import type { CollaboratorPersona } from '../store/simulatorStore'

export type CollaboratorIntent = 'notify' | 'advise' | 'both'

type ConversationEntry = {
  role: 'user' | 'assistant'
  content: string
}

export type CollaboratorAgentRequest = {
  prompt: string
  persona: CollaboratorPersona
  intent: CollaboratorIntent
  context: Record<string, unknown>
  history: ConversationEntry[]
}

type CollaboratorAgentResponse = {
  reply?: string
}

export async function requestCollaboratorResponse(payload: CollaboratorAgentRequest): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/api/collaboration/ai/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new Error(`AI collaborator request failed with status ${response.status}`)
    }
    const data = (await response.json()) as CollaboratorAgentResponse
    const reply = data.reply?.trim()
    return reply && reply.length > 0 ? reply : null
  } catch (error) {
    console.warn('collaborator agent unavailable', error)
    return null
  }
}
