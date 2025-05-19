# CleanSphere - Urban Cleanliness Tracker
<p align="center">
<img src="https://github.com/Harsh-Jingar/cleansphere/blob/main/src/assets/logo.jpg" height="300" width="300">
</p>

## Overview

CleanSphere is a comprehensive React Native mobile application designed to facilitate community involvement in urban cleanliness initiatives. The platform connects residents and municipal authorities, allowing users to report, track, and resolve cleanliness issues in their communities.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [User Roles](#user-roles)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Authentication](#authentication)
- [Screens](#screens)
- [Data Management](#data-management)
- [Offline Support](#offline-support)
- [License](#license)

## Features

### Core Features

1. **User Authentication**
   - Email/password login and registration
   - Google Sign-In integration (for residents)
   - Secure authentication with Firebase Auth
   - Persistent login state

2. **Reporting System**
   - Photo-based issue reporting
   - Automatic location detection
   - Detailed issue description
   - Real-time status tracking

3. **Community Engagement**
   - Report likes and comments
   - User profiles with impact scores
   - Follow/unfollow other users
   - Activity feed of reports

4. **Municipal Dashboard**
   - Dedicated interface for authority users
   - Report management and resolution
   - Before/after image documentation
   - Geographical area management

5. **Notification System**
   - Real-time notifications for report status changes
   - Comment notifications
   - Like notifications
   - Follow notifications

6. **User Profiles**
   - Impact score tracking based on resolved reports
   - User level progression system
   - Report history with grid and list views
   - Profile customization (bio, avatar, location)

7. **Location Services**
   - GPS-based location detection
   - Reverse geocoding for human-readable addresses
   - Map-based report visualization

8. **Offline Support**
   - Network status detection
   - Graceful degradation for offline users
   - Data synchronization when back online

## Technology Stack

- **Frontend**: React Native (v0.78.2)
- **UI Components**: React Native Paper, React Native Vector Icons
- **Navigation**: React Navigation (v7.x)
- **State Management**: React Context API
- **Backend/Database**: Firebase Firestore
- **Authentication**: Firebase Authentication
- **Storage**: Firebase Storage
- **Location Services**: React Native Geolocation Service, Nominatim API
- **Media Handling**: React Native Image Crop Picker, React Native Vision Camera
- **Data Persistence**: WatermelonDB, AsyncStorage

## User Roles

### Resident Users
- Create and submit reports about cleanliness issues
- Like and comment on reports
- Follow other users and municipal authorities
- Track personal impact score and level progression

### Municipal Authority Users
- Access dedicated dashboard for issue management
- Mark reports as resolved with documentation
- Upload "after" images showing resolved issues
- Manage assigned zones and responsibilities

## Installation

### Prerequisites
- Node.js ≥ 18
- React Native CLI
- Android Studio (for Android development)
- Xcode (for iOS development)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/your-username/cleansphere.git
cd cleansphere
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (.env file):
```
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_auth_domain
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
FIREBASE_APP_ID=your_app_id
GOOGLE_WEB_CLIENT_ID=your_google_web_client_id
```

4. Start the Metro bundler:
```bash
npm start
```

5. Build and run on Android:
```bash
npm run android
```

6. Build and run on iOS:
```bash
cd ios && pod install
cd ..
npm run ios
```

## Project Structure

```
cleansphere/
├── src/
│   ├── assets/             # Images and static resources
│   ├── config/             # Configuration files (Firebase setup)
│   ├── contexts/           # React Context providers
│   ├── navigation/         # Navigation configuration
│   ├── screens/            # UI screens
│   ├── theme/              # Theme configuration
│   └── utils/              # Utility functions
├── android/                # Android-specific files
├── ios/                    # iOS-specific files
└── package.json            # Project dependencies
```

## Authentication

CleanSphere offers multiple authentication methods:

1. **Email/Password**: Traditional authentication for both resident and municipal users
2. **Google Sign-In**: Social authentication option for resident users only
3. **Municipal Authority**: Special authentication flow for verified municipal authorities

Authentication state is persisted using AsyncStorage to provide a seamless user experience between app launches.

## Screens

### For All Users
- **LoginScreen**: User authentication with email/password or Google
- **SignUpScreen**: New user registration
- **HomeScreen**: Feed of reports with filtering options
- **ReportDetailScreen**: Detailed view of a report with comments
- **ProfileScreen**: User profile with reports and statistics
- **UserProfileScreen**: View other users' profiles
- **NotificationsScreen**: All user notifications

### For Resident Users
- **ReportScreen**: Create new cleanliness reports with photos and location
- **EditProfileScreen**: Update user profile information

### For Municipal Users
- **ReportActionScreen**: Upload resolution evidence for reports
- **Municipal Dashboard**: (Integrated in HomeScreen) Special view for authorities

## Data Management

CleanSphere uses Firebase Firestore as its primary database with the following collections:

- **users**: User profile information
- **municipal_authorities**: Municipal authority details
- **reports**: Cleanliness reports with details
- **comments**: Comments on reports (subcollection)
- **notifications**: User notifications (subcollection)

## Offline Support

The app includes a NetworkContext provider that monitors network connectivity status and enables:

- Visual indicators when offline
- Graceful error handling for failed operations
- Ability to view cached data when offline
- Automatic retries when connection is restored

## Team Members:

| S.No. | Name | Role | GitHub Username:octocat: |
| --------------- | --------------- | --------------- | --------------- |
| 1. | Harsh Jingar | Backend (React-native + firebase) | [@Harsh-Jingar](https://github.com/Harsh-Jingar)  |
| 2. | Harsh Chauhan | Frontend Development | [@GitHarsh1511](https://github.com/GitHarsh1511) |
| 3. | Divyesh kariya  | Ui/Ux Development | [@kariya2qr](https://github.com/kariya2qr) |

## Maintainers✨

<table>
  <tbody><tr>
    <td align="center"><a href="https://github.com/Harsh-Jingar"><img alt="" src="https://avatars.githubusercontent.com/Harsh-Jingar" width="100px;"><br><sub><b>Harsh Jingar</b></sub></a><br><a href="https://github.com/Harsh-Jingar/cleansphere" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/GitHarsh1511"><img alt="" src="https://avatars.githubusercontent.com/GitHarsh1511" width="100px;"><br><sub><b>Harsh Chauhan</b></sub></a><br><a href="https://github.com/Harsh-Jingar/cleansphere" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/kariya2qr"><img alt="" src="https://avatars.githubusercontent.com/kariya2qr" width="100px;"><br><sub><b>Divyesh Kariya</b></sub></a><br><a href="https://github.com/Harsh-Jingar/cleansphere" title="Code">💻</a></td>
  </tr>
</tbody></table>

## License

This project is licensed under the MIT License - see the <a href="https://github.com/Harsh-Jingar/cleansphere?tab=MIT-1-ov-file" >MIT LICENSE</a> for details.

---

© 2025 CleanSphere. All rights reserved.
