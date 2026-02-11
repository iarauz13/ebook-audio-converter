import * as ExpoHaptics from 'expo-haptics';

export const Haptics = {
  light: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light),
  medium: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium),
  heavy: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy),
  success: () => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success),
  warning: () => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning),
  error: () => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error),
};
