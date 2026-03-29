package bd.iam.sojib.passgen;
import android.Manifest;
import android.annotation.SuppressLint;
import android.app.*;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.google.firebase.messaging.FirebaseMessaging;
public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private LinearLayout offlineView;
    private static final String LOCAL_URL = "file:///android_asset/www/index.html";
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel("passgen_channel",
                "PassGen Pro", NotificationManager.IMPORTANCE_DEFAULT);
            ((NotificationManager)getSystemService(NotificationManager.class))
                .createNotificationChannel(ch);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
        }
        FirebaseMessaging.getInstance().getToken()
            .addOnSuccessListener(t -> android.util.Log.d("FCM", t));
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xff0f0f1a);
        setContentView(root);
        swipeRefresh = new SwipeRefreshLayout(this);
        swipeRefresh.setColorSchemeColors(0xff667eea, 0xff764ba2, 0xff43e97b);
        swipeRefresh.setProgressBackgroundColorSchemeColor(0xff1a1a2e);
        webView = new WebView(this);
        swipeRefresh.addView(webView, new LinearLayout.LayoutParams(-1, -1));
        root.addView(swipeRefresh, new LinearLayout.LayoutParams(-1, -1, 1f));
        offlineView = buildOfflineView();
        offlineView.setVisibility(View.GONE);
        root.addView(offlineView, new LinearLayout.LayoutParams(-1, -1));
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(s.getUserAgentString() + " PassGenProApp/1.0");
        webView.addJavascriptInterface(new AndroidBridge(this), "Android");
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView v, String u, android.graphics.Bitmap f) {
                swipeRefresh.setRefreshing(true); }
            @Override public void onPageFinished(WebView v, String u) {
                swipeRefresh.setRefreshing(false);
                offlineView.setVisibility(View.GONE);
                swipeRefresh.setVisibility(View.VISIBLE); }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                swipeRefresh.setRefreshing(false);
                if (r.isForMainFrame()) {
                    swipeRefresh.setVisibility(View.GONE);
                    offlineView.setVisibility(View.VISIBLE); } }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String url = r.getUrl().toString();
                if (url.startsWith("file://") || url.startsWith("https://sojib.iam.bd") ||
                    url.startsWith("https://pass-gen-pro-369.vercel.app")) return false;
                startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,
                    android.net.Uri.parse(url)));
                return true; }
        });
        swipeRefresh.setOnRefreshListener(() -> webView.reload());
        webView.loadUrl(LOCAL_URL);
    }
    private LinearLayout buildOfflineView() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(android.view.Gravity.CENTER);
        l.setBackgroundColor(0xff0f0f1a);
        l.setPadding(48,48,48,48);
        TextView icon = new TextView(this);
        icon.setText("⚠️"); icon.setTextSize(52f);
        icon.setGravity(android.view.Gravity.CENTER);
        TextView title = new TextView(this);
        title.setText("লোড হচ্ছে না"); title.setTextColor(0xffffffff); title.setTextSize(22f);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setGravity(android.view.Gravity.CENTER);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-2,-2); tp.topMargin=20;
        android.widget.Button btn = new android.widget.Button(this);
        btn.setText("Retry"); btn.setTextColor(0xffffffff);
        android.graphics.drawable.GradientDrawable gd =
            new android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{0xff667eea,0xff764ba2});
        gd.setCornerRadius(50f); btn.setBackground(gd);
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-2,-2);
        bp.topMargin=36; bp.gravity=android.view.Gravity.CENTER; btn.setPadding(64,28,64,28);
        btn.setOnClickListener(v -> {
            offlineView.setVisibility(View.GONE);
            swipeRefresh.setVisibility(View.VISIBLE);
            webView.loadUrl(LOCAL_URL); });
        l.addView(icon); l.addView(title,tp); l.addView(btn,bp);
        return l;
    }
    @Override public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
}
