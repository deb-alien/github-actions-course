import { info } from '@actions/core';

async function run() {
	/**
	 * 1. Phase inputs
	 * 	- base-branch from which to check for updates
	 *  - target-branch to use to create the PR
	 *  - Github token to authentication purposes (to create the PRs)
	 *  - Working directory for which to check for dependencies
	 * 2. Execute npm update command within the working directory
	 * 3. Check whether are modified package*.json files
	 * 4.  If there are modified files:
	 * 	- Add and commit to the target branch
	 *  - create a PR to the base branch using the octokit api
	 * 5. Otherwise conclude the custom action
	 */
	info('Hello from the JS Dependency Update Action!');
}

await run();
