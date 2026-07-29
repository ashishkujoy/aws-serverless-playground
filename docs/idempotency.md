# POST /quotes idempotency (planned, not yet implemented)

## Problem

`POST /quotes` is not idempotent. `quotes/domain/quote.ts` generates a fresh
`quoteId` via `crypto.randomUUID()` on every invocation, so a client retry
after a timeout or a dropped response creates a second, distinct quote for
the same logical request instead of returning the original one.

## Open decision: where the idempotency key comes from

Two options, not yet decided:

1. **Client-supplied `Idempotency-Key` header (recommended).** The client
   generates one key per logical request and sends it on every retry.
   Matches the standard REST pattern (Stripe-style). Two different keys with
   an identical body are correctly treated as two separate quotes — a
   customer can legitimately request the same quote twice.
2. **Content-derived key** (hash of `customerName`/`age`/`coverage`/
   `policyType`). No client-side changes needed, but it conflates
   idempotency with deduplication: two genuinely separate identical requests
   would incorrectly collapse into one quote.

Recommendation: option 1. It requires a documented API contract change
(clients must send the header), but it's the only option that doesn't risk
silently merging distinct business requests.

## Recommended implementation

Use [`@aws-lambda-powertools/idempotency`](https://docs.powertools.aws.dev/lambda/typescript/latest/features/idempotency/)
rather than a hand-rolled conditional-write check:

- It hashes the request and persists the in-progress/complete state to
  DynamoDB with a TTL, so a retry replays the original cached response
  instead of re-running `createQuote`/`saveQuote`.
- It correctly handles two concurrent retries racing each other (locking on
  the in-progress record) — a plain conditional `PutCommand` check on
  `QuotesTable` does not.
- It's the AWS-maintained tool built specifically for this problem, which
  fits the "serverless best practices" thrust of the rest of this codebase's
  cleanup (Zod validation, least-privilege IAM, etc.).

Cost of adopting it:

- One new runtime dependency (`@aws-lambda-powertools/idempotency`).
- One new small DynamoDB table dedicated to idempotency records — separate
  from `QuotesTable`, since the natural partition key here is the
  idempotency token, not `quoteId`.
- IAM permissions on that new table: `GetItem`, `PutItem`, `UpdateItem`,
  `DeleteItem` (unlike `QuotesTable`, this table needs updates for the
  in-progress → complete state transition).

## Next steps when picked up

1. Confirm the `Idempotency-Key` header contract (required vs optional;
   behavior when omitted).
2. Add the idempotency DynamoDB table + scoped IAM policy to `template.yaml`.
3. Wrap `saveQuote`/`createQuote` (or the `app.ts` POST path) with the
   Powertools idempotency decorator/handler.
4. Add integration tests: same key + same body → same `quoteId` returned on
   both calls, only one item written to `QuotesTable`; same key + different
   body → conflict response.
