// src/contexts/NetworkContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

const NetworkContext = createContext({
  isConnected: true,
  isInternetReachable: true,
});

export const NetworkProvider = ({ children }) => {
  const [networkState, setNetworkState] = useState({
    isConnected: true,
    isInternetReachable: true,
  });

  useEffect(() => {
    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener(state => {
      // Only update state if there's an actual change to avoid unnecessary re-renders
      if (networkState.isConnected !== state.isConnected || 
          networkState.isInternetReachable !== state.isInternetReachable) {
        
        setNetworkState({
          isConnected: state.isConnected ?? true,
          isInternetReachable: state.isInternetReachable ?? true,
        });
        
        // Log network state changes only in development
        if (__DEV__) {
          console.log('Network state changed:', state);
        }
      }
    });

    // Check initial network state
    NetInfo.fetch().then(state => {
      setNetworkState({
        isConnected: state.isConnected ?? true,
        isInternetReachable: state.isInternetReachable ?? true,
      });
      
      // Log initial network state only in development
      if (__DEV__) {
        console.log('Initial network state:', state);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <NetworkContext.Provider value={networkState}>
      {children}
    </NetworkContext.Provider>
  );
};

// Hook to use network context
export const useNetwork = () => useContext(NetworkContext);

export default NetworkContext;