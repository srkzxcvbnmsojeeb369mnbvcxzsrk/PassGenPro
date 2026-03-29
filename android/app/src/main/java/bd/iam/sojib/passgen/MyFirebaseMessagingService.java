package bd.iam.sojib.passgen;
import android.app.*;
import android.content.*;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.*;
public class MyFirebaseMessagingService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage msg) {
        String title="PassGen Pro", body="নতুন notification";
        if (msg.getNotification()!=null) {
            if (msg.getNotification().getTitle()!=null) title=msg.getNotification().getTitle();
            if (msg.getNotification().getBody()!=null) body=msg.getNotification().getBody();
        }
        if (msg.getData().containsKey("title")) title=msg.getData().get("title");
        if (msg.getData().containsKey("body")) body=msg.getData().get("body");
        PendingIntent pi = PendingIntent.getActivity(this,0,
            new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_ONE_SHOT|PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this,"passgen_channel")
            .setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body)
            .setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_DEFAULT).setContentIntent(pi);
        NotificationManager nm=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm!=null) nm.notify((int)System.currentTimeMillis(),b.build());
    }
    @Override public void onNewToken(String t) { android.util.Log.d("FCM_TOKEN",t); }
}
