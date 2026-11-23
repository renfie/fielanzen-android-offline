// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

package de.fielanzen.offline;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.IOException;

/** Best-effort Android schedule: Doze can delay execution. The file is the most recently staged SQLite snapshot (updated after every mutation). */
public class AutoBackupWorker extends Worker {
    public AutoBackupWorker(@NonNull Context appContext, @NonNull WorkerParameters workerParams) {
        super(appContext, workerParams);
    }
    @NonNull @Override public Result doWork() {
        try {
            AutoBackupFiles.save(getApplicationContext(), false);
            return Result.success();
        } catch (IOException | SecurityException error) {
            AutoBackupFiles.setError(getApplicationContext(), error.getMessage());
            return Result.retry();
        }
    }
}
