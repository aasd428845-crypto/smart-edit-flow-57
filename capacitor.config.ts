import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.montaji',
  appName: 'مونتاجي AI',
  webDir: 'dist',
  server: {
    url: 'https://8f0c7345-878a-484c-b6f1-a340de995c3e.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a',
    },
  },
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#0a0a0a',
  },
};

export default config;
