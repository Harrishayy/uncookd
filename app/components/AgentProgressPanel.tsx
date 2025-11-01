'use client'

import React, { useEffect, useRef, useState } from 'react'
import { TldrawAgent } from '@/client/agent/TldrawAgent'
import { getActionInfo } from '@/client/components/chat-history/getActionInfo'
import { ChatHistorySection, getAgentHistorySections } from '@/client/components/chat-history/ChatHistorySection'
import { getActionHistoryGroups } from '@/client/components/chat-history/ChatHistoryGroup'
import { AgentIcon } from '@/client/components/icons/AgentIcon'

export interface AgentProgressPanelProps {
	/** Map of agent IDs to their agent instances */
	agents: Map<string, TldrawAgent>
	/** Callback when a prompt is submitted */
	onPromptSubmit?: (agentId: string, prompt: string) => void
	/** Callback when an agent is stopped */
	onAgentStop?: (agentId: string) => void
	/** Callback when chat is reset */
	onChatReset?: (agentId: string) => void
}

export function AgentProgressPanel({ agents, onPromptSubmit, onAgentStop, onChatReset }: AgentProgressPanelProps) {
	const selectedAgent = agents.size > 0 ? Array.from(agents.values())[0] : null
	const [promptInput, setPromptInput] = useState<string>('')
	const [isCollapsed, setIsCollapsed] = useState(false)

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		if (!promptInput.trim() || !onPromptSubmit) return
		
		onPromptSubmit('agent', promptInput)
		setPromptInput('')
	}

	const handleStopAgent = () => {
		if (!selectedAgent) return
		
		// Stop the agent's current request
		selectedAgent.cancel()
		
		if (onAgentStop) {
			onAgentStop('agent')
		}
	}

	const handleResetChat = () => {
		if (!selectedAgent) return
		
		// Clear chat history
		selectedAgent.$chatHistory.set([])
		
		if (onChatReset) {
			onChatReset('agent')
		}
	}

	if (agents.size === 0) return null

	return (
		<div
			style={{
				position: 'absolute',
				bottom: '10px',
				right: '10px',
				width: isCollapsed ? '40px' : '320px',
				maxHeight: isCollapsed ? '40px' : '400px',
				background: 'white',
				border: '1px solid #e0e0e0',
				borderRadius: '8px',
				boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
				display: 'flex',
				flexDirection: 'column',
				overflow: 'hidden',
				zIndex: 1000,
				transition: 'width 0.3s ease, max-height 0.3s ease',
			}}
		>
			{/* Header */}
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					padding: '8px 12px',
					background: '#f5f5f5',
					borderBottom: '1px solid #e0e0e0',
					cursor: 'pointer',
				}}
				onClick={() => setIsCollapsed(!isCollapsed)}
			>
				<span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a1a1a' }}>
					{isCollapsed ? '⚡' : 'Agent Progress'}
				</span>
				<button
					style={{
						background: 'none',
						border: 'none',
						fontSize: '14px',
						cursor: 'pointer',
						color: '#666',
					}}
					onClick={(e) => {
						e.stopPropagation()
						setIsCollapsed(!isCollapsed)
					}}
				>
					{isCollapsed ? '▼' : '▲'}
				</button>
			</div>

			{!isCollapsed && (
				<>
					{/* Progress Content */}
					<div
						style={{
							flex: 1,
							overflowY: 'auto',
							padding: '8px',
							fontSize: '11px',
							maxHeight: '250px',
						}}
					>
						{selectedAgent && <AgentProgress agent={selectedAgent} />}
					</div>

					{/* Action Buttons */}
					{selectedAgent && <ActionButtons agent={selectedAgent} onStop={handleStopAgent} onReset={handleResetChat} />}

					{/* Prompt Input */}
					{onPromptSubmit && (
						<form
							onSubmit={handleSubmit}
							style={{
								padding: '8px',
								borderTop: '1px solid #e0e0e0',
								background: '#fafafa',
							}}
						>
							<div style={{ display: 'flex', gap: '4px' }}>
								<input
									type="text"
									value={promptInput}
									onChange={(e) => setPromptInput(e.target.value)}
									placeholder="Type prompt..."
									style={{
										flex: 1,
										padding: '6px 8px',
										fontSize: '11px',
										border: '1px solid #ddd',
										borderRadius: '4px',
										backgroundColor: 'white',
										color: '#1a1a1a',
									}}
								/>
								<button
									type="submit"
									disabled={!promptInput.trim()}
									style={{
										padding: '6px 12px',
										fontSize: '11px',
										background: promptInput.trim() ? '#0070f3' : '#ccc',
										color: 'white',
										border: 'none',
										borderRadius: '4px',
										cursor: promptInput.trim() ? 'pointer' : 'not-allowed',
									}}
								>
									Send
								</button>
							</div>
						</form>
					)}
				</>
			)}
		</div>
	)
}

function ActionButtons({ agent, onStop, onReset }: { agent: TldrawAgent; onStop: () => void; onReset: () => void }) {
	// Manually track if agent is generating (since we're outside Tldraw context)
	const [isGenerating, setIsGenerating] = useState(() => agent.isGenerating())
	
	useEffect(() => {
		// Poll agent state since we can't use useValue outside Tldraw context
		const interval = setInterval(() => {
			setIsGenerating(agent.isGenerating())
		}, 100) // Check every 100ms
		
		return () => clearInterval(interval)
	}, [agent])

	return (
		<div
			style={{
				padding: '8px',
				borderTop: '1px solid #e0e0e0',
				background: '#fafafa',
				display: 'flex',
				gap: '4px',
			}}
		>
			<button
				type="button"
				onClick={onStop}
				disabled={!isGenerating}
				style={{
					flex: 1,
					padding: '6px 8px',
					fontSize: '11px',
					background: isGenerating ? '#dc2626' : '#ccc',
					color: 'white',
					border: 'none',
					borderRadius: '4px',
					cursor: isGenerating ? 'pointer' : 'not-allowed',
				}}
				title="Stop the agent's current task"
			>
				⏹ Stop
			</button>
			<button
				type="button"
				onClick={onReset}
				style={{
					flex: 1,
					padding: '6px 8px',
					fontSize: '11px',
					background: '#6b7280',
					color: 'white',
					border: 'none',
					borderRadius: '4px',
					cursor: 'pointer',
				}}
				title="Reset chat history"
			>
				🔄 Reset
			</button>
		</div>
	)
}

function AgentProgress({ agent }: { agent: TldrawAgent }) {
	// Manually track agent state since we're outside Tldraw context
	const [historyItems, setHistoryItems] = useState(() => agent.$chatHistory.get())
	const [isGenerating, setIsGenerating] = useState(() => agent.isGenerating())
	const historyRef = useRef<HTMLDivElement>(null)

	// Poll for agent state changes (since we can't use useValue outside Tldraw context)
	useEffect(() => {
		let mounted = true

		const interval = setInterval(() => {
			if (mounted) {
				const newHistory = agent.$chatHistory.get()
				const newGenerating = agent.isGenerating()
				
				// Only update state if values actually changed to avoid unnecessary re-renders
				setHistoryItems(prev => {
					if (JSON.stringify(prev) !== JSON.stringify(newHistory)) {
						return newHistory
					}
					return prev
				})
				
				setIsGenerating(prev => prev !== newGenerating ? newGenerating : prev)
			}
		}, 100) // Check every 100ms

		return () => {
			mounted = false
			clearInterval(interval)
		}
	}, [agent])

	const sections = getAgentHistorySections(historyItems)

	// Auto-scroll to bottom
	useEffect(() => {
		if (historyRef.current && isGenerating) {
			historyRef.current.scrollTop = historyRef.current.scrollHeight
		}
	}, [historyItems, isGenerating])

	const latestSection = sections[sections.length - 1]

	return (
		<div ref={historyRef} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
			{latestSection && (
				<div>
					{/* Latest prompt */}
					{latestSection.prompt && (
						<div
							style={{
								padding: '6px',
								background: '#e3f2fd',
								borderRadius: '4px',
								marginBottom: '6px',
								fontWeight: 'bold',
								fontSize: '11px',
								color: '#1565c0',
							}}
						>
							💬 {latestSection.prompt.message}
						</div>
					)}

					{/* Latest action steps */}
					{(() => {
						const actions = latestSection.items.filter((item) => item.type === 'action')
						const groups = getActionHistoryGroups(actions, agent)
						return groups.map((group, groupIdx) => (
							<div key={groupIdx} style={{ marginBottom: '8px' }}>
								{group.items.map((item, itemIdx) => {
									if (item.type !== 'action') return null
									const info = getActionInfo(item.action, agent)
									return (
										<div
											key={itemIdx}
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: '6px',
												padding: '4px',
												fontSize: '10px',
												color: item.action.complete ? '#1a1a1a' : '#4a5568',
												fontStyle: item.action.complete ? 'normal' : 'italic',
											}}
										>
											{info.icon && (
												<span style={{ fontSize: '12px' }}>
													<AgentIcon type={info.icon} />
												</span>
											)}
											<span>{info.description || 'Processing...'}</span>
											{!item.action.complete && (
												<span style={{ fontSize: '10px' }}>⏳</span>
											)}
										</div>
									)
								})}
							</div>
						))
					})()}

					{isGenerating && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '6px',
								padding: '4px',
								fontSize: '10px',
								color: '#4a5568',
								fontStyle: 'italic',
							}}
						>
							<span>⏳</span>
							<span>Generating...</span>
						</div>
					)}
				</div>
			)}

			{sections.length === 0 && (
				<div style={{ fontSize: '10px', color: '#718096', textAlign: 'center', padding: '20px' }}>
					No activity yet. Send a prompt to get started.
				</div>
			)}
		</div>
	)
}

