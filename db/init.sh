#!/bin/bash
# Database initialization script
# This script creates the database and applies the schema

set -e

# Database connection parameters
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-rarb_outputs}"
DB_USER="${DB_USER:-sandbox}"
DB_PASSWORD="${DB_PASSWORD:-CHANGE_ME}"

echo "🔧 Initializing database..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "sandbox" -c '\q' 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "✓ PostgreSQL is ready"

# Create database if it doesn't exist
echo "📦 Creating database '$DB_NAME' if it doesn't exist..."
PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "sandbox" -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "sandbox" -c "CREATE DATABASE $DB_NAME"

echo "✓ Database '$DB_NAME' ready"

# Apply schema
echo "📋 Applying database schema..."
PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f /app/db/schema.sql

echo "✅ Database initialization complete!"
