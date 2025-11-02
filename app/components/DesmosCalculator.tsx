"use client";

import React, { useEffect, useRef, useState } from 'react';

interface DesmosCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

declare global {
  interface Window {
    Desmos?: any;
  }
}

export default function DesmosCalculator({ isOpen, onClose }: DesmosCalculatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const calculatorRef = useRef<any>(null);
  const scriptLoadedRef = useRef<boolean>(false);
  const [expressionInput, setExpressionInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Load Desmos API script
  useEffect(() => {
    if (scriptLoadedRef.current) return;

    const script = document.createElement('script');
    script.src = 'https://www.desmos.com/api/v1.8/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';
    script.async = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup script if needed
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Initialize calculator when component mounts and script is loaded
  useEffect(() => {
    if (!isOpen || !containerRef.current || !window.Desmos || calculatorRef.current) return;

    try {
      calculatorRef.current = window.Desmos.GraphingCalculator(containerRef.current, {
        keypad: true,
        expressions: true,
        zoomButtons: true,
        settingsMenu: true,
      });
    } catch (error) {
      console.error('Error initializing Desmos calculator:', error);
    }

    return () => {
      if (calculatorRef.current) {
        try {
          calculatorRef.current.destroy();
        } catch (error) {
          console.error('Error destroying calculator:', error);
        }
        calculatorRef.current = null;
      }
    };
  }, [isOpen]);

  // Handle plotting expression via API
  const handlePlotExpression = async (expression: string) => {
    if (!expression.trim() || !calculatorRef.current) return;
    
    setIsProcessing(true);
    try {
      const response = await fetch('/api/desmos-plot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expression: expression,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[Desmos Plot API] Response:', data);
        
        if (data.expression) {
          // Add expression to calculator
          calculatorRef.current.setExpression({
            id: `expr-${Date.now()}`,
            latex: data.expression,
          });
          
          // Set view bounds if provided
          if (data.viewBounds) {
            calculatorRef.current.setMathBounds({
              left: data.viewBounds.xMin,
              right: data.viewBounds.xMax,
              bottom: data.viewBounds.yMin,
              top: data.viewBounds.yMax,
            });
          }
        }
      } else {
        console.error('[Desmos Plot API] Request failed:', response.status);
      }
    } catch (error) {
      console.error('[Desmos Plot API] Error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle submit expression
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (expressionInput.trim()) {
      handlePlotExpression(expressionInput);
      setExpressionInput('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="relative z-5 w-full max-w-6xl mx-8 bg-gray-900 rounded-xl shadow-2xl border border-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-700 bg-gray-900/80 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-100">
          Desmos Graphing Calculator
        </h2>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Expression input form */}
      <div className="p-4 bg-gray-800/50 border-b border-gray-700">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={expressionInput}
            onChange={(e) => setExpressionInput(e.target.value)}
            placeholder="Enter mathematical expression (e.g., y=x^2, sin(x), etc.)"
            className="flex-1 px-4 py-2 rounded-lg bg-gray-700 text-gray-100 placeholder-gray-400 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isProcessing}
          />
          <button
            type="submit"
            disabled={isProcessing || !expressionInput.trim()}
            className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? 'Processing...' : 'Plot'}
          </button>
        </form>
      </div>
      
      <div 
        ref={containerRef} 
        className="w-full h-[600px] bg-white"
        style={{ minHeight: '600px' }}
      />
    </div>
  );
}

