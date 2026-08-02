import { z } from 'zod';

export const SignupRequestSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});

export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export class UserAlreadyExistsError extends Error {
    constructor(email: string) {
        super(`User ${email} already exists`);
        this.name = 'UserAlreadyExistsError';
    }
}
