import React, { useState, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl,
  Modal,
  Dimensions,
  FlatList
} from 'react-native';
import { 
  Text, 
  Avatar, 
  Button, 
  ActivityIndicator,
  Divider,
  Chip,
  SegmentedButtons,
  Surface,
  IconButton
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { db, auth } from '../config/firebase';
import { 
  doc, 
  getDoc, 
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { theme } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';

const UserProfileScreen = ({ route }) => {
  // States
  const [userData, setUserData] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followModal, setFollowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('followers');
  const [followersList, setFollowersList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [loadingFollowLists, setLoadingFollowLists] = useState(false);
  const [reportsModalVisible, setReportsModalVisible] = useState(false);

  // Hooks
  const navigation = useNavigation();
  const { user, userRole } = useAuth();
  const { userId, userRole: passedUserRole } = route.params; // Get userRole from params if available

  // Load user data when component mounts
  useEffect(() => {
    console.log('Route params received:', route.params);
    fetchUserData();
  }, [userId]);

  // Function to fetch followers list data
  const fetchFollowersList = async () => {
    setLoadingFollowLists(true);
    try {
      const followers = [];
      // If user has followers array
      if (userData?.followers && userData.followers.length > 0) {
        // Get detailed info for each follower
        for (const followerId of userData.followers) {
          try {
            // First check if follower is a municipal authority
            const municipalQuery = query(
              collection(db, 'municipal_authorities'),
              where('uid', '==', followerId)
            );
            const municipalSnapshot = await getDocs(municipalQuery);
            
            if (!municipalSnapshot.empty) {
              const municipalData = municipalSnapshot.docs[0].data();
              followers.push({
                id: followerId,
                displayName: municipalData.name || 'Municipal Authority',
                photoURL: municipalData.imageURL || null,
                role: 'municipal'  // Explicitly set role as municipal
              });
            } else {
              // If not found in municipal, try user collection
              const userDoc = await getDoc(doc(db, 'users', followerId));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                // Use imageURL if available, fallback to photoURL
                const photoURL = userData.imageURL || userData.photoURL || null;
                
                followers.push({
                  id: followerId,
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
      }
      setFollowersList(followers);
    } catch (error) {
      console.error('Error fetching followers:', error);
    } finally {
      setLoadingFollowLists(false);
    }
  };

  // Function to fetch following list data
  const fetchFollowingList = async () => {
    setLoadingFollowLists(true);
    try {
      const following = [];
      // If user has following array
      if (userData?.following && userData.following.length > 0) {
        // Get detailed info for each user being followed
        for (const followingId of userData.following) {
          try {
            // First check if following a municipal authority
            const municipalQuery = query(
              collection(db, 'municipal_authorities'),
              where('uid', '==', followingId)
            );
            const municipalSnapshot = await getDocs(municipalQuery);
            if (!municipalSnapshot.empty) {
              const municipalData = municipalSnapshot.docs[0].data();
              following.push({
                id: followingId,
                displayName: municipalData.name || 'Municipal Authority',
                photoURL: municipalData.imageURL || null,
                role: 'municipal'  // Explicitly set role as municipal
              });
            } else {
              // If not in municipal, try user collection
              const userDoc = await getDoc(doc(db, 'users', followingId));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                // Use imageURL if available, fallback to photoURL
                const photoURL = userData.imageURL || userData.photoURL || null;
                
                following.push({
                  id: followingId,
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
      }
      setFollowingList(following);
    } catch (error) {
      console.error('Error fetching following:', error);
    } finally {
      setLoadingFollowLists(false);
    }
  };

  // Handle opening the followers/following modal
  const openFollowModal = (tab) => {
    setActiveTab(tab);
    if (tab === 'followers') {
      fetchFollowersList();
    } else {
      fetchFollowingList();
    }
    setFollowModal(true);
  };

  // Fetch user data from Firestore - fetch from both users and municipal_authorities collections
  const fetchUserData = async () => {
    setLoading(true);
    try {
      console.log('Fetching user data for userId:', userId);
      
      // Always check users collection first for follower/following data
      const userDoc = await getDoc(doc(db, 'users', userId));
      let followersData = [];
      let followingData = [];
      let isUserInUsersCollection = false;
      
      if (userDoc.exists()) {
        isUserInUsersCollection = true;
        const userData = userDoc.data();
        // Get followers and following data from users collection
        followersData = userData.followers || [];
        followingData = userData.following || [];
      }
      
      // Now check if it's a municipal user (either by passed role or from data)
      if (passedUserRole === 'municipal' || 
          (isUserInUsersCollection && userDoc.data().role === 'municipal')) {
        // Get municipal authority details from municipal_authorities collection
        const municipalQuery = query(
          collection(db, 'municipal_authorities'),
          where('uid', '==', userId)
        );
        const municipalSnapshot = await getDocs(municipalQuery);
        
        if (!municipalSnapshot.empty) {
          const municipalData = municipalSnapshot.docs[0].data();
          
          // Format municipal data to match user data structure
          const formattedData = {
            ...municipalData,
            displayName: municipalData.name || 'Municipal Authority',
            role: 'municipal', // Explicitly set role to 'municipal'
            photoURL: municipalData.imageURL || null,
            impactScore: 0, // Municipal users don't have impact scores
            // Use followers and following data from the users collection
            followers: followersData,
            following: followingData
          };
          
          console.log('Found user in municipal_authorities collection, setting role to municipal');
          setUserData(formattedData);
          
          // Set followers and following counts from users collection data
          setFollowersCount(followersData.length);
          setFollowingCount(followingData.length);
          
          // Check if current user is following this municipal account
          const currentUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
          if (currentUserDoc.exists()) {
            const currentUserData = currentUserDoc.data();
            setIsFollowing(currentUserData.following?.includes(userId) || false);
          }
          
          // Fetch municipal user's reports
          fetchUserReports(userId);
          setLoading(false);
          return;
        }
      }
      
      // If it was found in the users collection earlier, use that data
      if (isUserInUsersCollection) {
        const userData = userDoc.data();
        
        // Make sure impact score is properly set from either impactScore or points field
        userData.impactScore = userData.impactScore || userData.points || 0;
        
        // Set image url correctly - handle both photoURL and imageURL fields
        if (userData.imageURL && !userData.photoURL) {
          userData.photoURL = userData.imageURL;
        }
        
        // Check if user is municipal based on role field or passed userRole
        const isMunicipal = userData.role === 'municipal' || passedUserRole === 'municipal';
        
        // Override role if passedUserRole is 'municipal'
        userData.role = isMunicipal ? 'municipal' : (userData.role || 'resident');
        
        console.log('Found user in users collection, role:', userData.role);
        setUserData(userData);
        
        // Set followers and following counts
        setFollowersCount(userData.followers?.length || 0);
        setFollowingCount(userData.following?.length || 0);
        
        // Check if current user is following this user
        const currentUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (currentUserDoc.exists()) {
          const currentUserData = currentUserDoc.data();
          setIsFollowing(currentUserData.following?.includes(userId) || false);
        }
        
        // Fetch user's reports
        fetchUserReports(userId);
      } else {
        // If not found in users collection, check municipal_authorities collection
        const municipalQuery = query(
          collection(db, 'municipal_authorities'),
          where('uid', '==', userId)
        );
        const municipalSnapshot = await getDocs(municipalQuery);
        
        if (!municipalSnapshot.empty) {
          const municipalData = municipalSnapshot.docs[0].data();
          
          // Format municipal data to match user data structure
          const formattedData = {
            ...municipalData,
            displayName: municipalData.name || 'Municipal Authority',
            role: 'municipal', // Explicitly set role to 'municipal'
            photoURL: municipalData.imageURL || null,
            impactScore: 0, // Municipal users don't have impact scores
            // Use empty arrays since we couldn't find data in users collection
            followers: [],
            following: []
          };
          
          console.log('Found user only in municipal_authorities collection, but missing in users collection');
          setUserData(formattedData);
          
          // Set empty followers/following counts since no data in users collection
          setFollowersCount(0);
          setFollowingCount(0);
          
          // Check if current user is following this municipal account
          const currentUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
          if (currentUserDoc.exists()) {
            const currentUserData = currentUserDoc.data();
            setIsFollowing(currentUserData.following?.includes(userId) || false);
          }
          
          // Fetch municipal user's reports
          fetchUserReports(userId);
        } else {
          console.log('No user found with ID:', userId);
          navigation.goBack();
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch reports created by the user
  const fetchUserReports = async (userId) => {
    try {
      let reportsList = [];

      // Fetch reports created by the user
      const createdReportsQuery = query(
        collection(db, 'reports'),
        where('userId', '==', userId)
      );
      const createdReportsSnapshot = await getDocs(createdReportsQuery);
      createdReportsSnapshot.forEach(doc => {
        reportsList.push({ id: doc.id, ...doc.data() });
      });
      
      // Also check for reports resolved by this user
      const resolvedReportsQuery = query(
        collection(db, 'reports'),
        where('resolvedBy', '==', userId)
      );
      const resolvedReportsSnapshot = await getDocs(resolvedReportsQuery);
      resolvedReportsSnapshot.forEach(doc => {
        // Avoid duplicates
        if (!reportsList.some(report => report.id === doc.id)) {
          reportsList.push({ id: doc.id, ...doc.data() });
        }
      });
      
      setReports(reportsList);
    } catch (error) {
      console.error('Error fetching user reports:', error);
    }
  };

  // Handle follow/unfollow action
  const toggleFollow = async () => {
    try {
      const currentUserRef = doc(db, 'users', auth.currentUser.uid);
      
      // Always use the users collection for managing followers/following
      // Municipal users also have entries in the users collection with these fields
      const targetUserRef = doc(db, 'users', userId);
      
      if (isFollowing) {
        // Unfollow: Remove userId from current user's following
        await updateDoc(currentUserRef, {
          following: arrayRemove(userId)
        });
        
        // Remove current userId from target user's followers
        await updateDoc(targetUserRef, {
          followers: arrayRemove(auth.currentUser.uid)
        });
        
        setIsFollowing(false);
        setFollowersCount(prev => Math.max(0, prev - 1));
      } else {
        // Follow: Add userId to current user's following
        await updateDoc(currentUserRef, {
          following: arrayUnion(userId)
        });
        
        // Add current userId to target user's followers
        await updateDoc(targetUserRef, {
          followers: arrayUnion(auth.currentUser.uid)
        });
        
        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
    }
  };

  // Handle pull-to-refresh
  const handleRefresh = () => {
    setRefreshing(true);
    fetchUserData();
  };

  // Get level color based on user level
  const getLevelColor = (level) => {
    switch (level) {
      case 'Novice':
        return '#4CAF50'; // Green
      case 'Contributor':
        return '#2196F3'; // Blue
      case 'Expert':
        return '#9C27B0'; // Purple
      case 'Master':
        return '#F44336'; // Red
      default:
        return theme.colors.primary;
    }
  };

  // Empty reports list component
  const EmptyReportsList = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="file-document-outline" size={80} color={theme.colors.textLight} />
      <Text style={styles.emptyText}>No Reports Yet</Text>
      <Text style={styles.emptySubtext}>
        This user hasn't created or resolved any reports yet.
      </Text>
    </View>
  );

  // Loading component
  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Followers/Following Modal */}
      <Modal
        visible={followModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFollowModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
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
              onValueChange={(value) => {
                setActiveTab(value);
                if (value === 'followers') {
                  fetchFollowersList();
                } else {
                  fetchFollowingList();
                }
              }}
              style={styles.tabButtons}
              buttons={[
                { value: 'followers', label: `Followers (${followersCount})` },
                { value: 'following', label: `Following (${followingCount})` },
              ]}
            />

            <Divider style={styles.modalDivider} />

            {loadingFollowLists ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : (
              <ScrollView style={styles.usersList}>
                {activeTab === 'followers' ? (
                  followersList.length > 0 ? (
                    followersList.map((follower) => (
                      <TouchableOpacity
                        key={follower.id}
                        style={styles.userListItem}
                        onPress={() => {
                          setFollowModal(false);
                          // Check if this is the current logged-in user's profile
                          if (follower.id === auth.currentUser.uid) {
                            // Navigate to the user's own profile screen (ProfileScreen)
                            // Fix: Navigate to MainTabs, then Profile
                            navigation.navigate('MainTabs', { screen: 'Profile' });
                          } else {
                            // Navigate to another user's profile
                            // Explicitly ensure municipal users are passed as 'municipal'
                            const userRole = follower.role === 'municipal' ? 'municipal' : 'resident';
                            console.log(`Navigating to follower profile with role: ${userRole}`, follower);
                            navigation.push('UserProfile', {
                              userId: follower.id,
                              userRole: userRole
                            });
                          }
                        }}
                      >
                        {follower.photoURL ? (
                          <Avatar.Image
                            size={50}
                            source={{ uri: follower.photoURL }}
                          />
                        ) : (
                          <Avatar.Text
                            size={50}
                            label={(follower.displayName || 'U')[0].toUpperCase()}
                            color={theme.colors.textInverted}
                            backgroundColor={theme.colors.primary}
                          />
                        )}
                        <View style={styles.userListItemInfo}>
                          <Text style={styles.userListItemName}>
                            {follower.displayName || 'User'}
                          </Text>
                          <View style={styles.userRoleBadge}>
                            <MaterialCommunityIcons
                              name={follower.role === 'municipal' ? "shield-account" : "shield-star"}
                              size={12}
                              color={follower.role === 'municipal' ? theme.colors.primary : theme.colors.accent}
                            />
                            <Text style={[styles.userRoleText, {
                              color: follower.role === 'municipal' ? theme.colors.primary : theme.colors.accent
                            }]}>
                              {follower.role === 'municipal' ? 'Municipal' : 'Resident'}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.emptyListContainer}>
                      <MaterialCommunityIcons name="account-off-outline" size={60} color={theme.colors.textLight} />
                      <Text style={styles.emptyListText}>No followers yet</Text>
                    </View>
                  )
                ) : followingList.length > 0 ? (
                  followingList.map((following) => (
                    <TouchableOpacity
                      key={following.id}
                      style={styles.userListItem}
                      onPress={() => {
                        setFollowModal(false);
                        // Check if this is the current logged-in user's profile
                        if (following.id === auth.currentUser.uid) {
                          // Navigate to the user's own profile screen (ProfileScreen)
                          // Fix: Navigate to MainTabs, then Profile
                          navigation.navigate('MainTabs', { screen: 'Profile' });
                        } else {
                          // Navigate to another user's profile
                          navigation.push('UserProfile', {
                            userId: following.id,
                            userRole: following.role
                          });
                        }
                      }}
                    >
                      {following.photoURL ? (
                        <Avatar.Image
                          size={50}
                          source={{ uri: following.photoURL }}
                        />
                      ) : (
                        <Avatar.Text
                          size={50}
                          label={(following.displayName || 'U')[0].toUpperCase()}
                          color={theme.colors.textInverted}
                          backgroundColor={theme.colors.primary}
                        />
                      )}
                      <View style={styles.userListItemInfo}>
                        <Text style={styles.userListItemName}>
                          {following.displayName || 'User'}
                        </Text>
                        <View style={styles.userRoleBadge}>
                          <MaterialCommunityIcons
                            name={following.role === 'municipal' ? "shield-account" : "shield-star"}
                            size={12}
                            color={following.role === 'municipal' ? theme.colors.primary : theme.colors.accent}
                          />
                          <Text style={[styles.userRoleText, {
                            color: following.role === 'municipal' ? theme.colors.primary : theme.colors.accent
                          }]}>
                            {following.role === 'municipal' ? 'Municipal' : 'Resident'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.emptyListContainer}>
                    <MaterialCommunityIcons name="account-off-outline" size={60} color={theme.colors.textLight} />
                    <Text style={styles.emptyListText}>Not following anyone yet</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Reports Modal */}
      <Modal
        visible={reportsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setReportsModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>All Reports</Text>
              <IconButton
                icon="close"
                size={24}
                onPress={() => setReportsModalVisible(false)}
              />
            </View>
            <FlatList
              data={reports}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.reportItem}
                  onPress={() => {
                    setReportsModalVisible(false);
                    navigation.navigate('ReportDetail', { report: item });
                  }}
                >
                  <View style={styles.reportItemHeader}>
                    <Text style={styles.reportTitle} numberOfLines={1}>
                      {item.title || 'Untitled Report'}
                    </Text>
                    <Chip
                      style={[
                        styles.reportStatusChip,
                        {
                          backgroundColor: item.status?.toLowerCase() === 'resolved'
                            ? '#e1f5e1' // Light green
                            : '#fff3e0' // Light orange
                        }
                      ]}
                      textStyle={{
                        color: item.status?.toLowerCase() === 'resolved'
                          ? '#2e7d32' // Dark green
                          : '#e65100' // Dark orange
                      }}
                    >
                      {item.status || 'Pending'}
                    </Chip>
                  </View>
                  <View style={styles.reportItemContent}>
                    <Text style={styles.reportLocation} numberOfLines={1}>
                      <MaterialCommunityIcons name="map-marker" size={14} color={theme.colors.textLight} />
                      {' '}
                      {item.locationName || 'Unknown location'}
                    </Text>
                    <Text style={styles.reportDate}>
                      <MaterialCommunityIcons name="calendar" size={14} color={theme.colors.textLight} />
                      {' '}
                      {item.createdAt?.toDate
                        ? item.createdAt.toDate().toLocaleDateString()
                        : new Date().toLocaleDateString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Profile Header */}
      <View style={styles.profileHeader}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          {userData?.photoURL ? (
            <Avatar.Image 
              size={80}
              source={{ uri: userData.photoURL }}
              style={styles.avatar}
            />
          ) : (
            <Avatar.Text
              size={80}
              label={(userData?.displayName || 'U')[0].toUpperCase()}
              style={styles.avatar}
              color={theme.colors.textInverted}
              backgroundColor={theme.colors.primary}
            />
          )}
          
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{reports.length}</Text>
              <Text style={styles.statLabel}>Reports</Text>
            </View>
            
            <TouchableOpacity style={styles.statItem} onPress={() => openFollowModal('followers')}>
              <Text style={styles.statNumber}>{followersCount}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.statItem} onPress={() => openFollowModal('following')}>
              <Text style={styles.statNumber}>{followingCount}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* User Info Section */}
        <View style={styles.userInfoContainer}>
          <Text style={styles.userName}>{userData?.displayName}</Text>
          
          <View style={styles.levelContainer}>
            <MaterialCommunityIcons 
              name={userData?.role === 'municipal' ? "shield-account" : "shield-star"} 
              size={16} 
              color={userData?.role === 'municipal' ? theme.colors.primary : getLevelColor(userData?.level)} 
              style={styles.levelIcon}
            />
            <Text style={[styles.levelText, {
              color: userData?.role === 'municipal' ? theme.colors.primary : getLevelColor(userData?.level)
            }]}>
              {userData?.role === 'municipal' ? 'Municipal Authority' : (userData?.level || 'Resident')}
            </Text>
          </View>
          
          {userData?.bio && <Text style={styles.bioText}>{userData.bio}</Text>}
          
          {userData?.location && (
            <View style={styles.locationContainer}>
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="map-marker" size={16} color={theme.colors.textLight} />
                <Text style={styles.infoText}>{userData.location}</Text>
              </View>
            </View>
          )}
          
          {/* Action Button - Follow/Unfollow */}
          <View style={styles.actionButtonsContainer}>
            <Button
              mode={isFollowing ? "outlined" : "contained"}
              style={styles.followButton}
              labelStyle={isFollowing ? {color: theme.colors.primary} : null}
              onPress={toggleFollow}
            >
              {isFollowing ? "Following" : "Follow"}
            </Button>
          </View>
        </View>
      </View>
      
      {/* Impact Score Section - Check both userData.role and passedUserRole to determine if municipal */}
      {(userData?.role !== 'municipal' && passedUserRole !== 'municipal') && (
        <View style={styles.impactScoreContainer}>
          <View style={styles.impactScoreHeader}>
            <MaterialCommunityIcons name="star-circle" size={24} color={theme.colors.accent} />
            <Text style={styles.impactScoreTitle}>Impact Score</Text>
          </View>
          
          <View style={styles.impactScoreValue}>
            <Text style={styles.scoreValue}>{userData?.impactScore || 0}</Text>
          </View>
          
          <View style={styles.impactProgressContainer}>
            <View 
              style={[
                styles.impactProgress, 
                { 
                  width: `${userData?.impactScore ? Math.min(100, (userData?.impactScore / 300) * 100) : 0}%`,
                  backgroundColor: theme.colors.accent
                }
              ]} 
            />
          </View>
          
          {/* User Level Information */}
          <View style={styles.levelProgressInfo}>
            <Text style={styles.levelProgressText}>
              Level: <Text style={{fontWeight: theme.typography.fontWeight.bold}}>
                {userData?.level || 'Novice'}
              </Text>
            </Text>
            <Text style={styles.nextLevelText}>
              {userData?.impactScore >= 300 ? 
                'Max level achieved!' : 
                `${300 - (userData?.impactScore || 0)} points to next level`}
            </Text>
          </View>
        </View>
      )}
      
      {/* Activity Header */}
      <View style={styles.activityHeader}>
        <Text style={styles.sectionTitle}>
          Reports Activity
        </Text>
      </View>
      
      <Divider style={styles.divider} />
      
      {/* Reports List */}
      {reports.length === 0 ? (
        <EmptyReportsList />
      ) : (
        <View style={styles.reportsContainer}>
          {/* Stats summary */}
          <View style={styles.reportStatsSummary}>
            <View style={styles.reportStatItem}>
              <Text style={styles.reportStatNumber}>
                {reports.filter(r => r.status?.toLowerCase() === 'resolved').length}
              </Text>
              <Text style={styles.reportStatLabel}>Resolved</Text>
            </View>
            
            <View style={styles.reportStatItem}>
              <Text style={styles.reportStatNumber}>
                {reports.filter(r => r.status?.toLowerCase() === 'pending').length}
              </Text>
              <Text style={styles.reportStatLabel}>Pending</Text>
            </View>
            
            <View style={styles.reportStatItem}>
              <Text style={styles.reportStatNumber}>
                {reports.length}
              </Text>
              <Text style={styles.reportStatLabel}>Total</Text>
            </View>
          </View>
          
          {/* List headers */}
          <View style={styles.reportListHeader}>
            <MaterialCommunityIcons 
              name="file-document-outline" 
              size={20} 
              color={theme.colors.primary} 
            />
            <Text style={styles.reportListHeaderText}>
              Recent Activity
            </Text>
          </View>
          
          {/* Show up to 3 most recent reports */}
          {reports.slice(0, 3).map((report, index) => (
            <TouchableOpacity 
              key={report.id} 
              style={styles.reportItem}
              onPress={() => navigation.navigate('ReportDetail', { report })}
            >
              <View style={styles.reportItemHeader}>
                <Text style={styles.reportTitle} numberOfLines={1}>
                  {report.title || 'Untitled Report'}
                </Text>
                <Chip 
                  style={[
                    styles.reportStatusChip, 
                    {
                      backgroundColor: report.status?.toLowerCase() === 'resolved' 
                        ? '#e1f5e1'  // Light green
                        : '#fff3e0'  // Light orange
                    }
                  ]}
                  textStyle={{
                    color: report.status?.toLowerCase() === 'resolved' 
                      ? '#2e7d32'    // Dark green
                      : '#e65100'    // Dark orange
                  }}
                >
                  {report.status || 'Pending'}
                </Chip>
              </View>
              
              <View style={styles.reportItemContent}>
                <Text style={styles.reportLocation} numberOfLines={1}>
                  <MaterialCommunityIcons name="map-marker" size={14} color={theme.colors.textLight} />
                  {' '}
                  {report.locationName || 'Unknown location'}
                </Text>
                <Text style={styles.reportDate}>
                  <MaterialCommunityIcons name="calendar" size={14} color={theme.colors.textLight} />
                  {' '}
                  {report.createdAt?.toDate 
                    ? report.createdAt.toDate().toLocaleDateString() 
                    : new Date().toLocaleDateString()}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          
          {/* View all reports button if there are more than 3 */}
          {reports.length > 3 && (
            <TouchableOpacity 
              style={styles.viewAllButton}
              onPress={() => setReportsModalVisible(true)}
            >
              <Text style={styles.viewAllButtonText}>
                View All ({reports.length}) Reports
              </Text>
              <MaterialCommunityIcons name="arrow-right" size={16} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.large,
  },
  loadingText: {
    marginTop: theme.spacing.medium,
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textLight,
  },
  profileHeader: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.medium,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.medium,
  },
  avatar: {
    backgroundColor: theme.colors.surface,
  },
  statsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginLeft: theme.spacing.medium,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textLight,
  },
  userInfoContainer: {
    marginBottom: theme.spacing.small,
  },
  userName: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xsmall,
  },
  levelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.small,
  },
  levelIcon: {
    marginRight: theme.spacing.xsmall,
  },
  levelText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  bioText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
  },
  locationContainer: {
    marginBottom: theme.spacing.small,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  infoText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textLight,
    marginLeft: theme.spacing.xsmall,
  },
  actionButtonsContainer: {
    marginTop: theme.spacing.small,
  },
  followButton: {
    borderRadius: theme.borderRadius.medium,
  },
  impactScoreContainer: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.medium,
    // borderTopWidth: 1,
    // borderBottomWidth: 1,
    // borderColor: theme.colors.border,
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
  impactScoreValue: {
    alignItems: 'center',
    marginBottom: theme.spacing.small,
  },
  scoreValue: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.accent,
  },
  impactProgressContainer: {
    height: 4,
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  impactProgress: {
    height: '100%',
  },
  levelProgressInfo: {
    marginTop: theme.spacing.small,
    alignItems: 'center',
  },
  levelProgressText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
  },
  nextLevelText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textLight,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.medium,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  divider: {
    backgroundColor: theme.colors.border,
  },
  emptyContainer: {
    padding: theme.spacing.large,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.medium,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginTop: theme.spacing.small,
  },
  reportsContainer: {
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.large,
  },
  reportStatsSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.medium,
  },
  reportStatItem: {
    alignItems: 'center',
  },
  reportStatNumber: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  reportStatLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textLight,
  },
  reportListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.small,
  },
  reportListHeaderText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
    marginLeft: theme.spacing.small,
  },
  reportItem: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.small,
    ...theme.shadows.small,
  },
  reportItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.small,
  },
  reportTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    flex: 1,
    marginRight: theme.spacing.small,
  },
  reportStatusChip: {
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.small,
  },
  reportItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportLocation: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textLight,
    flex: 1,
    marginRight: theme.spacing.small,
  },
  reportDate: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textLight,
  },
  viewAllButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.medium,
    borderRadius: theme.borderRadius.medium,
    backgroundColor: theme.colors.backgroundLight,
    marginTop: theme.spacing.small,
  },
  viewAllButtonText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
    marginRight: theme.spacing.small,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: Dimensions.get('window').width * 0.9,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.medium,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.small,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  tabButtons: {
    marginBottom: theme.spacing.small,
  },
  modalDivider: {
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.small,
  },
  usersList: {
    maxHeight: Dimensions.get('window').height * 0.5,
  },
  userListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.small,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  userListItemInfo: {
    marginLeft: theme.spacing.medium,
  },
  userListItemName: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  userRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xsmall,
  },
  userRoleText: {
    fontSize: theme.typography.fontSize.sm,
    marginLeft: theme.spacing.xsmall,
  },
  emptyListContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.large,
  },
  emptyListText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textLight,
    marginTop: theme.spacing.small,
  },
});

export default UserProfileScreen;