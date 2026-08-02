import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { z } from 'zod';
import {
    InvalidCredentialsError,
    LoginRequestSchema,
    SignupRequestSchema,
    UserAlreadyExistsError,
} from './domain/authUser';
import { login, signUp } from './repository/authRepository';
import { logger } from './observability';

export const lambdaHandler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.addContext(context);
    logger.info('Handling request', { httpMethod: event.httpMethod, path: event.path });
    try {
        if (event.httpMethod === 'POST' && event.path === '/auth/signup') {
            return await handleSignup(event);
        }
        if (event.httpMethod === 'POST' && event.path === '/auth/login') {
            return await handleLogin(event);
        }
        return {
            statusCode: 404,
            body: JSON.stringify({ message: 'Not found' }),
        };
    } catch (err) {
        return handleError(err);
    }
};

const handleSignup = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const requestBody = SignupRequestSchema.parse(parseJsonBody(event));
    await signUp(requestBody);
    logger.info('User signed up', { email: requestBody.email });
    return {
        statusCode: 201,
        body: JSON.stringify({ email: requestBody.email }),
    };
};

const handleLogin = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const requestBody = LoginRequestSchema.parse(parseJsonBody(event));
    const result = await login(requestBody);
    logger.info('User logged in', { email: requestBody.email });
    return {
        statusCode: 200,
        body: JSON.stringify(result),
    };
};

const parseJsonBody = (event: APIGatewayProxyEvent): unknown => {
    let bodyStr = event.body || '';
    if (event.isBase64Encoded) {
        bodyStr = Buffer.from(bodyStr, 'base64').toString('utf-8');
    }
    return JSON.parse(bodyStr);
};

const handleError = (err: unknown): APIGatewayProxyResult => {
    if (err instanceof z.ZodError) {
        logger.warn('Invalid request body', { issues: err.issues });
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid request body', errors: err.issues }),
        };
    }
    if (err instanceof SyntaxError) {
        logger.warn('Malformed JSON in request body');
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Malformed JSON in request body' }),
        };
    }
    if (err instanceof UserAlreadyExistsError) {
        logger.warn(err.message);
        return {
            statusCode: 409,
            body: JSON.stringify({ message: err.message }),
        };
    }
    if (err instanceof InvalidCredentialsError) {
        logger.warn(err.message);
        return {
            statusCode: 401,
            body: JSON.stringify({ message: err.message }),
        };
    }

    logger.error('Unhandled error while processing request', err as Error);
    return {
        statusCode: 500,
        body: JSON.stringify({ message: 'some error happened' }),
    };
};
