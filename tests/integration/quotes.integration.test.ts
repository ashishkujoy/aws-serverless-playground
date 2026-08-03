import { describe, it, expect, beforeAll } from '@jest/globals';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { FLOCI_ENDPOINT, FLOCI_REGION } from '../../shared/stack';

// NOTE on the two skipped tests below and the missing Authorization header on
// the requests in this file: floci has two compounding limitations that make
// it impossible to exercise Cognito authorization end-to-end locally.
// 1. Its bundled SAM transformer silently drops Cognito User Pool authorizer
//    config (confirmed with both Globals.Api.Auth and an explicit
//    AWS::Serverless::Api resource — neither produces an
//    AWS::ApiGateway::Authorizer, so every method deploys as AuthorizationType
//    NONE regardless of template.yaml).
// 2. Its legacy `/restapis/{id}/{stage}/_user_request_` invoke path
//    misinterprets any non-AWS-SigV4 `Authorization` header (it tries to parse
//    it for routing) and fails the whole request with
//    {"message":"Invalid API id specified"} — so even a valid Cognito token
//    can't be sent on this endpoint locally.
// The authorizer wiring in template.yaml is correct SAM per `sam validate` and
// works against real AWS; this is a floci-only local-testing gap. See
// docs/pending-issues.md.
describe('Quotes API (floci integration)', () => {
    let baseUrl: string;
    let quotesTableName: string;
    let docClient: DynamoDBDocumentClient;

    const testUser = { email: 'quotes-integration-test@example.com', password: 'Password123' };

    beforeAll(async () => {
        baseUrl = process.env.API_BASE_URL as string;
        if (!baseUrl) {
            throw new Error('API_BASE_URL was not set by globalSetup');
        }
        quotesTableName = process.env.QUOTES_TABLE_NAME as string;
        if (!quotesTableName) {
            throw new Error('QUOTES_TABLE_NAME was not set by globalSetup');
        }
        docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
            endpoint: FLOCI_ENDPOINT,
            region: FLOCI_REGION,
            credentials: {
                accessKeyId: 'test',
                secretAccessKey: 'test',
            },
        }));

        // Exercises signup + login still work post-deploy. Ignore the signup
        // response: the user may already exist from a previous run against the
        // same stack.
        await fetch(`${baseUrl}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testUser),
        });

        const loginResponse = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testUser),
        });
        if (loginResponse.status !== 200) {
            throw new Error(`Failed to log in test user: ${JSON.stringify(await loginResponse.json())}`);
        }
    });

    it('GET /quotes/{quoteId} returns hello world', async () => {
        const putCommand = new PutCommand({
            TableName: quotesTableName,
            Item: {
                quoteId: '123',
                customerName: 'John Doe',
                age: 30,
                coverage: 100000,
                policyType: 'auto',
                policyAmount: 10000,
            },
        });
        await docClient.send(putCommand);
        const response = await fetch(`${baseUrl}/quotes/123`);
        const body = await response.json();

        expect(response.status).toEqual(200);
        expect(body).toEqual({
            quoteId: '123',
            customerName: 'John Doe',
            age: 30,
            coverage: 100000,
            policyType: 'auto',
            policyAmount: 10000,
        });
    });

    it.skip('GET /quotes/{quoteId} without a token returns 401', async () => {
        const response = await fetch(`${baseUrl}/quotes/123`);

        expect(response.status).toEqual(401);
    });

    it('POST /quotes creates a new quote', async () => {
        const payload = { customerName: 'John Doe', age: 30, coverage: 100000, policyType: 'auto' };
        const response = await fetch(`${baseUrl}/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await response.json();

        expect(response.status).toEqual(200);
        expect(body).toMatchObject(payload);

        const { Item } = await docClient.send(
            new GetCommand({
                TableName: quotesTableName,
                Key: { quoteId: body.quoteId },
            }),
        );

        expect(Item).toEqual(body);
    });

    it.skip('POST /quotes without a token returns 401', async () => {
        const payload = { customerName: 'John Doe', age: 30, coverage: 100000, policyType: 'auto' };
        const response = await fetch(`${baseUrl}/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        expect(response.status).toEqual(401);
    });

    it('POST /quotes with invalid JSON returns 400', async () => {
        const response = await fetch(`${baseUrl}/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{not valid json',
        });
        const body = await response.json();

        expect(response.status).toEqual(400);
        expect(body).toEqual({ message: 'Malformed JSON in request body' });
    });

    it('POST /quotes with a schema-invalid payload returns 400', async () => {
        const payload = { customerName: 'John Doe', age: -5, coverage: 100000, policyType: 'auto' };
        const response = await fetch(`${baseUrl}/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await response.json();

        expect(response.status).toEqual(400);
        expect(body.message).toEqual('Invalid request body');
    });
});
