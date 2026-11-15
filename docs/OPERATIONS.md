# Running Rooharka: database changes, backups, checks

Written for the platform owner. Do these once before the first real store goes live.

## 1. Automatic checks on every push

`.github/workflows/ci.yml` runs on GitHub after every `git push`: it installs, validates the database schema,
checks the types and runs every test. A green tick on the commit means all passed; a red cross means something
is wrong and GitHub emails you. Run the same on your own computer with:

```
pnpm check
```

`pnpm exec prisma validate` and `tsc` are the two checks that would have caught the "Unknown field `currency`"
and "model Theme already exists" errors before you saw them.

## 2. Safe database changes (migrations)

Until now changes were applied with `pnpm db:push`. That is fine while developing, but on a live database it can
DROP a column (and its data) if the schema says so, and it keeps no history. The professional way is **migrations**:
each change is a small SQL file in `prisma/migrations/`, reviewed, committed, and applied in order.

**Switch over once (takes five minutes):**

```
# 1. Make sure the live database matches the schema one last time
pnpm db:push

# 2. Write the starting point ("baseline") as the first migration
mkdir -p prisma/migrations/0_init
pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
#    (on older Prisma versions the flag is --to-schema-datamodel instead of --to-schema)

# 3. Tell Prisma the live database already has it (nothing is changed in the database)
pnpm exec prisma migrate resolve --applied 0_init

# 4. Commit the folder
git add prisma/migrations && git commit -m "Baseline migration"
```

**From then on, for every schema change:**

```
pnpm db:migrate:new        # writes a new SQL file from the schema change; READ it before going on
pnpm db:migrate            # applies pending migrations (this is also what the hosting runs on deploy)
```

Rules: never edit a migration that has been applied; never run `db:push` against the live database again; a
migration that drops a column or table deserves a backup first (below).

Tip (Neon): create a **branch** of the database, point `DATABASE_URL` at the branch, and try the migration there first.

## 3. Backups and restore

Neon keeps a history of the database ("point-in-time restore"): in the Neon console, Branches, "Restore", you can
bring the database back to any moment within your plan's history window (check the window on your plan; the free
plan's is short). That protects against a bad change made minutes or hours ago.

For anything older, and to own a copy outside Neon, take a dump:

```
pg_dump "$DATABASE_URL" --format=custom --no-owner --file "backup-$(date +%F).dump"
```

- **How often:** daily once stores are live; weekly before that. Keep the last 14 daily and 8 weekly files.
- **Where:** not on the same computer only. A private cloud folder or bucket.
- **Use the direct connection string** (without `-pooler` in the host name) for `pg_dump`.
- **Test a restore** once, into a Neon branch: `pg_restore --no-owner --dbname "<branch connection string>" backup-2026-11-20.dump`.
  A backup that has never been restored is a hope, not a backup.
- **What is NOT in the database:** photos and videos live in each store owner's own Cloudinary account; the
  secrets live in your hosting's environment settings. Keep a private copy of `APP_SECRET`: without it the stores'
  saved API keys cannot be read back.

## 4. When something breaks

- CSMI, "Errors" lists pages that crashed (kind of page, message, count). The code shown there is also in the
  hosting log, where the full detail is.
- A store owner's own dashboard shows "Shop speed" on the Overview.
- `pnpm db:ping` checks the database connection.
