// @ts-check

import * as Semver from 'semver';
import lockfile from '@yarnpkg/lockfile';

/**
 * Drive renovate's major library update process.
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 * @param {object} options
 * @param {string} [options.versionRequirement] the version requirement, for example `^12` See https://www.npmjs.com/package/semver
 * @param {string} [options.library] full name of library to be updated via renovate, for example @time-loop/cdk-library. Ignored when doing an `all non-major updates`.
 * @param {string} [options.reduce] how to reduce the list of versions, for example `max` or `min`
 */
export async function script(
  octokit,
  repository,
  { versionRequirement, reduce, library = '@time-loop/cdk-library' }
) {
  if (!versionRequirement) {
    throw new Error('--minVersion is required, example 11.1.2');
  }

  const [repoOwner, repoName] = repository.full_name.split('/');
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

    const path = 'yarn.lock';
    const { data: file } = await octokit.request(
      'GET /repos/{owner}/{repo}/contents/{path}',
      { ...baseParams, path },
    );

    if (!file) {
      octokit.log.error(`Missing ${path}, quitting.`);
      return;
    }

    if (file.type !== 'file') {
      octokit.log.error(`${path} is a ${file.type}, quitting.`);
      return;
    }

    // Parse out the contents
    const buffer = Buffer.from(file.content, 'base64').toString('ascii');
    const yarnLock = lockfile.parse(buffer);

    if (yarnLock.type !== 'success') {
      octokit.log.error(`parsing ${path} did not succeed: ${yarnLock.type}`);
      return;
    }

    let versions = [];
    for (const packageName in yarnLock.object) {
      const nameOnly = packageName.match(/^(@?[a-z0-9-]+\/?[a-z0-9-]+)@/i)?.[1];
      if (nameOnly !== library) continue;
      const details = yarnLock.object[packageName];
      versions.push(details.version);
      // octokit.log.warn(`packageName: ${packageName}, version: ${details.version}`);
    }

    if (versions.length < 1) {
      octokit.log.debug(`${repository.full_name} does not have ${library} in ${path}`);
      return;
    }

    switch (reduce) {
      case 'min':
        const smallest = versions.reduce((prev, current) => Semver.compare(prev, current) === -1 ? prev : current, '99999999.0.0');
        versions = [smallest];
        break;
      case 'max':
        const largest = versions.reduce((prev, current) => Semver.compare(prev, current) === 1 ? prev : current, '0.0.0');
        versions = [largest];
        break;
    }

    versions.map((v) => {
      if (Semver.satisfies(v, versionRequirement)) {
        octokit.log.info(`${repository.full_name} library ${library} at version ${v} satisfies ${versionRequirement}`);
      } else {
        octokit.log.warn(`${repository.full_name} library ${library} at version ${v} DOES NOT satisfy ${versionRequirement}`);
      }
    });
 } catch (e) {
    octokit.log.error(e);
  }
}
