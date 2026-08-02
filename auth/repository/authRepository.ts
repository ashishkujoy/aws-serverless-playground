import {
    AdminCreateUserCommand,
    AdminSetUserPasswordCommand,
    CognitoIdentityProviderClient,
    UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { SignupRequest, UserAlreadyExistsError } from '../domain/authUser';
import { tracer } from '../observability';

const cognitoClient = tracer.captureAWSv3Client(
    new CognitoIdentityProviderClient({ region: process.env.AWS_REGION }),
);

export const signUp = async (request: SignupRequest): Promise<void> => {
    try {
        await cognitoClient.send(
            new AdminCreateUserCommand({
                UserPoolId: process.env.USER_POOL_ID,
                Username: request.email,
                UserAttributes: [
                    { Name: 'email', Value: request.email },
                    { Name: 'email_verified', Value: 'true' },
                ],
                MessageAction: 'SUPPRESS',
            }),
        );
        await cognitoClient.send(
            new AdminSetUserPasswordCommand({
                UserPoolId: process.env.USER_POOL_ID,
                Username: request.email,
                Password: request.password,
                Permanent: true,
            }),
        );
    } catch (err) {
        if (err instanceof UsernameExistsException) {
            throw new UserAlreadyExistsError(request.email);
        }
        throw err;
    }
};
