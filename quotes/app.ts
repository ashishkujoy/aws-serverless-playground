import { APIGatewayProxyEvent, APIGatewayProxyResult, Context, } from 'aws-lambda';
import { z } from 'zod';
import { createQuote, QuoteAlreadyExistsError, QuoteCreationRequestSchema } from './domain/quote';
import { getQuoteById, saveQuote } from './repository/quotesRepository';

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */
export const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    if (event.httpMethod === 'GET') {
        return handleGetQuote(event);
    }
    try {
        const requestBody = QuoteCreationRequestSchema.parse(parseJsonBody(event));
        const quote = createQuote(requestBody);
        await saveQuote(quote);
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

const parseJsonBody = (event: APIGatewayProxyEvent): unknown => {
    let bodyStr = event.body || "";
    if (event.isBase64Encoded) {
        bodyStr = Buffer.from(bodyStr, 'base64').toString('utf-8');
    }
    return JSON.parse(bodyStr);
}

const handleError = (err: unknown) => {
    if (err instanceof z.ZodError) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid request body', errors: err.issues }),
        };
    }
    if (err instanceof SyntaxError) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Malformed JSON in request body' }),
        };
    }
    if (err instanceof QuoteAlreadyExistsError) {
        return {
            statusCode: 409,
            body: JSON.stringify({ message: err.message }),
        };
    }

    return {
        statusCode: 500,
        body: JSON.stringify({ message: 'some error happened' }),
    };
}
