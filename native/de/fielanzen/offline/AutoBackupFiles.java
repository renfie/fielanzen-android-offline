// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

package de.fielanzen.offline;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.net.Uri;
import android.util.Base64;
import android.util.AtomicFile;

import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSObject;

import java.io.File;
import java.io.ByteArrayInputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.BufferedInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Comparator;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** A staged, validated gzip snapshot is copied to the user's SAF folder. No bank/network access. */
public final class AutoBackupFiles {
    private static final String PREFS = "fielanzen_auto_backup";
    private static final String FILE_NAME = "latest-financisto.backup";
    private static final String PREFIX = "FieLanzen-Financisto-";
    private static final int MAX_ARCHIVE = 30 * 1024 * 1024;
    private static final Object LOCK = new Object();

    private AutoBackupFiles() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static File staging(Context context) {
        return new File(context.getFilesDir(), FILE_NAME);
    }

    /** Alpha 13: treat old FieLanzen archives as a different format. Never
     * confuse a last-run timestamp from Alpha 12 with a compatible export.
     * Old backup files on disk are deliberately left untouched.
     */
    private static void ensureCompatibleFormat(Context context) {
        SharedPreferences p = prefs(context);
        if (p.getBoolean("financisto_format_v20", false)) return;
        // Old staged bytes from Alpha 12–19 must never be copied as a "fresh" backup.
        File old=staging(context);
        if(old.exists() && !old.delete()) throw new IllegalStateException("Veraltete Export-Zwischendatei kann nicht entfernt werden.");
        p.edit().putBoolean("financisto_format_v20", true)
            .remove("last_export_epoch").remove("last_export_at")
            .remove("last_export_name").remove("last_error")
            .apply();
    }

    static boolean hasFolder(Context context) {
        if ("downloads".equals(prefs(context).getString("destination", "downloads")))
            return DownloadsBackupFiles.supported();
        String raw = prefs(context).getString("tree", "");
        if (raw == null || raw.isEmpty()) return false;
        Uri chosen = Uri.parse(raw);
        for (UriPermission permission : context.getContentResolver().getPersistedUriPermissions()) {
            if (permission.getUri().equals(chosen) && permission.isWritePermission()) return true;
        }
        return false;
    }

    static JSObject status(Context context) {
        ensureCompatibleFormat(context);
        SharedPreferences p = prefs(context);
        JSObject out = new JSObject();
        boolean selected = hasFolder(context);
        out.put("selected", selected);
        String destination = p.getString("destination", "downloads");
        out.put("name", selected ? ("downloads".equals(destination) ? DownloadsBackupFiles.FOLDER_LABEL : p.getString("folder_label", "")) : "");
        out.put("destination", destination);
        out.put("lastExportAt", p.getString("last_export_at", ""));
        out.put("lastExportName", p.getString("last_export_name", ""));
        out.put("lastStagedAt", p.getString("last_stage_at", ""));
        out.put("lastError", p.getString("last_error", ""));
        out.put("enabled", p.getBoolean("enabled", false));
        out.put("frequency", p.getString("frequency", "daily"));
        out.put("time", p.getString("time", "03:00"));
        out.put("lastAutomaticAt", p.getString("last_auto_at", ""));
        out.put("lastAttemptAt", p.getString("last_auto_attempt_at", ""));
        long due=p.getLong("next_due_epoch", 0L);
        out.put("nextScheduledAt", p.getBoolean("enabled", false) && due>0 ? iso(due) : "");
        return out;
    }

    static void setFolder(Context context, Uri folder, String label) {
        prefs(context).edit().putString("tree", folder.toString()).putString("folder_label", label)
            .putString("destination", "tree").putString("last_error", "").apply();
    }

    static void useDownloads(Context context) throws IOException {
        if (!DownloadsBackupFiles.supported())
            throw new IOException("Die Sicherung in Downloads erfordert Android 10 oder neuer.");
        prefs(context).edit().putString("destination", "downloads")
            .putString("folder_label", DownloadsBackupFiles.FOLDER_LABEL)
            .putString("last_error", "").apply();
    }

    /** Validate actual gzip CONTENT, not only filename, extension or magic bytes.
     * This stops the legacy Alpha-18 staged archive from silently being emitted
     * with a new timestamp by WorkManager. Never log row values/PII.
     */
    static void validateArchive(byte[] zipped) throws IOException {
        if(zipped.length<20 || zipped.length>MAX_ARCHIVE || (zipped[0]&255)!=31 || (zipped[1]&255)!=139)
            throw new IOException("Ungültiger gzip-Financisto-Export.");
        boolean header=false, version=false, database=false, format=false, started=false, ended=false;
        boolean hasAccount=false, hasCurrency=false;
        String kind="";boolean hasId=false,hasName=false,hasTitle=false,hasSymbol=false;
        long chars=0;
        try(BufferedReader reader=new BufferedReader(new InputStreamReader(
            new GZIPInputStream(new ByteArrayInputStream(zipped)),StandardCharsets.UTF_8),65536)) {
            String line;
            while((line=reader.readLine())!=null){
                chars+=line.length()+1;
                if(chars>65L*1024L*1024L)throw new IOException("Entpackter Export überschreitet die Größenbegrenzung.");
                if(line.equals("PACKAGE:ru.orangesoftware.financisto"))header=true;
                if(line.equals("VERSION_CODE:117") && !started)version=true;
                if(line.equals("DATABASE_VERSION:217") && !started)database=true;
                if(line.equals("FIELANZEN_EXPORTER_VERSION:20") && !started)format=true;
                if(line.equals("#START")){started=true;continue;}
                if(line.equals("#END")){ended=true;continue;}
                if(line.startsWith("$ENTITY:")){
                    if(!kind.isEmpty())throw new IOException("Nicht abgeschlossener Financisto-Datensatz.");
                    kind=line.substring(8);hasId=false;hasName=false;hasTitle=false;hasSymbol=false;
                }else if(line.equals("$$")){
                    if(kind.equals("currency")){
                        if(!hasId||!hasName||!hasTitle||!hasSymbol)throw new IOException("Financisto-Währung enthält fehlende Pflichtfelder.");
                        hasCurrency=true;
                    }
                    if(kind.equals("account")){
                        if(!hasId||!hasTitle)throw new IOException("Financisto-Konto enthält fehlende Pflichtfelder.");
                        hasAccount=true;
                    }
                    kind="";
                }else if(!kind.isEmpty()){
                    int index=line.indexOf(':');
                    if(index>0 && index<line.length()-1){
                        String field=line.substring(0,index);
                        if(field.equals("_id"))hasId=true;
                        if(field.equals("name"))hasName=true;
                        if(field.equals("title"))hasTitle=true;
                        if(field.equals("symbol"))hasSymbol=true;
                    }
                }
            }
        }catch(java.util.zip.ZipException ex){throw new IOException("Beschädigte gzip-Sicherung.",ex);}
        if(!header||!version||!database||!format||!started||!ended||!kind.isEmpty()||!hasAccount||!hasCurrency)
            throw new IOException("Veraltete oder unvollständige Financisto-Sicherung. Aktuellen Export neu erzeugen.");
    }

    static int stage(Context context, String base64) throws IOException {
        ensureCompatibleFormat(context);
        if (base64 == null) throw new IOException("Sicherungsdaten fehlen.");
        synchronized (LOCK) {
            final byte[] bytes;
            try { bytes = Base64.decode(base64, Base64.DEFAULT); }
            catch (IllegalArgumentException error) { throw new IOException("Ungültige Sicherungsdaten.", error); }
            if (bytes.length < 20 || bytes.length > MAX_ARCHIVE || (bytes[0] & 255) != 31 || (bytes[1] & 255) != 139)
                throw new IOException("Sicherung ist keine gültige gzip-Datei oder zu groß.");
            validateArchive(bytes);
            // Replace atomically; WorkManager can only read a complete snapshot.
            AtomicFile target = new AtomicFile(staging(context));
            FileOutputStream out = null;
            try {
                out = target.startWrite();
                out.write(bytes);
                target.finishWrite(out);
            } catch (IOException error) {
                if (out != null) target.failWrite(out);
                throw error;
            }
            prefs(context).edit().putString("last_stage_at", time(System.currentTimeMillis())).putString("last_error", "").apply();
            return bytes.length;
        }
    }

    /** UTC ISO format for JS display; scheduling uses Android's LOCAL timezone. */
    static String iso(long milliseconds) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(milliseconds));
    }
    private static String time(long milliseconds) {return iso(milliseconds);}

    static long firstDue(long now, String hhmm) { return BackupSchedule.firstDue(now,hhmm); }

    private static boolean isDue(SharedPreferences prefs, long now) {
        long next=prefs.getLong("next_due_epoch",0L);
        return next>0L && now>=next;
    }

    static JSObject save(Context context, boolean force) throws IOException {
        ensureCompatibleFormat(context);
        synchronized (LOCK) {
            SharedPreferences p = prefs(context);
            long now = System.currentTimeMillis();
            if (!force && (!p.getBoolean("enabled", false) || !isDue(p, now))) return result(false, "", 0, p.getString("last_export_at", ""));
            if (!force) p.edit().putString("last_auto_attempt_at", iso(now)).apply();
            if (!hasFolder(context)) throw new IOException("Der Sicherungsordner ist nicht mehr freigegeben.");
            File source = staging(context);
            if (!source.isFile() || source.length() < 20L || source.length() > MAX_ARCHIVE)
                throw new IOException("Die lokale Sicherungskopie fehlt oder ist ungültig. App einmal starten.");
            // WorkManager cannot silently copy a staging file created with a prior exporter version.
            final byte[] verified;
            try(FileInputStream stream=new FileInputStream(source)){
                java.io.ByteArrayOutputStream buffer=new java.io.ByteArrayOutputStream((int)source.length());
                byte[] chunk=new byte[65536];int n;
                while((n=stream.read(chunk))>=0){buffer.write(chunk,0,n);if(buffer.size()>MAX_ARCHIVE)throw new IOException("Sicherungsdatei zu groß.");}
                verified=buffer.toByteArray();
            }
            validateArchive(verified);
            String stamp = new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss_SSS", Locale.ROOT).format(new Date(now));
            String filename = PREFIX + stamp + ".backup";
            int limit = Math.max(1, Math.min(50, p.getInt("keep", 7)));
            int deleted;
            if ("downloads".equals(p.getString("destination", "downloads"))) {
                deleted = DownloadsBackupFiles.save(context, source, filename, limit);
            } else {
            DocumentFile folder = DocumentFile.fromTreeUri(context, Uri.parse(p.getString("tree", "")));
            if (folder == null || !folder.isDirectory() || !folder.canWrite()) throw new IOException("Sicherungsordner ist nicht beschreibbar.");
            DocumentFile output = folder.createFile("application/octet-stream", filename);
            if (output == null) throw new IOException("Sicherungsdatei konnte im Zielordner nicht angelegt werden.");
            if (output.getName() == null || !output.getName().endsWith(".backup")) {
                output.delete();
                throw new IOException("Der gewählte Ordner hat die .backup-Dateiendung verändert.");
            }
            try (FileInputStream input = new FileInputStream(source);
                 OutputStream target = context.getContentResolver().openOutputStream(output.getUri(), "w")) {
                if (target == null) throw new IOException("Sicherungsordner erlaubt keinen Dateizugriff.");
                byte[] buffer = new byte[65536];
                int count;
                while ((count = input.read(buffer)) != -1) target.write(buffer, 0, count);
                target.flush();
            } catch (IOException error) {
                output.delete(); // Never leave a partial backup disguised as successful.
                throw error;
            }
            // Validate the stored bytes, not just a SAF provider's unreliable size metadata.
            try (InputStream original = new BufferedInputStream(new FileInputStream(source));
                 InputStream exported = new BufferedInputStream(context.getContentResolver().openInputStream(output.getUri()))) {
                int value;
                while ((value = original.read()) != -1)
                    if (exported.read() != value) throw new IOException("Sicherung im Zielordner weicht vom Original ab.");
                if (exported.read() != -1) throw new IOException("Exportierte Sicherung ist unerwartet länger.");
            } catch (IOException | NullPointerException error) {
                output.delete();
                throw new IOException("Sicherungsdatei konnte nicht verifiziert werden.", error);
            }
            // Retain only OUR filename pattern, never other user files.
            DocumentFile[] old = folder.listFiles();
            DocumentFile[] managed = Arrays.stream(old)
              .filter(f -> f.isFile() && f.getName() != null && f.getName().startsWith(PREFIX) && f.getName().endsWith(".backup"))
              .sorted(Comparator.comparing(DocumentFile::getName).reversed()).toArray(DocumentFile[]::new);
            int treeDeleted = 0;
            for (int i = limit; i < managed.length; i++) if (managed[i].delete()) treeDeleted++;
            deleted = treeDeleted;
            }
            String completed = time(now);
            SharedPreferences.Editor update=p.edit().putLong("last_export_epoch", now)
                .putString("last_export_at", completed).putString("last_export_name", filename)
                .putString("last_error", "");
            if (!force) {
                long previousTarget=p.getLong("next_due_epoch", 0L);
                long anchor=previousTarget>0L ? previousTarget : now;
                String frequency=p.getString("frequency","daily");
                String localTime=p.getString("time","03:00");
                update.putLong("last_auto_epoch", now).putString("last_auto_at", iso(now))
                    .putLong("next_due_epoch", BackupSchedule.followingDue(anchor,now,frequency,localTime,p.getInt("month_anchor_day",BackupSchedule.anchorDay(anchor))));
            }
            update.apply();
            return result(true, filename, deleted, completed);
        }
    }

    static void setError(Context context, String error) {
        prefs(context).edit().putString("last_error", error == null ? "Unbekannter Fehler" : error).apply();
    }

    private static JSObject result(boolean written, String name, int deleted, String at) {
        JSObject result = new JSObject();
        result.put("written", written);
        result.put("name", name);
        result.put("deleted", deleted);
        result.put("lastExportAt", at);
        return result;
    }
}
