import { stopFloci } from '../../../shared/stack';

export default async function globalTeardown(): Promise<void> {
    if (process.env.DESTROY_AFTER_TESTS === 'true') {
        console.log('[integration] Stopping floci container...');
        await stopFloci();
    }
}
