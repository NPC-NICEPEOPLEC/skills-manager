# Connecting an existing Skill library

## Problem and first increment

A user may already keep real Skill directories in an external `AI-Skills/skills/`
folder, with several agent entries linking to each directory. The existing
Settings path change migrates the current repository into an empty destination;
it correctly refuses a nonempty external folder. Removing that protection would
risk merging two libraries. Importing every discovered entry is also not adoption:
it can create renamed copies, and discovery excludes links into the active central
repository.

This increment adds **Inspect an existing library** in Settings. It is deliberately
read-only. It does not change the active path, create a database, import a Skill,
move a file, alter links, or enable a new agent.

The preview distinguishes:

- **Skill entities**: direct real subdirectories of `skills/` with a supported
  Skill marker. Linked entities, hidden entries and `.backup-` directories are
  excluded. Skill content is not recursively treated as more Skills.
- **Existing connections**: direct symbolic links in configured agent scan folders
  which resolve to these exact entities. One physical entry is counted once even
  when several adapters share a scan folder. This is not a recursive deployment
  inventory, a dependency check, or a statement that the client can run the Skill.
- **Excluded and unreadable paths**: visible separately, so a partial inspection
  does not masquerade as a complete count.

The native command runs on the blocking pool and only reads the configured
adapters and selected filesystem paths. The frontend distinguishes idle, loading,
success and error states; counts are dynamic, not fixed to a particular library.
The existing migration workflow remains separate and unchanged.

## Existing architecture to retain

- `central_repo`: configured repository root, runtime overrides and safe relocation.
- `SkillStore`: database records for managed entities and deployment targets.
- `sync_metadata`: portable metadata needed to survive startup reindexing.
- `tool_adapters`: built-in and custom agent paths, including shared discovery roots.
- `sync_engine`: ownership checks before replacing or removing deployment entries.
- `installer`: local/Git installation and same-target protection.

## Follow-up adoption boundary

Inspection is not adoption. Before a write-enabled workflow can ship:

1. Keep **move current library** separate from **connect an existing library**.
   Never weaken `check_migration_target` to accept arbitrary nonempty folders.
2. Preview and revalidate the exact selected root and entity inventory. An adoption
   operation must register existing files without sending them through copying,
   name sanitization or conflict-renaming installation paths.
3. Persist both the database and `sync_metadata`; database-only records can disappear
   at startup reindexing. Preserve user settings and existing scenarios explicitly.
4. Map existing deployment links separately from external-manager compatibility
   paths. A target row is not blanket authority to delete whatever occupies it.
5. Treat sources which resolve back into the library as local-only; reimporting from
   the entity's own link must not become a self-overwrite operation.
6. Keep **disconnect one client** separate from **archive the entity and disconnect
   its consumers**. Inspect all reverse dependencies, including compatibility links,
   before the latter. Current removal code is not a recoverable archive workflow.
7. Use a transactional journal, repository locking, failure recovery, restart
   behavior and idempotence tests before switching an actual library.
8. Do not deploy every entity to every agent by default. Preserve the user's
   selected client mapping. Third-party installers may recreate copies later.

## Validation

The new component tests cover selecting/cancelling a folder, disabled empty input,
entity versus link counts, failure/retry, loading protection and partial-scan
warnings. Native fixture tests cover real entities versus backups/nested content,
non-library rejection without writes, two clients sharing one entity, duplicate
scan roots, linked-entity exclusion and broken links. Native tests must pass before
this increment is packaged; frontend tests do not validate the native bridge.
