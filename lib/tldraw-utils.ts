/**
 * Utility functions for tldraw integration with AI agents
 */

import { Editor, TLShapeId, createShapeId, TLTextShapeProps } from 'tldraw';

export interface DrawingInstruction {
  agent_id: string;
  agent_name: string;
  agent_role: string;
  color: string;
  instructions: string;
  task: string;
}

/**
 * Convert plain text to tldraw richText format
 * Tldraw uses ProseMirror format for richText
 */
function createRichText(text: string): any {
  // Tldraw uses ProseMirror format - a simple paragraph with text
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: text || '',
          },
        ],
      },
    ],
  };
}

/**
 * Convert hex color to closest tldraw color name
 * Tldraw accepts: "black", "grey", "light-violet", "violet", "blue", "light-blue", 
 * "yellow", "orange", "green", "light-green", "light-red", "red", "white"
 */
function hexToTldrawColor(hex: string): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  
  // Parse RGB
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  // Define tldraw colors with their RGB values
  const tldrawColors = {
    'black': [0, 0, 0],
    'grey': [128, 128, 128],
    'light-violet': [186, 143, 231],
    'violet': [124, 58, 237],
    'blue': [59, 130, 246],
    'light-blue': [147, 197, 253],
    'yellow': [234, 179, 8],
    'orange': [251, 146, 60],
    'green': [34, 197, 94],
    'light-green': [134, 239, 172],
    'light-red': [252, 165, 165],
    'red': [239, 68, 68],
    'white': [255, 255, 255],
  };
  
  // Find closest color using Euclidean distance
  let minDistance = Infinity;
  let closestColor = 'black';
  
  for (const [colorName, [r2, g2, b2]] of Object.entries(tldrawColors)) {
    const distance = Math.sqrt(
      Math.pow(r - r2, 2) + Math.pow(g - g2, 2) + Math.pow(b - b2, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = colorName;
    }
  }
  
  return closestColor;
}

/**
 * Get the next available position on canvas that doesn't overlap with existing shapes
 */
function getNextAvailablePosition(editor: Editor, width: number, height: number): { x: number; y: number } {
  const padding = 60;
  const minX = 100;
  const minY = 100;
  
  // Get all existing shapes
  const allShapes = editor.getCurrentPageShapes();
  
  if (allShapes.length === 0) {
    return { x: minX, y: minY };
  }
  
  // Get bounds of all existing shapes
  const existingBounds: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];
  
  for (const shape of allShapes) {
    const bounds = editor.getShapePageBounds(shape);
    if (bounds) {
      existingBounds.push({
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
      });
    }
  }
  
  if (existingBounds.length === 0) {
    return { x: minX, y: minY };
  }
  
  // Find the rightmost position
  const maxRight = Math.max(...existingBounds.map(b => b.maxX));
  const maxBottom = Math.max(...existingBounds.map(b => b.maxY));
  
  // Try placing to the right first
  let candidateX = maxRight + padding;
  let candidateY = minY;
  
  // Check if this position would overlap
  const wouldOverlap = existingBounds.some(bounds => {
    return !(
      candidateX + width < bounds.minX - padding ||
      candidateX > bounds.maxX + padding ||
      candidateY + height < bounds.minY - padding ||
      candidateY > bounds.maxY + padding
    );
  });
  
  // If overlapping or too far right, place below existing content
  const viewportBounds = editor.getViewportPageBounds();
  if (wouldOverlap || candidateX + width > viewportBounds.maxX - padding) {
    candidateX = minX;
    candidateY = maxBottom + padding;
  }
  
  return { x: candidateX, y: candidateY };
}

/**
 * Verify a position doesn't overlap with existing shapes and adjust if needed
 * Returns next available position without infinite recursion
 */
function verifyNoOverlap(editor: Editor, x: number, y: number, width: number, height: number): { x: number; y: number } {
  const padding = 30;
  const maxAttempts = 50; // Limit attempts to avoid infinite loops
  let attempt = 0;
  
  while (attempt < maxAttempts) {
    let hasOverlap = false;
    const allShapes = editor.getCurrentPageShapes();
    
    // Check for overlaps with existing shapes
    for (const shape of allShapes) {
      try {
        const bounds = editor.getShapePageBounds(shape);
        if (!bounds) continue;
        
        // Check if proposed position overlaps with this shape
        const overlaps = !(
          x + width + padding < bounds.minX ||
          x - padding > bounds.maxX ||
          y + height + padding < bounds.minY ||
          y - padding > bounds.maxY
        );
        
        if (overlaps) {
          hasOverlap = true;
          // Move to the right of this shape
          x = bounds.maxX + padding;
          break; // Exit loop and check again with new position
        }
      } catch (error) {
        // Skip shapes that can't be checked
        continue;
      }
    }
    
    // If no overlap found, return this position
    if (!hasOverlap) {
      return { x, y };
    }
    
    attempt++;
    
    // If we've tried many times, move down instead
    if (attempt > 20) {
      y += height + padding;
      x = 100; // Reset x to left side
    }
  }
  
  // Fallback: return position far to the right
  return { x: x + width + padding, y };
}

/**
 * Parse AI agent drawing instructions and apply them to the tldraw editor
 */
export function applyDrawingInstructions(
  editor: Editor,
  instructions: DrawingInstruction[]
): void {
  console.log('Applying drawing instructions:', instructions);
  
  if (!instructions || instructions.length === 0) {
    console.warn('No instructions to apply');
    return;
  }

  // Reset session tracking for new drawing batch
  sessionInitialized = false;
  sessionOffset = { x: 0, y: 0 };
  
  instructions.forEach((instruction, instructionIndex) => {
    try {
      console.log(`Processing instruction ${instructionIndex} from ${instruction.agent_name}:`, instruction.instructions);
      
      // Try to parse JSON instructions - first extract JSON from markdown if present
      let parsedInstructions;
      let instructionsText = instruction.instructions.trim();
      
      // Remove markdown code blocks if present
      if (instructionsText.includes('```json')) {
        const jsonMatch = instructionsText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          instructionsText = jsonMatch[1];
        }
      } else if (instructionsText.includes('```')) {
        const codeMatch = instructionsText.match(/```\s*([\s\S]*?)\s*```/);
        if (codeMatch) {
          instructionsText = codeMatch[1];
        }
      }
      
      try {
        parsedInstructions = JSON.parse(instructionsText);
        console.log('Parsed JSON instructions:', parsedInstructions);
      } catch (parseError) {
        console.warn('JSON parse failed - backend should return valid JSON:', parseError);
        // Don't use hardcoded parsing - rely on backend to provide proper instructions
        parsedInstructions = null;
      }

      // Only create shapes if we have valid JSON instructions from backend
      if (parsedInstructions && parsedInstructions.shapes && Array.isArray(parsedInstructions.shapes) && parsedInstructions.shapes.length > 0) {
        console.log(`Applying ${parsedInstructions.shapes.length} shapes from backend`);
        parsedInstructions.shapes.forEach((shape: any, index: number) => {
          applyShape(editor, shape, instruction.color, index * 20); // Small horizontal offset between shapes
        });
      } else {
        console.warn(`No valid shapes found in instructions from ${instruction.agent_name}. Backend should return JSON with shapes array.`);
        // Create a simple text note that the backend needs to provide proper instructions
        try {
          const textDims = calculateTextDimensions(`Note: ${instruction.agent_name} - Backend should provide drawing instructions`);
          const position = getNextAvailablePosition(editor, textDims.width, textDims.height);
          editor.createShapes([{
            id: createShapeId(),
            type: 'text',
            x: position.x,
            y: position.y,
            props: {
              richText: createRichText(`${instruction.agent_name}: Waiting for drawing instructions...`),
              color: hexToTldrawColor(instruction.color || '#000000'),
              w: textDims.width,
              autoSize: true,
            },
          }]);
        } catch (error) {
          console.error('Failed to create fallback text:', error);
        }
      }
    } catch (error) {
      console.error(`Error applying instructions from ${instruction.agent_name}:`, error);
    }
  });
}

/**
 * Note: We no longer parse text instructions with hardcoded patterns.
 * All drawing instructions must come from the backend/LLM as JSON.
 * The backend is responsible for interpreting prompts and generating drawing instructions.
 */

/**
 * Calculate text dimensions for proper rectangle sizing
 */
function calculateTextDimensions(text: string, fontSize: number = 16): { width: number; height: number } {
  // Approximate text dimensions (rough estimate)
  const charWidth = fontSize * 0.6;
  const lineHeight = fontSize * 1.2;
  const lines = text.split('\n');
  const maxLineLength = Math.max(...lines.map(line => line.length));
  const width = Math.max(100, maxLineLength * charWidth + 40); // padding
  const height = Math.max(40, lines.length * lineHeight + 20); // padding
  return { width, height };
}

// Track position for this drawing session to avoid overlaps within the same batch
let sessionOffset = { x: 0, y: 0 };
let sessionInitialized = false;

/**
 * Apply a shape to the editor with collision detection
 */
function applyShape(editor: Editor, shape: any, color: string, offset: number = 0): void {
  // Calculate shape dimensions
  const defaultSize = { width: 200, height: 100 };
  let shapeWidth = defaultSize.width;
  let shapeHeight = defaultSize.height;
  
  if (shape.type === 'text' || shape.type === 'label') {
    const textContent = (shape.text || shape.label || '').toString();
    const textDims = calculateTextDimensions(textContent);
    shapeWidth = textDims.width;
    shapeHeight = textDims.height;
  } else if (shape.width && shape.height) {
    shapeWidth = shape.width;
    shapeHeight = shape.height;
  } else if (shape.radius) {
    shapeWidth = shapeHeight = shape.radius * 2;
  } else if (shape.type === 'circle' || shape.type === 'ellipse') {
    shapeWidth = shapeHeight = (shape.radius || shape.width || 100) * 2;
  } else if (shape.type === 'line' || shape.type === 'arrow') {
    // For arrows, estimate dimensions
    const startX = shape.x1 !== undefined ? shape.x1 : 0;
    const startY = shape.y1 !== undefined ? shape.y1 : 0;
    const endX = shape.x2 !== undefined ? shape.x2 : 150;
    const endY = shape.y2 !== undefined ? shape.y2 : 150;
    shapeWidth = Math.abs(endX - startX) || 150;
    shapeHeight = Math.abs(endY - startY) || 150;
  }
  
  // Get available position that doesn't overlap with existing content
  if (!sessionInitialized) {
    const position = getNextAvailablePosition(editor, shapeWidth, shapeHeight);
    sessionOffset = position;
    sessionInitialized = true;
  }
  
  // For subsequent shapes in the same batch, offset horizontally
  const baseX = shape.x !== undefined ? shape.x : (sessionOffset.x + offset);
  const baseY = shape.y !== undefined ? shape.y : (sessionOffset.y);
  
  // Verify this position doesn't overlap with existing shapes
  const finalPosition = verifyNoOverlap(editor, baseX, baseY, shapeWidth, shapeHeight);
  
  // Update session offset for next shape in batch
  sessionOffset.x = finalPosition.x + shapeWidth + 30;
  
  // Update shape coordinates
  const finalBaseX = finalPosition.x;
  const finalBaseY = finalPosition.y;

  try {
    switch (shape.type?.toLowerCase()) {
      case 'circle':
      case 'ellipse':
        editor.createShapes([{
          id: createShapeId(),
          type: 'geo',
          x: finalBaseX,
          y: finalBaseY,
          props: {
            w: (shape.radius || shape.width || 100) * 2,
            h: (shape.radius || shape.height || 100) * 2,
            geo: 'ellipse',
            fill: 'solid',
            color: hexToTldrawColor(color || '#000000'),
          },
        }]);
        break;

      case 'rectangle':
      case 'rect':
      case 'box':
        // If rectangle has associated text, size it to fit
        let rectWidth = shape.width || 200;
        let rectHeight = shape.height || 100;
        
        if (shape.text) {
          const textDims = calculateTextDimensions(shape.text);
          rectWidth = Math.max(rectWidth, textDims.width);
          rectHeight = Math.max(rectHeight, textDims.height);
        }
        
        editor.createShapes([{
          id: createShapeId(),
          type: 'geo',
          x: finalBaseX,
          y: finalBaseY,
          props: {
            w: rectWidth,
            h: rectHeight,
            fill: 'solid',
            color: hexToTldrawColor(color || '#000000'),
            geo: 'rectangle',
          },
        }]);
        
        // If rectangle has text, add it inside
        if (shape.text) {
          const textDims = calculateTextDimensions(shape.text);
          editor.createShapes([{
            id: createShapeId(),
            type: 'text',
            x: finalBaseX + 10,
            y: finalBaseY + (rectHeight - textDims.height) / 2,
            props: {
              richText: createRichText(shape.text),
              color: hexToTldrawColor(color || '#000000'),
              w: Math.max(100, rectWidth - 20),
              autoSize: true,
            },
          }]);
        }
        break;

      case 'line':
      case 'arrow':
        // Use provided coordinates or default relative to final position
        const startX = shape.x1 !== undefined ? shape.x1 : finalBaseX;
        const startY = shape.y1 !== undefined ? shape.y1 : finalBaseY;
        const endX = shape.x2 !== undefined ? shape.x2 : (startX + 150);
        const endY = shape.y2 !== undefined ? shape.y2 : (startY + 150);
        
        // Arrow coordinates are relative to arrow position
        const relEndX = endX - startX;
        const relEndY = endY - startY;
        
        editor.createShapes([{
          id: createShapeId(),
          type: 'arrow',
          x: startX,
          y: startY,
          props: {
            start: { x: 0, y: 0 },
            end: { x: relEndX || 150, y: relEndY || 150 },
            color: hexToTldrawColor(color || '#000000'),
            fill: 'none',
            arrowheadStart: 'none',
            arrowheadEnd: 'arrow',
          },
        }]);
        break;

      case 'text':
      case 'label':
        const textContent = (shape.text || shape.label || 'Text').toString();
        const textDims = calculateTextDimensions(textContent);
        editor.createShapes([{
          id: createShapeId(),
          type: 'text',
          x: finalBaseX,
          y: finalBaseY,
          props: {
            richText: createRichText(textContent),
            color: hexToTldrawColor(color || '#000000'),
            w: textDims.width,
            autoSize: true, // Let tldraw auto-size based on content
          },
        }]);
        break;

      default:
        // Default to text shape if text is provided, otherwise a simple rectangle
        const defaultText = shape.text || shape.label || '';
        
        if (defaultText) {
          // Create text shape without rectangle box
          const textDims = calculateTextDimensions(defaultText);
          editor.createShapes([{
            id: createShapeId(),
            type: 'text',
            x: finalBaseX,
            y: finalBaseY,
            props: {
              richText: createRichText(defaultText),
              color: hexToTldrawColor(color || '#000000'),
              w: textDims.width,
              autoSize: true,
            },
          }]);
        } else {
          // No text, create a simple rectangle
          editor.createShapes([{
            id: createShapeId(),
            type: 'geo',
            x: finalBaseX,
            y: finalBaseY,
            props: {
              w: 150,
              h: 75,
              fill: 'solid',
              color: hexToTldrawColor(color || '#000000'),
              geo: 'rectangle',
            },
          }]);
        }
    }
  } catch (error) {
    console.error('Error creating shape:', error);
  }
}

/**
 * Create a text annotation for drawing instructions that couldn't be parsed
 */
function createTextAnnotation(
  editor: Editor,
  instruction: DrawingInstruction,
  parsedInstructions: any
): void {
  const text = parsedInstructions.text || instruction.instructions.substring(0, 100);
  
  try {
    const textContent = `${instruction.agent_name}: ${text}`.toString();
    editor.createShapes([{
      id: createShapeId(),
      type: 'text',
      x: 50,
      y: 50,
      props: {
        richText: createRichText(textContent),
        color: hexToTldrawColor(instruction.color || '#000000'),
        w: Math.max(200, textContent.length * 8),
        autoSize: false,
      },
    }]);
  } catch (error) {
    console.error('Error creating text annotation:', error);
  }
}

