// @ts-check

import lockfile from "@yarnpkg/lockfile";
import * as Semver from "semver";
import { parse as yamlParse } from "yaml";

const pnpmLockPath = "pnpm-lock.yaml";
const yarnPath = "yarn.lock";
const packageJsonPath = "package.json";

/**
 * Fetches and extracts the package manager version from package.json's packageManager field
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {object} baseParams - { owner, repo }
 * @param {string} packageManager - The package manager name (e.g., "pnpm", "yarn", "npm")
 * @returns {Promise<string|null>} The version string (e.g., "10.0.0") or null if not found
 */
async function getPackageManagerVersion(octokit, baseParams, packageManager) {
	try {
		octokit.log.debug(
			`Fetching package.json to determine ${packageManager} version...`,
		);
		const { data: packageJsonFile } = await octokit.request(
			"GET /repos/{owner}/{repo}/contents/{path}",
			{ ...baseParams, path: packageJsonPath },
		);

		if (packageJsonFile.type !== "file") {
			octokit.log.debug(
				`${packageJsonPath} is a ${packageJsonFile.type}, cannot parse`,
			);
			return null;
		}

		// @ts-expect-error - Buffer is available in Node.js
		const packageJsonBuffer = Buffer.from(
			packageJsonFile.content,
			"base64",
		).toString("utf-8");
		const packageJson = JSON.parse(packageJsonBuffer);

		if (!packageJson.packageManager) {
			octokit.log.debug("No packageManager field found in package.json");
			return null;
		}

		// packageManager format is typically "pnpm@10.0.0", "yarn@4.0.0", "npm@9.0.0"
		const pattern = new RegExp(
			`^${packageManager}@(?<version>\\d+\\.\\d+\\.\\d+)`,
		);
		const match = packageJson.packageManager.match(pattern);
		if (match?.groups?.version) {
			return match.groups.version;
		}

		octokit.log.debug(
			`Could not parse ${packageManager} version from packageManager: ${packageJson.packageManager}`,
		);
		return null;
	} catch (e) {
		octokit.log.debug(`Could not fetch or parse package.json: ${e.message}`);
		return null;
	}
}

/**
 * Drive renovate's major library update process or check package manager versions.
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 * @param {object} options
 * @param {string} [options.versionRequirement] the version requirement, for example `^12` or `>=10.0.0`. See https://www.npmjs.com/package/semver
 * @param {string} [options.library] full name of library to be updated via renovate, for example @time-loop/cdk-library. Conflicts with packageManager.
 * @param {string} [options.packageManager] package manager to check (for example pnpm, yarn, npm). Conflicts with library.
 * @param {string} [options.reduce] how to reduce the list of versions, for example `max` or `min`
 */
export async function script(
	octokit,
	repository,
	{ versionRequirement, reduce, library, packageManager },
) {
	// Validate versionRequirement
	if (!versionRequirement) {
		throw new Error("--versionRequirement is required, example 11.1.2");
	}

	// Validate mutual exclusivity of packageManager and library
	if (packageManager && library) {
		throw new Error("Cannot use both --packageManager and --library options");
	}

	const [repoOwner, repoName] = repository.full_name.split("/");
	const baseParams = {
		owner: repoOwner,
		repo: repoName,
	};

	try {
		// skip archived repos
		if (repository.archived) {
			octokit.log.debug(`${repository.full_name} is archived, skipping.`);
			return;
		}

		if (packageManager) {
			const version = await getPackageManagerVersion(
				octokit,
				baseParams,
				packageManager,
			);
			if (version) {
				if (Semver.satisfies(version, versionRequirement)) {
					octokit.log.info(
						`${repository.full_name} ${packageManager} ${version} satisfies ${versionRequirement}`,
					);
				} else {
					octokit.log.warn(
						`${repository.full_name} ${packageManager} ${version} DOES NOT satisfy ${versionRequirement}`,
					);
				}
			} else {
				octokit.log.debug(
					`${repository.full_name} does not specify ${packageManager} version in package.json`,
				);
			}
			return;
		}

		let versions = [];
		let lockfilePath;

		// Look for a pnpm-lock.yaml file first
		try {
			octokit.log.debug("Looking for pnpm-lock.yaml...");
			const { data: pnpmFile } = await octokit.request(
				"GET /repos/{owner}/{repo}/contents/{path}",
				{ ...baseParams, path: pnpmLockPath },
			);
			octokit.log.debug(`Found ${pnpmLockPath}, parsing...`);
			lockfilePath = pnpmLockPath;

			if (pnpmFile.type !== "file") {
				octokit.log.error(`${pnpmLockPath} is a ${pnpmFile.type}, quitting.`);
				return;
			}

			// @ts-expect-error - Buffer is available in Node.js
			const pnpmBuffer = Buffer.from(pnpmFile.content, "base64").toString(
				"ascii",
			);
			const pnpmLock = yamlParse(pnpmBuffer);
			if (typeof pnpmLock !== "object" || !pnpmLock.packages) {
				octokit.log.error(`parsing ${pnpmLockPath} did not succeed`);
				return;
			}

			for (const dependencyPath of Object.keys(pnpmLock.packages)) {
				// Format is /thePackageName@1.0.0(stuff)(more stuff)
				// Examples:
				//   /has-proto@1.0.3
				//   /@babel/generator@7.24.5
				//   /jest@29.7.0(@types/node@18.19.33)(ts-node@10.9.2)
				//   /@aws-sdk/client-sso-oidc@3.572.0(@aws-sdk/client-sts@3.572.0)
				const { packageName, version } =
					dependencyPath.match(
						/^(?<packageName>(@[^/]+\/)?[^@]+)@(?<version>[0-9]+\.[0-9]+\.[0-9]+).*/,
					)?.groups ?? {};
				if (packageName !== library) continue;
				versions.push(version);
			}
		} catch (_e) {
			octokit.log.debug(`Missing ${pnpmLockPath}, maybe there's a yarn.lock?`);
		}

		if (!lockfilePath) {
			try {
				const { data: yarnFile } = await octokit.request(
					"GET /repos/{owner}/{repo}/contents/{path}",
					{ ...baseParams, path: yarnPath },
				);
				octokit.log.debug(`Found ${yarnPath}, parsing...`);
				lockfilePath = yarnPath;

				if (yarnFile.type !== "file") {
					octokit.log.error(`${yarnPath} is a ${yarnFile.type}, quitting.`);
					return;
				}

				// Parse out the contents
				// @ts-expect-error - Buffer is available in Node.js
				const buffer = Buffer.from(yarnFile.content, "base64").toString(
					"ascii",
				);
				const yarnLock = lockfile.parse(buffer);

				if (yarnLock.type !== "success") {
					octokit.log.error(
						`parsing ${yarnPath} did not succeed: ${yarnLock.type}`,
					);
					return;
				}

				for (const packageName in yarnLock.object) {
					const nameOnly = packageName.match(
						/^(@?[a-z0-9-]+\/?[a-z0-9-]+)@/i,
					)?.[1];
					if (nameOnly !== library) continue;
					const details = yarnLock.object[packageName];
					versions.push(details.version);
					// octokit.log.warn(`packageName: ${packageName}, version: ${details.version}`);
				}
			} catch (_e) {
				octokit.log.warn(`Missing ${yarnPath}, quitting.`);
				return;
			}
		}

		if (versions.length < 1) {
			octokit.log.debug(
				`${repository.full_name} does not have ${library} in ${lockfilePath}`,
			);
			return;
		}
		octokit.log.debug(
			`${repository.full_name} has ${library} in ${lockfilePath} at version(s) ${JSON.stringify(
				versions,
			)}, reducing to ${reduce}`,
		);

		switch (reduce) {
			case "min": {
				const smallest = versions.reduce(
					(prev, current) =>
						Semver.compare(prev, current) === -1 ? prev : current,
					"99999999.0.0",
				);
				versions = [smallest];
				break;
			}
			case "max": {
				const largest = versions.reduce(
					(prev, current) =>
						Semver.compare(prev, current) === 1 ? prev : current,
					"0.0.0",
				);
				versions = [largest];
				break;
			}
		}

		versions.forEach((v) => {
			if (Semver.satisfies(v, versionRequirement)) {
				octokit.log.info(
					`${repository.full_name} library ${library} at version ${v} satisfies ${versionRequirement}`,
				);
			} else {
				octokit.log.warn(
					`${repository.full_name} library ${library} at version ${v} DOES NOT satisfy ${versionRequirement}`,
				);
			}
		});
	} catch (e) {
		octokit.log.error(e);
	}
}
