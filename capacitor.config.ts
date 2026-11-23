// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

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
