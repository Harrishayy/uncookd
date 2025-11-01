"use client";

import React, { useEffect, useRef } from 'react';

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

  if (!isOpen) return null;

  return (
    <div className="relative z-5 w-full max-w-6xl mx-8 bg-black rounded-xl shadow-2xl border border-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-800 bg-black flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">
          Desmos Graphing Calculator
        </h2>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-black border border-transparent hover:border-gray-800 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div 
        ref={containerRef} 
        className="w-full h-[600px] bg-white"
        style={{ minHeight: '600px' }}
      />
    </div>
  );
}

