-- A private schema for point-in-time copies taken before destructive work.
-- No grants to anon or authenticated: it is reachable only with the service
-- role, so nothing here is exposed through the API.
create schema if not exists archive;

revoke all on schema archive from public, anon, authenticated;
grant usage on schema archive to postgres, service_role;

alter default privileges in schema archive revoke all on tables from public, anon, authenticated;