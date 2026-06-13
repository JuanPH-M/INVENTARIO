-- PostgreSQL initialization script for production
-- Runs once when the container is first created

-- Ensure the database uses UTF8 encoding
ALTER DATABASE inventario SET client_encoding TO 'UTF8';

-- Create extensions required by the application
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
