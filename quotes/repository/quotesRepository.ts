import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Quote, QuoteAlreadyExistsError } from '../domain/quote';

const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoDbClient);

export const saveQuote = async (quote: Quote): Promise<void> => {
    const putCommand = new PutCommand({
        TableName: process.env.QUOTES_TABLE_NAME,
        Item: quote,
        ConditionExpression: 'attribute_not_exists(quoteId)',
    });
    try {
        await docClient.send(putCommand);
    } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
            throw new QuoteAlreadyExistsError(quote.quoteId);
        }
        throw err;
    }
};

export const getQuoteById = async (quoteId: string): Promise<Quote | null> => {
    const command = new GetCommand({
        TableName: process.env.QUOTES_TABLE_NAME,
        Key: { quoteId },
    });
    const result = await docClient.send(command);
    return (result.Item as Quote) ?? null;
};
