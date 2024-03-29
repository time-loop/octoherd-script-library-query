# octoherd-script-library-query

<!-- [![@latest](https://img.shields.io/npm/v/@octoherd/script-hello-world.svg)](https://www.npmjs.com/package/@octoherd/script-hello-world) -->

[![Build Status](https://github.com/time-loop/octoherd-script-library-query/workflows/Test/badge.svg)](https://github.com/time-loop/octoherd-script-library-query/actions?query=workflow%3ATest+branch%3Amain)

## Usage

```bash
nvm use v18
node cli.js \
  -R time-loop/\*-cdk \
  -T ghp_0123456789abcdefghijABCDEFGHIJabcdefgh \
  --octoherd-bypass-confirms true \
  --library @time-loop/cdk-ecs-fargate \
  --versionRequirement \>=5.15.2
```

## Options

| option                 | type   | default                  | description                                         |
| ---------------------- | ------ | ------------------------ | --------------------------------------------------- |
| `--versionRequirement` | string | none                     | requirement for the library, for example `14.*`     |
| `--library`            | string | `@time-loop/cdk-library` | full name of the library to be updated via renovate |

See [semver](https://www.npmjs.com/package/semver) for details around specifying the `versionRequirement`.

## Limitations

- Should be re-written in TypeScript, but all examples were JS, and we're tight for time.
- Not projen-ified, which is kinda tragic.
  I feel that these two technologies are deeply complementary.
  https://github.com/projen/projen/issues/2841
- Not published to npmjs.com, so you have to run it locally.
  We use github packages, so... we'll probably never publish this to npmjs.com.
  Either way, not a priority right now.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[ISC](LICENSE.md)
