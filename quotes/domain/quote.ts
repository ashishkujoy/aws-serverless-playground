import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const QuoteCreationRequestSchema = z.object({
    customerName: z.string().min(1),
    age: z.number().int().positive(),
    coverage: z.number().positive(),
    policyType: z.string().min(1),
});

export type QuoteCreationRequest = z.infer<typeof QuoteCreationRequestSchema>;

export type Quote = QuoteCreationRequest & {
    quoteId: string;
    policyAmount: number;
}

export class QuoteAlreadyExistsError extends Error {
    constructor(quoteId: string) {
        super(`Quote ${quoteId} already exists`);
        this.name = 'QuoteAlreadyExistsError';
    }
}

const generateQuoteId = (): string => {
    return `quote-${randomUUID()}`;
};

const calculatePolicyAmount = (request: QuoteCreationRequest): number => {
    // Implement your policy amount calculation logic here
    return request.coverage * 0.1; // Example calculation
};

export const createQuote = (request: QuoteCreationRequest): Quote => {
    return {
        ...request,
        quoteId: generateQuoteId(),
        policyAmount: calculatePolicyAmount(request),
    };
};
