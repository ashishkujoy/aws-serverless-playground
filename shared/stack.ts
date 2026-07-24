import { exec } from 'node:child_process';
import { CloudFormationClient, DescribeStackResourcesCommand } from '@aws-sdk/client-cloudformation';

export const STACK_NAME = 'my-app-local';
export const FLOCI_ENDPOINT = 'http://localhost:4566';
export const FLOCI_REGION = 'us-east-1';
export const FLOCI_CONTAINER_NAME = 'floci';

const FLOCI_HEALTH_TIMEOUT_MS = 30_000;
const FLOCI_HEALTH_POLL_INTERVAL_MS = 1_000;

const execOptions = {
    env: {
        ...process.env,
        SAM_LOCAL: 'true',
        AWS_PROFILE: 'floci',
    },
};

const executeCommand = (command: string, options = execOptions): Promise<string> => {
    return new Promise((resolve, reject) => {
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }
            resolve(stdout);
        });
    });
};

const isFlociHealthy = async (): Promise<boolean> => {
    const response = await fetch(`${FLOCI_ENDPOINT}/_localstack/health`).catch(() => null);
    return Boolean(response?.ok);
};

export const ensureFlociRunning = async (): Promise<void> => {
    if (!(await isFlociHealthy())) {
        throw new Error(
            `floci does not appear to be running at ${FLOCI_ENDPOINT}. Start the floci container before running integration tests.`,
        );
    }
};

const waitForFlociHealthy = async (): Promise<void> => {
    const deadline = Date.now() + FLOCI_HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (await isFlociHealthy()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, FLOCI_HEALTH_POLL_INTERVAL_MS));
    }
    throw new Error(`floci did not become healthy at ${FLOCI_ENDPOINT} within ${FLOCI_HEALTH_TIMEOUT_MS}ms`);
};

export const startFloci = async (): Promise<void> => {
    try {
        await executeCommand(`docker rm -f ${FLOCI_CONTAINER_NAME}`);
    } catch (error) {
        console.log(`[integration] No existing floci container to remove: ${(error as Error).message}`);
    }
    await executeCommand(
        `docker run --rm -p 4566:4566 -v /var/run/docker.sock:/var/run/docker.sock -d --name ${FLOCI_CONTAINER_NAME} floci/floci:latest`,
    );
    await waitForFlociHealthy();
};

export const stopFloci = async (): Promise<void> => {
    await executeCommand(`docker stop ${FLOCI_CONTAINER_NAME}`);
};

export const buildStack = async (): Promise<void> => {
    await executeCommand('sam build');
};

export const deployStack = async (): Promise<void> => {
    await executeCommand('samlocal deploy --config-env floci --resolve-s3 --no-confirm-changeset');
};

const cloudFormationClient = new CloudFormationClient({
    endpoint: FLOCI_ENDPOINT,
    region: FLOCI_REGION,
    credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
    },
});

export const getApiBaseUrl = async (stackName: string = STACK_NAME): Promise<string> => {
    const { StackResources } = await cloudFormationClient.send(
        new DescribeStackResourcesCommand({ StackName: stackName }),
    );
    const restApi = StackResources?.find((resource) => resource.LogicalResourceId === 'ServerlessRestApi');
    if (!restApi?.PhysicalResourceId) {
        throw new Error(`Could not find the ServerlessRestApi resource in stack "${stackName}"`);
    }
    return `${FLOCI_ENDPOINT}/restapis/${restApi.PhysicalResourceId}/Prod/_user_request_`;
};
