#!/bin/bash
set -e

# Create the evolution database for Evolution API
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE evolution;
EOSQL
