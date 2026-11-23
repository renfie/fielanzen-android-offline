package de.fielanzen.offline;

import android.net.Uri;
import android.security.KeyChain;
import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.net.URI;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Set;
import java.util.Arrays;
import java.util.HashSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.X509ExtendedKeyManager;
import javax.net.ssl.SSLEngine;

/** Explicit opt-in mTLS for a user-installed Android KeyChain identity.
 * Never exports or persists a private key. HTTPS certificate validation and
 * hostname verification remain Android's defaults. Never forwards an API key
 * to an unrelated host through a redirect.
 */
@CapacitorPlugin(name="FieLanzenMtlsHttp")
public class FieLanzenMtlsHttpPlugin extends Plugin {
    private static final String PREF="fielanzen_mtls_v1";
    private static final String HOST="host";
    private static final String ALIAS="keychain_alias";
    private static final Set<String> ALLOWED_HEADERS = new HashSet<>(Arrays.asList(
        "accept", "authorization", "content-type", "cache-control", "idempotency-key", "if-match"));
    private final ExecutorService executor=Executors.newFixedThreadPool(2);
    private SharedPreferences prefs(){return getContext().getSharedPreferences(PREF,Context.MODE_PRIVATE);}
    private String validatedOrigin(String input) throws Exception {
        if(input==null||input.length()>250)throw new IllegalArgumentException("HTTPS-Basisadresse fehlt.");
        URI uri=new URI(input);
        if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||
           (uri.getPort()!=-1&&uri.getPort()!=443)||uri.getQuery()!=null||uri.getFragment()!=null||
           (uri.getPath()!=null&&!uri.getPath().isEmpty()&&!"/".equals(uri.getPath())))
           throw new IllegalArgumentException("Nur eine HTTPS-Basisadresse ohne Pfad ist erlaubt.");
        return uri.getHost().toLowerCase(java.util.Locale.ROOT);
    }
    @PluginMethod public void status(PluginCall call){
        String host=prefs().getString(HOST,"");String alias=prefs().getString(ALIAS,"");
        JSObject result=new JSObject();result.put("configured",!host.isEmpty()&&!alias.isEmpty());
        result.put("host",host);call.resolve(result);
    }
    @PluginMethod public void chooseCertificate(PluginCall call){
        try {
            final String host=validatedOrigin(call.getString("server", ""));
            getActivity().runOnUiThread(()->{
                try{
                    // Alias is chosen with Android's system dialogue; the private
                    // key remains protected in Android KeyChain and is never copied.
                    KeyChain.choosePrivateKeyAlias(getActivity(),alias->{
                        if(alias==null){call.reject("Client-Zertifikatsauswahl abgebrochen oder kein geeignetes Zertifikat vorhanden.");return;}
                        prefs().edit().putString(HOST,host).putString(ALIAS,alias).apply();
                        JSObject result=new JSObject();result.put("configured",true);result.put("host",host);call.resolve(result);
                    }, new String[]{"RSA","EC"},null,Uri.parse("https://"+host+"/"),null);
                }catch(Exception e){call.reject("Android-Zertifikatsauswahl fehlgeschlagen ("+e.getClass().getSimpleName()+").");}
            });
        }catch(Exception e){call.reject("Client-Zertifikatsauswahl: ungültige Serveradresse.");}
    }
    @PluginMethod public void clearCertificate(PluginCall call){
        prefs().edit().remove(HOST).remove(ALIAS).apply();call.resolve();
    }
    @PluginMethod public void request(PluginCall call){
        final String target=call.getString("url","");final String method=call.getString("method","GET");
        final JSObject headers=call.getObject("headers",new JSObject());
        final JSObject payload=call.getObject("data");
        if(!Arrays.asList("GET","POST","PUT","DELETE").contains(method)){
            call.reject("Unzulässige API-Methode.");return;
        }
        executor.execute(()->{
            HttpsURLConnection connection=null;
            try {
                URL url=new URL(target);URI uri=url.toURI();
                String host=prefs().getString(HOST,"");String alias=prefs().getString(ALIAS,"");
                if(alias.isEmpty()||host.isEmpty()||!"https".equals(uri.getScheme())||
                   !host.equalsIgnoreCase(uri.getHost())||
                   (uri.getPort()!=-1&&uri.getPort()!=443)||uri.getUserInfo()!=null||uri.getFragment()!=null||
                   (!uri.getPath().startsWith("/api/mobile/v1/")&&!"/healthz".equals(uri.getPath())))
                    throw new IllegalArgumentException("mTLS-Host oder API-Pfad stimmt nicht mit der Zertifikatsfreigabe überein.");
                PrivateKey key=KeyChain.getPrivateKey(getContext(),alias);
                X509Certificate[] chain=KeyChain.getCertificateChain(getContext(),alias);
                if(key==null||chain==null||chain.length==0)
                    throw new IllegalStateException("Client-Zertifikat ist nicht mehr freigegeben. Bitte erneut auswählen.");
                final PrivateKey selectedKey=key; final X509Certificate[] selectedChain=chain;
                X509ExtendedKeyManager manager=new X509ExtendedKeyManager(){
                    @Override public String[] getClientAliases(String keyType,Principal[] issuers){return new String[]{alias};}
                    @Override public String chooseClientAlias(String[] keyTypes,Principal[] issuers,Socket socket){return alias;}
                    @Override public String[] getServerAliases(String keyType,Principal[] issuers){return null;}
                    @Override public String chooseServerAlias(String keyType,Principal[] issuers,Socket socket){return null;}
                    @Override public X509Certificate[] getCertificateChain(String requested){return alias.equals(requested)?selectedChain:null;}
                    @Override public PrivateKey getPrivateKey(String requested){return alias.equals(requested)?selectedKey:null;}
                    @Override public String chooseEngineClientAlias(String[] keyTypes,Principal[] issuers,SSLEngine engine){return alias;}
                    @Override public String chooseEngineServerAlias(String keyType,Principal[] issuers,SSLEngine engine){return null;}
                };
                SSLContext ssl=SSLContext.getInstance("TLS");ssl.init(new javax.net.ssl.KeyManager[]{manager},null,new SecureRandom());
                connection=(HttpsURLConnection)url.openConnection();
                connection.setSSLSocketFactory(ssl.getSocketFactory());
                // Never disable TLS hostname/certificate verification.
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(10000);connection.setReadTimeout(16000);
                connection.setRequestMethod(method);
                java.util.Iterator<String> names=headers.keys();
                while(names.hasNext()){
                    String name=names.next();
                    if(!ALLOWED_HEADERS.contains(name.toLowerCase(java.util.Locale.ROOT)))continue;
                    String value=headers.getString(name);
                    if(value!=null&&!value.contains("\r")&&!value.contains("\n"))connection.setRequestProperty(name,value);
                }
                if(!"GET".equals(method)&&payload!=null){
                    byte[] json=payload.toString().getBytes(StandardCharsets.UTF_8);
                    if(json.length>65536)throw new IllegalArgumentException("Buchungsanfrage zu groß.");
                    connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json; charset=utf-8");
                    try(OutputStream out=connection.getOutputStream()){out.write(json);}
                }
                int status=connection.getResponseCode();
                InputStream stream=status>=400?connection.getErrorStream():connection.getInputStream();
                ByteArrayOutputStream output=new ByteArrayOutputStream();
                if(stream!=null)try(InputStream in=stream){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){
                    if(output.size()+n>10000000)throw new IllegalStateException("Dashboard-Antwort ist zu groß.");output.write(buf,0,n);
                }}
                JSObject result=new JSObject();result.put("status",status);
                result.put("data",output.toString("UTF-8"));call.resolve(result);
            }catch(Exception e){
                // Do not log or expose bearer tokens, request bodies or certificate material.
                call.reject("mTLS-Anfrage fehlgeschlagen ("+e.getClass().getSimpleName()+"). Prüfe die Android-Zertifikatsfreigabe und den Server.");
            }finally{if(connection!=null)connection.disconnect();}
        });
    }
    @Override protected void handleOnDestroy(){executor.shutdownNow();super.handleOnDestroy();}
}
