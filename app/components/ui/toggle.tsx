"use client";

import * as React from "react";
import { cn } from "@/app/lib/utils";

interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
}

export function Toggle({
  checked,
  onCheckedChange,
  label,
  size = "md",
  disabled = false,
  className,
}: ToggleProps) {
  const sizeClasses = {
    sm: "h-4 w-8",
    md: "h-6 w-11",
    lg: "h-7 w-14",
  };

  const thumbSizeClasses = {
    sm: "h-3 w-3",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <label
      className={cn(
        "inline-flex items-center gap-3 cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {label && (
        <span className="text-sm font-medium text-gray-300">{label}</span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex items-center rounded-full border-2 transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-white/20",
          sizeClasses[size],
          checked
            ? "bg-white border-white shadow-sm"
            : "bg-gray-900 border-gray-700",
          !disabled && checked && "hover:bg-gray-100 active:scale-95",
          !disabled && !checked && "hover:border-gray-600 active:scale-95"
        )}
      >
        <span
          className={cn(
            "inline-block transform rounded-full transition-transform duration-300 ease-in-out shadow-lg",
            thumbSizeClasses[size],
            checked
              ? "bg-black"
              : "bg-white",
            checked
              ? size === "sm"
                ? "translate-x-4"
                : size === "md"
                ? "translate-x-5"
                : "translate-x-7"
              : "translate-x-0.5"
          )}
        />
      </button>
    </label>
  );
}

