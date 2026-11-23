// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { target: 'es2022' } });
