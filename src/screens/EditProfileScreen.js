// src/screens/EditProfileScreen.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Keyboard,
  BackHandler,
  Image
} from 'react-native';
import { 
  Text, 
  Avatar, 
  Button, 
  TextInput,
  Chip,
  ActivityIndicator,
  Appbar,
  IconButton,
  Snackbar,
  FAB,
  Divider,
  List,
  Surface
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import { doc, updateDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db as firestore } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../contexts/NetworkContext';
import theme from '../theme/theme';

const EditProfileScreen = ({ navigation, route }) => {
  const { user, updateUserProfile, userRole } = useAuth();
  const { isConnected } = useNetwork();
  const { userData } = route.params || {}; // Get userData passed from ProfileScreen
  
  const [editedProfile, setEditedProfile] = useState({
    displayName: userData?.displayName || user?.displayName || 'User',
    bio: userData?.bio || '',
    location: userData?.location || '',
    // Removed website field but keeping it in the state to avoid breaking backend
    website: userData?.website || '',
    imageURL: userData?.imageURL || userData?.photoURL || user?.photoURL || '',
    base64Image: '', // New field to store base64 image data
    followers: userData?.followers || [],
    following: userData?.following || []
  });
  
  const [municipalData, setMunicipalData] = useState({
    name: '',
    email: '',
    city: '',
    region: '',
    role: 'municipal',
    assignedZones: [], // Initialize empty array
    responsibilities: [], // Initialize empty array
  });
  
  const [newZone, setNewZone] = useState('');
  const [newResponsibility, setNewResponsibility] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isMunicipalDataLoaded, setIsMunicipalDataLoaded] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Detect changes in the form and mark as having unsaved changes
  useEffect(() => {
    setHasUnsavedChanges(true);
  }, [editedProfile, municipalData]);

  // Handle back button to warn about unsaved changes
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (hasUnsavedChanges) {
        Alert.alert(
          'Unsaved Changes',
          'You have unsaved changes. Are you sure you want to go back?',
          [
            { text: 'Stay', style: 'cancel', onPress: () => {} },
            { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() }
          ]
        );
        return true; // Prevent default back button behavior
      }
      return false; // Allow default back button behavior
    });

    return () => backHandler.remove();
  }, [hasUnsavedChanges, navigation]);

  // Fetch municipal authority data
  useEffect(() => {
    if (userRole === 'municipal' && user?.uid && !isMunicipalDataLoaded) {
      fetchMunicipalData();
    }
  }, [user?.uid, userRole, isMunicipalDataLoaded]);

  // Function to fetch municipal authority data
  const fetchMunicipalData = useCallback(async () => {
    if (!isConnected) {
      Alert.alert(
        'Network Error',
        'You appear to be offline. Some data may not be available.'
      );
      return;
    }

    try {
      const municipalRef = collection(firestore, 'municipal_authorities');
      const q = query(municipalRef, where('uid', '==', user.uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const data = querySnapshot.docs[0].data();
        setMunicipalData({
          id: querySnapshot.docs[0].id,
          name: data.name || '',
          email: data.email || '',
          city: data.city || '',
          region: data.region || '',
          role: data.role || 'municipal',
          assignedZones: data.assignedZones || [],
          responsibilities: data.responsibilities || []
        });
        setIsMunicipalDataLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching municipal data:', error);
      Alert.alert(
        'Error',
        'Failed to fetch municipal authority data. Please try again later.'
      );
    }
  }, [user?.uid, isConnected]);
  
  // Helper function to add a new zone
  const handleAddZone = useCallback(() => {
    if (newZone.trim() && !municipalData.assignedZones?.includes(newZone.trim())) {
      setMunicipalData(prev => ({
        ...prev,
        assignedZones: [...(prev.assignedZones || []), newZone.trim()]
      }));
      setNewZone('');
      Keyboard.dismiss();
    }
  }, [newZone, municipalData.assignedZones]);
  
  // Helper function to remove a zone
  const handleRemoveZone = useCallback((zone) => {
    setMunicipalData(prev => ({
      ...prev,
      assignedZones: (prev.assignedZones || []).filter(item => item !== zone)
    }));
  }, []);
  
  // Helper function to add a new responsibility
  const handleAddResponsibility = useCallback(() => {
    if (newResponsibility.trim() && !municipalData.responsibilities?.includes(newResponsibility.trim())) {
      setMunicipalData(prev => ({
        ...prev,
        responsibilities: [...(prev.responsibilities || []), newResponsibility.trim()]
      }));
      setNewResponsibility('');
      Keyboard.dismiss();
    }
  }, [newResponsibility, municipalData.responsibilities]);
  
  // Helper function to remove a responsibility
  const handleRemoveResponsibility = useCallback((responsibility) => {
    setMunicipalData(prev => ({
      ...prev,
      responsibilities: (prev.responsibilities || []).filter(item => item !== responsibility)
    }));
  }, []);

  // Handler for choosing a photo - optimized with useCallback
  const handleChoosePhoto = useCallback(async () => {
    if (!isConnected) {
      Alert.alert(
        'Network Error',
        'You appear to be offline. Please check your connection and try again.'
      );
      return;
    }

    const options = {
      mediaType: 'photo',
      quality: 0.5,
      maxWidth: 500,
      maxHeight: 500,
      includeBase64: true,
    };
    
    try {
      const result = await launchImageLibrary(options);
      
      if (!result.didCancel && result.assets && result.assets[0]) {
        setImageUploading(true);
        setSnackbarMessage('Processing image...');
        setSnackbarVisible(true);
        
        const base64Image = result.assets[0].base64;
        
        if (!base64Image) {
          throw new Error('Failed to get base64 image data');
        }
        
        // Update the profile state with the base64 image
        setEditedProfile(prev => ({
          ...prev,
          base64Image: `data:image/jpeg;base64,${base64Image}`,
          imageURL: `data:image/jpeg;base64,${base64Image}` // Also update imageURL for display
        }));
        
        setSnackbarMessage('Image processed successfully');
        setSnackbarVisible(true);
      }
    } catch (error) {
      console.error('Error choosing/processing image:', error);
      Alert.alert(
        'Upload Error',
        'There was a problem processing your image. Please try again.'
      );
    } finally {
      setImageUploading(false);
    }
  }, [isConnected]);

  // Handle navigation back with confirmation if there are unsaved changes
  const handleBackNavigation = useCallback(() => {
    if (hasUnsavedChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Are you sure you want to go back?',
        [
          { text: 'Stay', style: 'cancel', onPress: () => {} },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() }
        ]
      );
    } else {
      navigation.goBack();
    }
  }, [hasUnsavedChanges, navigation]);

  // Handler for saving profile changes - optimized with useCallback
  const handleSaveProfile = useCallback(async () => {
    if (!user?.uid) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    if (!isConnected) {
      Alert.alert(
        'Network Error',
        'You appear to be offline. Please check your connection and try again.'
      );
      return;
    }
    
    try {
      setSaving(true);
      
      // Validate profile data
      if (!editedProfile.displayName.trim()) {
        throw new Error('Name cannot be empty');
      }
      
      // Prepare update data for user profile
      const updateData = {
        displayName: editedProfile.displayName.trim(),
        bio: editedProfile.bio.trim(),
        location: editedProfile.location.trim(),
        website: editedProfile.website.trim(),
        followers: editedProfile.followers,
        following: editedProfile.following
      };
      
      // Add base64Image if available
      if (editedProfile.base64Image) {
        updateData.imageURL = editedProfile.base64Image;
      }
      
      // Update user profile in Firestore
      await updateDoc(doc(firestore, 'users', user.uid), updateData);
      
      // Update Auth profile if display name changed
      if (user.displayName !== editedProfile.displayName) {
        await updateUserProfile({
          displayName: editedProfile.displayName,
        });
      }
      
      // Update municipal authority data if user is a municipal authority
      if (userRole === 'municipal' && municipalData.id) {
        const municipalRef = doc(firestore, 'municipal_authorities', municipalData.id);
        
        const municipalUpdateData = {
          name: municipalData.name.trim(),
          email: municipalData.email.trim(),
          city: municipalData.city.trim(),
          region: municipalData.region.trim(),
          role: municipalData.role,
          assignedZones: municipalData.assignedZones || [],
          responsibilities: municipalData.responsibilities || [],
          uid: user.uid, // Ensure the UID field is always preserved
          // Preserve followers and following arrays
          followers: municipalData.followers || [],
          following: municipalData.following || []
        };
        
        // Also update the profile photo in municipal authority document if available
        if (editedProfile.base64Image) {
          municipalUpdateData.imageURL = editedProfile.base64Image;
        }
        
        await updateDoc(municipalRef, municipalUpdateData);
      }
      
      // Show success message
      setSnackbarMessage('Profile updated successfully');
      setSnackbarVisible(true);
      setHasUnsavedChanges(false);
      
      // Navigate back to MainTabs and then to Profile tab
      setTimeout(() => {
        navigation.navigate('MainTabs', { 
          screen: 'Profile',
          params: { profileUpdated: true }
        });
      }, 1000);
      
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert(
        'Update Error',
        error.message || 'There was a problem updating your profile. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  }, [user, editedProfile, municipalData, userRole, updateUserProfile, navigation, isConnected]);

  // Render zones list for municipal users
  const renderZones = useMemo(() => (
    <View style={styles.chipsContainer}>
      {municipalData.assignedZones && municipalData.assignedZones.map((zone, index) => (
        <Chip
          key={index}
          style={styles.interestChip}
          onClose={() => handleRemoveZone(zone)}
          mode="outlined"
          closeIcon="close-circle"
        >
          {zone}
        </Chip>
      ))}
      
      {(municipalData.assignedZones || []).length === 0 && (
        <Text style={styles.noInterestsText}>
          Add zones you are responsible for
        </Text>
      )}
    </View>
  ), [municipalData.assignedZones, handleRemoveZone]);

  // Render responsibilities list for municipal users
  const renderResponsibilities = useMemo(() => (
    <View style={styles.chipsContainer}>
      {municipalData.responsibilities && municipalData.responsibilities.map((resp, index) => (
        <Chip
          key={index}
          style={styles.interestChip}
          onClose={() => handleRemoveResponsibility(resp)}
          mode="outlined"
          closeIcon="close-circle"
        >
          {resp}
        </Chip>
      ))}
      
      {(municipalData.responsibilities || []).length === 0 && (
        <Text style={styles.noInterestsText}>
          Add your areas of responsibility
        </Text>
      )}
    </View>
  ), [municipalData.responsibilities, handleRemoveResponsibility]);

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* User photo section */}
          <View style={styles.photoSection}>
            {imageUploading ? (
              <Surface style={styles.avatarContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </Surface>
            ) : editedProfile.imageURL ? (
              <Surface style={styles.avatarContainer}>
                <Avatar.Image
                  size={100}
                  source={{ uri: editedProfile.imageURL }}
                  style={styles.avatar}
                />
              </Surface>
            ) : (
              <Surface style={styles.avatarContainer}>
                <Avatar.Text
                  size={100}
                  label={(editedProfile.displayName || 'U')[0].toUpperCase()}
                  style={styles.avatar}
                  color={theme.colors.textInverted}
                  backgroundColor={theme.colors.primary}
                />
              </Surface>
            )}
            
            <TouchableOpacity 
              onPress={handleChoosePhoto}
              disabled={imageUploading}
              style={styles.changePhotoButton}
            >
              <Text style={styles.changePhotoText}>Change Profile Photo</Text>
            </TouchableOpacity>
          </View>
          
          {/* Profile form - Styled like LoginScreen */}
          <View style={styles.formSection}>
            <TextInput
              label="Name"
              value={editedProfile.displayName}
              onChangeText={text => setEditedProfile(prev => ({...prev, displayName: text}))}
              mode="outlined"
              style={styles.input}
              outlineColor={theme.colors.border}
              activeOutlineColor={theme.colors.primary}
              theme={{ colors: { text: theme.colors.text } }}
              autoCapitalize="words"
            />
            
            <TextInput
              label="Bio"
              value={editedProfile.bio}
              onChangeText={text => setEditedProfile(prev => ({...prev, bio: text}))}
              mode="outlined"
              style={styles.input}
              outlineColor={theme.colors.border}
              activeOutlineColor={theme.colors.primary}
              theme={{ colors: { text: theme.colors.text } }}
              multiline
              numberOfLines={3}
            />
            
            <TextInput
              label="Location"
              value={editedProfile.location}
              onChangeText={text => setEditedProfile(prev => ({...prev, location: text}))}
              mode="outlined"
              style={styles.input}
              outlineColor={theme.colors.border}
              activeOutlineColor={theme.colors.primary}
              theme={{ colors: { text: theme.colors.text } }}
              autoCapitalize="words"
            />
          </View>
          
          {/* Municipal Authority Fields - Only show for municipal users */}
          {userRole === 'municipal' && (
            <>
              <Divider style={styles.divider} />
              
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Municipal Authority Information</Text>
                
                <TextInput
                  label="Name"
                  value={municipalData.name}
                  onChangeText={text => setMunicipalData(prev => ({...prev, name: text}))}
                  mode="outlined"
                  style={styles.input}
                  outlineColor={theme.colors.border}
                  activeOutlineColor={theme.colors.primary}
                  theme={{ colors: { text: theme.colors.text } }}
                  autoCapitalize="words"
                />
                
                <TextInput
                  label="Email"
                  value={municipalData.email}
                  onChangeText={text => setMunicipalData(prev => ({...prev, email: text}))}
                  mode="outlined"
                  style={styles.input}
                  outlineColor={theme.colors.border}
                  activeOutlineColor={theme.colors.primary}
                  theme={{ colors: { text: theme.colors.text } }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                
                <TextInput
                  label="City"
                  value={municipalData.city}
                  onChangeText={text => setMunicipalData(prev => ({...prev, city: text}))}
                  mode="outlined" 
                  style={styles.input}
                  outlineColor={theme.colors.border}
                  activeOutlineColor={theme.colors.primary}
                  theme={{ colors: { text: theme.colors.text } }}
                  autoCapitalize="words"
                />
                
                <TextInput
                  label="Region"
                  value={municipalData.region}
                  onChangeText={text => setMunicipalData(prev => ({...prev, region: text}))}
                  mode="outlined"
                  style={styles.input}
                  outlineColor={theme.colors.border}
                  activeOutlineColor={theme.colors.primary}
                  theme={{ colors: { text: theme.colors.text } }}
                  autoCapitalize="words"
                />
                
                {/* Assigned Zones Section (for municipal users) */}
                <View style={styles.sectionSubContainer}>
                  <Text style={styles.sectionSubtitle}>Assigned Zones</Text>
                  
                  <View style={styles.interestsInputContainer}>
                    <TextInput
                      label="Add Zone"
                      value={newZone}
                      onChangeText={setNewZone}
                      mode="outlined"
                      style={styles.input}
                      outlineColor={theme.colors.border}
                      activeOutlineColor={theme.colors.primary}
                      theme={{ colors: { text: theme.colors.text } }}
                      autoCapitalize="words"
                      right={
                        <TextInput.Icon 
                          icon="plus"
                          onPress={handleAddZone}
                          disabled={!newZone.trim()}
                          color={theme.colors.primary}
                        />
                      }
                    />
                  </View>
                  
                  {renderZones}
                </View>
                
                {/* Responsibilities Section (for municipal users) */}
                <View style={styles.sectionSubContainer}>
                  <Text style={styles.sectionSubtitle}>Responsibilities</Text>
                  
                  <View style={styles.interestsInputContainer}>
                    <TextInput
                      label="Add Responsibility"
                      value={newResponsibility}
                      onChangeText={setNewResponsibility}
                      mode="outlined"
                      style={styles.input}
                      outlineColor={theme.colors.border}
                      activeOutlineColor={theme.colors.primary}
                      theme={{ colors: { text: theme.colors.text } }}
                      autoCapitalize="words"
                      right={
                        <TextInput.Icon 
                          icon="plus"
                          onPress={handleAddResponsibility}
                          disabled={!newResponsibility.trim()}
                          color={theme.colors.primary}
                        />
                      }
                    />
                  </View>
                  
                  {renderResponsibilities}
                </View>
              </View>
            </>
          )}
          
          {/* Network Status Warning */}
          {!isConnected && (
            <View style={styles.networkWarning}>
              <MaterialCommunityIcons name="wifi-off" size={20} color={theme.colors.error} />
              <Text style={styles.networkWarningText}>
                You are currently offline. Changes will not be saved.
              </Text>
            </View>
          )}
          
          {/* Save Button */}
          <Button
            mode="contained"
            onPress={handleSaveProfile}
            loading={isSaving}
            disabled={isSaving || !isConnected}
            style={styles.saveButton}
            labelStyle={styles.buttonLabel}
            color={theme.colors.primary}
          >
            Save Profile
          </Button>
          
          {/* Extra space at bottom */}
          <View style={{ height: 20 }} />
        </View>
      </ScrollView>
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        action={{
          label: 'OK',
          onPress: () => setSnackbarVisible(false),
        }}
        duration={2000}
        style={styles.snackbar}
      >
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
  appbar: {
    backgroundColor: theme.colors.surface,
    elevation: 1,
  },
  appbarTitle: {
    fontSize: 18,
    fontWeight: '500',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 16,
    paddingBottom: 50,
  },
  photoSection: {
    alignItems: 'center',
    padding: 20,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  avatar: {
    marginBottom: 0,
  },
  changePhotoButton: {
    padding: 8,
  },
  changePhotoText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 16,
  },
  formSection: {
    marginBottom: 20,
  },
  input: {
    marginBottom: 16,
    backgroundColor: theme.colors.surface,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: theme.colors.text,
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 12,
    color: theme.colors.text,
  },
  interestsInputContainer: {
    marginBottom: 16,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  interestChip: {
    margin: 4,
    backgroundColor: theme.colors.surfaceVariant,
  },
  noInterestsText: {
    color: theme.colors.textLight,
    fontStyle: 'italic',
    marginVertical: 10,
  },
  saveButton: {
    marginTop: 16,
    paddingVertical: 6,
    backgroundColor: theme.colors.primary,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 4,
  },
  snackbar: {
    bottom: 20,
  },
  sectionContainer: {
    padding: 8,
  },
  sectionSubContainer: {
    marginTop: 24,
    marginBottom: 8,
  },
  networkWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.errorContainer || '#ffebee',
    padding: 12,
    marginVertical: 16,
    borderRadius: 8,
  },
  networkWarningText: {
    color: theme.colors.error,
    marginLeft: 8,
    flex: 1,
    fontSize: 14,
  },
});

export default EditProfileScreen;