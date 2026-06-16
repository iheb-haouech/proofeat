import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cloud.proproof.proofeat',
  appName: 'ProofEat',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#1e40af',
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
  },
};

export default config;