// src/navigation/AppNavigator.js
import React, { useEffect, useCallback, useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../contexts/AuthContext';
import { Platform, View, Image, StatusBar } from 'react-native';
import { Text } from 'react-native-paper';
import Geolocation from 'react-native-geolocation-service';
import { theme } from '../theme/theme';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Import screens
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import HomeScreen from '../screens/HomeScreen';
import ReportScreen from '../screens/ReportScreen';
import ProfileScreen from '../screens/ProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import ReportDetailScreen from '../screens/ReportDetailScreen';
import ReportActionScreen from '../screens/ReportActionScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import CommunityScreen from '../screens/CommunityScreen';
import UserProfileScreen from '../screens/UserProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Add a cleanup utility function
const cleanupGeolocationResources = () => {
  if (Platform.OS === 'android') {
    try {
      Geolocation.stopObserving();
    } catch (error) {
      if (__DEV__) {
        console.log('Error cleaning up geolocation:', error);
      }
    }
  }
};

// Custom header component with white background for all screens
const CustomHeader = ({ title, showLogo = false }) => {
  const insets = useSafeAreaInsets();
  
  return (
    <View 
      style={{ 
        backgroundColor: theme.colors.primary, // Changed to primary color for status bar area
        zIndex: 100,
      }}
    >
      {/* Status bar spacer to maintain proper layout */}
      <View style={{ height: StatusBar.currentHeight || 0 }} />
      
      {/* Actual header content with white background */}
      <View style={{
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 1.5,
        elevation: 3,
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingHorizontal: 10,
        height: 55, // Match bottom navigation height
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0', // Match border style from bottom navigation
      }}>
        {showLogo && (
          <Image 
            source={require('../assets/logo.jpg')} 
            style={{ 
              width: 50, // Adjusted size to match bottom tab icon size
              height: 50, // Adjusted size to match bottom tab icon size
              marginRight: 10,
              borderRadius: 25, // Half of width/height for circular shape
            }}
          />
        )}
        <Text style={{ 
          fontSize: 20, // Match standard size across app
          fontWeight: '900',
          fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
          color: theme.colors.text,
          letterSpacing: 0, // Match standard letter spacing
        }}>{title}</Text>
      </View>
    </View>
  );
};

// Custom header for Home screen with logo and text
const HomeHeader = () => <CustomHeader title="Cleansphere" showLogo={true} />;

const MainTabs = () => {
  const { user, userRole } = useAuth();
  const insets = useSafeAreaInsets();
  
  // Clean up when component unmounts
  useEffect(() => {
    return cleanupGeolocationResources;
  }, []);
  
  // Memoize the blur event handler to prevent recreation on each render
  const handleBlur = useCallback(() => {
    cleanupGeolocationResources();
  }, []);
  
  // Memoize screen options to prevent unnecessary re-renders
  const screenOptions = useMemo(() => {
    return ({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        let iconName;
        
        if (route.name === 'Home') {
          iconName = focused ? 'home' : 'home-outline';
        } else if (route.name === 'Report') {
          iconName = focused ? 'alert-circle' : 'alert-circle-outline';
        } else if (route.name === 'Community') {
          iconName = focused ? 'account-group' : 'account-group-outline';
        } else if (route.name === 'Profile') {
          iconName = focused ? 'account' : 'account-outline';
        }
        
        return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
      },
      lazy: true, // Set to true to improve initial load time
      detachInactiveScreens: true, // Improve memory usage by detaching inactive screens
      unmountOnBlur: false,
      freezeOnBlur: true,
      tabBarHideOnKeyboard: true, // Hide the tab bar when keyboard appears
      tabBarStyle: {
        height: 55, // Reduced height to prevent overlap with system navigation
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
        // Add margin to ensure tab bar stays above system navigation
        marginBottom: insets.bottom > 0 ? insets.bottom : Platform.OS === 'android' ? 10 : 0,
        paddingTop: 0,
        paddingBottom: 0, // Remove padding bottom to prevent extra space
      },
      tabBarItemStyle: {
        // Set padding for individual tab items
        paddingVertical: 0,
      },
      tabBarLabelStyle: {
        fontSize: 10, // Small font size for labels
        marginBottom: 3, // Add small margin at the bottom of the label
      },
      listeners: () => ({
        blur: handleBlur,
      }),
    });
  }, [insets.bottom, handleBlur]);

  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{
          headerShown: true,
          header: () => <HomeHeader />,
        }}
      />
      {/* Only show Report tab for non-municipal users */}
      {userRole !== 'municipal' && (
        <Tab.Screen 
          name="Report" 
          component={ReportScreen} 
          options={{
            headerShown: true,
            header: () => <CustomHeader title="Report an Issue" />,
          }}
        />
      )}
      <Tab.Screen 
        name="Community" 
        component={CommunityScreen} 
        options={{
          headerShown: true,
          header: () => <CustomHeader title="Community" />,
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen} 
        options={{
          headerShown: true,
          header: () => <CustomHeader title="Profile" />,
        }}
      />
    </Tab.Navigator>
  );
};

// Main App Stack Navigator for authenticated users
const MainStack = () => {
  // Memoize the stack screen options
  const screenOptions = useMemo(() => ({ 
    headerShown: false,
    animation: 'slide_from_right',
    contentStyle: {
      backgroundColor: '#FFFFFF',
    },
  }), []);

  // Custom header style for stack screens
  const stackHeaderOptions = useMemo(() => ({
    headerStyle: {
      backgroundColor: theme.colors.primary, // Changed to primary color for status bar background
      height: 55 + (StatusBar.currentHeight || 0), // Match the 55px height of bottom and top navigation
    },
    headerTintColor: 'white', // Changed to white for better contrast on primary background
    headerTitleStyle: {
      fontWeight: '500',
      fontSize: 16, // Match font size with other headers
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
    },
    headerShadowVisible: true,
    // Add status bar height to header height so content stays below status bar
    headerStatusBarHeight: StatusBar.currentHeight || 0,
    // Use contentStyle to make the header content area white while keeping status bar area green
    headerBackground: () => (
      <View style={{ flex: 1 }}>
        <View style={{ height: StatusBar.currentHeight || 0, backgroundColor: theme.colors.primary }} />
        <View style={{ 
          flex: 1, 
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: '#E0E0E0', // Match border style from other navigation components
        }} />
      </View>
    ),
  }), []);

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen 
        name="MainTabs" 
        component={MainTabs}
      />
      <Stack.Screen 
        name="EditProfile" 
        component={EditProfileScreen} 
        options={{ 
          headerTitle: "Edit Profile",
          headerShown: true,
          ...stackHeaderOptions
        }}
      />
      <Stack.Screen 
        name="ReportDetail" 
        component={ReportDetailScreen} 
        options={{ 
          headerTitle: "Report Details",
          headerShown: true,
          ...stackHeaderOptions
        }}
      />
      <Stack.Screen 
        name="ReportActionScreen" 
        component={ReportActionScreen} 
        options={{ 
          headerTitle: "Resolve Report",
          headerShown: true,
          ...stackHeaderOptions
        }}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen} 
        options={{ 
          headerTitle: "Notifications",
          headerShown: true,
          ...stackHeaderOptions
        }}
      />
      <Stack.Screen 
        name="UserProfile" 
        component={UserProfileScreen} 
        options={{ 
          headerTitle: "User Profile",
          headerShown: true,
          ...stackHeaderOptions
        }}
      />
    </Stack.Navigator>
  );
};

// Auth Stack Navigator for unauthenticated users
const AuthStack = () => {
  // Memoize the auth stack screen options
  const authScreenOptions = useMemo(() => ({ 
    headerShown: false,
    animation: 'fade',
  }), []);

  return (
    <Stack.Navigator screenOptions={authScreenOptions}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  );
};

const AppNavigator = () => {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();

  // Create a loading component or placeholder if needed
  if (loading) {
    return null; // You could return a loading spinner component here
  }

  // Configure safe area for the entire app
  return (
    <NavigationContainer
      theme={{
        colors: {
          background: '#FFFFFF',
          card: '#FFFFFF',
          text: theme.colors.text,
          border: '#E0E0E0',
          primary: theme.colors.primary,
          notification: theme.colors.accent,
        },
        dark: false,
        // Add proper font configuration to fix "Cannot read property 'regular' of undefined" error
        fonts: {
          regular: {
            fontFamily: 'sans-serif',
            fontWeight: '400',
          },
          medium: {
            fontFamily: 'sans-serif-medium',
            fontWeight: '500',
          },
          light: {
            fontFamily: 'sans-serif-light',
            fontWeight: '300',
          },
          thin: {
            fontFamily: 'sans-serif-thin',
            fontWeight: '100',
          },
        },
      }}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={true}
      />
      <View 
        style={{ 
          flex: 1,
          paddingBottom: insets.bottom > 0 ? 0 : Platform.OS === 'android' ? 10 : 0,
        }}
      >
        {user ? <MainStack /> : <AuthStack />}
      </View>
    </NavigationContainer>
  );
};

export default React.memo(AppNavigator);
