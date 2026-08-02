import {
    AdminCreateUserCommand,
    AdminInitiateAuthCommand,
    AdminSetUserPasswordCommand,
    CognitoIdentityProviderClient,
    NotAuthorizedException,
    UserNotFoundException,
    UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { InvalidCredentialsError, LoginRequest, LoginResult, SignupRequest, UserAlreadyExistsError } from '../domain/authUser';
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

export const login = async (request: LoginRequest): Promise<LoginResult> => {
    try {
        const result = await cognitoClient.send(
            new AdminInitiateAuthCommand({
                UserPoolId: process.env.USER_POOL_ID,
                ClientId: process.env.USER_POOL_CLIENT_ID,
                AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
                AuthParameters: {
                    USERNAME: request.email,
                    PASSWORD: request.password,
                },
            }),
        );
        const authResult = result.AuthenticationResult;
        if (!authResult?.IdToken || !authResult.AccessToken || !authResult.RefreshToken) {
            throw new InvalidCredentialsError();
        }
        return {
            idToken: authResult.IdToken,
            accessToken: authResult.AccessToken,
            refreshToken: authResult.RefreshToken,
        };
    } catch (err) {
        if (err instanceof NotAuthorizedException || err instanceof UserNotFoundException) {
            throw new InvalidCredentialsError();
        }
        throw err;
    }
};
