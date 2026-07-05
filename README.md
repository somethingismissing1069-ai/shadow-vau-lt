# 🔒 ShadowVault

**Secure One-Time & Time-Limited Encrypted File Sharing Platform**

ShadowVault is a privacy-first web application that enables users to securely share files with end-to-end encryption, one-time download capabilities, and time-limited access controls. Every uploaded file is encrypted using AES-256-GCM with a per-file session key that is itself RSA-4096 wrapped.

## 🌟 Features

- **AES-256-GCM Encryption** — Every file encrypted with a unique session key
- **RSA-4096 Key Wrapping** — AES keys wrapped with recipient's public key
- **Time-Limited Sharing** — Links expire after configurable duration (5min to 30 days)
- **One-Time Download** — Optional single-download with automatic file destruction
- **Burn After Reading** — File, keys, and metadata permanently destroyed after first access
- **Password-Protected Links** — Optional Argon2id-hashed password protection
- **Comprehensive Audit Logging** — Every security event tracked
- **Secure Deletion** — Multi-pass overwrite before unlinking
- **Dark Theme Glassmorphism UI** — Modern, responsive interface

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                   NGINX (TLS 1.3)                │
│              Reverse Proxy + HSTS                │
└─────────────┬──────────────────┬────────────────┘
              │                  │
    ┌─────────▼─────────┐  ┌────▼─────────────┐
    │   Next.js Frontend │  │ Express.js API    │
    │   React + Tailwind │  │ + Encryption Svc  │
    │   Port 3000        │  │ Port 3001         │
    └────────────────────┘  └────────┬──────────┘
                                     │
                            ┌────────▼──────────┐
                            │   PostgreSQL 16    │
                            │   via Prisma ORM   │
                            └───────────────────┘
```

## 🔐 Security Features

| Feature | Implementation |
|---------|---------------|
| File Encryption | AES-256-GCM with random IV |
| Key Wrapping | RSA-4096 OAEP SHA-256 |
| Password Hashing | Argon2id |
| Session Management | JWT with JTI revocation |
| Transport Security | TLS 1.3, HSTS |
| XSS Protection | CSP, React auto-escaping |
| CSRF Protection | SameSite cookies |
| Rate Limiting | Per-endpoint throttling |
| SQL Injection | Prisma ORM (parameterized) |
| Secure Deletion | Random + zero overwrite |

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Auth | JWT (HTTP-only cookies), Argon2id |
| Crypto | Node.js crypto (AES-256-GCM, RSA-4096) |
| Deployment | Docker Compose, NGINX |

## 📁 Project Structure

```
shadowvault/
├── backend/                 # Express.js API
│   ├── src/
│   │   ├── config/          # Environment & constants
│   │   ├── errors/          # Error class hierarchy
│   │   ├── lib/             # Prisma client, logger
│   │   ├── middleware/      # Auth, rate limiting, security
│   │   ├── routes/          # API route handlers
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Utilities (filename sanitization)
│   │   ├── validation/      # Zod schemas
│   │   └── workers/         # Background jobs (expiry)
│   ├── prisma/              # Database schema
│   └── Dockerfile
├── frontend/                # Next.js application
│   ├── src/
│   │   ├── app/             # App Router pages
│   │   ├── components/      # UI components
│   │   ├── hooks/           # React hooks
│   │   └── lib/             # API client
│   └── Dockerfile
├── shared/                  # Shared TypeScript types
├── nginx/                   # NGINX configuration
├── docker-compose.yml       # Full stack deployment
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Docker & Docker Compose (for production)

### Development Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Generate Prisma client
cd backend && npx prisma generate

# Run database migrations
npx prisma migrate dev

# Start backend
npm run dev --workspace=backend

# Start frontend (separate terminal)
npm run dev --workspace=frontend
```

### Production Deployment (Docker)

```bash
# Copy environment template
cp .env.docker.example .env

# Generate secrets
openssl rand -hex 32 > /dev/null  # DB_PASSWORD
openssl rand -hex 64 > /dev/null  # JWT_SECRET
openssl genpkey -algorithm RSA -out secrets/rsa_private_key.pem -pkeyopt rsa_keygen_bits:4096

# Generate TLS certificates (or use Let's Encrypt)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/privkey.pem -out nginx/certs/fullchain.pem \
  -subj "/CN=localhost"

# Start all services
docker-compose up -d
```

## 📡 API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Register new user |
| POST | `/api/auth/login` | — | Login, receive JWT |
| POST | `/api/auth/logout` | JWT | Revoke session |
| POST | `/api/auth/refresh` | Refresh | Rotate tokens |
| GET | `/api/auth/me` | JWT | Current user profile |
| POST | `/api/files/upload` | JWT | Upload + encrypt file |
| GET | `/api/files` | JWT | List own files |
| GET | `/api/files/:fileId` | JWT | File details |
| DELETE | `/api/files/:fileId` | JWT | Delete file |
| POST | `/api/files/:fileId/revoke` | JWT | Revoke share link |
| GET | `/api/share/:token` | — | Download file |
| GET | `/api/audit` | JWT | Own audit logs |
| GET | `/api/admin/users` | Admin | List users |
| GET | `/api/admin/audit` | Admin | All audit logs |
| DELETE | `/api/admin/files/:fileId` | Admin | Force delete |
| GET | `/api/health` | — | Health check |

## 🧪 Testing

```bash
# Run all backend tests (232 tests)
cd backend && npx jest --forceExit

# Run with coverage
npx jest --coverage --forceExit
```

## 📊 Cryptographic Workflow

```
Upload: File → AES-256-GCM Encrypt → RSA-4096 Wrap Key → Store Ciphertext
Download: Validate Link → RSA Unwrap Key → AES-GCM Decrypt → Stream → Burn
```

## 📜 License

MIT

## 🙏 Acknowledgments

Built with modern cryptography best practices following OWASP Top 10 and STRIDE threat modeling.
