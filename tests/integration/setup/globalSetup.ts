import { ensureFlociRunning, startFloci, buildStack, deployStack, getApiBaseUrl, getQuotesTableName, STACK_NAME } from '../../../shared/stack';

export default async function globalSetup(): Promise<void> {
    if (process.env.SKIP_DEPLOY === 'true') {
        console.log('[integration] SKIP_DEPLOY=true, using the existing deployment on floci');
        await ensureFlociRunning();
    } else {
        if (process.env.NO_CLEAR === 'true') {
            console.log('[integration] NO_CLEAR=true, skipping floci clear, using the existing container');
            await ensureFlociRunning();
        } else {
            console.log('[integration] Restarting floci...');
            await startFloci();
        }
        console.log('[integration] Building application...');
        await buildStack();
        console.log('[integration] Deploying to floci...');
        await deployStack();
    }

    const apiBaseUrl = await getApiBaseUrl(STACK_NAME);
    console.log(`[integration] API base URL: ${apiBaseUrl}`);
    process.env.API_BASE_URL = apiBaseUrl;
    process.env.AWS_REGION = 'ap-south-1';
    process.env.QUOTES_TABLE_NAME = await getQuotesTableName(STACK_NAME);
}
