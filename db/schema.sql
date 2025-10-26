-- Database schema for MCP agent outputs
-- This schema stores agent execution outputs with automatic duplicate prevention

-- Create the database if running this manually (not needed if using init script)
-- CREATE DATABASE rarb_outputs;

-- Enable pgcrypto extension for SHA256 hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create table for storing agent outputs
CREATE TABLE IF NOT EXISTS agent_outputs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    url VARCHAR(1000),
    category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Computed hash for duplicate detection based on title + url
    content_hash VARCHAR(64) GENERATED ALWAYS AS (
        encode(digest(COALESCE(title, '') || '|' || COALESCE(url, ''), 'sha256'), 'hex')
    ) STORED,
    CONSTRAINT unique_content UNIQUE (content_hash)
);

-- Create index on created_at for efficient date-based queries
CREATE INDEX IF NOT EXISTS idx_agent_outputs_created_at ON agent_outputs(created_at DESC);

-- Create index on category for filtering
CREATE INDEX IF NOT EXISTS idx_agent_outputs_category ON agent_outputs(category);

-- Create index on url for quick lookups
CREATE INDEX IF NOT EXISTS idx_agent_outputs_url ON agent_outputs(url);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to call the function before updates
DROP TRIGGER IF EXISTS update_agent_outputs_updated_at ON agent_outputs;
CREATE TRIGGER update_agent_outputs_updated_at
    BEFORE UPDATE ON agent_outputs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create a view for recent outputs
CREATE OR REPLACE VIEW recent_outputs AS
SELECT
    id,
    title,
    description,
    url,
    category,
    created_at,
    updated_at
FROM agent_outputs
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Grant permissions (adjust username as needed)
GRANT SELECT, INSERT, UPDATE ON agent_outputs TO sandbox;
GRANT USAGE, SELECT ON SEQUENCE agent_outputs_id_seq TO sandbox;
GRANT SELECT ON recent_outputs TO sandbox;
