import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  RefreshControl,
  Dimensions,
  TextInput as RNTextInput
} from 'react-native';
import { 
  Text, 
  Avatar, 
  Button, 
  Card, 
  Title, 
  Paragraph, 
  Divider, 
  Badge,
  ActivityIndicator,
  Menu,
  Portal,
  Dialog,
  TextInput,
  Chip,
  Banner,
  Snackbar,
  Modal,
  IconButton,
  SegmentedButtons
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
// Updated imports - removed storage
import { db as firestore, convertImageToBase64 } from '../config/firebase';
import { collection, doc, getDoc, setDoc, updateDoc, query, where, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';
// Removed import for Firebase Storage
import { launchImageLibrary } from 'react-native-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../contexts/NetworkContext';
import theme from '../theme/theme';

const { width } = Dimensions.get('window');
const GRID_IMAGE_SIZE = width / 3 - 2;

const ProfileScreen = () => {
  const navigation = useNavigation();
  const { user, signOut, updateUserProfile, userRole } = useAuth();
  const { isConnected } = useNetwork();
  const [userData, setUserData] = useState({
    displayName: user?.displayName || '',
    bio: '',
    location: '',
    website: '',
    interests: [],
    photoURL: user?.photoURL || '',
    points: 0,
    level: 'Beginner',
    followers: [],
    following: [],
  });
  
  const [municipalData, setMunicipalData] = useState({
    name: '',
    email: '',
    city: '',
    region: '',
    role: 'municipal',
    resolvedCases: 0,
    imageURL: '', // Added imageURL field
  });
  
  const [reports, setReports] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [menuVisible, setMenuVisible] = useState(false);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showErrorSnackbar, setShowErrorSnackbar] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [followModal, setFollowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('followers');
  const [followersList, setFollowersList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [loadingFollowLists, setLoadingFollowLists] = useState(false);

  // Stats
  const resolvedReports = reports.filter(r => r.status?.toLowerCase() === 'resolved').length;
  const totalReports = reports.length;
  const impactScore = resolvedReports * 3;
  const followersCount = userData.followers?.length || 0;
  const followingCount = userData.following?.length || 0;

  useEffect(() => {
    fetchUserData();
    fetchUserReports();
    
    // Fetch municipal data if user is a municipal authority
    if (userRole === 'municipal' && user?.uid) {
      fetchMunicipalData();
    }
  }, [user?.uid, userRole]);
  
  // Function to fetch municipal authority data
  const fetchMunicipalData = async () => {
    if (!user?.uid) return;
    
    try {
      // Query municipal_authorities collection to find document with matching uid
      const municipalRef = collection(firestore, 'municipal_authorities');
      const q = query(municipalRef, where('uid', '==', user.uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        // Get the first document that matches (there should only be one)
        const data = querySnapshot.docs[0].data();
        
        // Set all municipal authority fields from Firestore using the actual fields in your database
        setMunicipalData({
          id: querySnapshot.docs[0].id,
          name: data.name || 'Municipal Authority',
          email: data.email || user.email || '',
          city: data.city || '',
          region: data.region || '',
          role: data.role || 'municipal',
          resolvedCases: reports.filter(r => r.status?.toLowerCase() === 'resolved').length || 0,
          imageURL: data.imageURL || '', // Get the municipal authority profile photo
        });
        
        // Also update userData for display purposes
        setUserData(prevData => ({
          ...prevData,
          displayName: data.name || 'Municipal Authority',
          photoURL: data.imageURL || prevData.photoURL, // Use municipal authority photo if available
        }));
        
        // Set the image URI for profile display
        if (data.imageURL) {
          setImageUri(data.imageURL);
        }
      }
    } catch (error) {
      console.error('Error fetching municipal data:', error);
      setErrorMessage('Failed to fetch municipal authority data. Please try again later.');
      setShowErrorSnackbar(true);
    }
  };

  const fetchUserData = async () => {
    if (!user?.uid) return;
    
    try {
      const userDoc = await getDoc(doc(firestore, 'users', user.uid));
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        // Don't directly use base64 string for photoURL
        let photoURLToUse = data.photoURL;
        if (data.photoURL && data.photoURL.startsWith('data:')) {
          // If it's a data URL, use imageURL field instead
          photoURLToUse = data.imageURL || '';
        }
        
        setUserData(prevData => ({
          ...prevData,
          ...data,
          displayName: data.displayName || user?.displayName || 'User',
          photoURL: photoURLToUse,
          followers: data.followers || [],
          following: data.following || [],
        }));
        
        // Set image URI if available
        if (data.imageURL) {
          setImageUri(data.imageURL);
        }
      } else {
        // Create a user document if it doesn't exist
        const newUserData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'User',
          photoURL: user.photoURL || '',
          imageURL: user.photoURL || '',
          bio: '',
          location: '',
          website: '',
          interests: [],
          createdAt: serverTimestamp(),
          points: 0,
          level: 'Beginner',
          followers: [],
          following: [],
        };
        
        await setDoc(doc(firestore, 'users', user.uid), newUserData);
        setUserData(newUserData);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setErrorMessage('Failed to fetch user data. Please try again later.');
      setShowErrorSnackbar(true);
    }
  };

  const fetchUserReports = async () => {
    if (!user?.uid) return;
    
    try {
      setLoading(true);
      let q;
      
      if (userRole === 'municipal') {
        // For municipal users, first get reports they resolved without ordering
        q = query(
          collection(firestore, 'reports'),
          where('resolvedBy', '==', user.uid)
        );
      } else {
        // For residents, show reports they created
        q = query(
          collection(firestore, 'reports'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
      }
      
      const snapshot = await getDocs(q);
      
      const reportData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      
      // If municipal user, sort the reports by resolvedAt client-side
      if (userRole === 'municipal' && reportData.length > 0) {
        reportData.sort((a, b) => {
          // Handle cases where resolvedAt might be missing
          if (!a.resolvedAt) return 1;
          if (!b.resolvedAt) return -1;
          
          // Convert Firestore timestamps to milliseconds for comparison
          const timeA = a.resolvedAt.toMillis ? a.resolvedAt.toMillis() : a.resolvedAt;
          const timeB = b.resolvedAt.toMillis ? b.resolvedAt.toMillis() : b.resolvedAt;
          
          // Sort in descending order (newest first)
          return timeB - timeA;
        });
      }
      
      setReports(reportData);
      
      // Calculate impact score for regular users and update the points field in database
      if (userRole !== 'municipal') {
        const resolvedCount = reportData.filter(r => r.status?.toLowerCase() === 'resolved').length;
        const calculatedImpactScore = resolvedCount * 3;
        
        // Update the points field in Firestore with the calculated impact score
        const userRef = doc(firestore, 'users', user.uid);
        await updateDoc(userRef, {
          points: calculatedImpactScore
        });
        
        // Also update the local state
        setUserData(prevData => ({
          ...prevData,
          points: calculatedImpactScore
        }));
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
      setErrorMessage('Failed to fetch reports. Please try again later.');
      setShowErrorSnackbar(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchUserData();
    fetchUserReports();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setLogoutDialogVisible(false);
    } catch (error) {
      console.error('Error signing out:', error);
      setErrorMessage('Failed to sign out. Please try again later.');
      setShowErrorSnackbar(true);
    }
  };

  const handleChoosePhoto = async () => {
    const options = {
      mediaType: 'photo',
      quality: 0.7,
      includeBase64: false, // We'll convert to base64 ourselves
      maxWidth: 800,
      maxHeight: 800,
    };
    
    try {
      const result = await launchImageLibrary(options);
      
      if (!result.didCancel && result.assets && result.assets[0]) {
        setImageUploading(true);
        const imageUri = result.assets[0].uri;
        
        // Convert image to base64
        const base64Image = await convertImageToBase64(imageUri);
        
        // Check if base64 string is valid
        if (!base64Image) {
          throw new Error('Failed to convert image to base64');
        }
        
        // Create full data URL for display
        const imageDataUrl = `data:image/jpeg;base64,${base64Image}`;
        
        // Update Firestore with the base64 image data
        await updateDoc(doc(firestore, 'users', user.uid), {
          imageBase64: base64Image,
          imageURL: imageDataUrl,
        });
        
        // Update local state
        setImageUri(imageDataUrl);
        
        // Update user data state
        setUserData({
          ...userData,
          imageURL: imageDataUrl,
          imageBase64: base64Image
        });
        
        setImageUploading(false);
        
        // Success notification
        setErrorMessage('Profile photo updated successfully!');
        setShowErrorSnackbar(true);
      }
    } catch (error) {
      console.error('Error choosing image:', error);
      setImageUploading(false);
      setErrorMessage(`Failed to upload image: ${error.message}`);
      setShowErrorSnackbar(true);
    }
  };

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'resolved':
        return theme.colors.success;
      case 'pending':
        return theme.colors.warning;
      case 'in progress':
        return theme.colors.info;
      default:
        return theme.colors.textLight;
    }
  };
  
  const getLevelColor = (level) => {
    switch(level?.toLowerCase()) {
      case 'expert':
        return '#FFD700'; // Gold
      case 'advanced':
        return '#32CD32'; // Lime Green
      case 'intermediate':
        return '#1E90FF'; // Dodger Blue
      default: // Beginner
        return theme.colors.primary;
    }
  };

  const handleViewFollowers = () => {
    setActiveTab('followers');
    setFollowModal(true);
    fetchFollowLists();
  };

  const handleViewFollowing = () => {
    setActiveTab('following');
    setFollowModal(true);
    fetchFollowLists();
  };

  const fetchFollowLists = async () => {
    if (!user?.uid) return;
    setLoadingFollowLists(true);
    try {
      // Handle empty arrays for followers and following
      const followersArray = userData.followers || [];
      const followingArray = userData.following || [];

      if (activeTab === 'followers') {
        // Only fetch followers if there are any
        if (followersArray.length > 0) {
          const followers = [];
          
          // Fetch detailed information for each follower
          for (const followerId of followersArray) {
            try {
              // First check if the follower is a municipal authority
              const municipalQuery = query(
                collection(firestore, 'municipal_authorities'),
                where('uid', '==', followerId)
              );
              const municipalSnapshot = await getDocs(municipalQuery);
              
              if (!municipalSnapshot.empty) {
                const municipalData = municipalSnapshot.docs[0].data();
                followers.push({
                  uid: followerId,
                  displayName: municipalData.name || 'Municipal Authority',
                  photoURL: municipalData.imageURL || null,
                  role: 'municipal' // Explicitly set role as municipal
                });
              } else {
                // If not a municipal user, check regular users collection
                const userDoc = await getDoc(doc(firestore, 'users', followerId));
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  // Use imageURL if available, fallback to photoURL
                  const photoURL = userData.imageURL || userData.photoURL || null;
                  
                  followers.push({
                    uid: followerId,
                    displayName: userData.displayName || 'User',
                    photoURL: photoURL,
                    role: userData.role || 'resident'
                  });
                }
              }
            } catch (error) {
              console.error(`Error fetching follower ${followerId}:`, error);
            }
          }
          
          setFollowersList(followers);
        } else {
          // Set empty array if no followers
          setFollowersList([]);
        }
      } else {
        // Handle following list
        if (followingArray.length > 0) {
          const following = [];
          
          // Fetch detailed information for each user being followed
          for (const followingId of followingArray) {
            try {
              // First check if following a municipal authority
              const municipalQuery = query(
                collection(firestore, 'municipal_authorities'),
                where('uid', '==', followingId)
              );
              const municipalSnapshot = await getDocs(municipalQuery);
              
              if (!municipalSnapshot.empty) {
                const municipalData = municipalSnapshot.docs[0].data();
                following.push({
                  uid: followingId,
                  displayName: municipalData.name || 'Municipal Authority',
                  photoURL: municipalData.imageURL || null,
                  role: 'municipal' // Explicitly set role as municipal
                });
              } else {
                // If not a municipal user, check regular users collection
                const userDoc = await getDoc(doc(firestore, 'users', followingId));
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  // Use imageURL if available, fallback to photoURL
                  const photoURL = userData.imageURL || userData.photoURL || null;
                  
                  following.push({
                    uid: followingId,
                    displayName: userData.displayName || 'User',
                    photoURL: photoURL,
                    role: userData.role || 'resident'
                  });
                }
              }
            } catch (error) {
              console.error(`Error fetching following ${followingId}:`, error);
            }
          }
          
          setFollowingList(following);
        } else {
          // Set empty array if not following anyone
          setFollowingList([]);
        }
      }
    } catch (error) {
      console.error('Error fetching follow lists:', error);
      setErrorMessage('Failed to fetch follow lists. Please try again later.');
      setShowErrorSnackbar(true);
    } finally {
      setLoadingFollowLists(false);
    }
  };

  const ReportCard = ({ item }) => (
    <Card style={styles.card}>
      {/* Check for both imageURL and imageBase64 */}
      {(item.imageUrl || item.imageBase64) && 
        <Card.Cover 
          source={
            item.imageBase64 
              ? { uri: `data:image/jpeg;base64,${item.imageBase64}` }
              : { uri: item.imageUrl }
          } 
        />
      }
      <Card.Content>
        <Title style={styles.cardTitle}>{item.title}</Title>
        <Paragraph style={styles.cardDescription}>{item.description}</Paragraph>
        <View style={styles.cardFooter}>
          <Badge 
            style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            {item.status || 'Submitted'}
          </Badge>
          <Text style={styles.timestamp}>
            {item.createdAt?.toDate 
              ? new Date(item.createdAt.toDate()).toLocaleDateString() 
              : new Date().toLocaleDateString()}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );

  const GridItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.gridItem}
      onPress={() => navigation.navigate('ReportDetail', { report: item })}>
      {(item.imageUrl || item.imageBase64) ? (
        <Image 
          source={
            item.imageBase64 
              ? { uri: `data:image/jpeg;base64,${item.imageBase64}` }
              : { uri: item.imageUrl }
          }
          style={styles.gridImage} 
        />
      ) : (
        <View style={[styles.gridImage, styles.noImageContainer]}>
          <MaterialCommunityIcons name="image-off" size={24} color={theme.colors.textLight} />
        </View>
      )}
      <Badge 
        style={[styles.gridStatusBadge, { backgroundColor: getStatusColor(item.status) }]}>
        {item.status?.charAt(0) || 'S'}
      </Badge>
    </TouchableOpacity>
  );

  const EmptyReportsList = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="clipboard-text-outline" size={50} color={theme.colors.textLight} />
      <Text style={styles.emptyText}>
        {userRole === 'municipal' 
          ? "No reports associated with your account"
          : "You haven't submitted any reports yet"}
      </Text>
      {userRole !== 'municipal' && (
        <Button
          mode="contained"
          color={theme.colors.primary}
          style={styles.newReportButton}
          labelStyle={styles.newReportButtonText}
          onPress={() => navigation.navigate('Report')}>
          Create New Report
        </Button>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Network Status Banner */}
      {!isConnected && (
        <Banner
          visible={true}
          icon="wifi-off"
          actions={[
            {
              label: 'Retry',
              onPress: () => handleRefresh(),
            },
          ]}
          style={styles.offlineBanner}
        >
          You are currently offline. Some features may be limited.
        </Banner>
      )}
      
      {/* Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>
          {user?.email ? `@${user.email.split('@')[0]}` : userData.displayName || 'Profile'}
        </Text>
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon={props => <MaterialCommunityIcons name="dots-vertical" {...props} />}
              size={24}
              color={theme.colors.text}
              onPress={() => setMenuVisible(true)}
            />
          }
        >
          <Menu.Item 
            icon={({size, color}) => <MaterialCommunityIcons name="logout" size={size} color={color} />}
            onPress={() => {
              setMenuVisible(false);
              setLogoutDialogVisible(true);
            }}
            title="Logout" 
          />
        </Menu>
      </View>
      
      <ScrollView 
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Profile Info Section - Instagram Style */}
        <View style={styles.profileHeader}>
          {/* Avatar Section - Left Aligned */}
          <View style={styles.profileInfoSection}>
            <View style={styles.avatarSection}>
              {imageUploading ? (
                <View style={styles.avatarContainer}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
              ) : imageUri ? (
                <Avatar.Image
                  size={80}
                  source={{ uri: imageUri }}
                  style={styles.avatar}
                />
              ) : (
                <Avatar.Text
                  size={80}
                  label={(userData.displayName || 'U')[0].toUpperCase()}
                  style={styles.avatar}
                  color={theme.colors.textInverted}
                  backgroundColor={theme.colors.primary}
                />
              )}
            </View>
            
            {/* Stats Section - Right Side */}
            <View style={styles.statsSection}>
              <View style={styles.statsRow}>
                <TouchableOpacity style={styles.statItem} onPress={() => {}}>
                  <Text style={styles.statNumber}>{totalReports}</Text>
                  <Text style={styles.statLabel}>Reports</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.statItem} onPress={handleViewFollowers}>
                  <Text style={styles.statNumber}>{followersCount}</Text>
                  <Text style={styles.statLabel}>Followers</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.statItem} onPress={handleViewFollowing}>
                  <Text style={styles.statNumber}>{followingCount}</Text>
                  <Text style={styles.statLabel}>Following</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* User Info Section - Below Avatar */}
          <View style={styles.userInfoContainer}>
            <Text style={styles.userName}>{userData.displayName}</Text>
            
            <View style={styles.levelContainer}>
              <MaterialCommunityIcons 
                name={userRole === 'municipal' ? "shield-account" : "shield-star"} 
                size={16} 
                color={userRole === 'municipal' ? theme.colors.primary : getLevelColor(userData.level)} 
                style={styles.levelIcon}
              />
              <Text style={[styles.levelText, {
                color: userRole === 'municipal' ? theme.colors.primary : getLevelColor(userData.level)
              }]}>
                {userRole === 'municipal' ? 'Municipal Authority' : userData.level}
              </Text>
            </View>
            
            {userData.bio ? (
              <Text style={styles.bioText}>{userData.bio}</Text>
            ) : null}
            
            <View style={styles.locationContainer}>
              {userData.location ? (
                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="map-marker" size={16} color={theme.colors.textLight} />
                  <Text style={styles.infoText}>{userData.location}</Text>
                </View>
              ) : null}
              
              {/* {userData.website ? (
                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="link-variant" size={16} color={theme.colors.textLight} />
                  <Text style={styles.infoText}>{userData.website}</Text>
                </View>
              ) : null} */}
            </View>
          </View>
          
          {/* Action Buttons */}
          <View style={styles.actionButtonsContainer}>
            <Button
              mode="outlined"
              style={[styles.editProfileButton, { flex: 1 }]} // Updated to take full width
              labelStyle={{color: theme.colors.primary}}
              icon={props => <MaterialCommunityIcons name="account-edit" {...props} />}
              onPress={() => navigation.navigate('EditProfile', { userData })}>
              Edit Profile
            </Button>
          </View>
          
          {/* Municipal Authority Information */}
          {userRole === 'municipal' && (
            <View style={styles.municipalInfoContainer}>
              <Text style={styles.municipalSectionTitle}>Authority Information</Text>
              
              <View style={styles.municipalInfoRow}>
                <MaterialCommunityIcons name="domain" size={18} color={theme.colors.primary} style={styles.municipalIcon} />
                <View style={styles.municipalInfoContent}>
                  <Text style={styles.municipalInfoLabel}>City</Text>
                  <Text style={styles.municipalInfoValue}>{municipalData.city || 'Not specified'}</Text>
                </View>
              </View>
              
              <View style={styles.municipalInfoRow}>
                <MaterialCommunityIcons name="map" size={18} color={theme.colors.primary} style={styles.municipalIcon} />
                <View style={styles.municipalInfoContent}>
                  <Text style={styles.municipalInfoLabel}>Region</Text>
                  <Text style={styles.municipalInfoValue}>{municipalData.region || 'Not specified'}</Text>
                </View>
              </View>
              
              <View style={styles.municipalInfoRow}>
                <MaterialCommunityIcons name="email" size={18} color={theme.colors.primary} style={styles.municipalIcon} />
                <View style={styles.municipalInfoContent}>
                  <Text style={styles.municipalInfoLabel}>Email</Text>
                  <Text style={styles.municipalInfoValue}>{municipalData.email || 'Not specified'}</Text>
                </View>
              </View>
            </View>
          )}
        </View>
        
        {/* Impact Score Section - Only show for regular users, not municipal authorities */}
        {userRole !== 'municipal' && (
          <View style={styles.impactSection}>
            <View style={styles.impactScoreContainer}>
              {/* <Text style={styles.impactScoreLabel}>Impact Score</Text> */}
              <View style={styles.impactScoreHeader}>
                          <MaterialCommunityIcons name="star-circle" size={24} color={theme.colors.accent} />
                          <Text style={styles.impactScoreTitle}>Impact Score</Text>
                        </View>
              <Text style={styles.impactScoreValue}>{impactScore}</Text>
              <View style={styles.impactScoreBar}>
                <View 
                  style={[
                    styles.impactScoreProgress, 
                    { 
                      width: `${Math.min(100, (impactScore / 300) * 100)}%`,
                      backgroundColor: theme.colors.accent || '#FF5722'
                    }
                  ]} 
                />
              </View>
              
              {/* Level progress info - matches UserProfileScreen UI */}
              <View style={styles.levelProgressInfo}>
                <Text style={styles.levelProgressText}>
                  Level: <Text style={{fontWeight: theme.typography.fontWeight.bold}}>
                    {userData?.level || 'Beginner'}
                  </Text>
                </Text>
                <Text style={styles.nextLevelText}>
                  {impactScore >= 300 ? 
                    'Max level achieved!' : 
                    `${300 - impactScore} points to next level`}
                </Text>
              </View>
            </View>
          </View>
        )}
        
        {/* Activity Header with Tabs */}
        <View style={styles.activityHeader}>
          <Text style={styles.sectionTitle}>
            {userRole === 'municipal' ? 'Resolved Reports' : 'My Reports'}
          </Text>
        </View>
        
        <Divider style={styles.divider} />
        
        {/* Activity Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : reports.length === 0 ? (
          <EmptyReportsList />
        ) : viewMode === 'grid' ? (
          <FlatList
            data={reports}
            renderItem={({ item }) => <GridItem item={item} />}
            keyExtractor={item => item.id}
            numColumns={3}
            scrollEnabled={false}
            contentContainerStyle={styles.gridList}
          />
        ) : (
          <FlatList
            data={reports}
            renderItem={({ item }) => <ReportCard item={item} />}
            keyExtractor={item => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.reportsList}
          />
        )}
      </ScrollView>
      
      {/* Logout Confirmation Dialog */}
      <Portal>
        <Dialog
          visible={logoutDialogVisible}
          onDismiss={() => setLogoutDialogVisible(false)}
        >
          <Dialog.Title>Logout</Dialog.Title>
          <Dialog.Content>
            <Paragraph>Are you sure you want to logout?</Paragraph>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLogoutDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleSignOut}>Logout</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Follow Modal */}
      <Portal>
        <Modal
          visible={followModal}
          onDismiss={() => setFollowModal(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {activeTab === 'followers' ? 'Followers' : 'Following'}
            </Text>
            <IconButton
              icon="close"
              size={24}
              onPress={() => setFollowModal(false)}
            />
          </View>

          <SegmentedButtons
            value={activeTab}
            onValueChange={(value) => setActiveTab(value)}
            style={styles.tabButtons}
            buttons={[
              { value: 'followers', label: `Followers (${followersCount})` },
              { value: 'following', label: `Following (${followingCount})` },
            ]}
          />
          
          <Divider style={styles.modalDivider} />
          
          {loadingFollowLists ? (
            <View style={styles.loadingListContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : (
            <View>
              {(activeTab === 'followers' ? followersList : followingList).length === 0 ? (
                <View style={styles.emptyFollowListContainer}>
                  <MaterialCommunityIcons 
                    name="account-group-outline" 
                    size={60} 
                    color={theme.colors.textLight} 
                  />
                  <Text style={styles.emptyFollowText}>
                    {activeTab === 'followers' 
                      ? "You don't have any followers yet" 
                      : "You're not following anyone yet"}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={activeTab === 'followers' ? followersList : followingList}
                  keyExtractor={(item, index) => index.toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity 
                      style={styles.followItem}
                      onPress={() => {
                        if (item.uid === user.uid) {
                          // Just close the modal since we're already on the user's profile
                          setFollowModal(false);
                        } else {
                          // Navigate to another user's profile
                          setFollowModal(false);
                          // Explicitly pass 'municipal' if role is 'municipal'
                          const userRole = item.role === 'municipal' ? 'municipal' : 'resident';
                          console.log(`Navigating to user profile with role: ${userRole}`, item);
                          navigation.navigate('UserProfile', {
                            userId: item.uid,
                            userRole: userRole
                          });
                        }
                      }}
                    >
                      {item.photoURL ? (
                        <Avatar.Image
                          size={50}
                          source={{ uri: item.photoURL }}
                          style={styles.followAvatar}
                        />
                      ) : (
                        <Avatar.Text
                          size={50}
                          label={(item.displayName || 'U')[0].toUpperCase()}
                          style={styles.followAvatar}
                          color={theme.colors.textInverted}
                          backgroundColor={theme.colors.primary}
                        />
                      )}
                      <View style={styles.followItemInfo}>
                        <Text style={styles.followName}>{item.displayName || 'User'}</Text>
                        <View style={styles.followRoleBadge}>
                          <MaterialCommunityIcons
                            name={item.role === 'municipal' ? "shield-account" : "shield-star"}
                            size={12}
                            color={item.role === 'municipal' ? theme.colors.primary : theme.colors.accent}
                          />
                          <Text style={[styles.followRoleText, {
                            color: item.role === 'municipal' ? theme.colors.primary : theme.colors.accent
                          }]}>
                            {item.role === 'municipal' ? 'Municipal' : 'Resident'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                  style={styles.followList}
                />
              )}
            </View>
          )}
        </Modal>
      </Portal>

      {/* Error Snackbar */}
      <Snackbar
        visible={showErrorSnackbar}
        onDismiss={() => setShowErrorSnackbar(false)}
        duration={Snackbar.DURATION_SHORT}
        action={{
          label: 'Dismiss',
          onPress: () => setShowErrorSnackbar(false),
        }}
      >
        {errorMessage}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.medium,
    height: 56,
    backgroundColor: theme.colors.surface,
    elevation: 2,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  profileHeader: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
  },
  profileInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.medium,
  },
  avatarSection: {
    marginRight: theme.spacing.medium,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 40,
    backgroundColor: theme.colors.surfaceVariant,
  },
  avatar: {
    elevation: 2,
  },
  statsSection: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    padding: 4,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  statLabel: {
    color: theme.colors.textLight,
    fontSize: theme.typography.fontSize.small,
  },
  userInfoContainer: {
    marginBottom: theme.spacing.medium,
  },
  userName: {
    fontSize: theme.typography.fontSize.xl, // Increased from medium to large
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: 2,
  },
  levelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  levelIcon: {
    marginRight: 4,
  },
  levelText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.medium,
  },
  bioText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.text,
    marginVertical: 4,
  },
  locationContainer: {
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoText: {
    marginLeft: 6,
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textLight,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editProfileButton: {
    flex: 1,
    marginRight: 8,
    borderColor: theme.colors.primary,
    borderRadius: 4,
  },
  municipalInfoContainer: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.small,
  },
  municipalSectionTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
  },
  municipalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.small,
  },
  municipalIcon: {
    marginRight: theme.spacing.small,
  },
  municipalInfoContent: {
    flex: 1,
  },
  municipalInfoLabel: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textLight,
  },
  municipalInfoValue: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  assignedZonesContainer: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.small,
  },
  zonesChipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  zoneChip: {
    margin: 4,
    backgroundColor: theme.colors.surfaceVariant,
  },
  responsibilitiesContainer: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.small,
  },
  responsibilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.small,
  },
  responsibilityText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  impactSection: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    borderWidth: 0.3,
    // marginBottom: theme.spacing.small,
  },
    impactScoreHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: theme.spacing.small,
    },
    impactScoreTitle: {
      fontSize: theme.typography.fontSize.md,
      fontWeight: theme.typography.fontWeight.bold,
      color: theme.colors.text,
      marginLeft: theme.spacing.small,
    },
  // impactScoreLabel: {
  //   fontSize: theme.typography.fontSize.medium,
  //   color: theme.colors.textLight,
  //   marginBottom: 4,
  // },
  impactScoreValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: theme.colors.accent || '#FF5722',
    marginBottom: 8,
    alignSelf: 'center',
  },
  impactScoreBar: {
    width: '100%',
    height: 6,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 3,
    overflow: 'hidden',
  },
  impactScoreProgress: {
    height: '100%',
    backgroundColor: theme.colors.accent || '#FF5722',
  },
  levelProgressInfo: {
    marginTop: theme.spacing.small,
    alignItems: 'center',
  },
  levelProgressText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  nextLevelText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textLight,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.medium,
    paddingVertical: theme.spacing.small,
    backgroundColor: theme.colors.surface,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: theme.spacing.small,
  },
  divider: {
    backgroundColor: theme.colors.border,
    height: 1,
  },
  loadingContainer: {
    padding: theme.spacing.xxl,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: theme.spacing.large,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textLight,
    marginTop: theme.spacing.small,
    marginBottom: theme.spacing.large,
    fontSize: theme.typography.fontSize.medium,
  },
  newReportButton: {
    paddingHorizontal: theme.spacing.medium,
    backgroundColor: theme.colors.primary,
  },
  newReportButtonText: {
    color: theme.colors.textInverted,
  },
  reportsList: {
    padding: theme.spacing.medium,
  },
  card: {
    marginBottom: theme.spacing.medium,
    backgroundColor: theme.colors.card,
    elevation: 2,
  },
  cardTitle: {
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  cardDescription: {
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.small,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    textTransform: 'capitalize',
  },
  timestamp: {
    color: theme.colors.textLight,
    fontSize: theme.typography.fontSize.xs,
  },
  gridList: {
    padding: 1,
  },
  gridItem: {
    width: GRID_IMAGE_SIZE,
    height: GRID_IMAGE_SIZE,
    margin: 1,
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  noImageContainer: {
    backgroundColor: theme.colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridStatusBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    fontSize: 10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
  },
  offlineBanner: {
    backgroundColor: '#FFF3E0',
    marginBottom: 0,
  },
  modalContainer: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.medium,
    marginHorizontal: theme.spacing.medium,
    borderRadius: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.medium,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  tabButtons: {
    marginBottom: theme.spacing.small,
  },
  modalDivider: {
    marginVertical: theme.spacing.small,
  },
  loadingListContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.large,
  },
  loadingText: {
    marginTop: theme.spacing.small,
    color: theme.colors.textLight,
  },
  emptyFollowListContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.large,
  },
  emptyFollowText: {
    marginTop: theme.spacing.small,
    color: theme.colors.textLight,
    textAlign: 'center',
  },
  followItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.small,
  },
  followAvatar: {
    marginRight: theme.spacing.small,
  },
  followItemInfo: {
    flex: 1,
  },
  followName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  followRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  followRoleText: {
    marginLeft: 4,
    fontSize: theme.typography.fontSize.small,
  },
  followList: {
    marginTop: theme.spacing.small,
  },
});

export default ProfileScreen;