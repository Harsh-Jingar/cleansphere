import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  BackHandler
} from 'react-native';
import { TextInput, Button, Text, Surface, SegmentedButtons, Snackbar } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../contexts/NetworkContext';
import { theme, commonStyles } from '../theme/theme';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

// Import the logo image
const logoImage = require('../assets/logo.jpg');
// Import Google logo for the sign-in button
const googleLogo = { uri: 'https://developers.google.com/identity/images/g-logo.png' };

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [userType, setUserType] = useState('resident'); // 'resident' or 'municipal'
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const { signIn, googleSignIn, checkMunicipalAuth } = useAuth();
  const { isConnected } = useNetwork();
  
  // Handle back button press
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // If we're at the login screen, ask for confirmation before exiting
      Alert.alert(
        'Exit App',
        'Are you sure you want to exit?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() }
        ]
      );
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, []);

  // Email validation
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  // Toggle password visibility
  const togglePasswordVisibility = useCallback(() => {
    setPasswordVisible(!passwordVisible);
  }, [passwordVisible]);
  
  // Show snackbar message
  const showSnackbar = useCallback((message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  }, []);

  const handleLogin = async () => {
    // Dismiss keyboard
    Keyboard.dismiss();
    
    // Validate form
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    // Validate email format
    if (!isValidEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    
    // Check network connectivity
    if (!isConnected) {
      showSnackbar('No internet connection. Please check your network and try again.');
      return;
    }

    try {
      setLoading(true);
      
      if (userType === 'municipal') {
        // Municipal authority login
        const municipalUser = await checkMunicipalAuth(email, password);
        if (municipalUser) {
          // Show welcome message
          showSnackbar(`Welcome back, ${municipalUser.displayName || 'Municipal Officer'}`);
          
          // Navigate to MainTabs (same as residents, but HomeScreen will show different UI)
          setTimeout(() => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            });
          }, 1000);
        } else {
          Alert.alert('Error', 'Invalid municipal credentials');
        }
      } else {
        // Regular user login
        const userCredential = await signIn(email, password);
        
        if (userCredential && userCredential.user) {
          // Show welcome message
          showSnackbar(`Welcome back, ${userCredential.user.displayName || 'User'}`);
          
          // Navigate to MainTabs after a short delay
          setTimeout(() => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            });
          }, 1000);
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      
      // Show user-friendly error messages
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        Alert.alert('Login Failed', 'Invalid email or password');
      } else if (error.code === 'auth/too-many-requests') {
        Alert.alert('Login Failed', 'Too many attempts. Please try again later or reset your password.');
      } else if (error.code === 'auth/user-disabled') {
        Alert.alert('Account Disabled', 'This account has been disabled. Please contact support.');
      } else {
        Alert.alert('Login Error', error.message || 'An error occurred during login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (userType === 'municipal') {
      Alert.alert('Notice', 'Municipal authorities must login with email and password credentials');
      return;
    }
    
    // Check network connectivity
    if (!isConnected) {
      showSnackbar('No internet connection. Please check your network and try again.');
      return;
    }
    
    try {
      setLoading(true);
      const result = await googleSignIn();
      
      if (result && result.user) {
        // Show welcome message
        showSnackbar(`Welcome, ${result.user.displayName || 'User'}`);
        
        // Navigate to MainTabs after a short delay
        setTimeout(() => {
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          });
        }, 1000);
      }
    } catch (error) {
      console.error('Google Sign-In Error in LoginScreen:', error);
      
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        // User cancelled the login flow - don't show error
      } else if (error.code === 'auth/network-request-failed') {
        Alert.alert('Network Error', 'Please check your internet connection and try again.');
      } else if (error.code === 'DEVELOPER_ERROR' || error.message?.includes('DEVELOPER_ERROR')) {
        // More specific handling for DEVELOPER_ERROR
        console.warn('Google Sign-In configuration error details:', error);
        Alert.alert(
          'Google Sign-In Error', 
          'There is an issue with the Google Sign-In configuration. Please try signing in with email and password instead while we fix this issue.'
        );
      } else {
        Alert.alert(
          'Sign-In Error', 
          error.message || 'An error occurred during Google Sign-In. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    if (!isConnected) {
      showSnackbar('No internet connection. Please check your network and try again.');
      return;
    }
    navigation.navigate('ForgotPassword');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Logo image */}
          <Surface style={styles.logoContainer}>
            <Image source={logoImage} style={styles.logoImage} resizeMode="cover" />
          </Surface>
          
          <Text style={styles.title}>Cleansphere</Text>
          <Text style={styles.subtitle}>Urban Cleanliness Tracker</Text>

          <SegmentedButtons
            value={userType}
            onValueChange={setUserType}
            buttons={[
              { 
                value: 'resident', 
                label: 'Resident',
                accessibilityLabel: 'Login as Resident' 
              },
              { 
                value: 'municipal', 
                label: 'Municipal Authority',
                accessibilityLabel: 'Login as Municipal Authority'
              }
            ]}
            style={styles.segmentedButton}
          />

          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            outlineColor={theme.colors.border}
            activeOutlineColor={theme.colors.primary}
            theme={{ colors: { text: theme.colors.text } }}
            disabled={loading}
            accessibilityLabel="Email input field"
            autoComplete="email"
            textContentType="emailAddress"
            blurOnSubmit={false}
            returnKeyType="next"
            error={email !== '' && !isValidEmail(email)}
          />

          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!passwordVisible}
            style={styles.input}
            outlineColor={theme.colors.border}
            activeOutlineColor={theme.colors.primary}
            theme={{ colors: { text: theme.colors.text } }}
            disabled={loading}
            accessibilityLabel="Password input field"
            autoComplete="password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            right={
              <TextInput.Icon 
                icon={passwordVisible ? "eye-off" : "eye"} 
                color={theme.colors.textLight}
                onPress={togglePasswordVisibility}
                forceTextInputFocus={false}
              />
            }
          />
          
          <TouchableOpacity onPress={handleForgotPassword}>
            <Text style={styles.forgotPassword}>
              Forgot Password?
            </Text>
          </TouchableOpacity>

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading || !isConnected}
            style={styles.loginButton}
            labelStyle={styles.buttonLabel}
            color={theme.colors.primary}
            accessibilityLabel="Login button">
            {loading ? 'Logging in...' : 'Login'}
          </Button>

          {userType === 'resident' && (
            <Button
              mode="outlined"
              onPress={handleGoogleLogin}
              loading={loading}
              disabled={loading || !isConnected}
              style={styles.googleButton}
              color={theme.colors.secondary}
              labelStyle={[styles.buttonLabel, { color: theme.colors.text }]}
              accessibilityLabel="Sign in with Google button"
              icon={({ size }) => (
                <Image source={googleLogo} style={{ width: size, height: size }} />
              )}>
              Sign in with Google
            </Button>
          )}

          {userType === 'resident' && (
            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don't have an account?</Text>
              <Button
                mode="text"
                onPress={() => navigation.navigate('SignUp')}
                color={theme.colors.primary}
                disabled={loading || !isConnected}
                labelStyle={{ fontWeight: theme.typography.fontWeight.medium }}
                accessibilityLabel="Sign up button">
                Sign Up
              </Button>
            </View>
          )}

          {userType === 'municipal' && (
            <Text style={styles.municipalNote}>
              Municipal authorities must use credentials provided by the app administrator.
            </Text>
          )}
          
          {/* Network warning banner */}
          {!isConnected && (
            <View style={styles.networkWarning}>
              <MaterialCommunityIcons name="wifi-off" size={20} color={theme.colors.error} />
              <Text style={styles.networkWarningText}>
                You are offline. Please check your internet connection.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        action={{
          label: 'OK',
          onPress: () => setSnackbarVisible(false),
        }}
        duration={3000}
        style={styles.snackbar}>
        {snackbarMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: theme.spacing.large,
    justifyContent: 'center',
    minHeight: '100%',
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.medium,
    elevation: 4,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },
  title: {
    fontSize: theme.typography.fontSize.xxxl,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
    color: theme.colors.primary,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.large,
    textAlign: 'center',
    color: theme.colors.textLight,
    marginBottom: theme.spacing.xl,
  },
  segmentedButton: {
    marginBottom: theme.spacing.medium,
  },
  input: {
    marginBottom: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
  },
  forgotPassword: {
    textAlign: 'right',
    color: theme.colors.primary,
    marginBottom: theme.spacing.medium,
    paddingVertical: 4, // Increased touch target
  },
  loginButton: {
    marginTop: theme.spacing.medium,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.primary,
  },
  googleButton: {
    marginTop: theme.spacing.medium,
    paddingVertical: theme.spacing.xs,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  buttonLabel: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    paddingVertical: theme.spacing.xs,
  },
  signupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
  },
  signupText: {
    color: theme.colors.textLight,
    fontSize: theme.typography.fontSize.medium,
  },
  municipalNote: {
    marginTop: theme.spacing.medium,
    textAlign: 'center',
    color: theme.colors.textLight,
    fontSize: theme.typography.fontSize.small,
    fontStyle: 'italic',
  },
  snackbar: {
    bottom: 20,
  },
  networkWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.errorContainer || '#ffebee',
    padding: theme.spacing.medium,
    borderRadius: 8,
    marginTop: theme.spacing.large,
  },
  networkWarningText: {
    color: theme.colors.error,
    marginLeft: 10,
    flex: 1,
    fontSize: theme.typography.fontSize.small,
  }
});

export default LoginScreen;