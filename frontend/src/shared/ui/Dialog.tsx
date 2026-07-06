"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/lib/cn";

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => {
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange?.(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-1000 flex min-h-dvh items-center justify-center overflow-y-auto px-4 py-6"
      role="presentation"
    >
      <div
        className="fixed inset-0 bg-black/40"
        onClick={() => onOpenChange?.(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-1001 max-h-[calc(100dvh-3rem)] w-full max-w-lg overflow-y-auto rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 shadow-lg"
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

const DialogTrigger: React.FC<{ children: React.ReactNode; asChild?: boolean }> = ({
  children,
}) => {
  return <>{children}</>;
};

const DialogContent: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => {
  return <div className={cn("p-5", className)}>{children}</div>;
};

const DialogHeader: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => {
  return <div className={cn("mb-4", className)}>{children}</div>;
};

const DialogTitle: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => {
  return <h2 className={cn("text-base font-semibold text-gray-900 dark:text-slate-100", className)}>{children}</h2>;
};

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle };
