import { getBooleanInput, getInput, info, setFailed, setSecret } from '@actions/core';
import { exec, getExecOutput } from '@actions/exec';

function validateBranchName(branchName) {
	return /^[a-zA-Z0-9_\-\.\/]+$/.test(branchName);
}

function validateWorkingDirectory(dirName) {
	return /^[a-zA-Z0-9_\-\/]+$/.test(dirName);
}

/**
 * [DONE]
 * 1. Phase inputs
 * 	- base-branch from which to check for updates
 *  - target-branch to use to create the PR
 *  - Github token to authentication purposes (to create the PRs)
 *  - Working directory for which to check for dependencies
 * [DONE]
 * 2. Execute npm update command within the working directory
 * [DONE]
 * 3. Check whether are modified package*.json files
 * [TODO]
 * 4.  If there are modified files:
 * 	- Add and commit to the target branch
 *  - create a PR to the base branch using the octokit api
 * 5. Otherwise conclude the custom action
 */

async function run() {
	info('Hello from the JS Dependency Update Action!');
	const baseBranch = getInput('base_branch');
	const targetBranch = getInput('target_branch');
	const githubToken = getInput('gh_token');
	const workingDirectory = getInput('working_directory');
	const debug = getBooleanInput('debug');

	setSecret(githubToken);

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

	info(`[js-dependency-update] : Base branch: ${baseBranch}`);
	info(`[js-dependency-update] : Target branch: ${targetBranch}`);
	info(`[js-dependency-update] : Working directory: ${workingDirectory}`);

	await exec('npm update', [], { cwd: workingDirectory });

	// Check for modified package.json or package-lock.json files
	const gitStatus = await getExecOutput('git status -s package*.json', [], { cwd: workingDirectory });
	if(gitStatus.stdout.length <= 0) {
		info(`[js-dependency-update] : No package.json files found in the working directory, exiting.`);
		return;
	}

	info('I am a custom action');
}

await run();
