import z from 'zod'
import { Streaming } from '../types/Streaming'
import { AgentActionUtil } from './AgentActionUtil'

const ClearAction = z
	.object({
		// All agent actions must have a _type field
		// We use an underscore to encourage the model to put this field first
		_type: z.literal('clear'),
	})
	.meta({
		// Give the action a title and description to tell the model what this action does
		title: 'Clear',
		description: 'The agent deletes all shapes on the canvas. WARNING: This action permanently deletes ALL content. Only use this when the user explicitly asks to clear, delete everything, start fresh, or erase all content. NEVER use this action when the user asks you to create or add content.',
	})

type ClearAction = z.infer<typeof ClearAction>

export class ClearActionUtil extends AgentActionUtil<ClearAction> {
	static override type = 'clear' as const

	/**
	 * Tell the model what the action's schema is
	 */
	override getSchema() {
		return ClearAction
	}

	/**
	 * Tell the model how to display this action in the chat history UI
	 */
	override getInfo() {
		return {
			icon: 'trash' as const,
			description: 'Cleared the canvas',
		}
	}

	/**
	 * Build a system message about when to use this action
	 */
	override buildSystemPrompt(): string {
		return `\n\n## CRITICAL: About the Clear Action

The \`clear\` action DELETES ALL SHAPES on the canvas permanently. This is a destructive action.

**WHEN TO USE:**
- ONLY when the user explicitly requests clearing, deleting everything, starting fresh, or erasing all content
- Examples: "clear the canvas", "delete everything", "start fresh", "erase all", "clear all"

**WHEN NOT TO USE:**
- When the user asks you to CREATE something (e.g., "create a mind map", "draw a house", "make a diagram")
- When the user asks you to ADD something (e.g., "add a node", "draw another shape")
- When the user asks you to UPDATE or MODIFY something
- When you're unsure whether clearing is requested - default to NOT clearing
- When the canvas is empty - there's nothing to clear

**CRITICAL RULE**: If the user asks you to CREATE, ADD, or MAKE something, you MUST create new content. NEVER use the \`clear\` action in these cases. Always create content alongside existing content unless explicitly asked to clear.\n\n`
	}

	/**
	 * Sanitize the action to prevent accidental clearing
	 */
	override sanitizeAction(action: Streaming<ClearAction>, helpers: AgentHelpers): Streaming<ClearAction> | null {
		if (!action.complete) return action
		
		// Get the most recent user message to check if clearing was explicitly requested
		const chatHistory = this.agent?.$chatHistory.get() || []
		const userMessages = chatHistory.filter(item => item.type === 'prompt')
		const lastUserMessage = userMessages[userMessages.length - 1]
		
		if (lastUserMessage && lastUserMessage.type === 'prompt') {
			const messageText = lastUserMessage.message.toLowerCase()
			const clearingKeywords = ['clear', 'delete everything', 'erase all', 'start fresh', 'wipe', 'remove all']
			const createKeywords = ['create', 'make', 'draw', 'add', 'build', 'generate', 'design']
			
			// Check if the message contains creation keywords but not clearing keywords
			const hasCreateKeyword = createKeywords.some(keyword => messageText.includes(keyword))
			const hasClearKeyword = clearingKeywords.some(keyword => messageText.includes(keyword))
			
			// If user asked to create/add but not explicitly to clear, reject the clear action
			if (hasCreateKeyword && !hasClearKeyword) {
				console.warn('[ClearActionUtil] Rejected clear action: User asked to create content, not clear')
				return null // Reject the action
			}
		}
		
		return action
	}

	/**
	 * Tell the model how to apply the action
	 */
	override applyAction(action: Streaming<ClearAction>) {
		// Don't do anything if the action hasn't finished streaming
		if (!action.complete) return

		// Delete all shapes on the page
		if (!this.agent) return
		const { editor } = this.agent

		const allShapes = editor.getCurrentPageShapes()
		editor.deleteShapes(allShapes)
	}
}
