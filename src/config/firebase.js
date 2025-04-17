import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID,
  GOOGLE_WEB_CLIENT_ID
} from '@env';

// Using environment variables for security
const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: FIREBASE_AUTH_DOMAIN,
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_APP_ID
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);

// Configure Google Sign In with proper error handling
try {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID, // This should match the client ID in Firebase console
    offlineAccess: true, // Changed back to true to ensure we get refresh token
    scopes: ['profile', 'email'],
  });
  console.log('GoogleSignin configured successfully');
} catch (error) {
  console.error('Error configuring GoogleSignin:', error);
}

// ✅ Initialize Auth with Persistent Storage
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Create Google Provider
const googleProvider = new GoogleAuthProvider();

// ✅ Initialize Firestore
const db = getFirestore(app);

// Add helper function for image processing
export const convertImageToBase64 = async (imageUri) => {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Get base64 string (remove the prefix data:image/jpeg;base64,)
        const base64data = reader.result.split(',')[1];
        resolve(base64data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw error;
  }
};

// Auth state listener - Only enable detailed logging in development
onAuthStateChanged(auth, (user) => {
  if (__DEV__) {
    if (user) {
      console.log('Firebase auth: User is signed in', user.uid);
    } else {
      console.log('Firebase auth: User is signed out');
    }
  }
});

// Export components
export { auth, db, googleProvider, app, GoogleSignin };

export default app;
