// src/contexts/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import { auth, db, GoogleSignin, app } from '../config/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  signInWithCredential, 
  GoogleAuthProvider,
  updateProfile 
} from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import appEvents, { APP_EVENTS } from '../utils/events';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('resident'); // 'resident' or 'municipal'

  // Check if the current user is a municipal authority
  const checkIsMunicipalUser = async (uid) => {
    try {
      // First check if user exists in municipal_authorities collection
      const municipalRef = collection(db, 'municipal_authorities');
      const q = query(municipalRef, where('uid', '==', uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setUserRole('municipal');
        return true;
      }
      
      // Also check if user has isMunicipalAuthority flag in users collection
      const userDocRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        if (userDoc.data().isMunicipalAuthority === true || userDoc.data().userRole === 'municipal') {
          setUserRole('municipal');
          return true;
        }
      }
      
      setUserRole('resident');
      return false;
    } catch (error) {
      console.error("Error checking municipal status:", error);
      // Default to resident on error
      setUserRole('resident');
      return false;
    }
  };

  // Monitor Auth State Changes
  useEffect(() => {
    // Check if Firebase is initialized
    if (!app) {
      console.error("Firebase app is not initialized!");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Check if the user is a municipal authority
        await checkIsMunicipalUser(firebaseUser.uid);
      } else {
        setUser(null);
        setUserRole('resident'); // Reset role when logged out
      }
      
      setLoading(false);
    });
    
    return unsubscribe;
  }, []);

  // Email & Password Sign-In
  const signIn = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setUser(userCredential.user);
      // Check if the user is a municipal authority
      await checkIsMunicipalUser(userCredential.user.uid);
    } catch (error) {
      throw new Error(error.message);
    }
  };

  // Municipal Authority Authentication
  const checkMunicipalAuth = async (email, password) => {
    try {
      // Step 1: Check if email exists in municipal_authorities collection
      const municipalRef = collection(db, 'municipal_authorities');
      const q = query(municipalRef, where('email', '==', email));
      
      const querySnapshot = await getDocs(q).catch(error => {
        throw new Error('Error checking municipal credentials: ' + error.message);
      });
      
      if (querySnapshot.empty) {
        throw new Error('No municipal authority account found with this email');
      }
      
      // Step 2: Try to sign in with email/password for verification
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Step 3: If successful, update the user role
      const municipalData = querySnapshot.docs[0].data();
      
      // Update the municipal_authorities document with the user's UID if it's not already there
      if (!municipalData.uid) {
        const municipalDocRef = querySnapshot.docs[0].ref;
        await municipalDocRef.update({
          uid: user.uid
        });
      }
      
      // Make sure the user document has the required fields for municipal authority
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        // Update existing user document with municipal authority flags
        await updateDoc(userDocRef, {
          isMunicipalAuthority: true,
          userRole: 'municipal'
        });
      } else {
        // Create a new user document with municipal authority flags
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || email.split('@')[0],
          isMunicipalAuthority: true,
          userRole: 'municipal',
          createdAt: serverTimestamp(),
          // Initialize followers and following arrays
          followers: [],
          following: []
        });
      }
      
      setUserRole('municipal');
      setUser(user);
      
      // Return the municipal user data
      return {
        ...municipalData,
        id: querySnapshot.docs[0].id
      };
    } catch (error) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        throw new Error('Invalid email or password');
      }
      throw new Error(error.message || 'Authentication failed');
    }
  };

  // Email & Password Sign-Up
  const signUp = async (email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      setUser(userCredential.user);
      setUserRole('resident');
    } catch (error) {
      throw new Error(error.message);
    }
  };

  // Google Sign-In
  const googleSignIn = async () => {
    try {
      // Make sure Google Play Services are available
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      
      // Force sign out first to ensure fresh tokens
      try {
        await GoogleSignin.signOut();
      } catch (signOutError) {
        // Ignore any sign out errors
        console.log('Pre-signin signout step:', signOutError);
      }
      
      // Sign in with Google
      const userInfo = await GoogleSignin.signIn();
      console.log('Google Sign-In success, user info:', JSON.stringify({
        name: userInfo.user?.name,
        email: userInfo.user?.email,
        hasIdToken: !!userInfo.idToken
      }));
      
      // Direct Firebase authentication
      if (userInfo.idToken) {
        // Create a Google credential with the ID token
        const googleCredential = GoogleAuthProvider.credential(userInfo.idToken);
        
        // Sign in with the credential
        const result = await signInWithCredential(auth, googleCredential);
        setUser(result.user);
        setUserRole('resident');
        
        // Return the user result
        return result;
      } else {
        // If we don't have an ID token, try a different approach
        console.log('No ID token in initial sign-in response, trying to get current user');
        
        // Try to get the current user's ID token
        const currentUser = await GoogleSignin.getCurrentUser();
        if (currentUser && currentUser.idToken) {
          const googleCredential = GoogleAuthProvider.credential(currentUser.idToken);
          const result = await signInWithCredential(auth, googleCredential);
          setUser(result.user);
          setUserRole('resident');
          return result;
        }
        
        throw new Error('Could not retrieve ID token from Google');
      }
    } catch (error) {
      console.error('Detailed Google Sign-In Error:', error);
      
      // Check if the error is related to the webClientId
      if (error.message && error.message.includes('DEVELOPER_ERROR')) {
        console.error('Please verify your webClientId in .env file and SHA-1 certificate in Firebase console');
      }
      
      // Provide more specific error messages based on error code
      if (error.code === 'SIGN_IN_CANCELLED') {
        throw new Error('Sign in was cancelled');
      } else if (error.code === 'SIGN_IN_REQUIRED') {
        throw new Error('Sign in is required');
      } else if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        throw new Error('Play services not available or outdated');
      } else if (error.code === 'DEVELOPER_ERROR') {
        throw new Error('Google Sign-In configuration error. Verify webClientId and SHA certificate');
      } else if (error.code === 'auth/argument-error') {
        throw new Error('Authentication error with Google credentials. Please try again.');
      } else {
        throw new Error(error.message || 'Unknown error occurred during Google Sign-In');
      }
    }
  };

  // Update user profile (display name and photo URL)
  const updateUserProfile = async (profileData) => {
    try {
      if (!auth.currentUser) {
        throw new Error('No authenticated user found');
      }
      
      // Make sure photoURL isn't a base64 string (which would be too long)
      if (profileData.photoURL && profileData.photoURL.length > 500) {
        delete profileData.photoURL;
      }
      
      await updateProfile(auth.currentUser, profileData);
      
      // Update local user state to reflect changes
      setUser({ ...auth.currentUser });
      
      return true;
    } catch (error) {
      throw error;
    }
  };

  // Sign-Out
  const signOutUser = async () => {
    try {
      // Emit sign out event BEFORE signing out
      appEvents.emit(APP_EVENTS.SIGN_OUT);
      
      // Small delay to allow listeners to clean up
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Sign out from Firebase
      await firebaseSignOut(auth);
      
      // Try to sign out from Google if available
      try {
        // Attempt to sign out from Google without checking isSignedIn first
        await GoogleSignin.signOut().catch(() => {
          console.log('Google sign-out failed, but continuing with Firebase sign-out');
        });
      } catch (googleError) {
        console.log('Error during Google sign-out:', googleError);
        // Don't throw error for Google sign-out issues
      }
      
      setUser(null);
      setUserRole('resident');
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      userRole,
      signIn, 
      signUp, 
      signOut: signOutUser, 
      googleSignIn,
      checkMunicipalAuth,
      updateUserProfile 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to use Auth Context
export const useAuth = () => useContext(AuthContext);

export default AuthContext;
