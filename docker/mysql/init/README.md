# MySQL init for TWinkleRP

This folder is meant to be mounted into the official MySQL container's
`/docker-entrypoint-initdb.d` directory.

What it does:
- creates the `twinklerp` database
- creates the `twinklelogs` database
- leaves table creation and migration to the application

Why this is safe for the current build:
- `packages/twinkle/database/index.js` runs `autoSyncSchema()`
- `packages/twinkle/database/logs.js` creates the logs schema on demand
- duplicate table definitions here would fight the app's runtime schema repair

Recommended use in `docker-compose.yml`:

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
    volumes:
      - ./docker/mysql/init:/docker-entrypoint-initdb.d:ro
      - mysql-data:/var/lib/mysql
```

If you later want a full offline seed, generate it from the live build first,
then compare it against `packages/twinkle/database/*` before committing.

