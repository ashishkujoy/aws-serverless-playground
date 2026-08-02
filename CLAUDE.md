# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-function AWS SAM (Serverless Application Model) app: `QuotesFunction`, a TypeScript Lambda behind API Gateway backed by a DynamoDB table (`QuotesTable`). It exposes:

- `POST /quotes` — create a quote
- `GET /quotes/{quoteId}` — fetch a quote by id

All infra is defined in `template.yaml`. There is no separate frontend.

## Repo layout

- `template.yaml` — SAM/CloudFormation template: `QuotesFunction`, `QuotesTable`, implicit API Gateway (`ServerlessRestApi`), IAM policies, Powertools env vars.
- `quotes/` — the Lambda's own npm package (separate `package.json`/`tsconfig.json`/`node_modules` from the repo root, since this is what SAM builds via esbuild).
  - `app.ts` — Lambda handler entrypoint (`lambdaHandler`); routes on `event.httpMethod`, validates input, translates domain errors to HTTP status codes.
  - `domain/quote.ts` — `QuoteCreationRequestSchema` (Zod), `createQuote`, `QuoteAlreadyExistsError`.
  - `repository/quotesRepository.ts` — DynamoDB access (`saveQuote`, `getQuoteById`) via `DynamoDBDocumentClient`; translates `ConditionalCheckFailedException` into `QuoteAlreadyExistsError`.
  - `observability.ts` — shared Powertools `logger`/`tracer` singletons, imported by both the handler and the repository.
- `shared/stack.ts` — root-level TS helpers (not part of the Lambda bundle) for the integration test harness: starting/stopping the `floci` container, running `sam build`/`samlocal deploy`, and resolving stack outputs (API URL, table name) via `DescribeStackResourcesCommand`.
- `tests/integration/` — end-to-end HTTP tests run against a real deployed stack in `floci` (a local AWS emulator), plus Jest global setup/teardown that manage the `floci` lifecycle.
- `docs/pending-issues.md` / `docs/idempotency.md` — living design notes on known gaps (see below); check these before assuming a limitation is unintentional.

## Two separate TypeScript/npm projects

This repo has **two independent dependency trees** — don't run root-level installs expecting them to cover `quotes/`, or vice versa:

1. **Root** (`package.json`, root `tsconfig.json`): only the integration test harness (`tests/`, `shared/stack.ts`) and its AWS SDK / Jest deps. Root `tsconfig.json` explicitly excludes `quotes/`.
2. **`quotes/`** (`quotes/package.json`, `quotes/tsconfig.json`): the actual Lambda source and its runtime deps (Powertools logger/tracer, AWS SDK, Zod) plus its own unit-test tooling. SAM builds this directory directly via esbuild (see `Metadata.BuildProperties` in `template.yaml`).

When adding a dependency, install it in the correct project (`cd quotes && npm install ...` for runtime/Lambda deps, root `npm install ...` for integration-test-only deps).

## Common commands

Build and deploy the real SAM stack (from repo root):
```bash
sam build
sam deploy            # after first `sam deploy --guided`; samconfig.toml already has stack name + capabilities saved
sam local start-api    # emulate the API locally on :3000
sam local invoke QuotesFunction --event events/event.json
sam logs -n QuotesFunction --stack-name insurance --tail
```

Lambda unit tests and lint (from `quotes/`):
```bash
cd quotes
npm run lint      # eslint '*.ts' --quiet --fix
npm run compile   # tsc --noEmit (via tsconfig noEmit)
npm run unit      # jest, tests under quotes/tests/unit/*.test.ts
npm run test      # compile then unit
```
Note: as of writing there are **no unit tests yet** (`quotes/tests/unit/` doesn't exist) — see "Zero unit test coverage" in `docs/pending-issues.md`. Only the floci integration suite currently exercises `domain/quote.ts` and `repository/quotesRepository.ts`.

Integration tests against `floci` (from repo root, needs Docker + `samlocal` on `PATH`):
```bash
npm run test:integration          # starts floci, sam build, samlocal deploy, then runs tests/integration/*.test.ts
SKIP_DEPLOY=true npm run test:integration   # reuse whatever's already deployed on floci; skip container restart/rebuild/redeploy
DESTROY_AFTER_TESTS=true npm run test:integration  # tear down the floci container afterward (default: left running)
```
Other root scripts: `npm run build:local` (`sam build`), `npm run deploy:local` (`samlocal deploy --config-env floci`), `npm run destroy:local` (`samlocal delete --stack-name my-app-local`).

To run a single integration test file/case, use Jest's normal filtering against the integration config, e.g.:
```bash
npx jest --config jest.integration.config.ts -t "creates a new quote"
```

## Architecture notes

- **Handler routing is manual, not framework-based**: `app.ts` branches on `event.httpMethod` directly (no router library). GET always goes through `handleGetQuote`; everything else falls through to the POST/create path.
- **Error-to-HTTP-status mapping lives in `handleError`** in `app.ts` — a single `catch` in the handler dispatches on error type (`ZodError` → 400, `SyntaxError` → 400 malformed JSON, `QuoteAlreadyExistsError` → 409, else → 500). When adding new domain errors that need a specific status code, extend this function rather than adding try/catch elsewhere.
- **Domain errors are thrown, not returned**: `repository/quotesRepository.ts` translates the DynamoDB-specific `ConditionalCheckFailedException` into the domain-level `QuoteAlreadyExistsError` at the repository boundary, so `app.ts` only ever needs to know about domain errors.
- **Idempotency is a known, explicit gap** — `POST /quotes` generates a fresh UUID per call, so retries create duplicate quotes. A conditional write (`attribute_not_exists(quoteId)`) exists purely to prevent an accidental overwrite on a UUID collision, not for retry-safety. See `docs/idempotency.md` for the planned fix (client-supplied `Idempotency-Key` header + `@aws-lambda-powertools/idempotency`) before changing this behavior.
- **`QuotesTable` is an `AWS::Serverless::SimpleTable`**, which limits it to a primary key only — no GSIs, streams, or point-in-time recovery. This is a known limitation tracked in `docs/pending-issues.md`, not an oversight; don't add a GSI without first migrating the resource type to `AWS::DynamoDB::Table`.
- **Powertools tracing is toggled via the `PowertoolsTraceEnabled` template parameter** (`template.yaml`), defaulting to `'true'` for real AWS but overridden to `'false'` for the `floci` deploy config (`samconfig.toml` → `[floci.deploy.parameters]`) since local emulators don't provide real X-Ray trace context.
- **Integration tests hit a real deployed stack**, not mocks: `globalSetup.ts` force-recreates the `floci` container, builds/deploys the SAM stack, and resolves the live API Gateway URL and table name via CloudFormation `DescribeStackResourcesCommand` (`shared/stack.ts`), exposing them as `process.env.API_BASE_URL` / `QUOTES_TABLE_NAME` to the tests. Tests both call the HTTP API and read/write the DynamoDB table directly to assert on persisted state.

