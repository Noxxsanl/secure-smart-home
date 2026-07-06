"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import type { Device } from "@/features/devices/types";

interface DevicesContextType {
  devices: Device[];
  addDevice: (device: Device) => void;
}

const DevicesContext = createContext<DevicesContextType | undefined>(undefined);

export function DevicesProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);

  const addDevice = (device: Device) => {
    setDevices((prev) => [...prev, device]);
  };

  return (
    <DevicesContext.Provider value={{ devices, addDevice }}>
      {children}
    </DevicesContext.Provider>
  );
}

export function useDevices() {
  const context = useContext(DevicesContext);
  if (!context) {
    throw new Error("useDevices must be used within DevicesProvider");
  }
  return context;
}
