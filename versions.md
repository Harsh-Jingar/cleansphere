# CleanSphere Version Control

## Version: v1.1.0-instagram-profile (April 4, 2025)

### Status: Stable - Working Build

### Changes:
- Enhanced ProfileScreen with Instagram-like interface
- Added profile editing capabilities with photo upload
- Added user statistics and impact scoring
- Added interests tags system
- Improved theme implementation for better stability
- Fixed theme import issues and added fallback values
- Added proper logout flow with confirmation

### Files Modified:
- src/screens/ProfileScreen.js (major redesign)
- src/contexts/AuthContext.js (added updateUserProfile function)
- App.js (improved theme loading)
- Package additions:
  - Added react-native-image-picker for photo upload
  - Using @react-native-firebase/storage for image storage

### Dependencies Added:
- react-native-image-picker
- @react-native-firebase/storage

### Rollback Instructions:
If you need to revert to this version:

1. For JavaScript files:
   - Restore ProfileScreen.js, AuthContext.js, and App.js from backup
   - Make sure dependencies are installed (run `npm install react-native-image-picker @react-native-firebase/storage`)

### Notes:
- The app now has an Instagram-style profile with grid/list view toggle
- Users can edit their profiles and upload photos
- Community features include interests tags, impact scores, and user level
- Fixed theme loading issues for better app stability

---

## Version: v1.0.0-green-theme (April 4, 2025)

### Status: Stable - Working Build

### Changes:
- Added green theme system in `src/theme/theme.js`
- Updated App.js to use theme with react-native-paper
- Applied theme to HomeScreen, LoginScreen, and ProfileScreen
- Fixed Android XML files:
  - Created proper colors.xml with green theme colors
  - Updated styles.xml to use green theme in native elements
  - Fixed background_splash.xml for splash screen

### Files Modified:
- src/theme/theme.js (created)
- App.js
- src/screens/HomeScreen.js
- src/screens/LoginScreen.js
- src/screens/ProfileScreen.js
- android/app/src/main/res/values/colors.xml
- android/app/src/main/res/values/styles.xml
- android/app/src/main/res/drawable/background_splash.xml

### Rollback Instructions:
If you need to revert to this version:

1. For JavaScript files:
   - Restore App.js, HomeScreen.js, LoginScreen.js, and ProfileScreen.js from backup
   - Delete the src/theme/theme.js file if you want to completely remove the theme system

2. For Android files:
   - Restore the previous versions of:
     - android/app/src/main/res/values/colors.xml
     - android/app/src/main/res/values/styles.xml
     - android/app/src/main/res/drawable/background_splash.xml

### Notes:
- The app has a light green theme applied consistently across all screens
- Android native elements (status bar, navigation bar) are themed to match
- Splash screen uses the same green theme colors