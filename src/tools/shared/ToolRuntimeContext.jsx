import React, { createContext, useContext } from 'react';

const ToolRuntimeContext = createContext({ showImmediateFeedback: true });

export const ToolRuntimeProvider = ({ showImmediateFeedback = true, children }) => (
  <ToolRuntimeContext.Provider value={{ showImmediateFeedback: Boolean(showImmediateFeedback) }}>
    {children}
  </ToolRuntimeContext.Provider>
);

export const useToolRuntimeContext = () => useContext(ToolRuntimeContext);

export default ToolRuntimeContext;
