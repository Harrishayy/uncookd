'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
	DefaultSizeStyle,
	ErrorBoundary,
	TLComponents,
	Tldraw,
	TldrawUiToastsProvider,
	TLUiOverrides,
	useEditor,
	Editor,
	TLShapeId,
	TLDrawShape,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { TldrawAgent } from '@/client/agent/TldrawAgent'
import { useTldrawAgent } from '@/client/agent/useTldrawAgent'
import { CustomHelperButtons } from '@/client/components/CustomHelperButtons'
import { AgentViewportBoundsHighlight } from '@/client/components/highlights/AgentViewportBoundsHighlights'
import { ContextHighlights } from '@/client/components/highlights/ContextHighlights'
import { enableLinedFillStyle } from '@/client/enableLinedFillStyle'
import { TargetAreaTool } from '@/client/tools/TargetAreaTool'
import { TargetShapeTool } from '@/client/tools/TargetShapeTool'
import { AgentInput } from '@/shared/types/AgentInput'
import { AgentProgressPanel } from './AgentProgressPanel'

// Customize tldraw's styles to play to the agent's strengths
DefaultSizeStyle.setDefaultValue('s')
enableLinedFillStyle()

// Custom tools for picking context items
const tools = [TargetShapeTool, TargetAreaTool]
const overrides: TLUiOverrides = {
	tools: (editor, tools) => {
		return {
			...tools,
			'target-area': {
				id: 'target-area',
				label: 'Pick Area',
				kbd: 'c',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-area')
				},
			},
			'target-shape': {
				id: 'target-shape',
				label: 'Pick Shape',
				kbd: 's',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-shape')
				},
			},
		}
	},
}

export interface TldrawBoardEmbeddedProps {
	/** Unique identifier for this board instance */
	boardId?: string
	/** Prompt for the agent */
	agentPrompt?: AgentInput | null
	/** Whether to show agent highlights and helpers */
	showAgentUI?: boolean
	/** Callback when the agent completes a task */
	onAgentComplete?: () => void
	/** Callback when the agent encounters an error */
	onAgentError?: (error: any) => void
	/** Callback when a prompt is submitted from the progress panel */
	onPromptSubmit?: (prompt: string) => void
	/** Callback to expose agent for cleanup/disposal */
	onAgentReady?: (agent: TldrawAgent | null) => void
}

export default function TldrawBoardEmbedded({
	boardId = 'default-board',
	agentPrompt = null,
	showAgentUI = true,
	onAgentComplete,
	onAgentError,
	onPromptSubmit,
	onAgentReady,
}: TldrawBoardEmbeddedProps) {
	const [agent, setAgent] = useState<TldrawAgent | null>(null)
	
	// Expose agent to parent for cleanup
	useEffect(() => {
		if (onAgentReady) {
			onAgentReady(agent)
		}
	}, [agent, onAgentReady])

	// Custom components to visualize what the agent is doing
	const components: TLComponents = useMemo(() => {
		if (!showAgentUI || !agent) {
			return {}
		}
		
		return {
			// Hide HelperButtons to avoid black bar on top - they're not needed in embedded mode
			HelperButtons: () => null,
			InFrontOfTheCanvas: () => (
				<>
					<AgentViewportBoundsHighlight agent={agent} />
					<ContextHighlights agent={agent} />
				</>
			),
		}
	}, [agent, showAgentUI])

	return (
		<TldrawUiToastsProvider>
			<div className="tldraw-board-embedded" style={{ width: '100%', height: '100%', position: 'relative' }}>
				<Tldraw
					persistenceKey={`tldraw-board-${boardId}`}
					tools={tools}
					overrides={overrides}
					components={components}
				>
					<BoardInner
						agentPrompt={agentPrompt}
						setAgent={setAgent}
						onAgentComplete={onAgentComplete}
						onAgentError={onAgentError}
					/>
				</Tldraw>
				{/* Progress Panel */}
				{agent && (
					<AgentProgressPanel 
						agents={new Map([['agent', agent]])} 
						onPromptSubmit={(agentId, prompt) => {
							if (onPromptSubmit) {
								onPromptSubmit(prompt)
							}
						}}
						onAgentStop={() => {
							console.log('[Agent] Stopped by user')
							agent.cancel()
						}}
						onChatReset={() => {
							console.log('[Agent] Chat history reset by user')
							agent.reset()
						}}
					/>
				)}
			</div>
		</TldrawUiToastsProvider>
	)
}

function BoardInner({
	agentPrompt,
	setAgent,
	onAgentComplete,
	onAgentError,
}: {
	agentPrompt: AgentInput | null
	setAgent: (agent: TldrawAgent | null) => void
	onAgentComplete?: () => void
	onAgentError?: (error: any) => void
}) {
	const editor = useEditor()
	const agent = useTldrawAgent(editor, 'agent')
	const processedPromptRef = useRef<string | null>(null)  // Track which prompt was processed
	const hasValidatedShapes = useRef<boolean>(false)

	// Validate and clean up invalid draw shapes on mount and when shapes change
	useEffect(() => {
		if (!editor || hasValidatedShapes.current) return

		try {
			const allShapes = editor.getCurrentPageShapes()
			const invalidDrawShapes: TLShapeId[] = []

			for (const shape of allShapes) {
				if (shape.type === 'draw') {
					const drawShape = shape as TLDrawShape
					const segments = drawShape.props?.segments
					
					if (segments && Array.isArray(segments)) {
						// Check each segment for valid point count
						if (segments.length === 0) {
							invalidDrawShapes.push(shape.id)
						} else {
							for (const segment of segments) {
								if (segment && segment.points) {
									if (!Array.isArray(segment.points) || segment.points.length < 2) {
										invalidDrawShapes.push(shape.id)
										break
									}
								}
							}
						}
					} else {
						// No segments or not an array
						invalidDrawShapes.push(shape.id)
					}
				}
			}

			// Delete invalid draw shapes
			if (invalidDrawShapes.length > 0) {
				console.warn(`[TldrawBoardEmbedded] Removing ${invalidDrawShapes.length} invalid draw shapes with insufficient points`)
				editor.deleteShapes(invalidDrawShapes)
			}

			hasValidatedShapes.current = true
		} catch (error) {
			console.error('[TldrawBoardEmbedded] Error validating shapes:', error)
		}
	}, [editor])

	// Register agent when it's created
	useEffect(() => {
		if (!agent || !editor) return
		
		setAgent(agent)

		// Set error handler
		if (onAgentError) {
			agent.onError = (error: any) => {
				console.error('[Agent] Error:', error)
				onAgentError(error)
			}
		}

		// Expose for debugging
		;(window as any).agent = agent
		;(window as any).editor = editor
	}, [agent, editor, setAgent, onAgentError])
	
	// Cleanup agent on unmount
	useEffect(() => {
		return () => {
			if (agent) {
				try {
					agent.dispose()
					console.log('[TldrawBoardEmbedded] Agent disposed on unmount')
				} catch (err) {
					console.error('[TldrawBoardEmbedded] Error disposing agent:', err)
				}
			}
		}
	}, [agent])

	// Track whiteboard updates and send to backend
	useEffect(() => {
		if (!editor) return

		let debounceTimer: NodeJS.Timeout | null = null

		// Listen for whiteboard changes with debouncing
		const handleUpdate = () => {
			// Clear existing timer
			if (debounceTimer) {
				clearTimeout(debounceTimer)
			}

			// Debounce API calls (send max once per second)
			debounceTimer = setTimeout(async () => {
				try {
					// Get current page state
					const pageState = editor.getInstanceState()
					const shapes = editor.getCurrentPageShapes()
					
					// Send update to backend
					const updateData = {
						pageState,
						shapesCount: shapes.length,
						timestamp: Date.now(),
					}

					const response = await fetch('/api/whiteboard-update', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							boardId: 'meeting-whiteboard',
							update: updateData,
						}),
					})

					if (response.ok) {
						const data = await response.json()
						console.log('[Whiteboard Update API] Response:', data)
						
						// Process any instructions returned from backend
						if (data.instructions && Array.isArray(data.instructions) && data.instructions.length > 0) {
							console.log('[Whiteboard Update API] Received instructions:', data.instructions)
							// TODO: Apply instructions to board if needed
						}
					}
				} catch (error) {
					console.error('[Whiteboard Update API] Error:', error)
				}
			}, 1000)
		}

		// Subscribe to editor changes
		const unsubscribe = editor.store.listen(() => {
			handleUpdate()
		})

		return () => {
			if (debounceTimer) {
				clearTimeout(debounceTimer)
			}
			unsubscribe()
		}
	}, [editor])

	// Process prompt when it changes
	useEffect(() => {
		if (!agent || !agentPrompt || !editor) {
			if (!agent) console.log('[Agent] Waiting for agent to be ready')
			if (!agentPrompt) console.log('[Agent] No prompt provided')
			if (!editor) console.log('[Agent] Waiting for editor to be ready')
			return
		}
		
		// Create a stable key for this prompt (normalize whitespace)
		const promptKey = typeof agentPrompt === 'string' 
			? agentPrompt.trim()
			: JSON.stringify(agentPrompt)
		
		// Skip if we've already processed this exact prompt (but allow retries after delay)
		if (processedPromptRef.current === promptKey) {
			console.log('[Agent] Prompt already processed, skipping:', promptKey.substring(0, 50))
			// Allow reprocessing after 5 seconds if it's the same prompt (in case of errors)
			setTimeout(() => {
				if (processedPromptRef.current === promptKey) {
					console.log('[Agent] Re-enabling prompt for retry after timeout')
					processedPromptRef.current = null
				}
			}, 5000)
			return
		}

		// Mark as processed
		processedPromptRef.current = promptKey

		console.log('[Agent] Processing new prompt:', promptKey.substring(0, 100))
		console.log('[Agent] Full prompt:', typeof agentPrompt === 'string' ? agentPrompt : JSON.stringify(agentPrompt, null, 2))

		// Execute prompt (use original agentPrompt, not the cleaned key)
		agent.prompt(agentPrompt)
			.then(() => {
				console.log('[Agent] Prompt completed successfully')
				// Don't reset processedPromptRef here - keep it so same prompt isn't reprocessed
				if (onAgentComplete) {
					onAgentComplete()
				}
			})
			.catch((error) => {
				console.error('[Agent] Prompt failed:', error)
				// Reset on error so we can retry
				processedPromptRef.current = null
				if (onAgentError) {
					onAgentError(error)
				}
			})
	}, [agent, agentPrompt, editor, onAgentComplete, onAgentError])

	return null
}

