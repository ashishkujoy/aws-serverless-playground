import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';


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
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'hello world',
            }),
        };
    }
    try {
        let bodyStr = event.body || "";
        if (event.isBase64Encoded) {
            bodyStr = Buffer.from(bodyStr, 'base64').toString('utf-8');
        }
        const body = JSON.parse(bodyStr);
        return {
            statusCode: 200,
            body: JSON.stringify(body),
        };
    } catch (err) {
        console.log(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'some error happened',
            }),
        };
    }
};
