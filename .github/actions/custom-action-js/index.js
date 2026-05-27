import { error, getBooleanInput, getInput, info, setSecret } from '@actions/core';

const validateBranchName = ({ branchName }) => /^[a-zA-Z0-9_\-\.\/]+$/.test(branchName);
const validateDirectoryName = ({ dirName }) => /^[a-zA-Z0-9_\-\/]+$/.test(dirName);

const setupLogger = ({ debug, prefix } = { debug: false, prefix: '' }) => ({
	debug: (message) => {
		if (debug) {
			info(`DEBUG ${prefix}${prefix ? ' : ' : ''}${message}`);
		}
	},
	info: (message) => {
		info(`${prefix}${prefix ? ' : ' : ''}${message}`);
	},
	error: (message) => {
		error(`${prefix}${prefix ? ' : ' : ''}${message}`);
	},
});

async function run() {
	const headBranch = getInput('head-branch', { required: true });
	const baseBranch = getInput('base-branch', { required: true });
	const workingDirectory = getInput('working-directory', { required: true });
	const debug = getBooleanInput('debug', { required: false });
	const ghToken = getInput('gh-token', { required: true });

	const logger = setupLogger({ debug, prefix: '[dependency-update]' });

	const commonExecOptions = {
		cwd: workingDirectory,
	};

	setSecret(ghToken);

	logger.debug('Validating inputs');
	if (!validateBranchName({ branchName: headBranch })) {
		logger.error(`Invalid head branch name: ${headBranch}`);
		return;
	}
	if (!validateBranchName({ branchName: baseBranch })) {
		logger.error(`Invalid base branch name: ${baseBranch}`);
		return;
	}
	if (!validateDirectoryName({ dirName: workingDirectory })) {
		logger.error(`Invalid working directory name: ${workingDirectory}`);
		return;
	}

	logger.info(`Base Branch is: ${baseBranch}`);
	logger.info(`Head Branch is: ${headBranch}`);
	logger.info(`Working Directory is: ${workingDirectory}`);

	// Here you would add the logic to update dependencies, create a pull request, etc.
}

await run();
