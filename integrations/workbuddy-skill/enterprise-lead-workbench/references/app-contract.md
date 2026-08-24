# Application contract

The Web UI, REST API, and MCP tools all call the same application services. Do not implement separate Agent-only business logic.

## Job actions

The initial server action endpoint accepts these domain actions:

- `test_connection`: validate one configured source without exposing credentials.
- `start_ingestion`: create a real source query or file-import job.
- `run_ruleset`: execute a published rule-set version against an immutable input batch.
- `start_export`: generate an export from a completed run.

Every action is scoped to a workspace and returns a job identifier plus a server status. The public action endpoint may normalize a completed job to `succeeded`; persisted job states are `queued`, `running`, `completed`, `partial`, `failed`, and `cancelled` (exports do not use `partial`). Treat both `succeeded` and `completed` as successful terminal states.

## Required identifiers

- Workspace: identifies the tenant boundary.
- Source connection: identifies a configured provider without returning its secret.
- Input batch: identifies the immutable set of source records.
- Rule-set version: identifies the exact deterministic rules.
- Rule run: joins one input batch with one rule-set version.
- Export: identifies the generated artifact and its audit metadata.

## MCP surface

The first production MCP exposes domain tools instead of generic SQL:

- list and inspect source connections;
- submit provider-query ingestion jobs and inspect ingestion jobs;
- list batches and companies;
- inspect rule sets and immutable rule-set versions;
- start and inspect rule runs;
- list decisions and inspect field-level evidence;
- create and inspect export jobs.

File upload, connection testing, and manual review remain GUI or application-API operations. MCP may publish a validated RuleTemplate v1 through `save_rule_template`, but it must not emulate application behavior with generic table mutation or SQL.

Ego Lite public reports use `start_ingestion_query` with `queryKind: web_evidence`, an existing `companyId`, `claimType: public_report`, and `reportMode: true`. Poll with `list_ingestion_jobs`; the safe MCP response returns report metadata and `reportAvailable`, never the HTML body.

QCC `company_detail` is an enrichment of an already-ingested company, not a list-acquisition query. Before calling it, retain the company's original list ID from `list_company_lists` / `list_companies`. A successful job returns `verified_company_ids` and does not create or return a new `company_list_id`; hand back the original list route. QCC facts remain an independent source and never silently overwrite Huoke Assistant or uploaded facts.

## Web UI handoff

Agent responses hand off stable resource identifiers, not a second copy of application state:

- company list: `/#/lists/{companyListId}`;
- public report: `/#/reports/{ingestionJobId}`;
- configuration: `/#/sources`;
- rule task history: `/#/runs`.

Only prepend an origin supplied by the deployment environment. Never assume localhost, a production domain, or a port. The Web UI rereads the same tenant-scoped records, so the Agent must not serialize HTML, credentials, or provider raw responses into a link.

Write operations must enforce workspace membership, scoped permissions, idempotency, and audit logging.
