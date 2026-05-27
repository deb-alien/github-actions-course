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
	let updateAvailable = false;

	// setup git, create new branch, commit changes, push branch, create pull request
	try {
		logger.debug('Checking for package update');
		await exec('npm update', [], commonExecOptions);

		logger.debug('Git Status');
		const gitStatusOutput = await getExecOutput('git status -s package*.json', [], commonExecOptions);

		if (gitStatusOutput.stdout <= 0) {
			logger.info('No updates available');
			return;
		}
		updateAvailable = true;

		logger.debug('Setting up git');
		await setUpGit();

		logger.debug('Creating new branch');
		await exec(`git checkout -b ${headBranch}`, [], commonExecOptions);

		logger.debug('Adding changes');
		await exec('git add package*.json', [], commonExecOptions);

		logger.debug('Committing changes');
		await exec('git commit -m "Update dependencies"', [], commonExecOptions);

		logger.debug('Pushing changes');
		await exec(`git push origin -u ${headBranch}`, [], commonExecOptions);
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
		setOutput('update_available', updateAvailable);
		return;
	} catch (error) {
		logger.error('An error occurred while creating the pull request');
		setFailed(error.message);
		logger.error(error);
	}
}

await run();
