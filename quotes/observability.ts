import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';

export const logger = new Logger();
export const tracer = new Tracer();
