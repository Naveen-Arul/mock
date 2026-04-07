-- =============================================================================
-- MockMentorBiz Seed Users - Test Data
-- =============================================================================
-- This file is optional for development/testing purposes only.
-- In production, users should be created through the application.
-- =============================================================================

USE mockmentorbiz;

-- =============================================================================
-- Note: The platform Owner should be created via bootstrap API or auto-seed
-- Super admins should be created via the Owner dashboard
-- Admins should be created via Super Admin dashboard
-- Students should register via the frontend
-- =============================================================================

-- This file intentionally left minimal to avoid conflicts with application logic.
-- The backend will handle user creation through proper APIs with password hashing.

-- To seed test data, use the backend scripts:
-- python backend/create_test_users.py
-- or
-- python backend/scripts/bootstrap_db.py

-- You can also use environment variables for auto-seeding the owner:
-- OWNER_SEED_ON_STARTUP=true
-- OWNER_SEED_EMAIL=owner@platform.com
-- OWNER_SEED_USERNAME=platform_owner
-- OWNER_SEED_PASSWORD=YourSecurePassword123
-- OWNER_SEED_FULL_NAME=Platform Owner
