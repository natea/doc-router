'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Integration } from '@/types/integrations';

interface IntegrationContextType {
  editingIntegration: Integration | null;
  setEditingIntegration: (integration: Integration | null) => void;
}

const IntegrationContext = createContext<IntegrationContextType | undefined>(undefined);

export const IntegrationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);

  return (
    <IntegrationContext.Provider value={{ editingIntegration, setEditingIntegration }}>
      {children}
    </IntegrationContext.Provider>
  );
};

export const useIntegrationContext = () => {
  const context = useContext(IntegrationContext);
  if (!context) {
    throw new Error('useIntegrationContext must be used within an IntegrationProvider');
  }
  return context;
};