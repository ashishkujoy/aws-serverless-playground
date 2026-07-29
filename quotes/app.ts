import { randomUUID } from 'node:crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context, } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */
const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoDbClient);

export const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    if (event.httpMethod === 'GET') {
        return handleGetQuote(event);
    }
    try {
        const body = parseRequestBody(event);
        const quote = await processCreateQuote(body);
        return {
            statusCode: 200,
            body: JSON.stringify(quote),
        };
    } catch (err) {
        return handleError(err);
    }
};

const handleGetQuote = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const quoteId = event.pathParameters?.quoteId;
    if (!quoteId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing quoteId in path parameters' }),
        };
    }
    const quote = await getQuoteById(quoteId);
    return {
        statusCode: 200,
        body: JSON.stringify(quote),
    };
};

const getQuoteById = async (quoteId: string): Promise<Quote | null> => {
    const command = new GetCommand({
        TableName: process.env.QUOTES_TABLE_NAME,
        Key: { quoteId },
    });
    const result = await docClient.send(command);
    if (!result.Item) {
        return null;
    }
    return result.Item as Quote;
};

const parseRequestBody = (event: APIGatewayProxyEvent): QuoteCreationRequest => {
    let bodyStr = event.body || "";
    if (event.isBase64Encoded) {
        bodyStr = Buffer.from(bodyStr, 'base64').toString('utf-8');
    }
    const body = JSON.parse(bodyStr);
    return QuoteCreationRequestSchema.parse(body);
}

const QuoteCreationRequestSchema = z.object({
    customerName: z.string().min(1),
    age: z.number().int().positive(),
    coverage: z.number().positive(),
    policyType: z.string().min(1),
});

type QuoteCreationRequest = z.infer<typeof QuoteCreationRequestSchema>;

type Quote = QuoteCreationRequest & {
    quoteId: string;
    policyAmount: number;
}

const generateQuoteId = (): string => {
    return `quote-${randomUUID()}`;
};

const calculatePolicyAmount = (body: QuoteCreationRequest): number => {
    // Implement your policy amount calculation logic here
    return body.coverage * 0.1; // Example calculation
};

const processCreateQuote = async (body: QuoteCreationRequest) => {
    const quote: Quote = {
        ...body,
        quoteId: generateQuoteId(),
        policyAmount: calculatePolicyAmount(body),
    };
    const putCommand = new PutCommand({
        TableName: process.env.QUOTES_TABLE_NAME,
        Item: quote,
        ConditionExpression: 'attribute_not_exists(quoteId)',
    });
    await docClient.send(putCommand);
    return quote;
}

const handleError = (err: unknown) => {
    if (err instanceof z.ZodError) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid request body', errors: err.issues }),
        };
    }
    console.log(err);
    return {
        statusCode: 500,
        body: JSON.stringify({ message: 'some error happened' }),
    };
}
