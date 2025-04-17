import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Image, TextInput, TouchableOpacity, Alert, Platform, ActivityIndicator, KeyboardAvoidingView, PermissionsAndroid, AppState, Dimensions } from 'react-native';
import { Text, Button, IconButton, HelperText, Chip } from 'react-native-paper';
import ImagePicker from 'react-native-image-crop-picker';
import Geolocation from 'react-native-geolocation-service';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { doc, getDoc, updateDoc, Timestamp, GeoPoint, collection, addDoc } from 'firebase/firestore';
import { db, auth, convertImageToBase64 } from '../config/firebase';
import { theme } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import MapView, { Marker } from 'react-native-maps';

const ReportActionScreen = ({ route }) => {
  const { report: reportParam } = route.params;
  const reportId = reportParam?.id;
  const [report, setReport] = useState(reportParam || null);
  const [cameraPermission, setCameraPermission] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);
  const [afterImageUri, setAfterImageUri] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actionCategory, setActionCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [locationVerified, setLocationVerified] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [unauthorized, setUnauthorized] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [actionImageUri, setActionImageUri] = useState(null);

  const isMounted = useRef(true);
  const geolocationWatchId = useRef(null);
  const locationTimeoutId = useRef(null);

  const { user, userRole } = useAuth();
  const navigation = useNavigation();

  const actionCategories = [
    { label: 'Garbage Collection', value: 'garbage_collection' },
    { label: 'Street Cleaning', value: 'street_cleaning' },
    { label: 'Graffiti Removal', value: 'graffiti_removal' },
    { label: 'Illegal Dumping Cleanup', value: 'illegal_dumping' },
    { label: 'Other', value: 'other' }
  ];

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      const wasBackground = appState.match(/inactive|background/) && nextAppState === 'active';
      const goingBackground = !appState.match(/inactive|background/) && nextAppState.match(/inactive|background/);

      setAppState(nextAppState);

      if (goingBackground) {
        releaseGeolocationResources();
      }

      if (wasBackground && isGettingLocation) {
        // Cancel any pending location requests when coming back from background
        releaseGeolocationResources();
        setIsGettingLocation(false);
        
        setTimeout(() => {
          if (isMounted.current) {
            Alert.alert(
              "Location Service Interrupted",
              "Location services were interrupted. Would you like to try fetching location again?",
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
    };
  }, [appState, isGettingLocation]);

  // Function to properly release all geolocation resources
  const releaseGeolocationResources = () => {
    if (geolocationWatchId.current !== null) {
      Geolocation.clearWatch(geolocationWatchId.current);
      geolocationWatchId.current = null;
    }

    if (locationTimeoutId.current !== null) {
      clearTimeout(locationTimeoutId.current);
      locationTimeoutId.current = null;
    }

    if (Platform.OS === 'android') {
      try {
        Geolocation.stopObserving();
      } catch (err) {
        // Silently handle error
      }
    }
  };

  // Initial setup - load data and permissions
  useEffect(() => {
    (async () => {
      try {
        // Check if user is authorized as a municipal authority
        if (!user) {
          setUnauthorized(true);
          Alert.alert(
            "Unauthorized Access",
            "Please sign in to continue.",
            [{ text: "OK", onPress: () => navigation.goBack() }]
          );
          return;
        }

        // Simplified check - just rely on the userRole from AuthContext
        if (userRole !== 'municipal') {
          setUnauthorized(true);
          Alert.alert(
            "Unauthorized Access",
            "Only municipal authorities can take actions on reports.",
            [{ text: "OK", onPress: () => navigation.goBack() }]
          );
          return;
        }

        // If user is authorized, continue with normal flow
        const cameraStatus = await requestCameraPermission();
        const locationStatus = await requestLocationPermission();

        setCameraPermission(cameraStatus);
        setLocationPermission(locationStatus);

        if (!locationStatus || !cameraStatus) {
          Alert.alert(
            "Permissions Required",
            "Both camera and location permissions are needed to complete this action.",
            [{ text: "OK" }]
          );
        }

        if (reportId) {
          fetchReportDetails();
        } else if (reportParam) {
          // If report is already passed from HomeScreen
          // Make sure imageUrl is set properly from imageBase64 or other source
          const processedReport = {
            ...reportParam,
            imageUrl: reportParam.imageUrl || 
                    (reportParam.imageBase64 ? `data:image/jpeg;base64,${reportParam.imageBase64}` : null)
          };
          setReport(processedReport);
          setLoading(false);
        } else {
          // No report data available
          Alert.alert(
            "Error",
            "No report data found. Please try again.",
            [{ text: "OK", onPress: () => navigation.goBack() }]
          );
        }
      } catch (error) {
        console.error("Error during initialization:", error);
        Alert.alert("Error", "Something went wrong. Please try again later.");
        navigation.goBack();
      }
    })();

    return () => {
      isMounted.current = false;
      releaseGeolocationResources();
    };
  }, [reportId, user, userRole]);

  const requestCameraPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: "Camera Permission",
            message: "CleanSphere needs access to your camera",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        return true; // iOS permissions are handled by ImagePicker
      }
    } catch (err) {
      console.error("Error requesting camera permission:", err);
      return false;
    }
  };

  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "CleanSphere needs access to your location",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const status = await Geolocation.requestAuthorization('whenInUse');
        return status === 'granted';
      }
    } catch (err) {
      console.error("Error requesting location permission:", err);
      return false;
    }
  };

  const fetchReportDetails = async () => {
    try {
      setLoading(true);
      const reportRef = doc(db, "reports", reportId);
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        Alert.alert("Error", "Report not found", [
          { text: "OK", onPress: () => navigation.goBack() }
        ]);
        return;
      }

      const reportData = {
        id: reportDoc.id,
        ...reportDoc.data()
      };

      if (reportData.status === 'resolved') {
        Alert.alert(
          "Already Resolved",
          "This report has already been marked as resolved.",
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
        return;
      }

      // Process the report data - ensure imageUrl is properly set
      const processedReport = {
        ...reportData,
        imageUrl: reportData.imageUrl || 
                 (reportData.imageBase64 ? `data:image/jpeg;base64,${reportData.imageBase64}` : null)
      };
      
      setReport(processedReport);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching report details:", error);
      Alert.alert("Error", "Failed to load report details");
      setLoading(false);
    }
  };

  const getCurrentLocation = async () => {
    if (isGettingLocation || !actionImageUri) {
      return;
    }
    
    try {
      setIsGettingLocation(true);
      
      // Always release resources before starting a new location request
      releaseGeolocationResources();

      if (!locationPermission) {
        const hasPermission = await requestLocationPermission();
        if (!hasPermission) {
          Alert.alert("Permission Denied", "Location permission is required to continue");
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

            if (!isMounted.current) return;

            if (report && report.location) {
              const reportLat = report.location.latitude || report.location._latitude;
              const reportLng = report.location.longitude || report.location._longitude;

              const distance = calculateDistance(
                latitude, longitude,
                reportLat, reportLng
              );

              setLocationVerified(distance < 0.1);
            }

            try {
              const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
              );
      
              if (!response.ok) {
                throw new Error("Geocoding network response was not ok");
              }
      
              const data = await response.json();
              if (data?.display_name && isMounted.current) {
                setLocationName(data.display_name);
              } else if (isMounted.current) {
                setLocationName(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
              }
            } catch (error) {
              console.error("Error getting location name:", error);
              if (isMounted.current) {
                setLocationName(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
              }
            }
          } finally {
            setIsGettingLocation(false);
          }
        },
        (error) => {
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
          androidProvider: 'auto'
        }
      );
    } catch (error) {
      console.error("Error in getCurrentLocation:", error);
      Alert.alert("Location Error", "Could not get your current location. Please try again.");
      setIsGettingLocation(false);
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
  };

  const deg2rad = (deg) => {
    return deg * (Math.PI / 180);
  };

  const imageContainerStyle = useMemo(() => ({
    ...styles.imageContainer,
    // Ensure 1:1 square aspect ratio
    aspectRatio: 1,
  }), []);

  const handleActionImage = useCallback(async () => {
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

      // Get screen dimensions for proper cropping ratio
      const screenWidth = Dimensions.get('window').width;
      const width = screenWidth;
      const height = screenWidth; // 1:1 aspect ratio for square photos
      
      // First clean up any previous image to free memory
      if (actionImageUri) {
        try {
          ImagePicker.cleanSingle(actionImageUri).catch(() => {});
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
      }).then(image => {
        if (!isMounted.current) return;
        setActionImageUri(image.path);
      }).catch(error => {
        if (!isMounted.current) return;
        if (error.code !== 'E_PICKER_CANCELLED') { // Don't show error for user cancellation
          Alert.alert("Camera Error", "Failed to take picture. Please try again.");
        }
      });
    } catch (error) {
      if (!isMounted.current) return;
      console.error("Camera Error:", error);
      Alert.alert("Camera Error", "Failed to take picture. Please try again.");
    }
  }, [actionImageUri]);

  const uploadImage = async () => {
    if (!actionImageUri) return null;

    try {
      const base64Image = await convertImageToBase64(actionImageUri);
      return base64Image;
    } catch (error) {
      console.error("Error converting image to base64:", error);
      throw error;
    }
  };

  const submitAction = async () => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to submit action.");
      return;
    }

    // Simply check userRole from AuthContext
    if (userRole !== 'municipal') {
      Alert.alert("Unauthorized", "Only municipal authorities can take actions on reports.");
      return;
    }

    if (!actionImageUri) {
      Alert.alert("Missing Image", "Please take an 'after' photo to show the cleanup.");
      return;
    }

    if (!actionCategory) {
      Alert.alert("Missing Information", "Please select the type of action taken.");
      return;
    }

    if (!location) {
      Alert.alert("Location Unavailable", "Location verification is required. Please fetch your location.");
      return;
    }

    try {
      setSubmitting(true);

      const afterImageBase64 = await uploadImage();

      const reportRef = doc(db, "reports", reportId);

      await updateDoc(reportRef, {
        status: 'resolved',
        resolvedBy: auth.currentUser.uid,
        resolvedByName: user.displayName || "Municipal Authority",
        resolvedAt: Timestamp.now(),
        afterImageBase64: afterImageBase64,
        resolutionNotes: resolutionNotes.trim() || "Action taken by municipal authority",
        actionCategory,
        actionLocation: new GeoPoint(location.latitude, location.longitude),
        actionLocationName: locationName,
        locationVerified
      });

      const activityRef = collection(db, "reports", reportId, "activities");
      await addDoc(activityRef, {
        type: 'resolution',
        userId: auth.currentUser.uid,
        userName: user.displayName || "Municipal Authority",
        timestamp: Timestamp.now(),
        notes: resolutionNotes.trim() || "Action taken by municipal authority",
        actionCategory,
        locationVerified
      });

      // Update the impact score for the report creator
      if (report.userId) {
        try {
          // Add notification
          const notificationRef = collection(db, "users", report.userId, "notifications");
          await addDoc(notificationRef, {
            type: "resolution",
            reportId: reportId,
            reportTitle: report.title,
            userId: auth.currentUser.uid,
            username: user.displayName || "Municipal Authority",
            notes: resolutionNotes.trim() || "Your report has been resolved",
            read: false,
            createdAt: Timestamp.now()
          });

          try {
            // Update impact score - add 3 points for resolved report
            const userRef = doc(db, "users", report.userId);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              // Calculate new impact score (current points + 3 for the resolved report)
              const currentPoints = userData.impactScore || userData.points || 0;
              const newPoints = currentPoints + 3;
              
              // Directly update the user document with the new points
              await updateDoc(userRef, {
                points: newPoints,
                impactScore: newPoints // Update both fields for compatibility
              });
              
              console.log(`Updated points for user ${report.userId}: ${currentPoints} -> ${newPoints}`);
            }
          } catch (pointsError) {
            // If updating points fails, log it but don't fail the entire transaction
            console.warn("Could not update impact score:", pointsError);
          }
        } catch (notifError) {
          console.warn("Could not send notification:", notifError);
          // Continue with the resolution even if notification fails
        }
      }

      setSubmitting(false);
      Alert.alert(
        "Action Submitted",
        "The report has been marked as resolved. Thank you for your service to the community!",
        [
          {
            text: "OK",
            onPress: () => navigation.navigate('MainTabs')
          }
        ]
      );
    } catch (error) {
      console.error("Error submitting action:", error);
      setSubmitting(false);
      Alert.alert("Error", "Failed to submit action. Please try again later.");
    }
  };

  if (unauthorized) {
    return (
      <View style={styles.unauthorizedContainer}>
        <MaterialIcons name="block" size={80} color={theme.colors.error} />
        <Text style={styles.unauthorizedTitle}>Access Denied</Text>
        <Text style={styles.unauthorizedText}>
          Only municipal authorities can access this feature to take action on reports.
        </Text>
        <Button
          mode="contained"
          onPress={() => navigation.goBack()}
          style={styles.unauthorizedButton}
        >
          Go Back
        </Button>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading report details...</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error" size={80} color={theme.colors.error} />
        <Text style={styles.errorText}>Report not found or error loading details</Text>
        <Button
          mode="contained"
          onPress={() => navigation.goBack()}
          style={styles.errorButton}
        >
          Go Back
        </Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : null}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Complete Action</Text>
          <Text style={styles.subtitle}>
            Take an 'after' photo to show the cleanup and resolve the report
          </Text>
        </View>
        
        {/* Three Step Process Instructions */}
        <View style={styles.stepsContainer}>
          <Text style={styles.stepsTitle}>Follow these steps:</Text>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>Take a photo of the cleanup</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>Fetch your current location</Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>Submit the resolution action</Text>
          </View>
        </View>

        <View style={styles.reportSummary}>
          <Text style={styles.reportSummaryTitle}>Original Report</Text>
          <Text style={styles.reportSummaryText}>
            <Text style={styles.boldText}>Title:</Text> {report.title}
          </Text>
          <Text style={styles.reportSummaryText}>
            <Text style={styles.boldText}>Reported by:</Text> {report.userName || "Anonymous"}
          </Text>
          <Text style={styles.reportSummaryText}>
            <Text style={styles.boldText}>Location:</Text> {report.locationName || "Unknown location"}
          </Text>

          <Text style={styles.beforeImageLabel}>Original Report Image:</Text>
          <View style={styles.beforeImageContainer}>
            <Image
              source={{ uri: report.imageUrl }}
              style={styles.beforeImage}
              resizeMode="cover"
            />
          </View>
        </View>

        <View style={styles.imageSection}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="camera-alt" size={24} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>After Action Image</Text>
          </View>
          
          {actionImageUri ? (
            <View style={imageContainerStyle}>
              <Image source={{ uri: actionImageUri }} style={styles.reportImage} />
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={handleActionImage}
              >
                <MaterialCommunityIcons name="camera-retake" size={20} color="white" />
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noImageContainer}>
              <Text style={styles.noImageText}>No 'after' image taken yet</Text>
              <View style={styles.cameraButtonsRow}>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={handleActionImage}
                >
                  <MaterialIcons name="camera-alt" size={24} color="white" />
                  <Text style={styles.actionButtonText}>Take Photo</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.locationSection}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="location-on" size={24} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>Location Verification</Text>
          </View>

          {location ? (
            <>
              <View style={styles.locationStatusContainer}>
                <Text style={styles.locationText}>{locationName || "Current location"}</Text>
                <View style={[
                  styles.locationVerifiedBadge,
                  { backgroundColor: locationVerified ? theme.colors.successLight : theme.colors.warningLight }
                ]}>
                  <Text style={[
                    styles.locationVerifiedText,
                    { color: locationVerified ? theme.colors.success : theme.colors.warning }
                  ]}>
                    {locationVerified ? "Verified" : "Not at report location"}
                  </Text>
                </View>
              </View>

              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  region={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                >
                  {report.location && (
                    <Marker
                      coordinate={{
                        latitude: report.location.latitude || report.location._latitude,
                        longitude: report.location.longitude || report.location._longitude,
                      }}
                      title="Report Location"
                      pinColor="red"
                    />
                  )}

                  <Marker
                    coordinate={{
                      latitude: location.latitude,
                      longitude: location.longitude,
                    }}
                    title="Your Location"
                    pinColor="blue"
                  />
                </MapView>
              </View>
            </>
          ) : (
            <View style={styles.noLocationContainer}>
              <Text style={styles.noLocationText}>Location not fetched yet</Text>
              <TouchableOpacity 
                style={[
                  styles.actionButton,
                  !actionImageUri ? styles.disabledButton : null
                ]}
                onPress={getCurrentLocation}
                disabled={!actionImageUri || isGettingLocation}
              >
                {isGettingLocation ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <MaterialIcons name="my-location" size={24} color="white" />
                    <Text style={styles.actionButtonText}>
                      {!actionImageUri ? "Take photo first" : "Fetch Location"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.formSection}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="check-circle" size={24} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>Action Details</Text>
          </View>

          <Text style={styles.fieldLabel}>Type of Action Taken:</Text>
          <View style={styles.categoryContainer}>
            {actionCategories.map((category) => (
              <Chip
                key={category.value}
                selected={actionCategory === category.value}
                onPress={() => setActionCategory(category.value)}
                style={[
                  styles.categoryChip,
                  actionCategory === category.value && styles.selectedCategoryChip
                ]}
                textStyle={actionCategory === category.value ? styles.selectedCategoryText : null}
              >
                {category.label}
              </Chip>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Resolution Notes:</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the action taken to resolve this issue..."
            value={resolutionNotes}
            onChangeText={setResolutionNotes}
            multiline
            numberOfLines={5}
            maxLength={500}
          />
          <HelperText type="info">
            Add details about the cleanup process, resources used, etc.
          </HelperText>
        </View>

        <View style={styles.submitContainer}>
          <Button
            mode="contained"
            onPress={submitAction}
            style={[styles.submitButton, (!actionImageUri || !location) ? styles.disabledSubmitButton : null]}
            disabled={submitting || !actionImageUri || !actionCategory || !location}
            loading={submitting}
            icon="check-circle"
          >
            Mark as Resolved
          </Button>
          {(!actionImageUri || !location) && (
            <Text style={styles.warningText}>
              {!actionImageUri ? "Please take a photo first. " : ""}
              {!location ? "Please fetch your location. " : ""}
            </Text>
          )}
          <Text style={styles.disclaimer}>
            By submitting this action, you confirm that the issue reported has been properly addressed and resolved.
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
  unauthorizedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.large,
    backgroundColor: theme.colors.background,
  },
  unauthorizedTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.error,
    marginTop: theme.spacing.medium,
  },
  unauthorizedText: {
    fontSize: theme.typography.fontSize.md,
    textAlign: 'center',
    marginVertical: theme.spacing.medium,
    color: theme.colors.text,
  },
  unauthorizedButton: {
    marginTop: theme.spacing.medium,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.medium,
    color: theme.colors.textLight,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.large,
    backgroundColor: theme.colors.background,
  },
  errorText: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.error,
    textAlign: 'center',
    marginVertical: theme.spacing.medium,
  },
  errorButton: {
    marginTop: theme.spacing.medium,
  },
  header: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.success,
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
  stepsContainer: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    marginTop: theme.spacing.medium,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.success,
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
    color: theme.colors.success,
    marginRight: theme.spacing.small,
  },
  stepText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
  },
  reportSummary: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    marginTop: theme.spacing.medium,
    ...theme.shadows.small,
  },
  reportSummaryTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.medium,
  },
  reportSummaryText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
  },
  boldText: {
    fontWeight: theme.typography.fontWeight.bold,
  },
  beforeImageLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textLight,
    marginTop: theme.spacing.medium,
    marginBottom: theme.spacing.small,
  },
  beforeImageContainer: {
    height: 200,
    borderRadius: theme.borderRadius.medium,
    overflow: 'hidden',
    ...theme.shadows.small,
  },
  beforeImage: {
    width: '100%',
    height: '100%',
  },
  imageSection: {
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
  actionButtonText: {
    color: 'white',
    fontWeight: theme.typography.fontWeight.medium,
    marginLeft: theme.spacing.small,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    borderRadius: theme.borderRadius.medium,
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundLight,
  },
  reportImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
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
  locationStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.medium,
  },
  locationVerifiedBadge: {
    paddingHorizontal: theme.spacing.medium,
    paddingVertical: theme.spacing.small,
    borderRadius: theme.borderRadius.full,
  },
  locationVerifiedText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
  },
  locationText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    flex: 1,
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
  mapContainer: {
    height: 200,
    borderRadius: theme.borderRadius.medium,
    overflow: 'hidden',
    ...theme.shadows.small,
    marginBottom: theme.spacing.medium,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  formSection: {
    padding: theme.spacing.medium,
    marginTop: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.small,
  },
  fieldLabel: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.medium,
  },
  categoryChip: {
    margin: theme.spacing.xsmall,
    backgroundColor: theme.colors.backgroundLight,
  },
  selectedCategoryChip: {
    backgroundColor: theme.colors.primaryLight,
  },
  selectedCategoryText: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
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
  },
  submitContainer: {
    padding: theme.spacing.medium,
    marginTop: theme.spacing.medium,
    marginBottom: theme.spacing.large,
  },
  submitButton: {
    borderRadius: theme.borderRadius.medium,
    paddingVertical: theme.spacing.small,
    backgroundColor: theme.colors.success,
  },
  disabledSubmitButton: {
    backgroundColor: theme.colors.disabled,
  },
  disclaimer: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginTop: theme.spacing.medium,
    paddingHorizontal: theme.spacing.medium,
  },
  warningText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.warning,
    textAlign: 'center',
    marginTop: theme.spacing.small,
  },
});

export default ReportActionScreen;