package bd.iam.sojib.passgen;
import android.content.*;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
public class AndroidBridge {
    private final Context ctx;
    public AndroidBridge(Context ctx) { this.ctx = ctx; }
    @JavascriptInterface
    public void copyToClipboard(String text) {
        ClipboardManager cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm!=null) cm.setPrimaryClip(ClipData.newPlainText("password",text));
        showToast("Copied!");
    }
    @JavascriptInterface
    public void showToast(String msg) { Toast.makeText(ctx,msg,Toast.LENGTH_SHORT).show(); }
    @JavascriptInterface
    public void shareText(String text) {
        Intent i = new Intent(Intent.ACTION_SEND); i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT,text);
        Intent c = Intent.createChooser(i,"Share via");
        c.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(c);
    }
    @JavascriptInterface
    public void vibrate() {
        android.os.Vibrator v = (android.os.Vibrator)ctx.getSystemService(Context.VIBRATOR_SERVICE);
        if (v!=null) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O)
                v.vibrate(android.os.VibrationEffect.createOneShot(50,android.os.VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(50);
        }
    }
    @JavascriptInterface public boolean isAndroidApp() { return true; }
    @JavascriptInterface public String getAppVersion() {
        try { return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(),0).versionName; }
        catch (Exception e) { return "1.0.0"; }
    }
    @JavascriptInterface
    public void openUrl(String url) {
        Intent i = new Intent(Intent.ACTION_VIEW,Uri.parse(url));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(i);
    }
}
