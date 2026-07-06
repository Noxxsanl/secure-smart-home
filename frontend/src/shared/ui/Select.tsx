"use client";

import * as React from "react";
import { cn } from "@/shared/lib/cn";

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

const Select: React.FC<SelectProps> = ({ value, onValueChange, children }) => {
  return <div>{children}</div>;
};

const SelectTrigger: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => {
  return <div className={cn("border rounded p-2", className)}>{children}</div>;
};

const SelectValue: React.FC<{ placeholder?: string }> = ({ placeholder }) => {
  return <span>{placeholder}</span>;
};

const SelectContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="border rounded mt-1 bg-white">{children}</div>;
};

const SelectItem: React.FC<{
  value: string;
  children: React.ReactNode;
  onClick?: () => void;
}> = ({ value, children, onClick }) => {
  return (
    <div className="p-2 hover:bg-gray-100 cursor-pointer" onClick={onClick}>
      {children}
    </div>
  );
};

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
