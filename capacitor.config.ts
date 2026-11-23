import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.fielanzen.offline',
  appName: 'FieLanzen Offline',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    CapacitorSQLite: { androidIsEncryption: false },
    // Native MainActivity owns status bar/cutout/navigation/IME insets.
    // Capacitor must not set a second inset listener/padding.
    SystemBars: { insetsHandling: 'disable', style: 'DARK', hidden: false }
  }
};
export default config;
