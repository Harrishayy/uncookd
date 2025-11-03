import { Box } from 'tldraw'
import z from 'zod'
import { AgentHelpers } from '../AgentHelpers'
import { AreaContextItem } from '../types/ContextItem'
import { Streaming } from '../types/Streaming'
import { AgentActionUtil } from './AgentActionUtil'
import { checkCompletion, getCompletionReport, CompletionCheckResult } from '../CompletionChecker'

const ReviewAction = z
	.object({
		_type: z.literal('review'),
		intent: z.string(),
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
	})
	.meta({
		title: 'Review',
		description:
			'The AI schedules further work or a review so that it can look at the results of its work so far and take further action, such as reviewing what it has done or taking further steps that would benefit from seeing the results of its work so far.',
	})

type ReviewAction = z.infer<typeof ReviewAction>

export class ReviewActionUtil extends AgentActionUtil<ReviewAction> {
	static override type = 'review' as const

	override getSchema() {
		return ReviewAction
	}

	override getInfo(action: Streaming<ReviewAction>) {
		const label = action.complete ? 'Review' : 'Reviewing'
		const text = action.intent?.startsWith('#') ? `\n\n${action.intent}` : action.intent
		const description = `**${label}:** ${text ?? ''}`

		return {
			icon: 'search' as const,
			description,
		}
	}

	override applyAction(action: Streaming<ReviewAction>, helpers: AgentHelpers) {
		if (!action.complete) return
		if (!this.agent) return

		const reviewBounds = helpers.removeOffsetFromBox({
			x: action.x,
			y: action.y,
			w: action.w,
			h: action.h,
		})

		const contextArea: AreaContextItem = {
			type: 'area',
			bounds: reviewBounds,
			source: 'agent',
		}

		// If the review area is outside the already-scheduled bounds, expand the bounds to include it
		const scheduledRequest = this.agent.$scheduledRequest.get()
		const bounds = scheduledRequest
			? Box.From(scheduledRequest.bounds).union(reviewBounds)
			: reviewBounds

		// Run completion check to provide concrete feedback
		const chatHistory = this.agent.$chatHistory.get()
		const promptItems = chatHistory.filter((item) => item.type === 'prompt')
		const originalPrompt =
			promptItems.length > 0 && promptItems[promptItems.length - 1].type === 'prompt'
				? (promptItems[promptItems.length - 1] as any).message
				: ''

		// Perform completion check
		const completionResult = checkCompletion(
			this.agent.editor,
			originalPrompt,
			chatHistory,
			reviewBounds
		)

		// Get completion report to include in review message
		const completionReport = getCompletionReport(completionResult, originalPrompt)

		// Schedule the review with completion check results
		const reviewMessage = getReviewMessage(action.intent, completionReport, completionResult)
		
		// If force continuation is needed, add a todo to ensure agent keeps working
		if (completionResult && completionResult.forceContinuation && completionResult.continuationReasons.length > 0) {
			// Add todo items for each unfulfilled intent to force continuation
			completionResult.continuationReasons.slice(0, 3).forEach((reason) => {
				this.agent?.addTodo(`Fulfill action intent: ${reason.substring(0, 100)}`)
			})
			console.log('[ReviewActionUtil] Force continuation - added todos to ensure agent keeps working')
		}
		
		this.agent.schedule({
			bounds,
			message: reviewMessage,
			contextItems: [contextArea],
		})
	}
}

function getReviewMessage(
	intent: string,
	completionReport?: string,
	completionResult?: CompletionCheckResult
) {
	let reportSection = ''
	if (completionReport && completionResult) {
		reportSection = `\n\n**AUTOMATED COMPLETION CHECK RESULTS:**\n\n${completionReport}\n\n`
		
		if (!completionResult.isComplete) {
			reportSection += `⚠️ **CRITICAL**: The automated check found incomplete requirements. You MUST address these before finishing.\n\n`
		}
		
		if (completionResult.forceContinuation && completionResult.continuationReasons.length > 0) {
			reportSection += `\n🚨 **FORCE CONTINUATION REQUIRED**:\n\n`
			reportSection += `**Action intents were NOT fulfilled on the canvas. You MUST continue working immediately and cannot finish until all action intents are verified as complete.**\n\n`
			reportSection += `**Unfulfilled Action Intents:**\n`
			completionResult.continuationReasons.forEach((reason) => {
				reportSection += `- ${reason}\n`
			})
			reportSection += `\n`
		}
	}

	return `Examine the actions that you (the agent) took since the most recent user message, with the intent: "${intent}". This is a SELF-REVIEW to verify completion.
${reportSection}

**YOU MUST COMPLETE THIS ENTIRE CHECKLIST BEFORE FINISHING:**

**CRITICAL SELF-REVIEW CHECKLIST:**

1. **Re-read the original user request**: What exactly did the user ask for? List ALL requirements explicitly.
   - Extract every specific item, element, or requirement mentioned
   - Note any quantities (e.g., "2 windows", "3 branches")
   - Note any specific details (e.g., "pneumatic leg designs", "with labels")

2. **Review your action history**: Look at all actions you've taken (shown as [ACTION] in chat history). For each action:
   - Check the \`intent\` field - did you accomplish what each intent stated?
   - Verify each action actually completed its intended purpose
   - Count how many actions you took - is it sufficient for the task?
   - Look for patterns: Did you create all required elements? Did you address all parts of the request?

3. **Check your todo list**: 
   - Are ALL items marked as "done"? 
   - If any items are "todo" or "in-progress", you MUST complete them before finishing
   - Compare your todo list items against the original request - did you create todos for everything needed?

4. **Compare against the canvas image**: Look at what's actually visible in the image. Does it match what was requested?
   - Are ALL requested elements present and visible?
   - Are there any missing components mentioned in the original request?
   - Is the content accurate and correct?
   - For mind maps: Are all branches present? Are all ideas connected?
   - For diagrams: Are all components present? Are connections correct?

5. **Verify accuracy**: For math problems, equations, or educational content:
   - Double-check all calculations
   - Verify formulas are correct
   - Ensure all steps are present and accurate

6. **Action-by-action verification**: Go through each [ACTION] you took:
   - Action 1: [Check what it was supposed to do] - Was it completed?
   - Action 2: [Check what it was supposed to do] - Was it completed?
   - Continue for all actions...
   - Are there any actions whose intents were NOT fulfilled?

**COMPLETION DECISION (MANDATORY):**

Before making any decision, you MUST explicitly list each requirement from the original user request and mark it as ✓ COMPLETE or ✗ INCOMPLETE.

Example format:
- Requirement 1: "Create a mind map" → ✓ COMPLETE (central node and branches visible)
- Requirement 2: "Include 5 ideas" → ✗ INCOMPLETE (only 3 branches visible, need 2 more)
- Requirement 3: "Label each branch" → ✓ COMPLETE (all branches have labels)

- **If ALL requirements are marked ✓ COMPLETE AND all todos are done AND all actions completed their intents**: 
  - You can finish with a message to the user confirming completion
  - Summarize what you created
  - List what you verified (e.g., "Verified: Created mind map with 5 labeled branches as requested")
  
- **If ANY requirement is marked ✗ INCOMPLETE OR any todo is incomplete OR any action intent wasn't fulfilled**:
  - You MUST continue working to complete the missing parts
  - Create additional actions to address what's missing
  - Do NOT finish until everything is complete
  - Be specific about what's missing (e.g., "Need to add 2 more branches for ideas 4 and 5")

- **If you're unsure about ANY requirement**: 
  - Mark it as ✗ INCOMPLETE
  - Err on the side of continuing work
  - It's better to do one more check than to leave something incomplete
  - Use another review action if needed

**REMEMBER**: 
- Your action intents are commitments. If an action's intent says "create central node for mind map", there must be a central node visible in the image. If it says "add 3 branches", there must be 3 branches. Verify each intent was fulfilled.
- Half-completing a task is NOT acceptable. If the user asked for 5 items and you created 3, you're only 60% done. Finish the remaining 40%.
- The original user request is the source of truth. Compare EVERYTHING against what the user actually asked for.

Make sure to reference your last actions (denoted by [ACTION]) in order to see if you completed the task. Assume each action you see in the chat history completed successfully, but VERIFY that the results match what was intended.`
}
