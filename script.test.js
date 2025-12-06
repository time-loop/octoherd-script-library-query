// @ts-check

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { script } from './script.js';

/**
 * Mock octokit object
 */
function createMockOctokit() {
  const logs = {
    debug: [],
    info: [],
    warn: [],
    error: [],
  };

  return {
    log: {
      debug: vi.fn((msg) => logs.debug.push(msg)),
      info: vi.fn((msg) => logs.info.push(msg)),
      warn: vi.fn((msg) => logs.warn.push(msg)),
      error: vi.fn((msg) => logs.error.push(msg)),
    },
    request: vi.fn(),
    logs,
  };
}

/**
 * Create a mock repository object
 */
function createMockRepository(fullName = 'test-org/test-repo', archived = false) {
  return {
    full_name: fullName,
    archived,
  };
}

/**
 * Create base64 encoded content
 */
function encodeBase64(content) {
  return Buffer.from(content).toString('base64');
}

describe('script.js', () => {
  let octokit;

  beforeEach(() => {
    octokit = createMockOctokit();
  });

  describe('packageManager mode', () => {
    it('should extract and report pnpm version when packageManager=pnpm', async () => {
      const packageJsonContent = JSON.stringify({
        name: 'test-package',
        packageManager: 'pnpm@10.0.0',
      });

      // Mock package.json request
      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(packageJsonContent),
          },
        }
      );

      const repository = createMockRepository();
      await script(octokit, repository, {
        packageManager: 'pnpm',
        versionRequirement: '>=9.0.0',
      });

      // Check if pnpm version was logged
      const infoLogs = octokit.log.info.mock.calls.map((call) => call[0]);
      expect(infoLogs.some((log) => log.includes('pnpm v10'))).toBe(true);
      expect(infoLogs.some((log) => log.includes('10.0.0'))).toBe(true);
      expect(infoLogs.some((log) => log.includes('satisfies'))).toBe(true);
    });

    it('should report when version does not satisfy requirement', async () => {
      const packageJsonContent = JSON.stringify({
        name: 'test-package',
        packageManager: 'pnpm@9.0.0',
      });

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(packageJsonContent),
          },
        }
      );

      const repository = createMockRepository();
      await script(octokit, repository, {
        packageManager: 'pnpm',
        versionRequirement: '>=10.0.0',
      });

      const warnLogs = octokit.log.warn.mock.calls.map((call) => call[0]);
      expect(warnLogs.some((log) => log.includes('DOES NOT satisfy'))).toBe(true);
      expect(warnLogs.some((log) => log.includes('pnpm v9'))).toBe(true);
    });

    it('should log debug when package.json has no packageManager field', async () => {
      const packageJsonContent = JSON.stringify({
        name: 'test-package',
      });

      // Mock package.json
      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(packageJsonContent),
          },
        }
      );

      const repository = createMockRepository();
      await script(octokit, repository, {
        packageManager: 'pnpm',
        versionRequirement: '>=10.0.0',
      });

      const debugLogs = octokit.log.debug.mock.calls.map((call) => call[0]);
      expect(
        debugLogs.some((log) => log.includes('does not specify pnpm version'))
      ).toBe(true);
    });

    it('should log debug when packageManager field is not pnpm', async () => {
      const packageJsonContent = JSON.stringify({
        name: 'test-package',
        packageManager: 'yarn@4.0.0',
      });

      // Mock package.json
      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(packageJsonContent),
          },
        }
      );

      const repository = createMockRepository();
      await script(octokit, repository, {
        packageManager: 'pnpm',
        versionRequirement: '>=10.0.0',
      });

      const debugLogs = octokit.log.debug.mock.calls.map((call) => call[0]);
      expect(
        debugLogs.some((log) => log.includes('does not specify pnpm version'))
      ).toBe(true);
    });

    it('should handle missing package.json gracefully', async () => {
      // Mock package.json request - fails
      octokit.request.mockRejectedValueOnce(new Error('404 Not Found'));

      const repository = createMockRepository();
      await script(octokit, repository, {
        packageManager: 'pnpm',
        versionRequirement: '>=10.0.0',
      });

      const debugLogs = octokit.log.debug.mock.calls.map((call) => call[0]);
      expect(
        debugLogs.some((log) => log.includes('does not specify pnpm version'))
      ).toBe(true);
    });

    it('should support yarn package manager', async () => {
      const packageJsonContent = JSON.stringify({
        name: 'test-package',
        packageManager: 'yarn@4.0.1',
      });

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(packageJsonContent),
          },
        }
      );

      const repository = createMockRepository();
      await script(octokit, repository, {
        packageManager: 'yarn',
        versionRequirement: '>=4.0.0',
      });

      const infoLogs = octokit.log.info.mock.calls.map((call) => call[0]);
      expect(infoLogs.some((log) => log.includes('yarn v4'))).toBe(true);
      expect(infoLogs.some((log) => log.includes('4.0.1'))).toBe(true);
    });

    it('should throw error when versionRequirement is missing in packageManager mode', async () => {
      const repository = createMockRepository();

      await expect(
        script(octokit, repository, {
          packageManager: 'pnpm',
        })
      ).rejects.toThrow('--versionRequirement is required when using --packageManager');
    });

    it('should throw error when both packageManager and library are specified', async () => {
      const repository = createMockRepository();

      await expect(
        script(octokit, repository, {
          packageManager: 'pnpm',
          library: '@custom/library',
          versionRequirement: '>=1.0.0',
        })
      ).rejects.toThrow('Cannot use both --packageManager and --library options');
    });
  });

  describe('script function', () => {
    it('should throw error when versionRequirement is missing in library check mode', async () => {
      const repository = createMockRepository();

      await expect(
        script(octokit, repository, {
          library: '@time-loop/cdk-library',
        })
      ).rejects.toThrow('--versionRequirement is required');
    });

    it('should skip archived repositories', async () => {
      const repository = createMockRepository('test-org/archived-repo', true);

      await script(octokit, repository, {
        versionRequirement: '>=1.0.0',
        library: '@time-loop/cdk-library',
      });

      const debugLogs = octokit.log.debug.mock.calls.map((call) => call[0]);
      expect(debugLogs.some((log) => log.includes('archived'))).toBe(true);
      expect(octokit.request).not.toHaveBeenCalled();
    });

    it('should report when library is not found in lockfiles', async () => {
      octokit.request.mockRejectedValueOnce(new Error('404 Not Found'));

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=1.0.0',
        library: '@non-existent/library',
      });

      const warnLogs = octokit.log.warn.mock.calls.map((call) => call[0]);
      expect(warnLogs.some((log) => log.includes('Missing'))).toBe(true);
    });

    it('should use default library name @time-loop/cdk-library', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@time-loop/cdk-library@5.14.0:
    dev: true
`;

      // Mock pnpm-lock.yaml request
      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        }
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
      });

      const warnLogs = octokit.log.warn.mock.calls.map((call) => call[0]);
      expect(warnLogs.some((log) => log.includes('5.14.0'))).toBe(true);
    });
  });

  describe('pnpm-lock.yaml parsing', () => {
    it('should successfully parse pnpm-lock.yaml and check version', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@time-loop/cdk-library@5.15.2:
    dev: true
  /some-other-package@1.0.0:
    dev: false
`;

      // Mock pnpm-lock.yaml request
      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        }
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
        library: '@time-loop/cdk-library',
      });

      const infoLogs = octokit.log.info.mock.calls.map((call) => call[0]);
      expect(infoLogs.some((log) => log.includes('satisfies'))).toBe(true);
      // Should NOT include pnpm version in library check mode
      expect(infoLogs[0]).not.toMatch(/pnpm v/);
    });

    it('should extract scoped package names correctly from pnpm-lock.yaml', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@aws-sdk/client-sso-oidc@3.572.0(@aws-sdk/client-sts@3.572.0):
    version: 3.572.0
  /@time-loop/cdk-ecs-fargate@5.15.2:
    version: 5.15.2
`;

      // Mock pnpm-lock.yaml
      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        }
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
        library: '@time-loop/cdk-ecs-fargate',
      });

      const infoLogs = octokit.log.info.mock.calls.map((call) => call[0]);
      expect(infoLogs.some((log) => log.includes('5.15.2'))).toBe(true);
    });

    it('should handle pnpm-lock.yaml with peer dependencies and nested dependencies', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /jest@29.7.0(@types/node@18.19.33)(ts-node@10.9.2):
    version: 29.7.0
  /@time-loop/cdk-library@5.16.0:
    version: 5.16.0
`;

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        }
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
        library: '@time-loop/cdk-library',
      });

      const infoLogs = octokit.log.info.mock.calls.map((call) => call[0]);
      expect(infoLogs.some((log) => log.includes('5.16.0'))).toBe(true);
    });

    it('should report when library version does not satisfy requirement in pnpm-lock.yaml', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@time-loop/cdk-library@5.14.0:
    dev: true
`;

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        }
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
        library: '@time-loop/cdk-library',
      });

      const warnLogs = octokit.log.warn.mock.calls.map((call) => call[0]);
      expect(
        warnLogs.some((log) => log.includes('DOES NOT satisfy'))
      ).toBe(true);
      // Should NOT include pnpm version in library check mode
      expect(warnLogs[0]).not.toMatch(/pnpm v/);
    });

    it('should skip pnpm-lock.yaml if it is not a file', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@time-loop/cdk-library@5.15.0:
    version: 5.15.0
`;
      const yarnLockContent = `
@time-loop/cdk-library@5.15.0:
  version "5.15.0"
`;

      // Mock pnpm-lock.yaml as directory
      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'dir',
            content: encodeBase64(pnpmLockContent),
          },
        }
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
        library: '@time-loop/cdk-library',
      });

      const errorLogs = octokit.log.error.mock.calls.map((call) => call[0]);
      expect(errorLogs.some((log) => log.includes('is a dir'))).toBe(true);
    });
  });

  describe('version reduction', () => {
    it('should reduce multiple versions to minimum when reduce=min', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@time-loop/cdk-library@5.15.0:
    version: 5.15.0
  /@time-loop/cdk-library@5.16.0:
    version: 5.16.0
  /@time-loop/cdk-library@5.14.0:
    version: 5.14.0
`;

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        },
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
        library: '@time-loop/cdk-library',
        reduce: 'min',
      });

      const warnLogs = octokit.log.warn.mock.calls.map((call) => call[0]);
      expect(warnLogs.some((log) => log.includes('5.14.0'))).toBe(true);
      // Should only have one warn log since it reduced to min
      const versionWarns = warnLogs.filter((log) =>
        log.includes('@time-loop/cdk-library')
      );
      expect(versionWarns).toHaveLength(1);
    });

    it('should reduce multiple versions to maximum when reduce=max', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@time-loop/cdk-library@5.15.0:
    version: 5.15.0
  /@time-loop/cdk-library@5.16.0:
    version: 5.16.0
  /@time-loop/cdk-library@5.14.0:
    version: 5.14.0
`;

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        },
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
        library: '@time-loop/cdk-library',
        reduce: 'max',
      });

      const infoLogs = octokit.log.info.mock.calls.map((call) => call[0]);
      expect(infoLogs.some((log) => log.includes('5.16.0'))).toBe(true);
      // Should only have one info log since it reduced to max
      const versionInfos = infoLogs.filter((log) =>
        log.includes('@time-loop/cdk-library')
      );
      expect(versionInfos).toHaveLength(1);
    });

    it('should report all versions when reduce is not specified', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@time-loop/cdk-library@5.15.0:
    version: 5.15.0
  /@time-loop/cdk-library@5.16.0:
    version: 5.16.0
`;

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        },
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
        library: '@time-loop/cdk-library',
      });

      const infoLogs = octokit.log.info.mock.calls.map((call) => call[0]);
      // Should have logs for both versions
      expect(infoLogs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('error handling', () => {
    it('should handle malformed pnpm-lock.yaml gracefully', async () => {
      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64('{ invalid yaml'),
          },
        },
      );

      const repository = createMockRepository();

      // Should not throw
      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
        library: '@time-loop/cdk-library',
      });

      const errorLogs = octokit.log.error.mock.calls.map((call) => call[0]);
      expect(errorLogs.length).toBeGreaterThan(0);
    });

    it('should handle GitHub API errors gracefully', async () => {
      octokit.request.mockRejectedValueOnce(
        new Error('API rate limit exceeded')
      );

      const repository = createMockRepository();

      // Should not throw
      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
        library: '@time-loop/cdk-library',
      });

      // Script should handle the error and either log or return early
      const allLogs =
        octokit.log.debug.mock.calls.length +
        octokit.log.warn.mock.calls.length +
        octokit.log.error.mock.calls.length;
      expect(allLogs).toBeGreaterThan(0);
    });
  });

  describe('semver satisfaction checking', () => {
    it('should correctly identify versions satisfying requirement', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@time-loop/cdk-library@5.15.2:
    version: 5.15.2
`;

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        }
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=5.15.2',
        library: '@time-loop/cdk-library',
      });

      const infoLogs = octokit.log.info.mock.calls.map((call) => call[0]);
      expect(infoLogs.some((log) => log.includes('satisfies'))).toBe(true);
    });

    it('should correctly identify versions not satisfying requirement', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@time-loop/cdk-library@5.15.1:
    version: 5.15.1
`;

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        }
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=5.15.2',
        library: '@time-loop/cdk-library',
      });

      const warnLogs = octokit.log.warn.mock.calls.map((call) => call[0]);
      expect(
        warnLogs.some((log) => log.includes('DOES NOT satisfy'))
      ).toBe(true);
    });

    it('should handle caret ranges in version requirement', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@time-loop/cdk-library@5.20.0:
    version: 5.20.0
`;

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        }
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '^5.15.0',
        library: '@time-loop/cdk-library',
      });

      const infoLogs = octokit.log.info.mock.calls.map((call) => call[0]);
      expect(infoLogs.some((log) => log.includes('satisfies'))).toBe(true);
    });
  });

  describe('repository information in output', () => {
    it('should include repository name in log output', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@time-loop/cdk-library@5.15.2:
    version: 5.15.2
`;

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        }
      );

      const repository = createMockRepository('my-org/my-repo');

      await script(octokit, repository, {
        versionRequirement: '>=5.15.0',
        library: '@time-loop/cdk-library',
      });

      const infoLogs = octokit.log.info.mock.calls.map((call) => call[0]);
      expect(infoLogs.some((log) => log.includes('my-org/my-repo'))).toBe(true);
    });

    it('should include library name in log output', async () => {
      const pnpmLockContent = `
lockfileVersion: '9.0'
packages:
  /@custom/my-lib@2.0.0:
    version: 2.0.0
`;

      octokit.request.mockResolvedValueOnce({
          data: {
            type: 'file',
            content: encodeBase64(pnpmLockContent),
          },
        }
      );

      const repository = createMockRepository();

      await script(octokit, repository, {
        versionRequirement: '>=1.0.0',
        library: '@custom/my-lib',
      });

      const infoLogs = octokit.log.info.mock.calls.map((call) => call[0]);
      expect(infoLogs.some((log) => log.includes('@custom/my-lib'))).toBe(true);
    });
  });
});
