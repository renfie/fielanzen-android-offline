package de.fielanzen.offline;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "FieLanzenAutoBackup")
public class FieLanzenAutoBackupPlugin extends Plugin {
    private static final String TAG = "FieLanzenBackup";
    private static final String JOB = "FieLanzenOfflineDailyBackupCheck";

    @PluginMethod public void getStatus(PluginCall call) {
        try {call.resolve(AutoBackupFiles.status(getContext()));}
        catch(RuntimeException error) {call.reject("Sicherungsstatus konnte nicht gelesen werden: "+error.getClass().getSimpleName());}
    }

    @PluginMethod public void selectFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        // Capacitor registers the ActivityResult callback via @ActivityCallback.
        // No UI-thread wrapper: Capacitor's launcher owns its lifecycle/thread.
        try {
            Log.i(TAG, "ACTION_OPEN_DOCUMENT_TREE launch requested");
            startActivityForResult(call, intent, "folderChosen");
        } catch (RuntimeException error) {
            Log.e(TAG, "Folder picker launch failed", error);
            call.reject("Android-Ordnerauswahl konnte nicht geöffnet werden: " + error.getClass().getSimpleName() + ": " + error.getMessage(), null, error);
        }
    }

    @ActivityCallback private void folderChosen(PluginCall call, ActivityResult result) {
        Log.i(TAG, "ACTION_OPEN_DOCUMENT_TREE callback received");
        if (call == null) {Log.e(TAG, "Picker callback without original call"); return;}
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Ordnerauswahl abgebrochen."); return;
        }
        Intent data = result.getData();
        Uri uri = data.getData();
        if (uri == null) {call.reject("Es wurde kein Ordner ausgewählt."); return;}
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            androidx.documentfile.provider.DocumentFile folder = androidx.documentfile.provider.DocumentFile.fromTreeUri(getContext(), uri);
            if (folder == null || !folder.isDirectory() || !folder.canWrite()) {
                call.reject("Der ausgewählte Ordner ist nicht beschreibbar."); return;
            }
            AutoBackupFiles.setFolder(getContext(), uri, folder.getName() == null ? "Gewählter Ordner" : folder.getName());
            call.resolve(AutoBackupFiles.status(getContext()));
        } catch (RuntimeException error) {
            Log.e(TAG, "Picker result processing failed", error);
            call.reject("Der gewählte Ordner konnte nicht freigegeben werden: " + error.getMessage(), null, error);
        }
    }

    @PluginMethod public void useDownloadsFolder(PluginCall call) {
        try {
            AutoBackupFiles.useDownloads(getContext());
            call.resolve(AutoBackupFiles.status(getContext()));
        } catch (IOException | RuntimeException error) {
            Log.e(TAG, "Downloads destination failed", error);
            call.reject("Der Downloads-Ordner konnte nicht verwendet werden: " + error.getMessage(), null, error);
        }
    }

    @PluginMethod public void configure(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        String frequency = call.getString("frequency", "daily");
        String localTime = call.getString("time", "03:00");
        Integer keep = call.getInt("keep", 7);
        if (!"daily".equals(frequency) && !"weekly".equals(frequency) && !"monthly".equals(frequency)) {
            call.reject("Ungültiges Sicherungsintervall."); return;
        }
        if (localTime == null || !localTime.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]")) {
            call.reject("Ungültige Sicherungszeit (HH:mm)."); return;
        }
        if (keep == null || keep < 1 || keep > 50) {call.reject("Ungültige Aufbewahrungsanzahl."); return;}
        if (enabled && !AutoBackupFiles.hasFolder(getContext())) {
            call.reject("Bitte zuerst einen dauerhaften Sicherungsordner auswählen."); return;
        }
        android.content.SharedPreferences prefs = AutoBackupFiles.prefs(getContext());
        boolean wasEnabled = prefs.getBoolean("enabled", false);
        boolean changed = !wasEnabled || !frequency.equals(prefs.getString("frequency", "daily"))
                || !localTime.equals(prefs.getString("time", "03:00"))
                || prefs.getLong("next_due_epoch", 0L) <= 0L;
        long due = changed ? AutoBackupFiles.firstDue(System.currentTimeMillis(), localTime)
                           : prefs.getLong("next_due_epoch", 0L);
        prefs.edit().putBoolean("enabled", enabled).putString("frequency", frequency)
                .putString("time", localTime).putInt("keep", keep)
                .putLong("next_due_epoch", enabled ? due : 0L)
                .putInt("month_anchor_day",changed ? BackupSchedule.anchorDay(due) : prefs.getInt("month_anchor_day",BackupSchedule.anchorDay(due))).apply();
        WorkManager manager = WorkManager.getInstance(getContext());
        if (enabled) {
            // This is a TARGET time, never a guarantee of exact execution (Doze/WorkManager).
            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(AutoBackupWorker.class, 24, TimeUnit.HOURS)
                .setInitialDelay(Math.max(0L, due - System.currentTimeMillis()), TimeUnit.MILLISECONDS).build();
            manager.enqueueUniquePeriodicWork(JOB, changed
                    ? ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE : ExistingPeriodicWorkPolicy.KEEP, request);
        } else {
            manager.cancelUniqueWork(JOB);
        }
        JSObject response = new JSObject();
        response.put("enabled", enabled);
        response.put("nextScheduledAt", enabled ? AutoBackupFiles.iso(due) : "");
        call.resolve(response);
    }

    @PluginMethod public void runDueNow(PluginCall call) {
        try { call.resolve(AutoBackupFiles.save(getContext(), false)); }
        catch (IOException | RuntimeException error) {
            Log.e(TAG, "Catch-up backup failed", error);
            AutoBackupFiles.setError(getContext(), error.getMessage());
            call.reject("Nachholsicherung fehlgeschlagen: " + error.getMessage(), null, error);
        }
    }

    @PluginMethod public void stageBackup(PluginCall call) {
        String base64 = call.getString("base64", null);
        try {
            int bytes = AutoBackupFiles.stage(getContext(), base64);
            JSObject result = Boolean.TRUE.equals(call.getBoolean("stageOnly", false))
                ? new JSObject() : AutoBackupFiles.save(getContext(), false);
            result.put("bytes", bytes);
            call.resolve(result);
        } catch (IOException | RuntimeException error) {
            Log.e(TAG, "Stage failed", error);
            AutoBackupFiles.setError(getContext(), error.getMessage());
            call.reject("Automatische Sicherung fehlgeschlagen: " + error.getMessage(), null, error);
        }
    }

    @PluginMethod public void writeNow(PluginCall call) {
        try {call.resolve(AutoBackupFiles.save(getContext(), true));}
        catch (IOException | RuntimeException error) {
            Log.e(TAG, "Write failed", error);
            AutoBackupFiles.setError(getContext(), error.getMessage());
            call.reject("Sicherung fehlgeschlagen: " + error.getMessage(), null, error);
        }
    }
}
