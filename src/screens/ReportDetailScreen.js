import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native';
import { Text, Button, Avatar, Divider, ActivityIndicator } from 'react-native-paper';
import { db, auth } from '../config/firebase';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, Timestamp, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { theme } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

const ReportDetailScreen = ({ route }) => {
  const { report: initialReport } = route.params;
  const [report, setReport] = useState(initialReport);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const navigation = useNavigation();
  const commentsRef = React.useRef();
  const scrollViewRef = React.useRef();

  useEffect(() => {
    fetchReportDetails();
    subscribeToComments();
  }, []);

  const fetchReportDetails = async () => {
    try {
      setLoading(true);
      const reportRef = doc(db, "reports", initialReport.id);
      const reportDoc = await getDoc(reportRef);
      
      if (reportDoc.exists()) {
        const data = reportDoc.data();
        
        let userAvatar = null;
        let userName = data.userName || "Anonymous";
        
        if (data.userId) {
          const municipalQuery = query(collection(db, "municipal_authorities"), where("uid", "==", data.userId));
          const municipalSnapshot = await getDocs(municipalQuery);
          
          if (!municipalSnapshot.empty) {
            const municipalData = municipalSnapshot.docs[0].data();
            userName = municipalData.name || userName;
            userAvatar = municipalData.imageURL || null;
          } else {
            const userQuery = query(collection(db, "users"), where("uid", "==", data.userId));
            const userSnapshot = await getDocs(userQuery);
            if (!userSnapshot.empty) {
              const userData = userSnapshot.docs[0].data();
              userAvatar = userData.imageURL || null;
              userName = userData.displayName || userName;
            }
          }
        }
        
        let municipalDetails = {};
        if (data.status === 'resolved' && data.resolvedBy) {
          const municipalQuery = query(collection(db, "municipal_authorities"), where("uid", "==", data.resolvedBy));
          const municipalSnapshot = await getDocs(municipalQuery);
          
          if (!municipalSnapshot.empty) {
            const municipalData = municipalSnapshot.docs[0].data();
            municipalDetails = {
              resolvedByName: municipalData.name || "Municipal Authority",
              city: municipalData.city || null,
              region: municipalData.region || null
            };
          } else {
            const resolverQuery = query(collection(db, "users"), where("uid", "==", data.resolvedBy));
            const resolverSnapshot = await getDocs(resolverQuery);
            
            if (!resolverSnapshot.empty) {
              const resolverData = resolverSnapshot.docs[0].data();
              municipalDetails = {
                resolvedByName: resolverData.displayName || "Municipal Authority"
              };
            }
          }
        }

        const reportData = {
          id: reportDoc.id,
          ...data,
          ...municipalDetails,
          userAvatar: userAvatar,
          userName: userName,
          liked: data.likes && data.likes.includes(auth.currentUser?.uid)
        };
        setReport(reportData);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error fetching report details:", error);
      Alert.alert("Error", "Failed to load report details");
      setLoading(false);
    }
  };

  const subscribeToComments = () => {
    const q = collection(db, "reports", initialReport.id, "comments");
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const commentsDataPromises = snapshot.docs.map(async doc => {
        const commentData = {
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate() || new Date()
        };
        
        if (commentData.userId) {
          try {
            const municipalQuery = query(collection(db, "municipal_authorities"), where("uid", "==", commentData.userId));
            const municipalSnapshot = await getDocs(municipalQuery);
            
            if (!municipalSnapshot.empty) {
              const municipalData = municipalSnapshot.docs[0].data();
              if (municipalData.name) {
                commentData.userName = municipalData.name;
              }
              if (municipalData.imageURL) {
                commentData.userAvatar = municipalData.imageURL;
              }
            } else {
              const userQuery = query(collection(db, "users"), where("uid", "==", commentData.userId));
              const userSnapshot = await getDocs(userQuery);
              
              if (!userSnapshot.empty) {
                const userData = userSnapshot.docs[0].data();
                commentData.userAvatar = userData.imageURL || userData.photoURL || commentData.userAvatar;
                if (userData.displayName) {
                  commentData.userName = userData.displayName;
                }
              }
            }
          } catch (error) {
            console.error("Error fetching commenter data:", error);
          }
        }
        
        return commentData;
      });
      
      const commentsData = await Promise.all(commentsDataPromises);
      
      commentsData.sort((a, b) => b.timestamp - a.timestamp);
      
      setComments(commentsData);
    });

    return () => unsubscribe();
  };

  const handleLike = async () => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to like posts.");
      return;
    }

    try {
      const reportRef = doc(db, "reports", report.id);
      
      await updateDoc(reportRef, {
        likes: report.liked 
          ? arrayRemove(auth.currentUser.uid) 
          : arrayUnion(auth.currentUser.uid)
      });

      setReport({
        ...report,
        liked: !report.liked,
        likes: report.liked 
          ? (report.likes || []).filter(id => id !== auth.currentUser.uid)
          : [...(report.likes || []), auth.currentUser.uid]
      });
    } catch (error) {
      console.error("Error updating like:", error);
      Alert.alert("Error", "Failed to update like");
    }
  };

  const handleCommentSubmit = async () => {
    if (!comment.trim()) return;
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to comment.");
      return;
    }

    try {
      setSubmitting(true);
      
      let userName = user.displayName;
      
      if (user && user.isMunicipalAuthority) {
        try {
          const municipalRef = collection(db, 'municipal_authorities');
          const q = query(municipalRef, where('uid', '==', auth.currentUser.uid));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const data = querySnapshot.docs[0].data();
            if (data.name) {
              userName = data.name;
            }
          }
        } catch (err) {
          console.error("Error fetching municipal name:", err);
        }
      }
      
      const commentData = {
        userId: auth.currentUser.uid,
        userName: userName || "Municipal Authority",
        userAvatar: user.imageURL || user.photoURL || null,
        text: comment.trim(),
        timestamp: Timestamp.now()
      };

      const commentsRef = collection(db, "reports", report.id, "comments");
      await addDoc(commentsRef, commentData);

      const reportRef = doc(db, "reports", report.id);
      await updateDoc(reportRef, {
        commentCount: (report.commentCount || 0) + 1
      });

      if (report.userId !== auth.currentUser.uid) {
        const notificationRef = collection(db, "users", report.userId, "notifications");
        await addDoc(notificationRef, {
          type: "comment",
          reportId: report.id,
          userId: auth.currentUser.uid,
          username: userName || "Municipal Authority",
          text: comment.trim(),
          read: false,
          createdAt: new Date()
        });
      }

      setComment('');
      setSubmitting(false);
    } catch (error) {
      console.error("Error adding comment:", error);
      Alert.alert("Error", "Failed to add comment");
      setSubmitting(false);
    }
  };

  const handleResolveReport = async () => {
    if (!user || !user.isMunicipalAuthority) {
      Alert.alert("Unauthorized", "Only municipal authorities can mark reports as resolved.");
      return;
    }

    try {
      setLoading(true);
      const reportRef = doc(db, "reports", report.id);
      
      await updateDoc(reportRef, {
        status: 'resolved',
        resolvedBy: auth.currentUser.uid,
        resolvedAt: Timestamp.now()
      });

      const notificationRef = collection(db, "users", report.userId, "notifications");
      await addDoc(notificationRef, {
        type: "resolution",
        reportId: report.id,
        userId: auth.currentUser.uid,
        username: user.displayName || "Municipal Authority",
        read: false,
        createdAt: new Date()
      });

      setReport({
        ...report,
        status: 'resolved',
        resolvedBy: auth.currentUser.uid,
        resolvedAt: Timestamp.now()
      });

      Alert.alert("Success", "Report has been marked as resolved. The reporter will be notified.");
      setLoading(false);
    } catch (error) {
      console.error("Error resolving report:", error);
      Alert.alert("Error", "Failed to mark report as resolved");
      setLoading(false);
    }
  };

  const handleNavigateToActionUpload = () => {
    navigation.navigate('ReportActionScreen', { reportId: report.id });
  };

  const handleNavigateToProfile = (userId) => {
    if (!userId) return;
    
    if (userId === auth.currentUser?.uid) {
      navigation.navigate('MainTabs', { screen: 'Profile' });
    } else {
      navigation.navigate('UserProfile', { userId });
    }
  };

  const scrollToComments = () => {
    commentsRef.current?.measureInWindow((x, y) => {
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: y, animated: true });
      }
    });
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "Unknown date";
    
    const date = timestamp.seconds 
      ? new Date(timestamp.seconds * 1000) 
      : new Date(timestamp);
    
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const imageSource = report && report.imageUrl 
    ? { uri: report.imageUrl } 
    : report && report.imageBase64 
      ? { uri: `data:image/jpeg;base64,${report.imageBase64}` }
      : null;

  const likesCount = report?.likes?.length || 0;
  const commentCount = comments?.length || 0;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading report details...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : null}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView style={styles.container} ref={scrollViewRef}>
        <View style={styles.headerContainer}>
          <TouchableOpacity 
            style={styles.userInfoContainer} 
            onPress={() => handleNavigateToProfile(report?.userId)}
            disabled={!report?.userId}
          >
            <Avatar.Image 
              source={report?.userAvatar ? { uri: report.userAvatar } : require('../assets/logo.jpg')} 
              size={50} 
            />
            <View style={styles.userTextContainer}>
              <Text style={styles.userName}>{report?.userName || "Anonymous"}</Text>
              <Text style={styles.locationText} numberOfLines={1}>
                <MaterialIcons name="location-on" size={14} color={theme.colors.primary} />
                {' '}{report?.locationName || "Unknown Location"}
              </Text>
            </View>
          </TouchableOpacity>
          
          <View style={[
            styles.statusContainer, 
            { backgroundColor: report?.status === 'resolved' ? theme.colors.successLight : theme.colors.warningLight }
          ]}>
            <Text style={[
              styles.statusText,
              { color: report?.status === 'resolved' ? theme.colors.success : theme.colors.warning }
            ]}>
              {report?.status === 'resolved' ? 'Resolved' : 'Pending'}
            </Text>
          </View>
        </View>

        <View style={styles.imageContainer}>
          <Image 
            source={imageSource} 
            style={styles.reportImage}
            resizeMode="cover"
          />
        </View>

        <View style={styles.detailsContainer}>
          <Text style={styles.reportTitle}>{report?.title || "Untitled Report"}</Text>
          <Text style={styles.reportTimestamp}>Reported on {formatDate(report?.createdAt)}</Text>
          <Text style={styles.reportDescription}>{report?.description || "No description provided"}</Text>
          
          {report?.status === 'resolved' && (
            <View style={styles.resolutionContainer}>
              <Text style={styles.resolutionTitle}>Resolution Information</Text>
              <Text style={styles.resolutionText}>
                Resolved by: {report?.resolvedByName || "Municipal Authority"}
              </Text>
              <Text style={styles.resolutionText}>
                Resolved on: {formatDate(report?.resolvedAt)}
              </Text>
              {report?.city && (
                <Text style={styles.resolutionText}>
                  City: {report.city}
                </Text>
              )}
              {report?.region && (
                <Text style={styles.resolutionText}>
                  Region: {report.region}
                </Text>
              )}
              {report?.resolutionNotes && (
                <Text style={styles.resolutionNotes}>{report.resolutionNotes}</Text>
              )}
              {(report?.afterImageUrl || report?.afterImageBase64) && (
                <View style={styles.afterImageContainer}>
                  <Text style={styles.afterImageTitle}>After cleanup:</Text>
                  <Image 
                    source={
                      report.afterImageUrl 
                        ? { uri: report.afterImageUrl } 
                        : report.afterImageBase64
                          ? { uri: `data:image/jpeg;base64,${report.afterImageBase64}` }
                          : null
                    } 
                    style={styles.afterImage}
                    resizeMode="cover"
                  />
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
            <MaterialCommunityIcons 
              name={report?.liked ? "heart" : "heart-outline"} 
              size={24} 
              color={report?.liked ? theme.colors.error : theme.colors.text} 
            />
            <Text style={styles.actionText}>
              {likesCount > 0 ? `${likesCount} ${likesCount === 1 ? 'Like' : 'Likes'}` : "Like"}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={scrollToComments}>
            <MaterialCommunityIcons name="comment-outline" size={24} color={theme.colors.text} />
            <Text style={styles.actionText}>
              {commentCount > 0 ? `${commentCount} ${commentCount === 1 ? 'Comment' : 'Comments'}` : "Comment"}
            </Text>
          </TouchableOpacity>
        </View>

        {user && user.isMunicipalAuthority && report?.status !== 'resolved' && (
          <View style={styles.authorityActionsContainer}>
            <Text style={styles.authorityTitle}>Municipal Authority Actions</Text>
            <View style={styles.authorityButtonsRow}>
              <Button 
                mode="contained" 
                icon="check-circle" 
                onPress={handleResolveReport}
                style={[styles.authorityButton, { backgroundColor: theme.colors.success }]}
                labelStyle={{ color: theme.colors.white }}
                loading={loading}
                disabled={loading}
              >
                Mark Resolved
              </Button>
              
              <Button 
                mode="contained" 
                icon="camera" 
                onPress={handleNavigateToActionUpload}
                style={[styles.authorityButton, { backgroundColor: theme.colors.info }]}
                labelStyle={{ color: theme.colors.white }}
                disabled={loading}
              >
                Upload Action
              </Button>
            </View>
          </View>
        )}

        <View style={styles.commentsContainer} ref={commentsRef}>
          <Text style={styles.commentsTitle}>Comments</Text>
          <Divider style={styles.divider} />
          
          {comments.length > 0 ? (
            comments.map(item => (
              <View key={item.id} style={styles.commentItem}>
                <View style={styles.commentHeader}>
                  <TouchableOpacity onPress={() => handleNavigateToProfile(item.userId)} disabled={!item.userId}>
                    <Avatar.Image 
                      source={item.userAvatar ? { uri: item.userAvatar } : require('../assets/logo.jpg')} 
                      size={40} 
                    />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.commentUserInfo} 
                    onPress={() => handleNavigateToProfile(item.userId)}
                    disabled={!item.userId}
                  >
                    <Text style={styles.commentUserName}>{item.userName || "Municipal Authority"}</Text>
                    <Text style={styles.commentTimestamp}>{formatDate(item.timestamp)}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.commentText}>{item.text}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noCommentsText}>No comments yet. Be the first to comment!</Text>
          )}
        </View>
      </ScrollView>

      <View style={styles.commentInputContainer}>
        <Avatar.Image 
          source={user?.imageURL ? { uri: user.imageURL } : user?.photoURL ? { uri: user.photoURL } : require('../assets/logo.jpg')} 
          size={40} 
        />
        <TextInput
          style={styles.commentInput}
          placeholder="Add a comment..."
          placeholderTextColor="#000000"
          value={comment}
          onChangeText={setComment}
          multiline
        />
        <TouchableOpacity 
          style={[
            styles.sendButton, 
            (!comment.trim() || submitting) && styles.disabledSendButton
          ]} 
          onPress={handleCommentSubmit}
          disabled={!comment.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={theme.colors.white} />
          ) : (
            <Ionicons name="send" size={24} color={theme.colors.white} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.medium,
    color: theme.colors.textLight,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.small,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.small,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userTextContainer: {
    marginLeft: theme.spacing.small,
  },
  userName: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  locationText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textLight,
    marginTop: theme.spacing.xsmall,
  },
  statusContainer: {
    paddingHorizontal: theme.spacing.small,
    paddingVertical: theme.spacing.small,
    borderRadius: theme.borderRadius.medium,
  },
  statusText: {
    marginLeft: -10,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: theme.colors.disabled,
  },
  reportImage: {
    width: '100%',
    height: '100%',
  },
  detailsContainer: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.small,
  },
  reportTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
  },
  reportTimestamp: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.small,
  },
  reportDescription: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    lineHeight: 24,
  },
  resolutionContainer: {
    marginTop: theme.spacing.medium,
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.successLight,
    borderRadius: theme.borderRadius.medium,
  },
  resolutionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.success,
    marginBottom: theme.spacing.small,
  },
  resolutionText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    marginBottom: theme.spacing.xsmall,
  },
  resolutionNotes: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    marginTop: theme.spacing.small,
    fontStyle: 'italic',
  },
  afterImageContainer: {
    marginTop: theme.spacing.medium,
  },
  afterImageTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
  },
  afterImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.borderRadius.medium,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.small,
  },
  actionText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    marginLeft: theme.spacing.small,
  },
  authorityActionsContainer: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.medium,
  },
  authorityTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.medium,
  },
  authorityButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  authorityButton: {
    flex: 1,
    marginHorizontal: theme.spacing.xsmall,
  },
  commentsContainer: {
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    marginBottom: 10,
  },
  commentsTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  divider: {
    marginVertical: theme.spacing.medium,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  commentItem: {
    marginBottom: theme.spacing.medium,
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.medium,
  },
  commentHeader: {
    flexDirection: 'row',
    marginBottom: theme.spacing.small,
  },
  commentUserInfo: {
    marginLeft: theme.spacing.medium,
    justifyContent: 'center',
  },
  commentUserName: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  commentTimestamp: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textLight,
  },
  commentText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    lineHeight: 22,
  },
  noCommentsText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textLight,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: theme.spacing.large,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.medium,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    bottom: 43,
    left: 0,
    right: 0,
    ...theme.shadows.medium,
  },
  commentInput: {
    flex: 1,
    marginHorizontal: theme.spacing.medium,
    paddingHorizontal: theme.spacing.medium,
    paddingVertical: theme.spacing.small,
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.full,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledSendButton: {
    backgroundColor: theme.colors.disabled,
  },
});

export default ReportDetailScreen;