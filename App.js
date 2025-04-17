// src/App.js
import React from 'react';
import { LogBox, StatusBar } from 'react-native';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { AuthProvider } from './src/contexts/AuthContext';
import { NetworkProvider } from './src/contexts/NetworkContext';
// Removed EventProvider import
import AppNavigator from './src/navigation/AppNavigator';
import theme from './src/theme/theme';

// Ignore specific harmless warnings
LogBox.ignoreLogs([
  'EventEmitter.removeListener',
  '[react-native-gesture-handler]',
  'AsyncStorage has been extracted from react-native',
  'ViewPropTypes will be removed',
  'Sending `onAnimatedValueUpdate` with no listeners registered',
  'Found screens with the same name nested inside one another'
]);

// Create a react-native-paper theme using our custom colors
const paperTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: theme?.colors?.primary || '#4CAF50',
    accent: theme?.colors?.accent || '#009688',
    background: theme?.colors?.background || '#F1F8E9',
    surface: theme?.colors?.surface || '#FFFFFF',
    text: theme?.colors?.text || '#2E2E2E',
    error: theme?.colors?.error || '#EF5350',
    disabled: theme?.colors?.disabled || '#BDBDBD',
    placeholder: theme?.colors?.textLight || '#757575',
    backdrop: 'rgba(0, 0, 0, 0.5)',
    notification: theme?.colors?.accent || '#009688'
  },
  fonts: DefaultTheme.fonts,
  roundness: theme?.borderRadius?.small || 4
};

const App = () => {
  return (
    <PaperProvider theme={paperTheme}>
      <StatusBar 
        backgroundColor="transparent"
        barStyle="light-content"
        translucent={true}
      />
      <NetworkProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </NetworkProvider>
    </PaperProvider>
  );
};

export default App;
