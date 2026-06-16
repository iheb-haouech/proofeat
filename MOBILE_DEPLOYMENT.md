# ProofEat Mobile Deployment

## Android APK Build

### Prerequisites
- Node.js 18+
- Android Studio (for Android SDK)
- Java JDK 11+

### Build Commands
```bash
# Install dependencies
cd frontend
npm install

# Build for mobile
npm run build

# Initialize Capacitor (first time only)
npx cap init

# Add Android platform (first time only)
npx cap add android

# Sync and open in Android Studio
npx cap sync android
npx cap open android
```

In Android Studio:
1. Connect Android device or start emulator
2. Click Run > app
3. The APK will be generated at `android/app/build/outputs/apk/debug/app-debug.apk`

### Release Build
```bash
cd android
./gradlew assembleRelease
```
The release APK will be at `android/app/build/outputs/apk/release/app-release.apk`

## iOS Build

### Prerequisites
- macOS with Xcode 15+
- Node.js 18+

### Build Commands
```bash
# Initialize Capacitor (first time only)
npx cap add ios

# Sync and open in Xcode
npx cap sync ios
npx cap open ios
```

In Xcode:
1. Select a device or simulator
2. Product > Archive
3. Distribute App to generate IPA

## Docker Deployment

### Production
```bash
# Create .env file with required variables
cp docker-compose.yml docker-compose.prod.yml
# Edit docker-compose.prod.yml or use environment variables

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables (.env)
```
POSTGRES_USER=proofeat
POSTGRES_PASSWORD=secure_password_here
POSTGRES_DB=proofeat
JWT_SECRET=your-jwt-secret-here
VITE_API_URL=https://your-domain.com
HTTP_PORT=80
HTTPS_PORT=443
NGINX_HOST=your-domain.com
```

### Run Production Stack
```bash
# With docker-compose
docker-compose -f docker-compose.prod.yml up -d

# Or with docker-compose.yml (development mode)
docker-compose up -d
```

## Nginx Configuration

The nginx.conf in frontend/ is configured for:
- HTTPS redirect (port 80 → 443)
- SSL with Let's Encrypt certificates
- API proxy to backend
- Static file serving
- File upload/download proxying

Mount certificates at runtime:
```bash
docker run -v /etc/letsencrypt:/etc/letsencrypt:ro nginx:stable-alpine
```

## Production Checklist

- [ ] Update `JWT_SECRET` in .env
- [ ] Configure `DATABASE_URL` for your PostgreSQL
- [ ] Set `VITE_API_URL` to your production API URL
- [ ] Configure SSL certificates
- [ ] Set up domain DNS
- [ ] Run `docker-compose -f docker-compose.prod.yml up -d`

## Mobile-Specific Notes

### Camera Access
The mobile app requires camera permissions which are handled by the Capacitor Camera plugin.

### Network Security
For Android development, clear text traffic is enabled in AndroidManifest.xml to allow HTTP connections to local servers.

### PWA Fallback
The web app is PWA-capable and can be installed on mobile browsers without the native app wrapper.