import { describe, it, expect, beforeAll } from '@jest/globals';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { FLOCI_ENDPOINT, FLOCI_REGION } from '../../shared/stack';

describe('Quotes API (floci integration)', () => {
    let baseUrl: string;
    let quotesTableName: string;
    let docClient: DynamoDBDocumentClient;

    beforeAll(() => {
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
