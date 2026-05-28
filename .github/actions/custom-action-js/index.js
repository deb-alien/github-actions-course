import { error, getBooleanInput, getInput, info, setFailed, setOutput, setSecret } from '@actions/core';
import { exec, getExecOutput } from '@actions/exec';
import { context, getOctokit } from '@actions/github';

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

async function setUpGit() {
	await exec('git config --global user.name "github-actions[bot]"');
	await exec('git config --global user.email "github-actions[bot]@users.noreply.github.com"');
}

async function branchExists({ branchName, options }) {
	const output = await getExecOutput(`git branch --list ${branchName}`, [], {
		...options,
		silent: true,
		ignoreReturnCode: true,
	});

	return output.stdout.trim().length > 0;
}

async function remoteBranchExists({ branchName, options }) {
	const output = await getExecOutput(`git ls-remote --heads origin ${branchName}`, [], {
		...options,
		silent: true,
		ignoreReturnCode: true,
	});

	return output.stdout.trim().length > 0;
}

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

	// setup git, create new branch, commit changes, push branch, create pull request
	try {
		logger.debug('Setting up git');
		await setUpGit();

		logger.debug('Fetching latest refs');
		await exec(`git fetch origin ${baseBranch} ${headBranch}`, [], {
			...commonExecOptions,
			ignoreReturnCode: true,
		});

		logger.debug('Checking out base branch');
		await exec(`git checkout ${baseBranch}`, [], commonExecOptions);

		logger.debug('Updating base branch');
		await exec(`git pull origin ${baseBranch} --ff-only`, [], commonExecOptions);

		const hasLocalHeadBranch = await branchExists({ branchName: headBranch, options: commonExecOptions });
		const hasRemoteHeadBranch = await remoteBranchExists({ branchName: headBranch, options: commonExecOptions });

		if (hasLocalHeadBranch) {
			logger.debug('Checking out existing local head branch');
			await exec(`git checkout ${headBranch}`, [], commonExecOptions);
		} else if (hasRemoteHeadBranch) {
			logger.debug('Checking out head branch from remote');
			await exec(`git checkout -b ${headBranch} origin/${headBranch}`, [], commonExecOptions);
		} else {
			logger.debug('Creating new head branch from base branch');
			await exec(`git checkout -b ${headBranch}`, [], commonExecOptions);
		}

		logger.debug('Rebasing head branch on latest base branch');
		await exec(`git rebase origin/${baseBranch}`, [], commonExecOptions);

		logger.debug('Checking for package update');
		await exec('npm update', [], commonExecOptions);

		logger.debug('Git Status');
		const gitStatusOutput = await getExecOutput('git status -s package*.json', [], commonExecOptions);

		if (gitStatusOutput.stdout.trim().length === 0) {
			logger.info('No updates available');
			setOutput('update_available', false);
			return;
		}
		setOutput('update_available', true);

		logger.debug('Adding changes');
		await exec('git add .', [], commonExecOptions);

		logger.debug('Committing changes');
		await exec('git commit -m "Update dependencies"', [], commonExecOptions);

		logger.debug('Pushing changes');
		await exec(`git push origin ${headBranch} --force-with-lease`, [], commonExecOptions);
	} catch (error) {
		logger.error('An error occurred while updating dependencies or pushing changes');
		setFailed(error.message);
		logger.error(error);
		return;
	}

	// If there are updates available, create a pull request
	try {
		logger.debug('Creating pull request');
		const octokit = getOctokit(ghToken);

		const existingPrs = await octokit.rest.pulls.list({
			owner: context.repo.owner,
			repo: context.repo.repo,
			head: `${context.repo.owner}:${headBranch}`,
			base: baseBranch,
			state: 'open',
			per_page: 1,
		});

		if (existingPrs.data.length > 0) {
			logger.info(`Pull request already exists: #${existingPrs.data[0].number}`);
			logger.debug('Setting output for update availability');
			setOutput('update_available', true);
			return;
		}

		await octokit.rest.pulls.create({
			owner: context.repo.owner,
			repo: context.repo.repo,
			title: 'Update dependencies',
			head: headBranch,
			base: baseBranch,
			body: 'This pull request updates the dependencies.',
		});
		logger.info('Pull request created successfully');

		logger.debug('Setting output for update availability');
		setOutput('update_available', true);
		return;
	} catch (error) {
		logger.error('An error occurred while creating the pull request');
		setFailed(error.message);
		logger.error(error);
	}
}

await run();
