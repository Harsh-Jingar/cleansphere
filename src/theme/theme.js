/**
 * CleanSphere App Theme
 * A light green theme for environmental focus
 */

export const theme = {
  colors: {
    // Primary palette
    primary: '#4CAF50',       // Main green
    primaryLight: '#81C784',  // Light green
    primaryDark: '#388E3C',   // Dark green
    
    // Secondary colors
    secondary: '#8BC34A',     // Light green
    secondaryLight: '#AED581', // Very light green
    secondaryDark: '#689F38', // Darker green
    
    // Accent colors
    accent: '#009688',        // Teal
    accentLight: '#4DB6AC',   // Light teal
    
    // Functional colors
    success: '#66BB6A',       // Success green
    warning: '#FFB74D',       // Warning orange
    error: '#EF5350',         // Error red
    info: '#42A5F5',          // Info blue
    
    // Background colors
    background: '#F1F8E9',    // Very light green background
    card: '#E8F5E9',          // Card background
    surface: '#FFFFFF',       // White surface
    surfaceVariant: '#F5F5F5', // Light grey surface
    
    // Text colors
    text: '#2E2E2E',          // Almost black
    textLight: '#757575',     // Medium grey
    textMuted: '#9E9E9E',     // Light grey
    textInverted: '#FFFFFF',  // White text
    
    // Border colors
    border: '#DCEDC8',        // Very light green border
    divider: '#E0E0E0',       // Light grey divider
    
    // Additional UI colors  
    disabled: '#BDBDBD',      // Disabled grey
    highlight: '#C8E6C9',     // Highlight green
    ripple: 'rgba(76, 175, 80, 0.2)', // Ripple effect color
  },
  
  // Typography
  typography: {
    fontSize: {
      xs: 12,
      small: 14,
      medium: 16,
      large: 18,
      xl: 20,
      xxl: 24,
      xxxl: 32,
    },
    fontWeight: {
      light: '300',
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },
  
  // Spacing
  spacing: {
    xs: 4,
    small: 8,
    medium: 16,
    large: 24,
    xl: 32,
    xxl: 48,
  },
  
  // Border radius
  borderRadius: {
    xs: 2,
    small: 4,
    medium: 8, 
    large: 12,
    xl: 16,
    round: 1000, // For circular elements
  },
  
  // Shadows
  shadows: {
    small: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.18,
      shadowRadius: 1,
      elevation: 1,
    },
    medium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
      elevation: 3,
    },
    large: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius: 5,
      elevation: 6,
    },
  },
};

// Common styles that can be reused throughout the app
export const commonStyles = {
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  section: {
    margin: theme.spacing.medium,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.medium,
    ...theme.shadows.small,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centeredContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.small,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: theme.spacing.medium,
    fontSize: theme.typography.fontSize.medium,
  },
  // Text styles
  title: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  bodyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  caption: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textLight,
  },
  // Button styles
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: theme.colors.textInverted,
    fontWeight: theme.typography.fontWeight.medium,
    fontSize: theme.typography.fontSize.medium,
  },
};

export default theme;