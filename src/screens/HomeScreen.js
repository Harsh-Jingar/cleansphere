import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert, Dimensions, Image as RNImage, BackHandler } from 'react-native';
import { Text, Card, Button, Avatar, ActivityIndicator, FAB, Chip, Badge } from 'react-native-paper';
import { db, auth } from '../config/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, getDocs, where } from 'firebase/firestore';
import { theme } from '../theme/theme';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import appEvents, { APP_EVENTS } from '../utils/events';
import { useNetwork } from '../contexts/NetworkContext';

const HomeScreen = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'resolved'
  const navigation = useNavigation();
  const { user, userRole } = useAuth();
  const { isConnected } = useNetwork();
  const windowWidth = Dimensions.get('window').width;
  // Keep track of active subscriptions
  const firestoreUnsubscribe = useRef(null);
  const isMounted = useRef(true);

  // Reset mounted status on screen focus/unfocus
  useFocusEffect(
    useCallback(() => {
      isMounted.current = true;
      
      return () => {
        isMounted.current = false;
      };
    }, [])
  );

  const fetchReports = useCallback(() => {
    if (!isConnected) {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
        Alert.alert(
          "Network Error", 
          "You appear to be offline. Please check your connection and try again."
        );
      }
      return () => {};
    }

    setLoading(true);
    try {
      // Build query based on filter - with improved approach to avoid composite index requirements
      let q;
      if (filter === 'all') {
        q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(20));
      } else {
        // For filtered queries, first get by status, then sort client-side
        q = query(
          collection(db, "reports"),
          where("status", "==", filter),
          limit(50) // Fetch more to ensure we have enough after sorting
        );
      }

      let unsubscribe;
      try {
        unsubscribe = onSnapshot(q, async (snapshot) => {
          if (!isMounted.current) return;
          
          if (!snapshot || snapshot.empty) {
            if (__DEV__) {
              console.warn("No reports found for filter: " + filter);
            }
            setReports([]);
            setLoading(false);
            setRefreshing(false);
            return;
          }

          try {
            const reportData = await Promise.all(snapshot.docs.map(async (doc) => {
              if (!doc || !doc.data) return null;
              
              const data = doc.data() || {};
              let userAvatar = null;
              let currentUserName = data.userName || 'Anonymous';

              if (data.userId) {
                try {
                  const userQuery = query(collection(db, "users"), where("uid", "==", data.userId));
                  const userSnapshot = await getDocs(userQuery);
                  if (!userSnapshot.empty) {
                    const userData = userSnapshot.docs[0].data();
                    userAvatar = userData.imageURL || null;
                    // Always use the current username from the user document, not the one stored in the report
                    currentUserName = userData.displayName || data.userName || 'Anonymous';
                  }
                } catch (err) {
                  if (__DEV__) {
                    console.log("Error fetching user avatar or name:", err);
                  }
                }
              }

              return {
                id: doc.id,
                ...data,
                liked: data.likes && auth.currentUser ? data.likes.includes(auth.currentUser.uid) : false,
                title: data.title || '',
                description: data.description || '',
                userName: currentUserName, // Use the current userName we retrieved
                locationName: data.locationName || 'Unknown Location',
                status: data.status || 'pending',
                likes: data.likes || [],
                comments: data.comments || [],
                userAvatar: userAvatar,
              };
            }));

            if (!isMounted.current) return;

            // Filter out null values (from failed mappings)
            let filteredData = reportData.filter(item => item !== null);
            
            // For filtered views, sort client-side to get the same ordering as 'all' view
            if (filter !== 'all') {
              filteredData = filteredData.sort((a, b) => {
                const timeA = a.createdAt?.seconds ? a.createdAt.seconds : 0;
                const timeB = b.createdAt?.seconds ? b.createdAt.seconds : 0;
                return timeB - timeA; // descending order (newest first)
              }).slice(0, 20); // Only take the first 20 after sorting
            }
            
            if (__DEV__) {
              console.log(`Reports fetched for filter '${filter}':`, filteredData.length);
            }
            setReports(filteredData);
          } catch (err) {
            if (__DEV__) {
              console.error("Error processing report data:", err);
            }
            if (isMounted.current) {
              setReports([]);
            }
          } finally {
            if (isMounted.current) {
              setLoading(false);
              setRefreshing(false);
            }
          }
        }, (error) => {
          if (__DEV__) {
            console.error(`Error fetching reports with filter '${filter}':`, error);
          }
          if (isMounted.current) {
            Alert.alert("Error", "Failed to load reports. Please try again later.");
            setLoading(false);
            setRefreshing(false);
          }
        });
      } catch (innerError) {
        if (__DEV__) {
          console.error("Error setting up onSnapshot:", innerError);
        }
        if (isMounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
        return () => {};
      }

      return unsubscribe;
    } catch (error) {
      if (__DEV__) {
        console.error("Error in fetchReports:", error);
      }
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
      return () => {}; // Return empty function if setup fails
    }
  }, [filter, isConnected]);

  useEffect(() => {
    firestoreUnsubscribe.current = fetchReports();
    
    // Listen for sign out events
    const removeSignOutListener = appEvents.on(APP_EVENTS.SIGN_OUT, () => {
      if (__DEV__) {
        console.log('HomeScreen: Cleaning up Firestore listeners on sign out');
      }
      if (firestoreUnsubscribe.current) {
        firestoreUnsubscribe.current();
        firestoreUnsubscribe.current = null;
      }
    });
    
    // Handle back button press to show exit confirmation dialog
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(
        "Exit App",
        "Are you sure you want to exit the app?",
        [
          { text: "Cancel", onPress: () => {}, style: "cancel" },
          { text: "Exit", onPress: () => BackHandler.exitApp() }
        ]
      );
      return true;
    });

    // Clean up subscription on unmount
    return () => {
      isMounted.current = false;
      if (typeof firestoreUnsubscribe.current === 'function') {
        firestoreUnsubscribe.current();
      }
      removeSignOutListener();
      backHandler.remove();
    };
  }, [fetchReports]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    
    // If current subscription exists, clean it up first
    if (firestoreUnsubscribe.current) {
      firestoreUnsubscribe.current();
    }
    
    // Get a new subscription
    firestoreUnsubscribe.current = fetchReports();
  }, [fetchReports]);

  const handleLike = useCallback(async (reportId, isLiked) => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to like posts.");
      return;
    }

    try {
      const reportRef = doc(db, "reports", reportId);
      const reportDoc = await getDoc(reportRef);
      
      if (!reportDoc.exists()) {
        Alert.alert("Error", "Report not found.");
        return;
      }

      // First, update the local state to make the UI more responsive
      setReports(prevReports => prevReports.map(report => 
        report.id === reportId 
          ? { 
              ...report, 
              liked: !isLiked, 
              likes: isLiked 
                ? (report.likes || []).filter(id => id !== auth.currentUser.uid)
                : [...(report.likes || []), auth.currentUser.uid]
            }
          : report
      ));

      // Update only the likes array in the report document
      await updateDoc(reportRef, {
        likes: isLiked ? arrayRemove(auth.currentUser.uid) : arrayUnion(auth.currentUser.uid)
      });

      // Try to create notification in a separate try/catch block
      // to prevent notification failures from affecting the like operation
      try {
        // Only send notification if this is a new like and not from the post owner
        if (!isLiked && reportDoc.data().userId !== auth.currentUser.uid) {
          const notificationRef = collection(db, "users", reportDoc.data().userId, "notifications");
          await addDoc(notificationRef, {
            type: "like",
            reportId: reportId,
            userId: auth.currentUser.uid,
            username: user.displayName || "A user",
            read: false,
            createdAt: new Date()
          });
        }
      } catch (notificationError) {
        // Log error but don't alert user - the like was successful
        if (__DEV__) {
          console.log("Failed to create notification (non-critical):", notificationError);
        }
      }

    } catch (error) {
      if (__DEV__) {
        console.error("Error updating like:", error);
      }
      
      // Revert the optimistic UI update since the operation failed
      setReports(prevReports => prevReports.map(report => 
        report.id === reportId ? { ...report } : report
      ));
      
      Alert.alert("Error", "Failed to update like. Please try again.");
    }
  }, [user]);

  const navigateToReportDetail = useCallback((report) => {
    navigation.navigate('ReportDetail', { report });
  }, [navigation]);
  
  const navigateToReportAction = useCallback((report) => {
    navigation.navigate('ReportActionScreen', { report });
  }, [navigation]);

  const navigateToNewReport = useCallback(() => {
    navigation.navigate('Report');
  }, [navigation]);

  const handleUserProfileNavigation = useCallback((userId, userName) => {
    if (!userId) {
      Alert.alert("User Not Found", "Cannot display profile for anonymous user.");
      return;
    }
    
    const isCurrentUser = auth.currentUser && userId === auth.currentUser.uid;
    
    if (isCurrentUser) {
      navigation.navigate('Profile');
    } else {
      navigation.navigate('UserProfile', { 
        userId: userId,
        userName: userName || 'User'
      });
    }
  }, [navigation]);

  // Municipal authority can update report status
  const handleUpdateStatus = useCallback(async (reportId, newStatus) => {
    if (userRole !== 'municipal') {
      return;
    }

    try {
      const reportRef = doc(db, "reports", reportId);
      const reportDoc = await getDoc(reportRef);
      
      if (!reportDoc.exists()) {
        Alert.alert("Error", "Report not found.");
        return;
      }

      // Update the report status
      await updateDoc(reportRef, {
        status: newStatus,
        updatedAt: new Date(),
        updatedBy: auth.currentUser.uid
      });

      // Notify the report creator
      const reportData = reportDoc.data();
      if (reportData.userId) {
        const notificationRef = collection(db, "users", reportData.userId, "notifications");
        await addDoc(notificationRef, {
          type: "status_update",
          reportId: reportId,
          newStatus: newStatus,
          message: `Your report "${reportData.title}" has been marked as ${newStatus}`,
          read: false,
          createdAt: new Date()
        });
      }

      Alert.alert("Success", `Report status updated to ${newStatus}`);

      // Update the local state to reflect changes
      setReports(prevReports => prevReports.map(report => 
        report.id === reportId 
          ? { ...report, status: newStatus }
          : report
      ));
    } catch (error) {
      if (__DEV__) {
        console.error("Error updating report status:", error);
      }
      Alert.alert("Error", "Failed to update report status.");
    }
  }, [userRole]);

  const renderReportCard = useCallback(({ item }) => {
    const formattedDate = item.createdAt?.seconds 
      ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() 
      : "No Date Available";

    // Handle image source
    const imageSource = item.imageUrl 
      ? { uri: item.imageUrl } 
      : item.imageBase64 
        ? { uri: `data:image/jpeg;base64,${item.imageBase64}` }
        : null;
        
    // Handle user avatar correctly
    const avatarSource = item.userAvatar 
      ? { uri: item.userAvatar }
      : require('../assets/logo.jpg');

    const likesCount = item.likes ? item.likes.length : 0;
    const commentsCount = item.commentCount || 0;
    
    return (
      <Card style={styles.card} elevation={1}>
        {/* Header: User info */}
        <View style={styles.cardHeader}>
          <TouchableOpacity 
            style={styles.userInfo}
            onPress={() => handleUserProfileNavigation(item.userId, item.userName)}
            disabled={!item.userId}
          >
            <Avatar.Image 
              source={avatarSource} 
              size={32} 
            />
            <View style={styles.userNameContainer}>
              <Text style={styles.userName}>{item.userName || "Anonymous"}</Text>
              <Text style={styles.locationText} numberOfLines={1}>{item.locationName || "Unknown Location"}</Text>
            </View>
          </TouchableOpacity>
          
          <View style={styles.statusContainer}>
            <Text style={[
              styles.statusText, 
              { color: item.status === 'resolved' ? theme.colors.success : theme.colors.warning }
            ]}>
              {item.status === 'resolved' ? 'Resolved' : 'Pending'}
            </Text>
          </View>
        </View>
        
        {/* Image Section with progressive loading */}
        <TouchableOpacity 
          style={styles.imageContainer} 
          onPress={() => navigateToReportDetail(item)}
          activeOpacity={0.9}
        >
          {imageSource ? (
            <Card.Cover 
              source={imageSource} 
              style={styles.cardImage}
              resizeMode="cover"
              progressiveRenderingEnabled={true}
            />
          ) : (
            <View style={styles.noImageContainer}>
              <MaterialIcons name="image-not-supported" size={40} color={theme.colors.disabled} />
              <Text style={styles.noImageText}>Image not available</Text>
            </View>
          )}
        </TouchableOpacity>
        
        {/* Action Buttons for residents only */}
        {userRole === 'resident' && (
          <View style={styles.actionsContainer}>
            <View style={styles.leftActions}>
              <TouchableOpacity 
                style={styles.actionButton} 
                onPress={() => handleLike(item.id, item.liked)}
              >
                <MaterialCommunityIcons 
                  name={item.liked ? "heart" : "heart-outline"} 
                  size={26} 
                  color={item.liked ? theme.colors.error : theme.colors.text} 
                />
                {likesCount > 0 && (
                  <Text style={styles.actionText}>{likesCount}</Text>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => navigateToReportDetail(item)}
              >
                <MaterialCommunityIcons name="comment-outline" size={26} color={theme.colors.text} />
                {commentsCount > 0 && (
                  <Text style={styles.actionText}>{commentsCount}</Text>
                )}
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={styles.takeActionButton}
              onPress={() => navigateToReportDetail(item)}
            >
              <Text style={styles.takeActionText}>Action Status</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Content section with a TouchableOpacity for easier navigation */}
        <TouchableOpacity 
          onPress={() => navigateToReportDetail(item)}
          activeOpacity={0.7}
        >
          <Card.Content style={styles.contentContainer}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
            <Text style={styles.timestamp}>{formattedDate}</Text>
          </Card.Content>
        </TouchableOpacity>

        {/* Take Action button for municipal authority below content */}
        {userRole === 'municipal' && (
          <View style={styles.municipalActionsContainer}>
            <TouchableOpacity 
              style={[styles.takeActionButton, styles.municipalTakeActionButton]}
              onPress={() => navigateToReportAction(item)}
            >
              <Text style={styles.municipalActionText}>Take Action</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>
    );
  }, [navigateToReportDetail, navigateToReportAction, handleLike, userRole, handleUserProfileNavigation]);

  // Filter tabs for municipal users
  const renderFilterOptions = useCallback(() => {
    if (!userRole || userRole !== 'municipal') return null;
    
    return (
      <View style={styles.filterContainer}>
        <Text style={styles.filterLabel}>Filter by status:</Text>
        <View style={styles.chipContainer}>
          <Chip 
            selected={filter === 'all'} 
            onPress={() => setFilter('all')} 
            style={styles.chip}
            selectedColor={filter === 'all' ? theme.colors.primary : theme.colors.text}
          >
            All
          </Chip>
          <Chip 
            selected={filter === 'pending'} 
            onPress={() => setFilter('pending')} 
            style={styles.chip}
            selectedColor={filter === 'pending' ? theme.colors.warning : theme.colors.text}
          >
            Pending
          </Chip>
          <Chip 
            selected={filter === 'resolved'} 
            onPress={() => setFilter('resolved')} 
            style={styles.chip}
            selectedColor={filter === 'resolved' ? theme.colors.success : theme.colors.text}
          >
            Resolved
          </Chip>
        </View>
      </View>
    );
  }, [filter, userRole]);

  // Render the municipal header component as part of the FlatList header
  const renderMunicipalHeader = useCallback(() => {
    if (userRole !== 'municipal') return null;

    return (
      <View style={styles.municipalHeader}>
        <Text style={styles.welcomeTitle}>Municipal Authority Dashboard</Text>
        <Text style={styles.welcomeSubtitle}>Manage cleanliness reports</Text>
      </View>
    );
  }, [userRole]);

  // Memoize the Empty Component to prevent unnecessary re-renders
  const ListEmptyComponent = useMemo(() => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons 
        name="map-marker-alert-outline" 
        size={80} 
        color={theme.colors.textLight} 
      />
      <Text style={styles.emptyText}>No reports found</Text>
      <Text style={styles.emptySubtext}>
        {userRole === 'resident' 
          ? 'Be the first to report an issue in your area!' 
          : 'No cleanliness reports available with current filter.'}
      </Text>
      {userRole === 'resident' && (
        <Button 
          mode="contained" 
          style={styles.emptyButton}
          onPress={navigateToNewReport}
        >
          Create Report
        </Button>
      )}
    </View>
  ), [userRole, navigateToNewReport]);

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading reports...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Sticky filter container for municipal users */}
      {userRole === 'municipal' && renderFilterOptions()}

      <FlatList
        data={reports}
        renderItem={renderReportCard}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListHeaderComponent={renderMunicipalHeader}
        ListEmptyComponent={ListEmptyComponent}
        maxToRenderPerBatch={5}
        windowSize={10}
        removeClippedSubviews={true}
        initialNumToRender={3}
        updateCellsBatchingPeriod={50}
      />
      
      {/* Only show FAB for residents */}
      {userRole === 'resident' && (
        <FAB
          style={styles.fab}
          icon="plus"
          color={theme.colors.textInverted}
          onPress={navigateToNewReport}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    // Reduce padding to avoid extra space
    paddingBottom: 0, // Remove container padding as it creates double spacing
  },
  municipalHeader: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.medium,
    paddingHorizontal: theme.spacing.medium,
  },
  welcomeTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverted,
    marginBottom: theme.spacing.xsmall,
  },
  welcomeSubtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textInverted,
    opacity: 0.8,
  },
  filterContainer: {
    paddingHorizontal: theme.spacing.medium,
    paddingVertical: theme.spacing.small,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filterLabel: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textLight,
    marginBottom: 4,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.xsmall,
  },
  chip: {
    marginRight: theme.spacing.small,
    marginBottom: theme.spacing.xsmall,
  },
  listContainer: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    // Reduce padding to avoid extra space with bottom navigation
    paddingBottom: 80, // Reduced from 120px to 80px
  },
  card: {
    marginBottom: 0,
    borderWidth: 0.2,
    backgroundColor: theme.colors.surface,
    borderRadius: 0, // Remove border radius for more Instagram-like appearance
    overflow: 'hidden',
    elevation: 1,
    marginHorizontal: 0,
    marginTop: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.medium,
    paddingVertical: theme.spacing.small,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userNameContainer: {
    marginLeft: theme.spacing.small,
  },
  userName: {
    fontWeight: theme.typography.fontWeight.bold,
    fontSize: theme.typography.fontSize.medium,
  },
  locationText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textLight,
  },
  statusContainer: {
    paddingHorizontal: theme.spacing.small,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.small,
  },
  statusText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1, // Changed from fixed height to 1:1 aspect ratio for square images
    backgroundColor: theme.colors.backgroundLight,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 0, // Remove border radius for rectangular images
  },
  noImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundLight,
  },
  noImageText: {
    marginTop: theme.spacing.small,
    color: theme.colors.textLight,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.medium,
    paddingVertical: theme.spacing.small,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.medium,
    padding: theme.spacing.xsmall,
  },
  actionText: {
    marginLeft: 5,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  takeActionButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.small,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  takeActionText: {
    color: theme.colors.textInverted,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
  },
  municipalActionsContainer: {
    paddingHorizontal: theme.spacing.medium,
    paddingVertical: theme.spacing.small,
    alignItems: 'center',
  },
  municipalTakeActionButton: {
    width: 'auto',
    paddingHorizontal: theme.spacing.medium,
    paddingVertical: 8,
  },
  municipalActionText: {
    color: theme.colors.textInverted,
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
  },
  contentContainer: {
    paddingVertical: theme.spacing.small,
    paddingTop: 5,
  },
  cardTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  cardDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textLight,
    marginTop: 3,
  },
  timestamp: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textLight,
    marginTop: theme.spacing.xsmall,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.large,
    marginTop: 80,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.medium,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginVertical: theme.spacing.medium,
  },
  emptyButton: {
    marginTop: theme.spacing.medium,
  },
  fab: {
    position: 'absolute',
    right: 0, // Remove the right alignment
    bottom: 10, // Move it closer to the bottom edge
    backgroundColor: theme.colors.primary,
    alignSelf: 'center', // Center horizontally
    margin: theme.spacing.medium,
  },
});

export default HomeScreen;
