import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  Image, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  Platform, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  PermissionsAndroid,
  Linking,
  BackHandler,
  AppState,
  LogBox,
  Dimensions
} from 'react-native';
import { Text, Button, HelperText } from 'react-native-paper';
import ImagePicker from 'react-native-image-crop-picker';
import Geolocation from 'react-native-geolocation-service';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { collection, addDoc, Timestamp, GeoPoint } from 'firebase/firestore';
import { db, auth, convertImageToBase64 } from '../config/firebase';
import { theme } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useNetwork } from '../contexts/NetworkContext';

// Ignore specific warnings
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
]);

// Format location name to be more precise and readable
const formatLocation = (displayName) => {
  if (!displayName) return "";
  
  const parts = displayName.split(',').map(part => part.trim());
  
  // Extract meaningful location components
  let street = "", area = "", city = "", state = "", postalCode = "", country = "";
  
  // Try to identify different parts from the address components
  parts.forEach(part => {
    if (/^\d{5,}$/.test(part.replace(/\s/g, ''))) { // postal code pattern
      postalCode = part;
    } else if (part.length <= 3 && part.toUpperCase() === part) { // State abbreviation
      state = part;
    } else if (part.length > 8 && part.includes(' ')) { // Street address typically longer with spaces
      street = street || part;
    } else if (part.length > 3 && parts.indexOf(part) < parts.length - 3) {
      area = area || part;
    } else if (parts.indexOf(part) === parts.length - 2) {
      state = state || part;
    } else if (parts.indexOf(part) === parts.length - 1) {
      country = part;
    } else if (parts.indexOf(part) === parts.length - 3) {
      city = part;
    }
  });
  
  // Format the precise location display
  let formattedLocation = [];
  
  if (street) formattedLocation.push(street);
  if (area) formattedLocation.push(area);
  if (city) formattedLocation.push(city);
  if (state) formattedLocation.push(state);
  if (postalCode) formattedLocation.push(postalCode);
  
  // Always show at least city, state, country if available
  if (formattedLocation.length === 0) {
    return displayName; // Fallback to original if we couldn't parse it properly
  }
  
  return formattedLocation.join(', ');
};

const ReportScreen = () => {
  // Basic state
  const [imageUri, setImageUri] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  
  // References
  const isMounted = useRef(true);
  const geolocationWatchId = useRef(null); // Store watch ID for cleanup
  const scrollViewRef = useRef(null); // Add scroll view reference
  
  // Hooks
  const { user } = useAuth();
  const navigation = useNavigation();
  const { isConnected } = useNetwork(); // Use network context to check connectivity

  // Make sure we clean up on screen focus/unfocus
  useFocusEffect(
    useCallback(() => {
      isMounted.current = true;
      
      return () => {
        isMounted.current = false;
      };
    }, [])
  );

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      const wasBackground = appState.match(/inactive|background/) && nextAppState === 'active';
      const goingBackground = !appState.match(/inactive|background/) && nextAppState.match(/inactive|background/);
      
      setAppState(nextAppState);
      
      if (goingBackground) {
        // Release geolocation resources when app goes to background
        releaseGeolocationResources();
      }
      
      if (wasBackground && isGettingLocation) {
        // Cancel any pending location requests and reset state
        releaseGeolocationResources();
        setIsGettingLocation(false);
        
        // Give time for resources to be properly released before allowing another request
        setTimeout(() => {
          if (isMounted.current) {
            Alert.alert(
              "Location Request Interrupted",
              "The location request was interrupted. Would you like to try again?",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Try Again", onPress: () => getCurrentLocation() }
              ]
            );
          }
        }, 1000);
      }
    });

    return () => {
      subscription.remove();
      releaseGeolocationResources();
    };
  }, [isGettingLocation, appState]);

  // Function to properly release all geolocation resources
  const releaseGeolocationResources = useCallback(() => {
    // Clear any active watch position
    if (geolocationWatchId.current !== null) {
      Geolocation.clearWatch(geolocationWatchId.current);
      geolocationWatchId.current = null;
    }
    
    // Force stop observing (important for Android)
    if (Platform.OS === 'android') {
      try {
        Geolocation.stopObserving();
      } catch (err) {
        // Silently handle error
      }
    }
  }, []);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      isMounted.current = false;
      releaseGeolocationResources();
      // Clean up any image picked with ImagePicker
      if (imageUri) {
        try {
          // Delete temporary file if it exists
          ImagePicker.cleanSingle(imageUri).catch(() => {});
        } catch (err) {
          // Ignore errors during cleanup
        }
      }
    };
  }, [imageUri, releaseGeolocationResources]);

  // Handle back button for Android - optimized with useCallback
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => false
    );
    return () => backHandler.remove();
  }, []);

  // Get current location - optimized with useCallback
  const getCurrentLocation = useCallback(async () => {
    if (isGettingLocation || !isConnected) {
      if (!isConnected) {
        Alert.alert("Network Error", "You appear to be offline. Please check your connection and try again.");
      }
      return;
    }
  
    try {
      setIsGettingLocation(true);
      
      // Always release resources before starting a new location request
      releaseGeolocationResources();
  
      let granted = false;
  
      if (Platform.OS === 'android') {
        try {
          const locationResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: "Location Permission",
              message: "CleanSphere needs access to your location to track where reports come from",
              buttonNeutral: "Ask Me Later",
              buttonNegative: "Cancel",
              buttonPositive: "OK"
            }
          );
  
          granted = locationResult === PermissionsAndroid.RESULTS.GRANTED;
  
          if (!granted) {
            Alert.alert(
              "Permission Denied",
              "Location permission is required to continue. Please enable it in Settings.",
              [
                { text: "Cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() }
              ]
            );
            setIsGettingLocation(false);
            return;
          }
        } catch (err) {
          if (__DEV__) console.error("Permission Error:", err);
          Alert.alert("Permission Error", "Unable to request location permission.");
          setIsGettingLocation(false);
          return;
        }
      } else {
        const status = await Geolocation.requestAuthorization('whenInUse');
        granted = status === 'granted';
  
        if (!granted) {
          Alert.alert(
            "Permission Denied",
            "Location permission is required to get your position.",
            [
              { text: "Cancel" },
              { text: "Open Settings", onPress: () => Linking.openURL('app-settings:') }
            ]
          );
          setIsGettingLocation(false);
          return;
        }
      }
  
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay before requesting location
  
      Geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            setLocation({ latitude, longitude });
            setLocationName("Location found");
    
            // Only make API call if network is available
            if (isConnected) {
              try {
                const response = await fetch(
                  `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
                );
        
                if (!response.ok) {
                  throw new Error("Geocoding network response was not ok");
                }
        
                const data = await response.json();
                if (data?.display_name) {
                  setLocationName(formatLocation(data.display_name));
                } else {
                  setLocationName("Location found (coordinates only)");
                }
              } catch (error) {
                if (__DEV__) console.log("Geocoding error:", error);
                setLocationName(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
              }
            } else {
              // Fallback to coordinate display when offline
              setLocationName(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
            }
          } finally {
            if (isMounted.current) {
              setIsGettingLocation(false);
            }
          }
        },
        (error) => {
          if (!isMounted.current) return;

          let message = "Could not get your current location.";
          if (error.code === 1) message = "Location permission was denied.";
          else if (error.code === 2) message = "Location unavailable. Check device settings.";
          else if (error.code === 3) message = "Location request timed out. Try again.";
  
          Alert.alert("Location Error", message);
          setIsGettingLocation(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
          forceRequestLocation: true, 
          showLocationDialog: true,
          androidProvider: 'auto' // Let the system decide which provider to use
        }
      );
    } catch (err) {
      if (__DEV__) console.error("Location Error:", err);
      if (isMounted.current) {
        Alert.alert("Location Error", "Unexpected error occurred.");
        setIsGettingLocation(false);
      }
    }
  }, [isGettingLocation, isConnected, releaseGeolocationResources]);

  // Take picture - optimized with useCallback
  const takePicture = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: "Camera Permission",
            message: "CleanSphere needs camera access to take photos",
            buttonPositive: "OK"
          }
        );
        
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert("Permission Denied", "Camera permission is required");
          return;
        }
      }

      // Get screen dimensions for proper cropping ratio (1:1 aspect ratio for square photos)
      const screenWidth = Dimensions.get('window').width;
      const width = screenWidth;
      const height = screenWidth; // 1:1 aspect ratio for square photos
      
      // First clean up any previous image to free memory
      if (imageUri) {
        try {
          ImagePicker.cleanSingle(imageUri).catch(() => {});
        } catch (err) {
          // Ignore cleanup errors
        }
      }

      ImagePicker.openCamera({
        width: width,
        height: height,
        cropping: true,
        cropperCircleOverlay: false,
        compressImageMaxWidth: 1080,
        compressImageMaxHeight: 1080,
        compressImageQuality: 0.8,
        mediaType: 'photo',
      }).then(image => {
        if (!isMounted.current) return;
        setImageUri(image.path);
      }).catch(error => {
        if (!isMounted.current) return;
        if (error.code !== 'E_PICKER_CANCELLED') { // Don't show error for user cancellation
          Alert.alert("Camera Error", "Failed to take picture. Please try again.");
        }
      });
    } catch (error) {
      if (!isMounted.current) return;
      if (__DEV__) console.error("Camera Error:", error);
      Alert.alert("Camera Error", "Failed to take picture. Please try again.");
    }
  }, [imageUri]);

  // Submit report - optimized with useCallback
  const submitReport = useCallback(async () => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to submit a report.");
      return;
    }
    
    if (!title.trim()) {
      Alert.alert("Missing Information", "Please enter a title for your report.");
      return;
    }
    
    if (!description.trim()) {
      Alert.alert("Missing Information", "Please enter a description for your report.");
      return;
    }
    
    if (!imageUri) {
      Alert.alert("Missing Image", "Please take a photo or select an image from your gallery.");
      return;
    }
    
    if (!location) {
      Alert.alert("Location Unavailable", "Location information is required. Please fetch your location.");
      return;
    }

    if (!isConnected) {
      Alert.alert("Network Error", "You appear to be offline. Please check your connection and try again.");
      return;
    }
    
    try {
      setLoading(true);
      
      const imageBase64 = await convertImageToBase64(imageUri);
      
      const reportData = {
        title: title.trim(),
        description: description.trim(),
        imageBase64,
        location: new GeoPoint(location.latitude, location.longitude),
        locationName,
        status: 'pending',
        createdAt: Timestamp.now(),
        userId: auth.currentUser.uid,
        userName: user.displayName || "Anonymous",
        userAvatar: user.photoURL || null,
        likes: [],
        commentCount: 0
      };
      
      await addDoc(collection(db, "reports"), reportData);
      
      // Reset all fields after successful submission
      setLoading(false);
      setTitle('');
      setDescription('');
      setImageUri(null);
      setLocation(null);
      setLocationName('');
      
      // Custom styled alert with theme colors
      const alertBackgroundColor = Platform.OS === 'ios' ? 
        { backgroundColor: theme.colors.success } : {};
        
      Alert.alert(
        "Report Submitted", 
        "Your report has been submitted successfully. Thank you for helping keep our community clean!",
        [{ 
          text: "OK", 
          style: "default",
          color: theme.colors.success
        }],
        { 
          cancelable: true,
          ...alertBackgroundColor 
        }
      );
    } catch (error) {
      if (__DEV__) console.error("Submit Error:", error);
      if (isMounted.current) {
        setLoading(false);
        Alert.alert("Error", "Failed to submit report. Please try again later.");
      }
    }
  }, [user, title, description, imageUri, location, locationName, isConnected]);

  // Memoize the disabled state of the submit button
  const isSubmitDisabled = useMemo(() => {
    return loading || !imageUri || !title.trim() || !description.trim() || !location || !isConnected;
  }, [loading, imageUri, title, description, location, isConnected]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : null}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView 
        style={styles.container}
        ref={scrollViewRef}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Report Unclean Area</Text>
          <Text style={styles.subtitle}>
            Take a photo, describe the issue, and help keep our community clean
          </Text>
        </View>
        
        {/* Three Step Process Instructions */}
        <View style={styles.stepsContainer}>
          <Text style={styles.stepsTitle}>Follow these steps:</Text>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>Take a photo of the location</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>Fetch your current location</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>Submit your report</Text>
          </View>
        </View>
        
        {/* Image Section */}
        <View style={styles.imageSection}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="camera-alt" size={24} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>Photo</Text>
          </View>
          
          {imageUri ? (
            <View style={styles.imageContainer}>
              <Image 
                source={{ uri: imageUri }} 
                style={styles.reportImage} 
                resizeMethod="resize" 
                resizeMode="contain"
              />
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={takePicture}
              >
                <MaterialCommunityIcons name="camera-retake" size={20} color="white" />
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noImageContainer}>
              <Text style={styles.noImageText}>No image taken yet</Text>
              <View style={styles.cameraButtonsRow}>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={takePicture}
                >
                  <MaterialIcons name="camera-alt" size={24} color="white" />
                  <Text style={styles.actionButtonText}>Take Photo</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
        
        {/* Location Section */}
        <View style={styles.locationSection}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="location-on" size={24} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>Location</Text>
          </View>
          
          {location ? (
            <View style={styles.locationTextContainer}>
              <Text style={styles.locationText}>{locationName || "Location detected"}</Text>
              <TouchableOpacity 
                style={[styles.refreshLocationButton]}
                onPress={getCurrentLocation}
                disabled={isGettingLocation}
              >
                {isGettingLocation ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <MaterialIcons name="refresh" size={20} color={theme.colors.primary} />
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noLocationContainer}>
              <Text style={styles.noLocationText}>Location not fetched yet</Text>
              <TouchableOpacity 
                style={[
                  styles.actionButton,
                  !imageUri ? styles.disabledButton : null
                ]}
                onPress={getCurrentLocation}
                disabled={!imageUri || isGettingLocation}
              >
                {isGettingLocation ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <MaterialIcons name="my-location" size={24} color="white" />
                    <Text style={styles.actionButtonText}>
                      {!imageUri ? "Take photo first" : "Fetch Location"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
        
        {/* Report Details */}
        <View style={styles.formSection}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="description" size={24} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>Report Details</Text>
          </View>
          
          <TextInput
            style={styles.input}
            placeholder="Title"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <HelperText type="info">
            Briefly describe the issue (e.g., "Garbage pile on street corner")
          </HelperText>
          
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            maxLength={500}
            blurOnSubmit={true}
          />
          <HelperText type="info">
            Provide more details about the issue and suggestions if you have any
          </HelperText>
        </View>
        
        {/* Submit Button */}
        <View style={styles.submitContainer}>
          <Button
            mode="contained"
            onPress={submitReport}
            style={[styles.submitButton, isSubmitDisabled ? styles.disabledSubmitButton : null]}
            disabled={isSubmitDisabled}
            loading={loading}
          >
            Submit Report
          </Button>
          {(!imageUri || !location || !isConnected) && (
            <Text style={styles.warningText}>
              {!imageUri ? "Please take a photo first. " : ""}
              {!location ? "Please fetch your location. " : ""}
              {!isConnected ? "You are offline. Please check your connection. " : ""}
            </Text>
          )}
          <Text style={styles.disclaimer}>
            By submitting this report, you confirm that the information provided is accurate.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.primary,
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.white,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.white,
    opacity: 0.8,
    marginTop: theme.spacing.small,
  },
  imageSection: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.small,
  },
  noImageContainer: {
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.medium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noImageText: {
    color: theme.colors.textLight,
    marginBottom: theme.spacing.medium,
  },
  cameraButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    // Set height based on 1:1 aspect ratio
    aspectRatio: 1, // 1:1 aspect ratio (width:height)
    borderRadius: theme.borderRadius.medium,
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundLight,
  },
  reportImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain', // Ensures the full image is visible without cropping
  },
  retakeButton: {
    position: 'absolute',
    right: theme.spacing.small,
    bottom: theme.spacing.small,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.small,
    borderRadius: theme.borderRadius.medium,
  },
  retakeButtonText: {
    color: 'white',
    marginLeft: theme.spacing.xsmall,
  },
  locationSection: {
    padding: theme.spacing.medium,
    marginTop: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.small,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.medium,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginLeft: theme.spacing.small,
  },
  locationTextContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.medium,
  },
  locationText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    flex: 1,
  },
  refreshLocationButton: {
    padding: theme.spacing.small,
    borderRadius: theme.borderRadius.full,
  },
  formSection: {
    padding: theme.spacing.medium,
    marginTop: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.small,
  },
  input: {
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.medium,
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    marginTop: theme.spacing.medium,
  },
  submitContainer: {
    padding: theme.spacing.medium,
    marginTop: theme.spacing.medium,
    marginBottom: theme.spacing.large,
  },
  submitButton: {
    borderRadius: theme.borderRadius.medium,
    paddingVertical: theme.spacing.small,
  },
  disclaimer: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginTop: theme.spacing.medium,
    paddingHorizontal: theme.spacing.medium,
  },
  stepsContainer: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    marginTop: theme.spacing.medium,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    ...theme.shadows.small,
  },
  stepsTitle: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    marginBottom: theme.spacing.medium,
    textAlign: 'center',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.small,
  },
  stepNumber: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
    marginRight: theme.spacing.small,
  },
  stepText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius.medium,
    backgroundColor: theme.colors.primary,
    margin: theme.spacing.small,
    ...theme.shadows.small,
  },
  galleryButton: {
    backgroundColor: theme.colors.secondary,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: theme.typography.fontWeight.medium,
    marginLeft: theme.spacing.small,
  },
  noLocationContainer: {
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.medium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noLocationText: {
    color: theme.colors.textLight,
    marginBottom: theme.spacing.medium,
  },
  disabledButton: {
    backgroundColor: theme.colors.disabled,
  },
  disabledSubmitButton: {
    backgroundColor: theme.colors.disabled,
  },
  warningText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.warning,
    textAlign: 'center',
    marginTop: theme.spacing.small,
  },
});

export default ReportScreen;