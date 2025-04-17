import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ImageBackground,
  StatusBar,
  Dimensions
} from 'react-native';
import {
  Text,
  Avatar,
  Button,
  Divider,
  Chip,
  ActivityIndicator,
  Searchbar,
  SegmentedButtons,
  Card,
  Surface
} from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { db, auth } from '../config/firebase';
import {
  collection,
  query,
  where,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../contexts/NetworkContext';
import { theme } from '../theme/theme';

const CommunityScreen = ({ route }) => {
  // States
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('residents'); // 'residents' or 'municipal'
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  
  // Refs for tracking mounted state
  const isMounted = useRef(true);
  
  // Hooks
  const navigation = useNavigation();
  const { user, userRole } = useAuth();
  const { isConnected } = useNetwork();
  const windowWidth = Dimensions.get('window').width;

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch users when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchUsers();
    }, [isConnected])
  );
  
  // Filter users when search query or active tab changes
  useEffect(() => {
    filterUsers();
  }, [searchQuery, activeTab, users]);

  // Fetch all users from Firestore with optimized query
  const fetchUsers = useCallback(async () => {
    if (!isConnected) {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    setLoading(true);
    try {
      // Create arrays to hold both types of users
      const combinedUsers = [];
      // Create a map to store users by uid for easy reference
      const usersMap = {};

      // First fetch all users from the users collection
      const usersRef = collection(db, 'users');
      const usersQuery = query(usersRef, limit(100)); // Limit to 100 users for better performance
      const usersSnapshot = await getDocs(usersQuery);
      
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        // Skip users without proper data
        if (!userData.uid) return;
        
        // Ensure photoURL is properly set from imageURL if available
        const photoURL = userData.imageURL || userData.photoURL || null;
        
        const userObject = { 
          id: userData.uid,
          uid: userData.uid,
          ...userData,
          photoURL: photoURL,
          role: userData.role || 'resident',
          impactScore: userData.impactScore || userData.points || 0
        };
        
        // Store in map for easy lookup
        usersMap[userData.uid] = userObject;
        
        // Add to combined users array
        combinedUsers.push(userObject);
      });
      
      // Then fetch municipal authorities to enhance or add municipal users
      const municipalRef = collection(db, 'municipal_authorities');
      const municipalQuery = query(municipalRef, limit(50));
      const municipalSnapshot = await getDocs(municipalQuery);
      
      municipalSnapshot.forEach(doc => {
        const municipalData = doc.data();
        // Skip entries without uid
        if (!municipalData.uid) return;
        
        // Check if this user already exists in the map (from users collection)
        const existingUser = usersMap[municipalData.uid];
        
        if (existingUser) {
          // Update the existing user with municipal data while keeping followers data
          const updatedUser = {
            ...existingUser,
            ...municipalData,
            // Preserve followers and following from users table
            followers: existingUser.followers || municipalData.followers || [],
            following: existingUser.following || municipalData.following || [],
            displayName: municipalData.name || existingUser.displayName,
            photoURL: municipalData.imageURL || existingUser.photoURL,
            role: 'municipal'
          };
          
          // Update the map
          usersMap[municipalData.uid] = updatedUser;
          
          // Find and update in the array
          const index = combinedUsers.findIndex(u => u.uid === municipalData.uid);
          if (index !== -1) {
            combinedUsers[index] = updatedUser;
          }
        } else {
          // This municipal user doesn't exist in users collection
          const newMunicipalUser = {
            id: municipalData.uid,
            uid: municipalData.uid,
            displayName: municipalData.name || 'Municipal Authority',
            photoURL: municipalData.imageURL || null,
            email: municipalData.email || null,
            role: 'municipal',
            followers: municipalData.followers || [],
            following: municipalData.following || [],
            ...municipalData
          };
          
          // Add to map and array
          usersMap[municipalData.uid] = newMunicipalUser;
          combinedUsers.push(newMunicipalUser);
        }
      });
      
      // Ensure followers data is properly normalized
      const finalUsers = combinedUsers.map(user => {
        // Convert followers to standard array format if it exists
        let followers = [];
        if (user.followers) {
          if (Array.isArray(user.followers)) {
            followers = user.followers;
          } else if (typeof user.followers === 'object') {
            followers = Object.keys(user.followers);
          }
        }
        
        // Convert following to standard array format if it exists
        let following = [];
        if (user.following) {
          if (Array.isArray(user.following)) {
            following = user.following;
          } else if (typeof user.following === 'object') {
            following = Object.keys(user.following);
          }
        }
        
        return {
          ...user,
          followers,
          following
        };
      });
      
      if (isMounted.current) {
        setUsers(finalUsers);
      }
    } catch (error) {
      if (__DEV__) {
        console.error('Error fetching users:', error);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isConnected]);

  // Filter users based on search query and active tab - optimized with memoization
  const filterUsers = useCallback(() => {
    let filtered = [...users];
    
    // Remove current logged-in user from the list
    filtered = filtered.filter(user => user.id !== auth.currentUser?.uid);
    
    // If there's a search query, show results from all user roles
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(user => {
        const displayName = user.displayName?.toLowerCase() || '';
        const username = user.username?.toLowerCase() || '';
        const email = user.email?.toLowerCase() || '';
        
        return displayName.includes(query) || 
               username.includes(query) || 
               email.includes(query);
      });
    } else {
      // Only apply role filter if there's no search query
      if (activeTab === 'residents') {
        filtered = filtered.filter(user => user.role !== 'municipal');
      } else if (activeTab === 'municipal') {
        filtered = filtered.filter(user => user.role === 'municipal');
      }
    }
    
    setFilteredUsers(filtered);
  }, [users, searchQuery, activeTab]);

  // Handle user profile navigation - optimized with useCallback
  const navigateToProfile = useCallback((userId, userRole) => {
    if (userId === auth.currentUser?.uid) {
      // Navigate to the user's own profile screen directly
      navigation.navigate('Profile');
    } else {
      // Navigate to view another user's profile with role info
      // Ensure that municipal users are explicitly passed as municipal
      const role = userRole === 'municipal' ? 'municipal' : 'resident';
      if (__DEV__) {
        console.log(`Navigating to user profile with role: ${role}`);
      }
      
      navigation.navigate('UserProfile', { 
        userId,
        userRole: role 
      });
    }
  }, [navigation]);

  // Memoize the leaderboard data to avoid unnecessary recalculations
  const leaderboardData = useMemo(() => {
    return [...users]
      .filter(user => user.role !== 'municipal') 
      .sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0))
      .slice(0, 20); // Top 20 users
  }, [users]);

  // Render user item in the list with enhanced visual design
  const renderUserItem = useCallback(({ item }) => {
    return (
      <Card 
        style={styles.userCard}
        onPress={() => navigateToProfile(item.id, item.role)}
      >
        <Card.Content style={styles.userItemContent}>
          <Avatar.Image 
            size={70}
            source={item.photoURL ? { uri: item.photoURL } : require('../assets/logo.jpg')}
            style={styles.avatar}
          />
          
          <View style={styles.userInfoContainer}>
            <View style={styles.nameContainer}>
              <Text style={styles.displayName} numberOfLines={1}>
                {item.displayName || 'User'}
              </Text>
              {item.role === 'municipal' && (
                <Chip 
                  icon="shield-account" 
                  mode="flat" 
                  style={styles.municipalChip}
                  textStyle={styles.municipalChipText}
                >
                  Municipal
                </Chip>
              )}
            </View>
            
            <Text style={styles.username} numberOfLines={1}>
              @{item.username || item.email?.split('@')[0] || 'user'}
            </Text>
            
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <MaterialCommunityIcons name="account-group" size={18} color={theme.colors.primary} />
                <Text style={styles.statNumber}>{item.followers?.length || 0}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
              
              {/* Only show impact score for non-municipal users */}
              {item.role !== 'municipal' && (
                <View style={styles.statItem}>
                  <MaterialCommunityIcons name="star-circle" size={18} color={theme.colors.accent} />
                  <Text style={styles.statNumber}>{item.impactScore || 0}</Text>
                  <Text style={styles.statLabel}>Impact</Text>
                </View>
              )}
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  }, [navigateToProfile]);

  // Memoize the leaderboard item renderer for better performance
  const renderLeaderboardItem = useCallback(({ item, index }) => {
    return (
      <Surface style={[styles.leaderboardItem, index < 3 ? styles.topThreeItem : null]}>
        <TouchableOpacity 
          style={styles.leaderboardItemContent}
          onPress={() => navigateToProfile(item.id)}
        >
          <View style={[styles.rankContainer, 
            {backgroundColor: 
              index === 0 ? '#FFD70022' : 
              index === 1 ? '#C0C0C022' : 
              index === 2 ? '#CD7F3222' : 'transparent'
            }]}
          >
            {index < 3 ? (
              <MaterialCommunityIcons 
                name="trophy" 
                size={28} 
                color={
                  index === 0 ? '#FFD700' : 
                  index === 1 ? '#C0C0C0' : 
                  '#CD7F32'
                } 
              />
            ) : (
              <Text style={styles.rankNumber}>{index + 1}</Text>
            )}
          </View>
          
          <Avatar.Image 
            size={50}
            source={item.photoURL ? { uri: item.photoURL } : require('../assets/logo.jpg')}
            style={styles.leaderAvatar}
          />
          
          <View style={styles.leaderInfoContainer}>
            <Text style={styles.leaderName} numberOfLines={1}>
              {item.displayName || 'User'}
            </Text>
            <Text style={styles.leaderUsername} numberOfLines={1}>
              @{item.username || item.email?.split('@')[0] || 'user'}
            </Text>
          </View>
          
          <View style={styles.scoreContainer}>
            <Text style={[
              styles.scoreValue, 
              index < 3 ? styles.topThreeScore : null
            ]}>
              {item.impactScore || 0}
            </Text>
            <Text style={styles.scoreLabel}>Impact</Text>
          </View>
        </TouchableOpacity>
      </Surface>
    );
  }, [navigateToProfile]);

  // Render leaderboard with enhanced visuals
  const renderLeaderboard = useCallback(() => {
    return (
      <View style={styles.leaderboardContainer}>
        {/* Restore the leaderboard header with gradient */}
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.accent]}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={styles.leaderboardHeader}
        >
          <View style={styles.leaderboardHeaderContent}>
            <View style={styles.leaderboardTitleContainer}>
              <MaterialCommunityIcons name="trophy" size={30} color="#fff" />
              <Text style={styles.leaderboardTitle}>Impact Leaderboard</Text>
            </View>
            <Button 
              mode="contained" 
              onPress={() => setLeaderboardVisible(false)}
              labelStyle={{ color: theme.colors.primary }}
              style={styles.closeButton}
            >
              Close
            </Button>
          </View>
        </LinearGradient>

        <FlatList
          data={leaderboardData}
          keyExtractor={item => item.id}
          renderItem={renderLeaderboardItem}
          contentContainerStyle={styles.leaderboardList}
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={10}
          removeClippedSubviews={true}
        />
      </View>
    );
  }, [leaderboardData, renderLeaderboardItem]);

  // Handle pull-to-refresh - optimized with useCallback
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUsers();
  }, [fetchUsers]);

  // Memoize the empty state component
  const EmptyListComponent = useMemo(() => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="account-search" size={80} color={theme.colors.textLight} />
      <Text style={styles.emptyText}>No users found</Text>
      <Text style={styles.emptySubtext}>
        {searchQuery 
          ? 'Try a different search term'
          : activeTab === 'residents' 
            ? 'No resident users found' 
            : 'No municipal users found'
        }
      </Text>
    </View>
  ), [searchQuery, activeTab]);

  // UI Elements
  if (leaderboardVisible) {
    return renderLeaderboard();
  }

  return (
    <View style={styles.container}>
      {/* Header with gradient background */}
      {/* <LinearGradient
        colors={[theme.colors.primary, theme.colors.accent]}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 0}}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Community</Text>
      </LinearGradient> */}
      
      <View style={styles.searchAndFilterContainer}>
        {/* Search Bar */}
        <Searchbar
          placeholder="Search users..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          iconColor={theme.colors.primary}
        />
        
        {/* User Type Filter and Leaderboard Button */}
        <View style={styles.filterContainer}>
          <SegmentedButtons
            value={activeTab}
            onValueChange={setActiveTab}
            buttons={[
              {
                value: 'residents',
                label: 'Residents',
                icon: 'account-group',
              },
              {
                value: 'municipal',
                label: 'Municipal',
                icon: 'shield-account',
              },
            ]}
            style={styles.segmentedButtons}
          />
          
          <Button 
            mode="contained" 
            icon="trophy"
            onPress={() => setLeaderboardVisible(true)}
            style={styles.leaderboardButton}
            labelStyle={styles.leaderboardButtonText}
          >
            Leaderboard
          </Button>
        </View>
      </View>
      
      {/* User List Section */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading users...</Text>
        </View>
      ) : filteredUsers.length === 0 ? (
        EmptyListComponent
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={renderUserItem}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={handleRefresh} 
              colors={[theme.colors.primary]}
            />
          }
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={5}
          windowSize={10}
          removeClippedSubviews={true}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  // header: {
  //   height: 80,
  //   justifyContent: 'center',
  //   alignItems: 'center',
  //   paddingHorizontal: 15,
  // },
  // headerTitle: {
  //   fontSize: 24,
  //   fontWeight: 'bold',
  //   color: '#fff',
  // },
  searchAndFilterContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginTop: 15,
    marginHorizontal: 5,
    paddingTop: 20,
    paddingHorizontal: 5,
    paddingBottom: 10,
    ...theme.shadows.medium,
  },
  searchBar: {
    elevation: 0,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 50,
    marginBottom: 15,
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  segmentedButtons: {
    flex: 1,
    marginRight: 5,
  },
  leaderboardButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    paddingVertical: 8,
  },
  leaderboardButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.medium,
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textLight,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 15,
  },
  emptySubtext: {
    fontSize: 16,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginTop: 8,
  },
  listContainer: {
    padding: 15,
    paddingBottom: 80,
  },
  userCard: {
    marginBottom: 15,
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 3,
  },
  userItemContent: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  avatar: {
    marginRight: 15,
    backgroundColor: theme.colors.surfaceVariant,
  },
  userInfoContainer: {
    flex: 1,
    paddingVertical: 5,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  displayName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    flex: 1,
  },
  municipalChip: {
    backgroundColor: theme.colors.primaryLight || '#e8f5e9',
    height: 28,
  },
  municipalChipText: {
    color: theme.colors.primary,
    fontSize: 12,
  },
  username: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginBottom: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    marginTop: 5,
  },
  statItem: {
    marginRight: 20,
    alignItems: 'center',
    flexDirection: 'row',
  },
  statNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    marginHorizontal: 5,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
  leaderboardContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  leaderboardHeader: {
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 5,
  },
  leaderboardHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  leaderboardTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leaderboardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 10,
  },
  closeButton: {
    backgroundColor: '#fff',
    borderRadius: 50,
  },
  leaderboardList: {
    padding: 15,
    paddingBottom: 30,
  },
  leaderboardItem: {
    marginBottom: 10,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
  },
  topThreeItem: {
    borderWidth: 1,
    borderColor: theme.colors.accent + '50',
  },
  leaderboardItemContent: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  rankContainer: {
    width: 45,
    height: 45,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textLight,
  },
  leaderAvatar: {
    marginRight: 15,
  },
  leaderInfoContainer: {
    flex: 1,
  },
  leaderName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  leaderUsername: {
    fontSize: 14,
    color: theme.colors.textLight,
  },
  scoreContainer: {
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.accent,
  },
  topThreeScore: {
    color: theme.colors.primary,
    fontSize: 22,
  },
  scoreLabel: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
});

export default CommunityScreen;