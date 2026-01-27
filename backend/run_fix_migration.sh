#!/bin/bash
# Run the fix auto-assigned requisitions migration

# Load environment variables if .env exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL not set"
    echo "Please set it in .env file or export it:"
    echo 'export DATABASE_URL="postgresql://user:password@host:port/database"'
    exit 1
fi

# Run the migration
./venv/bin/python3 migrations/fix_auto_assigned_requisitions.py
