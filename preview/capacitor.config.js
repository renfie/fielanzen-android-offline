const config = {
    appId: 'de.fielanzen.offline',
    appName: 'FieLanzen Offline',
    webDir: 'dist',
    android: { allowMixedContent: false },
    plugins: { CapacitorSQLite: { androidIsEncryption: false } }
};
export default config;
