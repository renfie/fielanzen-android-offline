// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 René Fieler (RenFie)
//
// This program is free software under the GNU GPL v2.
// See LICENSE for the complete license text.

package de.fielanzen.offline;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.view.WindowManager;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** System-owned Android fingerprint / device-credential gate. Not a WebView PIN.
 * The enable flag is native, and the WebView must not load finance data before unlock.
 * This protects access to the app UI, not exported cleartext backups. */
@CapacitorPlugin(name = "FieLanzenAppLock")
public class FieLanzenAppLockPlugin extends Plugin {
    public static final String PREFS = "FieLanzenAppLock";
    public static final String ENABLED = "enabled";
    private boolean promptOpen = false;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
    private boolean enabled() { return prefs().getBoolean(ENABLED, false); }
    private JSObject status() { JSObject ret = new JSObject(); ret.put("enabled", enabled()); return ret; }
    private void updatePrivateWindow(boolean isEnabled) {
        getActivity().runOnUiThread(() -> {
            if (isEnabled) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        });
    }
    @PluginMethod public void getStatus(PluginCall call) {
        updatePrivateWindow(enabled()); call.resolve(status());
    }
    @PluginMethod public void authenticate(PluginCall call) {
        if (!enabled()) { JSObject ret = new JSObject(); ret.put("authenticated", true); call.resolve(ret); return; }
        verify(call, () -> {JSObject ret = new JSObject();ret.put("authenticated", true);call.resolve(ret);});
    }
    @PluginMethod public void setEnabled(PluginCall call) {
        Boolean newEnabled = call.getBoolean("enabled");
        if (newEnabled == null) { call.reject("App-Sperre: Einstellung fehlt."); return; }
        if (newEnabled == enabled()) { call.resolve(status()); return; }
        verify(call, () -> {
            if (!prefs().edit().putBoolean(ENABLED, newEnabled).commit()) {
                call.reject("Die Android-Sperre konnte nicht gespeichert werden."); return;
            }
            updatePrivateWindow(newEnabled);
            call.resolve(status());
        });
    }
    private synchronized boolean beginPrompt() {
        if (promptOpen) return false;
        promptOpen = true;return true;
    }
    private synchronized void endPrompt() { promptOpen = false; }
    private void verify(PluginCall call, Runnable afterSuccess) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            call.reject("Diese App-Sperre benötigt Android 11 oder neuer.");return;
        }
        final int authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG |
                BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        int readiness = BiometricManager.from(getContext()).canAuthenticate(authenticators);
        if (readiness != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("Keine sichere Android-Displaysperre verfügbar. Fingerabdruck oder Geräte-PIN zuerst unter Android einrichten.");return;
        }
        if (!beginPrompt()) {call.reject("Android-Entsperrung läuft bereits.");return;}
        getActivity().runOnUiThread(() -> {
            try {
                FragmentActivity activity = (FragmentActivity)getActivity();
                BiometricPrompt prompt = new BiometricPrompt(activity,
                    ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        endPrompt();afterSuccess.run();
                    }
                    @Override public void onAuthenticationError(int code, @NonNull CharSequence error) {
                        endPrompt();call.reject("Entsperrung abgebrochen oder fehlgeschlagen: " + error);
                    }
                    @Override public void onAuthenticationFailed() {
                        // Android keeps the system prompt open for another fingerprint try.
                    }
                });
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("FieLanzen entsperren")
                    .setSubtitle("Fingerabdruck oder Android-Geräte-PIN")
                    .setAllowedAuthenticators(authenticators).build();
                prompt.authenticate(info);
            } catch (Exception ex) {
                endPrompt();call.reject("Android-Entsperrdialog konnte nicht geöffnet werden: " + ex.getMessage());
            }
        });
    }
}
