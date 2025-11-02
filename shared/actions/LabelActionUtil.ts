import { TLShapeId, toRichText } from 'tldraw'
import z from 'zod'
import { AgentHelpers } from '../AgentHelpers'
import { Streaming } from '../types/Streaming'
import { AgentActionUtil } from './AgentActionUtil'

const LabelAction = z
	.object({
		_type: z.literal('label'),
		intent: z.string(),
		shapeId: z.string(),
		text: z.string(),
	})
	.meta({ title: 'Label', description: "The AI changes a shape's text." })

type ILabelEvent = z.infer<typeof LabelAction>

export class LabelActionUtil extends AgentActionUtil<ILabelEvent> {
	static override type = 'label' as const

	override getSchema() {
		return LabelAction
	}

	override getInfo(action: Streaming<ILabelEvent>) {
		return {
			icon: 'pencil' as const,
			description: action.intent ?? '',
		}
	}

	override sanitizeAction(action: Streaming<ILabelEvent>, helpers: AgentHelpers) {
		if (!action.complete) return action

		const shapeId = helpers.ensureShapeIdExists(action.shapeId)
		if (!shapeId) return null

		action.shapeId = shapeId
		return action
	}

	override applyAction(action: Streaming<ILabelEvent>) {
		if (!action.complete) return
		if (!this.agent) return
		const { editor } = this.agent

		const shapeId = `shape:${action.shapeId}` as TLShapeId
		const shape = editor.getShape(shapeId)
		if (!shape) return
		
		// Only apply richText to shapes that support it (arrow, geo, note, text)
		// Line and draw shapes don't support richText
		const supportsRichText = ['arrow', 'geo', 'note', 'text'].includes(shape.type)
		
		if (supportsRichText) {
			editor.updateShape({
				id: shapeId,
				type: shape.type,
				props: { richText: toRichText(action.text ?? '') },
			})
		}
		// For line and draw shapes, we can't add labels - skip silently or log a warning
	}
}
