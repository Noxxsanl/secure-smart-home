"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { AddDeviceModal } from "@/features/devices/components/AddDeviceModal";

interface AddDeviceContextType {
  openModal: () => void;
}

const AddDeviceContext = createContext<AddDeviceContextType | undefined>(undefined);

export function AddDeviceProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <AddDeviceContext.Provider value={{ openModal: () => setIsOpen(true) }}>
      {children}
      <AddDeviceModal open={isOpen} onClose={() => setIsOpen(false)} />
    </AddDeviceContext.Provider>
  );
}

export function useAddDevice() {
  const context = useContext(AddDeviceContext);
  if (!context) throw new Error("useAddDevice must be used within AddDeviceProvider");
  return context;
}
