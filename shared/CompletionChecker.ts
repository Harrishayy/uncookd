import type { Editor, TLShape, TLTextShape, TLGeoShape, TLNoteShape, Box } from 'tldraw'
import type { ChatHistoryItem } from './types/ChatHistoryItem'
import type { AgentAction } from './types/AgentAction'

/**
 * Result of a completion check
 */
export interface CompletionCheckResult {
	/** Whether all requirements are complete */
	isComplete: boolean
	/** List of requirements that are complete */
	completeRequirements: string[]
	/** List of requirements that are incomplete */
	incompleteRequirements: string[]
	/** Detailed information about what's missing */
	missingDetails: string[]
	/** Position verification results */
	positionIssues: string[]
	/** Whether continuation should be forced (action intents not fulfilled) */
	forceContinuation: boolean
	/** Reasons why continuation is forced */
	continuationReasons: string[]
}

/**
 * Extract text content from a shape
 */
function extractShapeText(editor: Editor, shape: TLShape): string {
	const textContent: string[] = []
	
	// Check if shape has richText (text, geo, note, arrow shapes)
	if ('richText' in shape.props && shape.props.richText) {
		try {
			const richText = shape.props.richText
			// Extract plain text from rich text
			if (typeof richText === 'string') {
				textContent.push(richText)
			} else if (richText && typeof richText === 'object' && 'content' in richText) {
				// tldraw rich text format
				const extractText = (content: any): string => {
					if (typeof content === 'string') return content
					if (Array.isArray(content)) {
						return content.map(extractText).join('')
					}
					if (content && typeof content === 'object') {
						if ('text' in content) return content.text || ''
						if ('content' in content) return extractText(content.content)
					}
					return ''
				}
				textContent.push(extractText(richText))
			}
		} catch (e) {
			// Silently fail if we can't extract text
		}
	}
	
	return textContent.join(' ').trim()
}

/**
 * Get all shapes in a given area (bounds)
 */
function getShapesInBounds(editor: Editor, bounds: Box): TLShape[] {
	const allShapes = editor.getCurrentPageShapes()
	return allShapes.filter((shape) => {
		const shapeBounds = editor.getShapePageBounds(shape)
		if (!shapeBounds) return false
		// Check if shape overlaps with bounds
		return !(
			shapeBounds.maxX < bounds.minX ||
			shapeBounds.minX > bounds.maxX ||
			shapeBounds.maxY < bounds.minY ||
			shapeBounds.minY > bounds.maxY
		)
	})
}

/**
 * Parse requirements from the original user prompt
 */
function extractRequirementsFromPrompt(originalPrompt: string): {
	requirements: string[]
	quantities: Map<string, number>
	keywords: string[]
} {
	const requirements: string[] = []
	const quantities = new Map<string, number>()
	const keywords: string[] = []
	
	// Extract quantity requirements (e.g., "3 branches", "2 windows")
	const quantityPattern = /(\d+)\s+(\w+)/gi
	let match
	while ((match = quantityPattern.exec(originalPrompt)) !== null) {
		const count = parseInt(match[1], 10)
		const item = match[2].toLowerCase()
		quantities.set(item, count)
		requirements.push(`${count} ${item}`)
		keywords.push(item)
	}
	
	// Extract explicit requirements (e.g., "with labels", "including arrows")
	const requirementPatterns = [
		/with\s+(\w+)/gi,
		/including\s+(\w+)/gi,
		/must\s+have\s+(\w+)/gi,
		/should\s+include\s+(\w+)/gi,
	]
	
	requirementPatterns.forEach((pattern) => {
		let match
		while ((match = pattern.exec(originalPrompt)) !== null) {
			const req = match[1].toLowerCase()
			requirements.push(`with ${req}`)
			keywords.push(req)
		}
	})
	
	// Extract main subject/object (e.g., "draw a house", "create a mind map")
	const mainPatterns = [
		/draw\s+(?:a|an|the)?\s+([^.]+?)(?:\.|$|with|including)/i,
		/create\s+(?:a|an|the)?\s+([^.]+?)(?:\.|$|with|including)/i,
		/make\s+(?:a|an|the)?\s+([^.]+?)(?:\.|$|with|including)/i,
		/show\s+(?:a|an|the)?\s+([^.]+?)(?:\.|$|with|including)/i,
	]
	
	mainPatterns.forEach((pattern) => {
		const match = originalPrompt.match(pattern)
		if (match && match[1]) {
			const mainItem = match[1].trim().toLowerCase()
			requirements.push(mainItem)
			keywords.push(...mainItem.split(/\s+/))
		}
	})
	
	return { requirements, quantities, keywords }
}

/**
 * Check if shapes match quantity requirements
 */
function checkQuantities(
	editor: Editor,
	shapes: TLShape[],
	quantities: Map<string, number>,
	bounds?: Box
): { complete: string[]; incomplete: string[]; missing: string[] } {
	const complete: string[] = []
	const incomplete: string[] = []
	const missing: string[] = []
	
	// Filter shapes to bounds if provided
	const relevantShapes = bounds ? getShapesInBounds(editor, bounds) : shapes
	
	quantities.forEach((requiredCount, item) => {
		// Try to match shapes by type or text content
		let foundCount = 0
		
		for (const shape of relevantShapes) {
			const text = extractShapeText(editor, shape).toLowerCase()
			const shapeType = shape.type.toLowerCase()
			
			// Check if shape matches the item
			if (
				text.includes(item) ||
				shapeType.includes(item) ||
				(shape.props as any)?.text?.toLowerCase()?.includes(item)
			) {
				foundCount++
			}
		}
		
		if (foundCount >= requiredCount) {
			complete.push(`${requiredCount} ${item} (found ${foundCount})`)
		} else {
			const missingCount = requiredCount - foundCount
			incomplete.push(`${requiredCount} ${item} (found ${foundCount}, need ${missingCount} more)`)
			missing.push(`Need ${missingCount} more ${item}`)
		}
	})
	
	return { complete, incomplete, missing }
}

/**
 * Check if shapes have required labels/text
 */
function checkLabels(shapes: TLShape[], editor: Editor): {
	hasLabels: boolean
	labelCount: number
	shapesWithoutLabels: number
} {
	let labelCount = 0
	let shapesWithoutLabels = 0
	
	for (const shape of shapes) {
		const text = extractShapeText(editor, shape)
		if (text && text.length > 0) {
			labelCount++
		} else {
			shapesWithoutLabels++
		}
	}
	
	return {
		hasLabels: labelCount > 0,
		labelCount,
		shapesWithoutLabels,
	}
}

/**
 * Check if shapes are positioned correctly (within expected bounds)
 */
function checkPositions(
	editor: Editor,
	shapes: TLShape[],
	expectedBounds?: Box,
	originalPrompt?: string
): string[] {
	const issues: string[] = []
	
	if (!expectedBounds) return issues
	
	// Check if shapes are within expected area
	for (const shape of shapes) {
		const bounds = editor.getShapePageBounds(shape)
		if (!bounds) continue
		
		// Check if shape is outside expected bounds (with some tolerance)
		const tolerance = 50 // pixels
		if (
			bounds.minX < expectedBounds.minX - tolerance ||
			bounds.maxX > expectedBounds.maxX + tolerance ||
			bounds.minY < expectedBounds.minY - tolerance ||
			bounds.maxY > expectedBounds.maxY + tolerance
		) {
			// Only report if it's significantly outside
			const isSignificantlyOutside =
				bounds.minX < expectedBounds.minX - tolerance * 2 ||
				bounds.maxX > expectedBounds.maxX + tolerance * 2 ||
				bounds.minY < expectedBounds.minY - tolerance * 2 ||
				bounds.maxY > expectedBounds.maxY + tolerance * 2
			
			if (isSignificantlyOutside) {
				const shapeText = extractShapeText(editor, shape) || shape.type
				issues.push(`Shape "${shapeText}" is positioned outside expected area`)
			}
		}
	}
	
	// Check for relative positioning requirements (e.g., "above", "below", "next to")
	if (originalPrompt) {
		const positioningKeywords = [
			{ word: 'above', check: (a: Box, b: Box) => a.maxY < b.minY },
			{ word: 'below', check: (a: Box, b: Box) => a.minY > b.maxY },
			{ word: 'left', check: (a: Box, b: Box) => a.maxX < b.minX },
			{ word: 'right', check: (a: Box, b: Box) => a.minX > b.maxX },
			{ word: 'center', check: (a: Box, b: Box) => Math.abs(a.midX - b.midX) < 50 },
		]
		
		const promptLower = originalPrompt.toLowerCase()
		positioningKeywords.forEach(({ word, check }) => {
			if (promptLower.includes(word)) {
				// Try to verify relative positioning (simplified check)
				// This would need more sophisticated parsing in a real implementation
			}
		})
	}
	
	return issues
}

/**
 * Robust completion checker that verifies all drawing requirements are met
 * and checks if content is position-aware
 */
export function checkCompletion(
	editor: Editor,
	originalPrompt: string,
	chatHistory: ChatHistoryItem[],
	expectedBounds?: Box
): CompletionCheckResult {
	const result: CompletionCheckResult = {
		isComplete: true,
		completeRequirements: [],
		incompleteRequirements: [],
		missingDetails: [],
		positionIssues: [],
		forceContinuation: false,
		continuationReasons: [],
	}
	
	// Get all shapes on the canvas
	const allShapes = editor.getCurrentPageShapes()
	const relevantShapes = expectedBounds ? getShapesInBounds(editor, expectedBounds) : allShapes
	
	if (relevantShapes.length === 0 && allShapes.length > 0) {
		result.isComplete = false
		result.incompleteRequirements.push('No shapes found in expected area')
		result.missingDetails.push('Shapes exist but are not in the expected position')
		return result
	}
	
	if (allShapes.length === 0) {
		result.isComplete = false
		result.incompleteRequirements.push('No shapes created')
		result.missingDetails.push('The canvas is empty - no content has been drawn')
		return result
	}
	
	// Extract requirements from prompt
	const { requirements, quantities, keywords } = extractRequirementsFromPrompt(originalPrompt)
	
	// Check quantity requirements
	if (quantities.size > 0) {
		const quantityCheck = checkQuantities(editor, relevantShapes, quantities, expectedBounds)
		result.completeRequirements.push(...quantityCheck.complete)
		result.incompleteRequirements.push(...quantityCheck.incomplete)
		result.missingDetails.push(...quantityCheck.missing)
		
		if (quantityCheck.incomplete.length > 0) {
			result.isComplete = false
		}
	}
	
	// Check for label requirements
	if (requirements.some((r) => r.includes('label'))) {
		const labelCheck = checkLabels(relevantShapes, editor)
		if (labelCheck.shapesWithoutLabels > 0) {
			result.isComplete = false
			result.incompleteRequirements.push(
				`${labelCheck.shapesWithoutLabels} shapes are missing labels`
			)
			result.missingDetails.push(
				`Only ${labelCheck.labelCount} out of ${relevantShapes.length} shapes have labels`
			)
		} else {
			result.completeRequirements.push(`All ${relevantShapes.length} shapes have labels`)
		}
	}
	
	// Check keyword requirements (e.g., "tree", "house", "arrow")
	keywords.forEach((keyword) => {
		if (keyword.length < 3) return // Skip short keywords
		
		let found = false
		for (const shape of relevantShapes) {
			const text = extractShapeText(editor, shape).toLowerCase()
			const shapeType = shape.type.toLowerCase()
			
			if (text.includes(keyword) || shapeType.includes(keyword)) {
				found = true
				break
			}
		}
		
		if (!found) {
			// Check in action history - maybe it was supposed to be created
			const wasCreated = chatHistory.some((item) => {
				if (item.type === 'action' && item.action) {
					const action = item.action as AgentAction
					const intent = (action as any).intent?.toLowerCase() || ''
					return intent.includes(keyword)
				}
				return false
			})
			
			if (!wasCreated) {
				result.isComplete = false
				result.incompleteRequirements.push(`Missing: ${keyword}`)
				result.missingDetails.push(`No shape found matching requirement: ${keyword}`)
			}
		} else {
			result.completeRequirements.push(`Found: ${keyword}`)
		}
	})
	
	// Check positions if expected bounds provided
	if (expectedBounds) {
		const positionIssues = checkPositions(editor, relevantShapes, expectedBounds, originalPrompt)
		result.positionIssues = positionIssues
		if (positionIssues.length > 0) {
			result.isComplete = false
		}
	}
	
	// Verify action intents were fulfilled - CRITICAL CHECK
	const actionIntentsCheck = verifyActionIntents(editor, chatHistory, relevantShapes, expectedBounds)
	result.completeRequirements.push(...actionIntentsCheck.fulfilled)
	result.incompleteRequirements.push(...actionIntentsCheck.unfulfilled)
	result.missingDetails.push(...actionIntentsCheck.missingDetails)
	
	if (actionIntentsCheck.unfulfilled.length > 0) {
		result.isComplete = false
		result.forceContinuation = true
		result.continuationReasons.push(
			`${actionIntentsCheck.unfulfilled.length} action intent(s) were NOT fulfilled on canvas`
		)
		result.continuationReasons.push(...actionIntentsCheck.unfulfilled.slice(0, 5)) // First 5 reasons
	}
	
	// Check create actions vs actual shapes
	const createActions = chatHistory.filter(
		(item) => item.type === 'action' && (item.action as any)?._type === 'create'
	)
	
	if (createActions.length > 0 && relevantShapes.length < createActions.length) {
		const missingActions = createActions.length - relevantShapes.length
		result.isComplete = false
		result.incompleteRequirements.push(
			`${missingActions} created shape(s) may be missing from canvas`
		)
		result.missingDetails.push(
			`Expected ${createActions.length} shapes from actions, found ${relevantShapes.length}`
		)
	}
	
	return result
}

/**
 * Verify that each action's intent was actually fulfilled on the canvas
 * This is the core verification that checks agent progress
 */
function verifyActionIntents(
	editor: Editor,
	chatHistory: ChatHistoryItem[],
	shapes: TLShape[],
	expectedBounds?: Box
): {
	fulfilled: string[]
	unfulfilled: string[]
	missingDetails: string[]
} {
	const fulfilled: string[] = []
	const unfulfilled: string[] = []
	const missingDetails: string[] = []
	
	// Get all actions from chat history
	const actions = chatHistory
		.filter((item) => item.type === 'action')
		.map((item) => item.action)
		.filter((action) => action && action.complete)
	
	// Group by action type
	const createActions = actions.filter((a: any) => a._type === 'create')
	const labelActions = actions.filter((a: any) => a._type === 'label')
	const moveActions = actions.filter((a: any) => a._type === 'move')
	const updateActions = actions.filter((a: any) => a._type === 'update')
	
	// Verify create actions
	createActions.forEach((action: any, index: number) => {
		const intent = action.intent?.toLowerCase() || ''
		const actionType = action._type || 'create'
		
		if (!intent) {
			// Action without intent - check if shape was created
			if (action.shape) {
				const shapeId = action.shape.shapeId || ''
				const shape = shapes.find((s) => s.id.includes(shapeId.split(':').pop() || ''))
				if (shape) {
					fulfilled.push(`Create action ${index + 1}: shape exists on canvas`)
				} else {
					unfulfilled.push(`Create action ${index + 1}: shape not found on canvas`)
					missingDetails.push(
						`Action created shape "${action.shape._type || 'unknown'}" but it's not visible on canvas`
					)
				}
			}
			return
		}
		
		// Check if intent was fulfilled
		let intentFulfilled = false
		const intentWords = intent.split(/\s+/).filter((w: string) => w.length > 2)
		
		// Try to find evidence on canvas that intent was fulfilled
		for (const shape of shapes) {
			const shapeText = extractShapeText(editor, shape).toLowerCase()
			const shapeType = shape.type.toLowerCase()
			const shapeNote = (shape.meta as any)?.note?.toLowerCase() || ''
			
			// Check if shape text, type, or note matches intent keywords
			const matchesIntent = intentWords.some((word: string) => {
				return (
					shapeText.includes(word) ||
					shapeType.includes(word) ||
					shapeNote.includes(word) ||
					intent.includes(shapeType)
				)
			})
			
			if (matchesIntent) {
				// Found a shape that matches the intent
				intentFulfilled = true
				
				// Verify specific quantities if mentioned in intent
				const quantityMatch = intent.match(/(\d+)\s+(\w+)/)
				if (quantityMatch) {
					const requiredCount = parseInt(quantityMatch[1], 10)
					const item = quantityMatch[2].toLowerCase()
					
					// Count shapes matching this item
					let matchingCount = 0
					for (const s of shapes) {
						const sText = extractShapeText(editor, s).toLowerCase()
						const sType = s.type.toLowerCase()
						if (sText.includes(item) || sType.includes(item)) {
							matchingCount++
						}
					}
					
					if (matchingCount < requiredCount) {
						intentFulfilled = false
						unfulfilled.push(
							`Intent "${intent}" - found ${matchingCount} but need ${requiredCount}`
						)
						missingDetails.push(
							`Action intent requires ${requiredCount} ${item}, but only ${matchingCount} found on canvas`
						)
					} else {
						fulfilled.push(`Intent "${intent}" - ✓ FULFILLED (${matchingCount} found)`)
					}
				} else {
					fulfilled.push(`Intent "${intent}" - ✓ FULFILLED`)
				}
				break
			}
		}
		
		if (!intentFulfilled) {
			unfulfilled.push(`Intent "${intent}" - ✗ NOT FULFILLED`)
			missingDetails.push(
				`Action intent: "${intent}" - no matching content found on canvas. This action's goal was not accomplished.`
			)
		}
	})
	
	// Verify label actions
	labelActions.forEach((action: any, index: number) => {
		const intent = action.intent?.toLowerCase() || ''
		const shapeId = action.shapeId || ''
		
		if (!shapeId) return
		
		// Find the shape that should have been labeled
		const shape = shapes.find((s) => {
			const id = s.id.replace('shape:', '')
			return id === shapeId || s.id.includes(shapeId)
		})
		
		if (!shape) {
			unfulfilled.push(`Label action ${index + 1}: target shape not found`)
			missingDetails.push(`Cannot verify label action - shape ${shapeId} not on canvas`)
			return
		}
		
		const shapeText = extractShapeText(editor, shape)
		if (intent && shapeText) {
			// Check if label text matches intent
			if (shapeText.toLowerCase().includes(intent) || intent.includes(shapeText.toLowerCase())) {
				fulfilled.push(`Label intent "${intent}" - ✓ FULFILLED`)
			} else {
				unfulfilled.push(`Label intent "${intent}" - text doesn't match`)
				missingDetails.push(
					`Label action intent was "${intent}" but shape has text "${shapeText.substring(0, 50)}"`
				)
			}
		} else if (!shapeText && intent) {
			unfulfilled.push(`Label intent "${intent}" - shape has no text`)
			missingDetails.push(`Shape should have label "${intent}" but has no text content`)
		} else if (shapeText) {
			fulfilled.push(`Label action ${index + 1} - shape has label`)
		}
	})
	
	// Check for actions with specific progress markers (e.g., "step 1", "part 2", "branch A")
	const progressKeywords = ['step', 'part', 'branch', 'item', 'component', 'element', 'stage']
	actions.forEach((action: any) => {
		const intent = (action.intent || '').toLowerCase()
		if (!intent) return
		
		// Check if intent mentions progress markers
		progressKeywords.forEach((keyword) => {
			const progressPattern = new RegExp(`${keyword}\\s+(\\d+|\\w+)`, 'i')
			const match = intent.match(progressPattern)
			if (match) {
				const progressItem = match[0] // e.g., "step 1", "branch A"
				const itemType = keyword
				
				// Try to find this progress item on canvas
				let found = false
				for (const shape of shapes) {
					const text = extractShapeText(editor, shape).toLowerCase()
					const note = ((shape.meta as any)?.note || '').toLowerCase()
					
					if (
						text.includes(progressItem.toLowerCase()) ||
						note.includes(progressItem.toLowerCase()) ||
						text.includes(`${itemType} ${match[1]}`)
					) {
						found = true
						break
					}
				}
				
				if (!found && intent.includes(keyword)) {
					unfulfilled.push(`Progress marker "${progressItem}" from intent not found`)
					missingDetails.push(
						`Action intent mentions "${progressItem}" but no corresponding content found on canvas`
					)
				}
			}
		})
	})
	
	return { fulfilled, unfulfilled, missingDetails }
}

/**
 * Get a human-readable completion report
 */
export function getCompletionReport(result: CompletionCheckResult, originalPrompt: string): string {
	const lines: string[] = []
	
	lines.push(`## Completion Check Report`)
	lines.push(`**Original Request:** "${originalPrompt}"`)
	lines.push(``)
	lines.push(`**Status:** ${result.isComplete ? '✓ COMPLETE' : '✗ INCOMPLETE'}`)
	lines.push(``)
	
	if (result.completeRequirements.length > 0) {
		lines.push(`### ✓ Complete Requirements:`)
		result.completeRequirements.forEach((req) => {
			lines.push(`- ${req}`)
		})
		lines.push(``)
	}
	
	if (result.incompleteRequirements.length > 0) {
		lines.push(`### ✗ Incomplete Requirements:`)
		result.incompleteRequirements.forEach((req) => {
			lines.push(`- ${req}`)
		})
		lines.push(``)
	}
	
	if (result.missingDetails.length > 0) {
		lines.push(`### Missing Details:`)
		result.missingDetails.forEach((detail) => {
			lines.push(`- ${detail}`)
		})
		lines.push(``)
	}
	
	if (result.positionIssues.length > 0) {
		lines.push(`### Position Issues:`)
		result.positionIssues.forEach((issue) => {
			lines.push(`- ${issue}`)
		})
		lines.push(``)
	}
	
	if (result.forceContinuation && result.continuationReasons.length > 0) {
		lines.push(`### ⚠️ FORCE CONTINUATION REQUIRED:`)
		lines.push(`**The agent MUST continue working to complete unfulfilled action intents.**`)
		lines.push(``)
		result.continuationReasons.forEach((reason) => {
			lines.push(`- ${reason}`)
		})
		lines.push(``)
		lines.push(
			`**ACTION REQUIRED**: Create additional actions to fulfill these intents. Do NOT finish until all action intents are verified as complete on the canvas.`
		)
		lines.push(``)
	}
	
	return lines.join('\n')
}

