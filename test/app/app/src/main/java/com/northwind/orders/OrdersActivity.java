package com.northwind.orders;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;

public class OrdersActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView title = new TextView(this);
        title.setText("Orders");
        setContentView(title);
    }
}
