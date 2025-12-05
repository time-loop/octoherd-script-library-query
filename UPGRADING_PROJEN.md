
# Upgrading Projen

## GitHub Actions Breaking Change

GitHub recently decided to push a breaking change to the `upload-artifact` action, while violating semver.
This wreaked havoc on our CI/CD pipelines.
So... we had to manually upgrade projen using the following steps

```bash
git co main
git pull --ff-only
git co -b github-actions/update-projen-main

pnpm i && pnpm update-projen

git add . && git commit -m "fix(deps): upgrade projen [INFRA-23096]\n\nPick up projen fix to GitHub Actions breaking change. Related GH issue: https://github.com/actions/upload-artifact/issues/602 . Related slack thread is here: https://clickup.enterprise.slack.com/archives/C03F94339PV/p1725475644645509\n"

# If you're lucky, there's a pre-existing PR you can overwrite.
git push --force
gh pr view --web

# Otherwise...
#gh pr create --assignee @me --reviewer @time-loop/cloud-platform --fill && gh pr merge --squash --auto
```

### IntegRunner Test Failures

First of all, we had an issue with older versions of integrunner crashing when running the test suite.
Fix here was to upgrade `cdkVersion` to latest.

Once they're running, you can see snapshot changes triggering failures (which is expected).
Fix here is to update snapshot files. And of course, ensure that it's an intended change.

```bash
npx projen integ:update --parallel-regions us-west-2
```

We currently run our integ tests in `us-west-2`.
Without specifying the `--parallel-regions` flag, the command will try running tests in multiple regions.
Which... will fail.

Anyway, that should generate a bunch of new snapshot files, commit and push.
