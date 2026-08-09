import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dizitakip.app',
  appName: 'Dizi Takip',
  webDir: 'public',
  server: {
    url: 'https://dizi-takip.vercel.app',
    cleartext: true
  }
};

export default config;
