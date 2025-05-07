-- Simple ALTER TABLE statement to add the permission_level column
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS permission_level VARCHAR(50) DEFAULT 'view_and_download';

-- Add missing columns to the access_requests table
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
