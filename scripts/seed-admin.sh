#!/bin/sh
# Seed script: Register an admin user and promote them
# Run after docker compose up: ./scripts/seed-admin.sh

set -e

API_URL="${1:-https://localhost}"
ADMIN_EMAIL="${2:-admin@shadowvault.io}"
ADMIN_USERNAME="${3:-admin}"
ADMIN_PASSWORD="${4:-AdminPassword123!}"

echo "=== ShadowVault Admin Seed ==="
echo "API: $API_URL"
echo "Email: $ADMIN_EMAIL"
echo "Username: $ADMIN_USERNAME"
echo ""

# 1. Register the user
echo "1. Registering user..."
REGISTER_RESULT=$(curl -sk -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$REGISTER_RESULT" | tail -1)
BODY=$(echo "$REGISTER_RESULT" | head -1)

if [ "$HTTP_CODE" = "201" ]; then
  echo "   User registered successfully."
elif echo "$BODY" | grep -q "already taken"; then
  echo "   User already exists, skipping registration."
else
  echo "   Registration response ($HTTP_CODE): $BODY"
fi

# 2. Promote to admin via direct DB update
echo "2. Promoting to admin..."
docker compose exec -T db psql -U sv -d shadowvault -c \
  "UPDATE users SET is_admin = true WHERE email = '$ADMIN_EMAIL';" 2>/dev/null

echo ""
echo "=== Done! ==="
echo "Login at: $API_URL/login"
echo "Email: $ADMIN_EMAIL"
echo "Password: $ADMIN_PASSWORD"
echo "Role: Admin"
