// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

package de.fielanzen.offline;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Android 10+ fallback: app-owned, user-visible backups in Downloads/FieLanzen.
 * Does not require broad storage permissions and survives app uninstallation.
 */
final class DownloadsBackupFiles {
    static final String FOLDER_LABEL = "Downloads/FieLanzen";
    private static final String FOLDER_PATH = Environment.DIRECTORY_DOWNLOADS + "/FieLanzen/";
    private static final String PREFIX = "FieLanzen-Financisto-";
    private static final String SUFFIX = ".backup";
    private DownloadsBackupFiles() {}

    static boolean supported() { return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q; }

    static int save(Context context, File source, String filename, int keep) throws IOException {
        if (!supported()) throw new IOException("Der feste Downloads-Ordner erfordert Android 10 oder neuer.");
        ContentResolver resolver = context.getContentResolver();
        Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, "application/octet-stream");
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, FOLDER_PATH);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        final Uri uri;
        try { uri = resolver.insert(collection, values); }
        catch (RuntimeException error) { throw new IOException("MediaStore konnte die Datei nicht anlegen (" + error.getClass().getSimpleName() + "): " + error.getMessage(), error); }
        if (uri == null) throw new IOException("Android konnte keine Sicherung unter Downloads/FieLanzen anlegen.");
        boolean completed = false;
        try {
            try (InputStream input = new FileInputStream(source);
                 OutputStream output = resolver.openOutputStream(uri, "w")) {
                if (output == null) throw new IOException("Downloads-Datei ist nicht beschreibbar.");
                byte[] buffer = new byte[65536]; int n;
                while ((n = input.read(buffer)) != -1) output.write(buffer, 0, n);
                output.flush();
            }
            try (InputStream original = new FileInputStream(source);
                 InputStream written = resolver.openInputStream(uri)) {
                if (written == null) throw new IOException("Downloads-Datei konnte nicht gelesen werden.");
                byte[] a = new byte[65536], b = new byte[65536]; int n;
                while ((n = original.read(a)) != -1) {
                    int read = 0;
                    while (read < n) {
                        int k = written.read(b, read, n - read);
                        if (k < 0) throw new IOException("Sicherung im Downloads-Ordner ist unvollständig.");
                        read += k;
                    }
                    for (int i = 0; i < n; i++) if (a[i] != b[i]) throw new IOException("Downloads-Sicherung weicht ab.");
                }
                if (written.read() != -1) throw new IOException("Downloads-Sicherung ist unerwartet länger.");
            }
            ContentValues publish = new ContentValues();
            publish.put(MediaStore.MediaColumns.IS_PENDING, 0);
            if (resolver.update(uri, publish, null, null) < 1)
                throw new IOException("Android konnte die Sicherungsdatei nicht veröffentlichen.");
            completed = true;
        } catch (RuntimeException error) {
            throw new IOException("Android-Downloads-Schreibfehler (" + error.getClass().getSimpleName() + "): " + error.getMessage(), error);
        } finally {
            if (!completed) {
                try {resolver.delete(uri, null, null);} catch (RuntimeException ignored) { /* preserve original failure */ }
            }
        }
        // Cleanup only this app's files, inside its own subfolder and matching its prefix.
        List<Stored> owned = new ArrayList<>();
        String[] columns = {MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.OWNER_PACKAGE_NAME};
        try (Cursor cursor = resolver.query(collection, columns,
                MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?",
                new String[]{FOLDER_PATH, PREFIX + "%"}, null)) {
            if (cursor != null) while (cursor.moveToNext()) {
                String name = cursor.getString(1), owner = cursor.getString(2);
                if (name != null && name.startsWith(PREFIX) && name.endsWith(SUFFIX)
                        && context.getPackageName().equals(owner)) {
                    owned.add(new Stored(name, Uri.withAppendedPath(collection, String.valueOf(cursor.getLong(0)))));
                }
            }
        } catch (RuntimeException error) {
            // A backup was created and validated. If the media provider refuses a listing,
            // keep the backup and skip pruning rather than reporting data loss.
            return 0;
        }
        owned.sort(Comparator.comparing((Stored entry) -> entry.name).reversed());
        int deleted = 0;
        for (int i = Math.max(1, keep); i < owned.size(); i++) {
            try { if (resolver.delete(owned.get(i).uri, null, null) > 0) deleted++; }
            catch (RuntimeException ignored) { /* never delete more broadly */ }
        }
        return deleted;
    }

    private static final class Stored {
        final String name; final Uri uri;
        Stored(String name, Uri uri) { this.name = name; this.uri = uri; }
    }
}
