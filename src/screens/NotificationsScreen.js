import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, Animated } from 'react-native';
import { Text, ActivityIndicator, Divider, Badge, IconButton, Snackbar } from 'react-native-paper';
import { db, auth } from '../config/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, where, limit } from 'firebase/firestore';
import { theme } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNetwork } from '../contexts/NetworkContext';

const NotificationsScreen = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const { user } = useAuth();
  const navigation = useNavigation();
  const { isConnected } = useNetwork();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const unsubscribeRef = useRef(null);

  const showSnackbar = useCallback((message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  }, []);
  
  const loadNotifications = useCallback(() => {
    if (!user || !isConnected) {
      setLoading(false);
      if (!isConnected) {
        showSnackbar('No internet connection. Showing cached notifications.');
      }
      return null;
    }

    try {
      const userNotificationsRef = collection(db, 'users', auth.currentUser.uid, 'notifications');
      const q = query(userNotificationsRef, orderBy('createdAt', 'desc'), limit(20));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
          setNotifications([]);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const notificationsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date()
        }));

        setNotifications(notificationsData);
        setLoading(false);
        setRefreshing(false);
      }, (error) => {
        console.error("Error fetching notifications:", error);
        showSnackbar("Failed to load notifications");
        setLoading(false);
        setRefreshing(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Setup notifications listener error:", error);
      showSnackbar("An error occurred while setting up notifications");
      setLoading(false);
      setRefreshing(false);
      return null;
    }
  }, [user, isConnected, showSnackbar]);

  useEffect(() => {
    unsubscribeRef.current = loadNotifications();
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      if (!loading && !refreshing) {
        onRefresh();
      }
      return () => {};
    }, [loading, refreshing])
  );

  const onRefresh = useCallback(() => {
    if (!isConnected) {
      showSnackbar('No internet connection. Cannot refresh.');
      return;
    }
    
    setRefreshing(true);
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    unsubscribeRef.current = loadNotifications();
  }, [isConnected, loadNotifications, showSnackbar]);

  const markAsRead = useCallback(async (notificationId) => {
    if (!isConnected) {
      showSnackbar('No internet connection. Cannot mark as read.');
      return;
    }
    
    try {
      const notificationRef = doc(db, 'users', auth.currentUser.uid, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        read: true
      });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      showSnackbar("Failed to mark notification as read");
    }
  }, [isConnected, showSnackbar]);

  const deleteNotification = useCallback(async (notificationId) => {
    if (!isConnected) {
      showSnackbar('No internet connection. Cannot delete notification.');
      return;
    }
    
    try {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      }).start(async () => {
        const notificationRef = doc(db, 'users', auth.currentUser.uid, 'notifications', notificationId);
        await deleteDoc(notificationRef);
        showSnackbar("Notification deleted");
        fadeAnim.setValue(1);
      });
    } catch (error) {
      console.error("Error deleting notification:", error);
      showSnackbar("Failed to delete notification");
      fadeAnim.setValue(1);
    }
  }, [isConnected, showSnackbar, fadeAnim]);

  const handleNotificationPress = useCallback((notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }

    if (notification.type === 'like' || notification.type === 'comment' || notification.type === 'resolution') {
      if (notification.reportId) {
        navigation.navigate('ReportDetail', { reportId: notification.reportId });
      } else {
        showSnackbar("Cannot open this notification - missing report reference");
      }
    } else if (notification.type === 'system') {
    }
  }, [markAsRead, navigation, showSnackbar]);

  const confirmDeleteNotification = useCallback((notificationId) => {
    Alert.alert(
      "Delete Notification",
      "Are you sure you want to delete this notification?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteNotification(notificationId)
        }
      ]
    );
  }, [deleteNotification]);

  const markAllAsRead = useCallback(async () => {
    if (!isConnected) {
      showSnackbar('No internet connection. Cannot mark all as read.');
      return;
    }
    
    if (notifications.length === 0) {
      showSnackbar('No notifications to mark as read');
      return;
    }
    
    try {
      const batch = db.batch();
      const unreadNotifications = notifications.filter(notif => !notif.read);
      
      if (unreadNotifications.length === 0) {
        showSnackbar('All notifications are already read');
        return;
      }
      
      unreadNotifications.forEach(notification => {
        const notificationRef = doc(db, 'users', auth.currentUser.uid, 'notifications', notification.id);
        batch.update(notificationRef, { read: true });
      });
      
      await batch.commit();
      showSnackbar(`Marked ${unreadNotifications.length} notifications as read`);
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      showSnackbar("Failed to mark all notifications as read");
    }
  }, [notifications, isConnected, showSnackbar]);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';

    const now = new Date();
    const notificationDate = new Date(timestamp);
    const diffMs = now - notificationDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    } else {
      return notificationDate.toLocaleDateString();
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'like':
        return <MaterialCommunityIcons name="heart" size={24} color={theme.colors.error} />;
      case 'comment':
        return <MaterialCommunityIcons name="comment-text" size={24} color={theme.colors.info} />;
      case 'resolution':
        return <MaterialCommunityIcons name="check-circle" size={24} color={theme.colors.success} />;
      case 'system':
        return <MaterialCommunityIcons name="bell-ring" size={24} color={theme.colors.warning} />;
      default:
        return <MaterialCommunityIcons name="bell" size={24} color={theme.colors.primary} />;
    }
  };

  const getNotificationMessage = (notification) => {
    const username = notification.username || 'Someone';
    
    switch (notification.type) {
      case 'like':
        return `${username} liked your report`;
      case 'comment':
        return `${username} commented: "${notification.text?.substring(0, 30)}${notification.text?.length > 30 ? '...' : ''}"`;
      case 'resolution':
        return `Your report "${notification.reportTitle || 'Untitled'}" has been resolved by ${username}`;
      case 'system':
        return notification.text || 'System notification';
      default:
        return notification.text || 'New notification';
    }
  };

  const renderNotificationItem = useCallback(({ item }) => (
    <TouchableOpacity 
      style={[styles.notificationItem, !item.read && styles.unreadNotification]} 
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
      accessible={true}
      accessibilityLabel={`${getNotificationMessage(item)}, ${item.read ? 'Read' : 'Unread'}, ${formatTimestamp(item.createdAt)}`}
      accessibilityHint="Double tap to view details"
      accessibilityRole="button"
    >
      <View style={styles.notificationContent}>
        <View style={styles.iconContainer}>
          {getNotificationIcon(item.type)}
          {!item.read && <Badge size={8} style={styles.unreadBadge} />}
        </View>
        
        <View style={styles.textContainer}>
          <Text style={styles.notificationText} numberOfLines={2}>
            {getNotificationMessage(item)}
          </Text>
          <Text style={styles.timestampText}>
            {formatTimestamp(item.createdAt)}
          </Text>
        </View>
        
        <IconButton
          icon="delete"
          size={20}
          iconColor={theme.colors.textLight}
          onPress={() => confirmDeleteNotification(item.id)}
          style={styles.deleteButton}
          accessibilityLabel="Delete notification"
          accessibilityHint="Double tap to delete this notification"
        />
      </View>
      
      <Divider style={styles.divider} />
    </TouchableOpacity>
  ), [handleNotificationPress, confirmDeleteNotification]);

  const ListHeaderComponent = useCallback(() => {
    const unreadCount = notifications.filter(n => !n.read).length;
    
    return notifications.length > 0 ? (
      <View style={styles.headerContainer}>
        <View style={styles.headerLeftSection}>
          <Text style={styles.notificationCount}>
            {notifications.length} Notification{notifications.length !== 1 ? 's' : ''}
          </Text>
          {unreadCount > 0 && (
            <Badge size={22} style={styles.countBadge}>
              {unreadCount}
            </Badge>
          )}
        </View>
        
        {unreadCount > 0 && (
          <TouchableOpacity 
            onPress={markAllAsRead}
            style={styles.markAllAsRead}
            accessibilityLabel="Mark all notifications as read"
            accessibilityRole="button"
          >
            <Text style={styles.markAllAsReadText}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>
    ) : null;
  }, [notifications, markAllAsRead]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <MaterialCommunityIcons name="wifi-off" size={16} color={theme.colors.onWarning} />
          <Text style={styles.offlineBannerText}>You are offline</Text>
        </View>
      )}
      
      {notifications.length > 0 ? (
        <FlatList
          data={notifications}
          renderItem={renderNotificationItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.notificationsList}
          ListHeaderComponent={ListHeaderComponent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="bell-outline" size={80} color={theme.colors.textLight} />
          <Text style={styles.emptyText}>No notifications</Text>
          <Text style={styles.emptySubtext}>When you receive notifications, they'll appear here</Text>
          
          {!loading && (
            <TouchableOpacity 
              onPress={onRefresh} 
              style={styles.refreshButton}
              disabled={!isConnected}
              accessibilityLabel="Refresh notifications"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="refresh" size={20} color={theme.colors.primary} />
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        action={{
          label: 'OK',
          onPress: () => setSnackbarVisible(false),
        }}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
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
  },
  loadingText: {
    marginTop: theme.spacing.medium,
    color: theme.colors.textLight,
  },
  notificationsList: {
    paddingBottom: theme.spacing.large,
  },
  notificationItem: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.medium,
  },
  unreadNotification: {
    backgroundColor: theme.colors.primaryLight || theme.colors.background,
  },
  notificationContent: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.medium,
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.medium,
    position: 'relative',
    elevation: 2,
  },
  unreadBadge: {
    backgroundColor: theme.colors.notification,
    position: 'absolute',
    top: 0,
    right: 0,
  },
  textContainer: {
    flex: 1,
  },
  notificationText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    marginBottom: 4,
  },
  timestampText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textLight,
  },
  deleteButton: {
    margin: 0,
    padding: 8,
  },
  divider: {
    backgroundColor: theme.colors.border,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.large,
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
    marginTop: theme.spacing.small,
    marginBottom: theme.spacing.medium,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: theme.spacing.medium,
  },
  refreshButtonText: {
    color: theme.colors.primary,
    marginLeft: 8,
    fontSize: theme.typography.fontSize.md,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerLeftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationCount: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  countBadge: {
    backgroundColor: theme.colors.notification,
    marginLeft: 8,
    color: theme.colors.onNotification || '#fff',
  },
  markAllAsRead: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  markAllAsReadText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.primary,
  },
  offlineBanner: {
    backgroundColor: theme.colors.warning || '#ffd600',
    padding: theme.spacing.small,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineBannerText: {
    color: theme.colors.onWarning || '#000',
    marginLeft: 8,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  snackbar: {
    bottom: 16,
  },
});

export default NotificationsScreen;