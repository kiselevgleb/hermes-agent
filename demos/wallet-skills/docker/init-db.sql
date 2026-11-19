-- Read-only role used by the incident-analysis skill.
-- The official Postgres image runs this file as the superuser named in POSTGRES_USER.

CREATE ROLE agent_ro LOGIN PASSWORD 'agent_ro';
GRANT CONNECT ON DATABASE wallet TO agent_ro;
GRANT USAGE ON SCHEMA public TO agent_ro;
GRANT pg_read_all_stats TO agent_ro;
ALTER ROLE agent_ro SET statement_timeout = '15s';

-- Tables are created later by Prisma, running as this same user.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO agent_ro;
