import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.fielanzen.offline',
  appName: 'FieLanzen Offline',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: { CapacitorSQLite: { androidIsEncryption: false } }
};
export default config;
