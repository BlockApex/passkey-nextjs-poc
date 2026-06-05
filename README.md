# Passkey Next.js PoC

Proof of Concept for Handle Pay's passkey-based onboarding system.

## Features

### Phase 1: Foundation ✅
- Usecase selection
- Username validation & reservation
- TTL-based reservation system (30 minutes)

### Phase 2: Passkey Authentication ✅
- WebAuthn passkey registration
- Biometric login (Face ID, Touch ID, Windows Hello)
- JWT-based session management

## Tech Stack

- **Frontend**: Next.js 14, React, TailwindCSS
- **Authentication**: @simplewebauthn/browser
- **Backend API**: NestJS (separate repository)

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
Create `.env.local` (see `.env.example`):
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_REQUEST_SIGNATURE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

3. **Configure request signing keys** (required — backend enforces `x-signature` on most routes):

Generate a P-256 key pair:
```bash
openssl ecparam -name prime256v1 -genkey -noout -out request-signature-private.pem
openssl ec -in request-signature-private.pem -pubout -out request-signature-public.pem
```

Set in `handle-pay-backend/.env`:
```env
REQUEST_SIGNATURE_PUBLIC_KEY="<contents of request-signature-public.pem>"
```

Set in `passkey-nextjs-poc/.env.local`:
```env
NEXT_PUBLIC_REQUEST_SIGNATURE_PRIVATE_KEY="<contents of request-signature-private.pem>"
```

Use `\n` escapes for newlines in `.env` files (same convention as the mobile app).

4. **Run development server:**
```bash
npm run dev
```

5. **Open browser:**
```
http://localhost:3002
```

## Testing

### Phase 1: Username Reservation
1. Navigate to `/phase1/onboarding`
2. Select a usecase
3. Check username availability
4. Reserve username and save the token

### Phase 2: Passkey Registration
1. Navigate to `/phase2/passkey-test`
2. Enter reservation token from Phase 1
3. Create passkey with biometric authentication
4. Test login with existing passkey

**Note**: Passkeys work best with HTTPS. For local testing, use browser's built-in authenticator (not password managers like Proton Pass).

## Deployment

### Vercel (Recommended)
```bash
vercel --prod
```

Set environment variables:
- `NEXT_PUBLIC_API_URL`: Your backend API URL
- `NEXT_PUBLIC_REQUEST_SIGNATURE_PRIVATE_KEY`: PEM private key matching backend `REQUEST_SIGNATURE_PUBLIC_KEY`

## Backend

This PoC requires the Handle Pay backend running. See main repository for backend setup.

## License

Private - Handle Pay Project
