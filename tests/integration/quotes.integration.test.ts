import { describe, it, expect, beforeAll } from '@jest/globals';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { FLOCI_ENDPOINT, FLOCI_REGION } from '../../shared/stack';

describe('Quotes API (floci integration)', () => {
    let baseUrl: string;
    let quotesTableName: string;
    let dynamoDbClient: DynamoDBClient;

    beforeAll(() => {
        baseUrl = process.env.API_BASE_URL as string;
        if (!baseUrl) {
            throw new Error('API_BASE_URL was not set by globalSetup');
        }
        quotesTableName = process.env.QUOTES_TABLE_NAME as string;
        if (!quotesTableName) {
            throw new Error('QUOTES_TABLE_NAME was not set by globalSetup');
        }
        dynamoDbClient = new DynamoDBClient({
            endpoint: FLOCI_ENDPOINT,
            region: FLOCI_REGION,
            credentials: {
                accessKeyId: 'test',
                secretAccessKey: 'test',
            },
        });
    });

    it('GET /quotes/{quoteId} returns hello world', async () => {
        const response = await fetch(`${baseUrl}/quotes/123`);
        const body = await response.json();

        expect(response.status).toEqual(200);
        expect(body).toEqual({ message: 'hello world' });
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

        const { Item } = await dynamoDbClient.send(
            new GetItemCommand({
                TableName: quotesTableName,
                Key: { quoteId: { S: body.quoteId } },
            }),
        );

        expect(Item).toBeDefined();
        expect(JSON.parse(Item?.quoteData.S as string)).toEqual(body);
    });

    it('POST /quotes with invalid JSON returns 500', async () => {
        const response = await fetch(`${baseUrl}/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{not valid json',
        });
        const body = await response.json();

        expect(response.status).toEqual(500);
        expect(body).toEqual({ message: 'some error happened' });
    });
});
