import { error, getBooleanInput, getInput, info, setFailed, setOutput } from '@actions/core';
import { exec, getExecOutput } from '@actions/exec';
import * as github from '@actions/github';

const { context, getOctokit } = github;

function validateBranchName(branchName) {
	return /^[a-zA-Z0-9_\-\.\/]+$/.test(branchName);
}

function validateWorkingDirectory(dirName) {
	return /^[a-zA-Z0-9_\-\/]+$/.test(dirName);
}

async function setupGit() {
	await exec('git config user.name "github-actions[bot]"');
	await exec('git config user.email "github-actions[bot]@users.noreply.github.com"');
}

const setupLogger = ({ debug, prefix } = { debug: false, prefix: '' }) => ({
	debug: (message) => {
		if (debug) {
			info(`DEBUG ${prefix}${prefix ? ' :' : ''}${message}`);
		}
	},
	info: (message) => {
		info(`${prefix}${prefix ? ' :' : ''}${message}`);
	},
	error: (message) => {
		error(`${prefix}${prefix ? ' :' : ''}${message}`);
	},
});

async function run() {
	let logger = setupLogger({ debug: false, prefix: '[js-dependency-update]' });

	try {
		info('Hello from the JS Dependency Update Action!');

		// get input
		const baseBranch = getInput('base_branch', { required: true });
		const targetBranch = getInput('target_branch', { required: true });
		const githubToken = getInput('gh_token', { required: true });
		const workingDirectory = getInput('working_directory', { required: true });
		const debug = getBooleanInput('debug');
		logger = setupLogger({ debug, prefix: '[js-dependency-update]' });
		const octokit = getOctokit(githubToken);

		const commonExecOptions = { cwd: workingDirectory };

		logger.debug('Validating inputs base-branch, head-branch, working-directory');

		if (!octokit) {
			setFailed('Failed to initialize Octokit with the provided GitHub token.');
			return;
		}

		if (!validateBranchName(baseBranch)) {
			setFailed(`Invalid base branch name: ${baseBranch}`);
			return;
		}

		if (!validateBranchName(targetBranch)) {
			setFailed(`Invalid target branch name: ${targetBranch}`);
			return;
		}

		if (!validateWorkingDirectory(workingDirectory)) {
			setFailed(`Invalid working directory: ${workingDirectory}`);
			return;
		}

		logger.debug(`Base branch is: ${baseBranch}`);
		logger.debug(`Target branch is: ${targetBranch}`);
		logger.debug(`Working directory is: ${workingDirectory}`);

		// Execute npm update command within the working directory
		logger.info('Running npm update to check for dependency updates...');
		await exec('npm update', [], { ...commonExecOptions });

		let updatesAvailable = false;

		// Check for modified package.json or package-lock.json files
		const gitStatus = await getExecOutput('git status -s package*.json', [], { ...commonExecOptions });
		if (gitStatus.stdout.length <= 0) {
			info('No dependency updates found. Concluding action execution.');
			return; //* Conclude the action execution if there are no modified files
		}

		updatesAvailable = true;

		logger.debug('Updates Available');
		logger.debug('Setting up Git');

		await setupGit();

		// Create and switch to the target branch
		logger.debug(`Creating and switching to target branch: ${targetBranch}`);
		await exec(`git checkout -b ${targetBranch}`, [], { ...commonExecOptions });

		// Add modified files to staging
		logger.debug('Adding modified package.json and package-lock.json files to staging');
		await exec('git add package.json package-lock.json', [], { ...commonExecOptions });

		// Commit changes
		logger.debug('Committing changes');
		await exec('git commit -m "Update JS dependencies"', [], { ...commonExecOptions });

		// Push the target branch to the remote repository
		logger.debug(`Pushing target branch: ${targetBranch} to remote repository`);
		await exec(`git push origin -u ${targetBranch}`, [], { ...commonExecOptions });

		// create a pull request to the base branch using the octokit api
		logger.debug('Fetching octokit API');

		logger.debug(`Creating PR using head branch: ${targetBranch}`);
		await octokit.pulls.create({
			owner: context.repo.owner,
			repo: context.repo.repo,
			title: 'Update JS dependencies',
			head: targetBranch,
			base: baseBranch,
			body: 'This PR updates the JS dependencies to their latest versions.',
		});

		logger.info('Pull request created successfully. Concluding action execution.');

		logger.debug(`Setting updates-available output to ${updatesAvailable}`);
		setOutput('update_available', updatesAvailable);

		return; //* Conclude the action execution after creating the PR
	} catch (error) {
		logger.error('Something went wrong while creating the PR. Check logs below.');
		setFailed(error instanceof Error ? error.message : String(error));
		logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
	}
}

await run();
