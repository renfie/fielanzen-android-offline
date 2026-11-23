package de.fielanzen.offline;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Dedicated encrypted storage for the Dashboard token and uncertain writes.
 * No bearer credentials or server bookings are persisted in local finance SQLite,
 * Android backup/transfer, browser storage, exported JSON or .backup archives.
 */
@CapacitorPlugin(name="FieLanzenSecureSession")
public class FieLanzenSecureSessionPlugin extends Plugin {
    private static final String ALIAS="FieLanzenMobileApiKeyV1";
    private static final String PREF="fielanzen_secure_session_v1";
    private static final String MODE="mode";
    private static final String SERVER="server";
    private static final String TOKEN="token";
    private static final String PENDING="pending";

    private SharedPreferences prefs(){return getContext().getSharedPreferences(PREF,Context.MODE_PRIVATE);}
    private SecretKey secret() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(ALIAS)) {
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry)store.getEntry(ALIAS,null)).getSecretKey();
    }
    private String encrypt(String value) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        // AndroidKeyStore AES/GCM with randomizedEncryptionRequired(true) MUST generate
        // its own IV. Passing a caller-generated GCMParameterSpec on ENCRYPT_MODE
        // triggers InvalidAlgorithmParameterException on real Samsung devices.
        cipher.init(Cipher.ENCRYPT_MODE,secret());
        byte[] iv=cipher.getIV();
        if(iv==null || iv.length!=12)throw new java.security.GeneralSecurityException("Ungültiger Android-GCM-IV");
        byte[] encoded=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] combined=new byte[iv.length+encoded.length];
        System.arraycopy(iv,0,combined,0,iv.length);
        System.arraycopy(encoded,0,combined,iv.length,encoded.length);
        return "v1:"+Base64.encodeToString(combined,Base64.NO_WRAP);
    }
    private String decrypt(String value) throws Exception {
        if(value==null || value.isEmpty())return "";
        if(!value.startsWith("v1:"))throw new IllegalArgumentException("Unbekannte sichere Datenversion");
        byte[] combined=Base64.decode(value.substring(3),Base64.NO_WRAP);
        if(combined.length<29)throw new IllegalArgumentException("Beschädigte sichere Daten");
        byte[] iv=new byte[12];System.arraycopy(combined,0,iv,0,iv.length);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,secret(),new GCMParameterSpec(128,iv));
        return new String(cipher.doFinal(combined,12,combined.length-12),StandardCharsets.UTF_8);
    }
    private String read(String name) throws Exception {return decrypt(prefs().getString(name,""));}
    private void write(String name,String value) throws Exception {prefs().edit().putString(name,encrypt(value)).apply();}
    private void reject(PluginCall call,Exception e){
        // Deliberately do NOT log the exception, raw request arguments or keys.
        call.reject("Sicherer Android-Keystore konnte nicht verwendet werden ("+e.getClass().getSimpleName()+").");
    }
    @PluginMethod public void getStatus(PluginCall call) {
        try {
            String mode=prefs().getString(MODE,"local");
            JSObject reply=new JSObject();reply.put("mode","server".equals(mode)?"server":"local");
            reply.put("hasToken",!read(TOKEN).isEmpty());reply.put("server",read(SERVER));
            reply.put("hasPending",!read(PENDING).isEmpty());call.resolve(reply);
        }catch(Exception e){reject(call,e);}
    }
    @PluginMethod public void saveToken(PluginCall call) {
        try {
            String value=call.getString("token","");String server=call.getString("server","");
            if(value==null||value.length()<10||value.length()>4096||value.contains("\n")||value.contains("\r")){
                call.reject("API-Schlüssel ist ungültig.");return;
            }
            java.net.URI uri=new java.net.URI(server);
            if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||
                (uri.getPath()!=null&&!uri.getPath().isEmpty()&&!"/".equals(uri.getPath()))||uri.getQuery()!=null||uri.getFragment()!=null){
                call.reject("Nur eine reine HTTPS-Basisadresse ist zulässig.");return;
            }
            write(TOKEN,value);write(SERVER,server);prefs().edit().remove(PENDING).apply();call.resolve();
        }catch(Exception e){reject(call,e);}
    }
    @PluginMethod public void getToken(PluginCall call) {
        try{JSObject r=new JSObject();r.put("token",read(TOKEN));r.put("server",read(SERVER));call.resolve(r);}catch(Exception e){reject(call,e);}
    }
    @PluginMethod public void setMode(PluginCall call) {
        String mode=call.getString("mode","");
        if(!"local".equals(mode)&&!"server".equals(mode)){call.reject("Unbekannter Datenquellenmodus.");return;}
        try {
            if("server".equals(mode)&&(read(TOKEN).isEmpty()||read(SERVER).isEmpty())){
                call.reject("Vor dem Serverbetrieb ist ein gültiger API-Schlüssel erforderlich.");return;
            }
            prefs().edit().putString(MODE,mode).apply();call.resolve();
        }catch(Exception e){reject(call,e);}
    }
    @PluginMethod public void clearToken(PluginCall call) {
        prefs().edit().putString(MODE,"local").remove(TOKEN).remove(SERVER).remove(PENDING).apply();call.resolve();
    }
    @PluginMethod public void putPending(PluginCall call) {
        try {
            String json=call.getString("json","");
            if(json==null||json.isEmpty()||json.length()>16000){call.reject("Zu große oder fehlende offene Serveroperation.");return;}
            write(PENDING,json);call.resolve();
        }catch(Exception e){reject(call,e);}
    }
    @PluginMethod public void getPending(PluginCall call) {
        try{JSObject r=new JSObject();r.put("json",read(PENDING));call.resolve(r);}catch(Exception e){reject(call,e);}
    }
    @PluginMethod public void clearPending(PluginCall call) {prefs().edit().remove(PENDING).apply();call.resolve();}
}
