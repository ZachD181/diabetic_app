package com.insulindaily.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(HealthConnectBridgePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
