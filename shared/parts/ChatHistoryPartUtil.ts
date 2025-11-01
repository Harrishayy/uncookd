import { structuredClone } from 'tldraw'
import { AgentHelpers } from '../AgentHelpers'
import { AgentMessage, AgentMessageContent } from '../types/AgentMessage'
import { AgentRequest } from '../types/AgentRequest'
import { BasePromptPart } from '../types/BasePromptPart'
import { ChatHistoryItem } from '../types/ChatHistoryItem'
import { PromptPartUtil } from './PromptPartUtil'

export interface ChatHistoryPart extends BasePromptPart<'chatHistory'> {
	items: ChatHistoryItem[] | null
}

export class ChatHistoryPartUtil extends PromptPartUtil<ChatHistoryPart> {
	static override type = 'chatHistory' as const

	override getPriority() {
		return Infinity // history should appear first in the prompt (low priority)
	}

	override async getPart(_request: AgentRequest, helpers: AgentHelpers) {
		if (!this.agent) return { type: 'chatHistory' as const, items: null }

		const items = structuredClone(this.agent.$chatHistory.get())

		for (const historyItem of items) {
			if (historyItem.type !== 'prompt') continue

			// Offset and round the context items of each history item
			const contextItems = historyItem.contextItems.map((contextItem) => {
				const offsetContextItem = helpers.applyOffsetToContextItem(contextItem)
				return helpers.roundContextItem(offsetContextItem)
			})

			historyItem.contextItems = contextItems
		}

		return {
			type: 'chatHistory' as const,
			items,
		}
	}

	override buildMessages({ items }: ChatHistoryPart): AgentMessage[] {
		if (!items) return []

		const messages: AgentMessage[] = []
		const priority = this.getPriority()

		// If the last message is from the user, skip it
		const lastIndex = items.length - 1
		let end = items.length
		if (end > 0 && items[lastIndex].type === 'prompt') {
			end = lastIndex
		}

		// Build regular history messages
		for (let i = 0; i < end; i++) {
			const item = items[i]
			const message = this.buildHistoryItemMessage(item, priority)
			if (message) messages.push(message)
		}

		// Add a summary of recent actions to help prevent repetition
		if (end > 0) {
			const recentActions = items.slice(Math.max(0, end - 15), end).filter(item => item.type === 'action')
			if (recentActions.length > 0) {
				const actionSummaries = recentActions.map((item, idx) => {
					if (item.type !== 'action') return null
					const action = item.action
					const actionType = action._type
					// Extract key info from action
					let summary = `${idx + 1}. ${actionType}`
					if ('intent' in action && action.intent) {
						summary += `: ${action.intent}`
					} else if (actionType === 'create' && 'shape' in action && action.shape) {
						summary += `: created ${(action.shape as any)._type || 'shape'}`
					} else if (actionType === 'message' && 'text' in action && action.text) {
						summary += `: "${(action.text as string).substring(0, 50)}..."`
					}
					return summary
				}).filter(Boolean)

				if (actionSummaries.length > 0) {
					messages.push({
						role: 'assistant',
						content: [{
							type: 'text',
							text: `\n[IMPORTANT: YOUR RECENT ACTIONS - CHECK THIS BEFORE REPEATING ANY ACTION]\nRecent action summary (last ${actionSummaries.length} actions):\n${actionSummaries.join('\n')}\n\n**CRITICAL**: Before creating any new action, verify it's not already in this list above. Do NOT repeat actions that appear here.\n`
						}],
						priority: priority - 1, // Higher priority (lower number) so it appears near the end
					})
				}
			}
		}

		return messages
	}

	private buildHistoryItemMessage(item: ChatHistoryItem, priority: number): AgentMessage | null {
		switch (item.type) {
			case 'prompt': {
				const content: AgentMessageContent[] = []

				if (item.message.trim() !== '') {
					content.push({
						type: 'text',
						text: item.message,
					})
				}

				if (item.contextItems.length > 0) {
					for (const contextItem of item.contextItems) {
						switch (contextItem.type) {
							case 'shape': {
								const simpleShape = contextItem.shape
								content.push({
									type: 'text',
									text: `[CONTEXT]: ${JSON.stringify(simpleShape)}`,
								})
								break
							}
							case 'shapes': {
								const simpleShapes = contextItem.shapes
								content.push({
									type: 'text',
									text: `[CONTEXT]: ${JSON.stringify(simpleShapes)}`,
								})
								break
							}
							default: {
								content.push({
									type: 'text',
									text: `[CONTEXT]: ${JSON.stringify(contextItem)}`,
								})
								break
							}
						}
					}
				}

				if (content.length === 0) {
					return null
				}

				return {
					role: 'user',
					content,
					priority,
				}
			}
			case 'continuation': {
				if (item.data.length === 0) {
					return null
				}
				const text = `[DATA RETRIEVED]: ${JSON.stringify(item.data)}`
				return {
					role: 'assistant',
					content: [{ type: 'text', text }],
					priority,
				}
			}
			case 'action': {
				const { action } = item
				let text: string
				switch (action._type) {
					case 'message': {
						text = action.text || '<message data lost>'
						break
					}
					case 'think': {
						text = '[THOUGHT]: ' + (action.text || '<thought data lost>')
						break
					}
					default: {
						const { complete: _complete, time: _time, ...rawAction } = action || {}
						text = '[ACTION]: ' + JSON.stringify(rawAction)
						break
					}
				}
				return {
					role: 'assistant',
					content: [{ type: 'text', text }],
					priority,
				}
			}
		}
	}

	override buildSystemPrompt(_part: ChatHistoryPart): string {
		return `\n\n## CRITICAL: Preventing Action Repetition

Before taking ANY action, you MUST:

1. **Review your recent action history** (shown in your chat history above). Check if you've already performed a similar action in your last 5-10 actions.

2. **Check your todo list**: If a task is marked as "done", DO NOT repeat that action.

3. **Before creating any shape:**
   - Check if a similar shape with the same purpose already exists in your recent actions
   - Look at the canvas description to see if the shape is already present
   - If unsure, use a \`review\` action first instead of creating duplicates

4. **Pattern detection**: If you notice yourself repeating the same type of action (e.g., creating multiple roofs, adding the same door multiple times), STOP immediately. This is a sign you're stuck in a loop.

5. **Completion check**: When you complete an action, mark the corresponding todo as "done". Do not repeat actions for completed todos.

Remember: Creating one roof is correct. Creating 10 roofs is a critical error. Always check before acting.\n\n`
	}
}
