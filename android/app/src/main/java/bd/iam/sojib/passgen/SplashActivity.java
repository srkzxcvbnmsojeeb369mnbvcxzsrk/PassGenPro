package bd.iam.sojib.passgen;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.view.animation.*;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
public class SplashActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(0xff0f0f1a);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(180, 180);
        lp.bottomMargin = 40;
        root.addView(logo, lp);
        TextView name = new TextView(this);
        name.setText("PassGen Pro");
        name.setTextColor(0xffffffff);
        name.setTextSize(30f);
        name.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        name.setGravity(Gravity.CENTER);
        root.addView(name);
        TextView sub = new TextView(this);
        sub.setText("Secure Password Generator");
        sub.setTextColor(0xff667eea);
        sub.setTextSize(14f);
        sub.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-2, -2);
        sp.topMargin = 10;
        root.addView(sub, sp);
        setContentView(root);
        AnimationSet anim = new AnimationSet(true);
        AlphaAnimation fade = new AlphaAnimation(0f, 1f);
        fade.setDuration(700);
        ScaleAnimation scale = new ScaleAnimation(0.85f,1f,0.85f,1f,
            Animation.RELATIVE_TO_SELF,0.5f,Animation.RELATIVE_TO_SELF,0.5f);
        scale.setDuration(700);
        anim.addAnimation(fade);
        anim.addAnimation(scale);
        anim.setFillAfter(true);
        root.startAnimation(anim);
        new Handler().postDelayed(() -> {
            startActivity(new Intent(this, MainActivity.class));
            finish();
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
        }, 2000);
    }
}
