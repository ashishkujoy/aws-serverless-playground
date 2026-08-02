import { z } from 'zod';

export const SignupRequestSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});

export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export type LoginResult = {
    idToken: string;
    accessToken: string;
    refreshToken: string;
};

export class UserAlreadyExistsError extends Error {
    constructor(email: string) {
        super(`User ${email} already exists`);
        this.name = 'UserAlreadyExistsError';
    }
}

export class InvalidCredentialsError extends Error {
    constructor() {
        super('Invalid email or password');
        this.name = 'InvalidCredentialsError';
    }
}
