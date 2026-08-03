# Pending serverless best-practice issues

Findings from a fresh review of the project, not yet implemented. See also
[`idempotency.md`](./idempotency.md) for the POST /quotes idempotency plan.

## DynamoDB table uses `AWS::Serverless::SimpleTable`

`template.yaml`'s `QuotesTable` resource is an `AWS::Serverless::SimpleTable`,
which only supports `PrimaryKey`, `ProvisionedThroughput`,
`SSESpecification`, `TableName`, and `Tags`. It cannot have:

- Global Secondary Indexes — blocks querying quotes by `customerName` or
  `policyType`, which is the whole reason the quote item was flattened into
  native attributes instead of a JSON blob.
- DynamoDB Streams.
- Point-in-Time Recovery — no continuous backup / restore-to-point-in-time
  for what is effectively financial data.

Fix: migrate `QuotesTable` to a full `AWS::DynamoDB::Table` resource, which
exposes all of the above.

## No explicit API Gateway resource

The REST API is SAM's implicit `ServerlessRestApi`, auto-generated from the
function's `Events`. Without an explicit `AWS::Serverless::Api` resource,
there's no way to configure:

- Access logging (`AccessLogSetting`).
- Per-method throttling (`MethodSettings`).
- CORS.
- Gateway-level request validation (Models/RequestValidators) — today every
  malformed request still invokes the Lambda before Zod rejects it inside
  the handler; gateway-level validation would reject it for free before
  invocation.

Fix: add an explicit `AWS::Serverless::Api` resource and point the function's
`Events` at it.

## No concurrency ceiling on `QuotesFunction`

No `ReservedConcurrentExecutions` is set. A traffic burst (legitimate or a
retry storm) could consume the account's entire concurrent-execution pool
and starve any other Lambda function in the same account/region.

Fix: set a `ReservedConcurrentExecutions` value once real traffic patterns
are known.

## Zero unit test coverage

`quotes/domain/quote.ts` and `quotes/repository/quotesRepository.ts` have no
unit tests. Only the floci-backed integration suite
(`tests/integration/quotes.integration.test.ts`) exercises them, which
requires Docker and is slow — there's nothing fast/isolated covering
`createQuote`/`calculatePolicyAmount` or the repository's
`ConditionalCheckFailedException` → `QuoteAlreadyExistsError` translation.

Fix: add a Jest unit suite under `quotes/tests/unit/` targeting the domain
and repository modules directly (mocking the DynamoDB client for the
repository tests).

## Cognito authorizer enforcement can't be verified against floci

`template.yaml` wires `InsuranceCognitoAuthorizer` (COGNITO_USER_POOLS) as the
`DefaultAuthorizer` on `Globals.Api.Auth`, protecting every quotes route. This
is correct, spec-standard SAM — confirmed via `sam validate` — and works
against real AWS. Two floci-only issues currently make it unverifiable
locally:

- floci's bundled SAM transformer silently drops Cognito User Pool authorizer
  config: confirmed with both `Globals.Api.Auth` and an explicit
  `AWS::Serverless::Api` resource, neither produces an
  `AWS::ApiGateway::Authorizer` in the deployed stack, so every method ends up
  with `AuthorizationType: NONE` regardless of the template.
- floci's legacy `/restapis/{id}/{stage}/_user_request_` invoke path
  misinterprets any non-AWS-SigV4 `Authorization` header (it tries to parse it
  for internal routing) and fails the whole request with
  `{"message":"Invalid API id specified"}` — so even a valid Cognito token
  can't be sent to that endpoint locally.

As a result, `tests/integration/quotes.integration.test.ts` has two `it.skip`
tests for the "no token → 401" cases, and none of its requests carry an
`Authorization` header. Fix/next step: re-verify authorizer enforcement
against a real AWS deployment (or a newer floci/LocalStack image, if one lifts
either limitation) before relying on this suite as proof that quotes routes
are actually protected.

## No CI/CD pipeline

There's no `.github/workflows` (or equivalent) in the repo. `npm run
test:integration` only runs locally today — nothing automatically validates
a push or PR.

Fix: add a workflow that runs `tsc --noEmit`, unit tests, and (where Docker
is available in the runner) the floci integration suite on every PR.

## Explicitly deferred (not covered here)

- **Idempotency on POST /quotes** — see [`idempotency.md`](./idempotency.md).
- **Lambda memory size tuning** — explicitly deprioritized; revisit with
  AWS Lambda Power Tuning once there's real production traffic to profile.
