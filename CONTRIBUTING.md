# Contributing Guideline

Before contributing, please familiarize yourself with the [Design principles](README.md#design-principles) and [Architecture](README.md#architecture) sections to understand the project's core philosophy and structure.

TBA

## [Maintainer Only] Publishing dev version

To test a build in your app, use [publish-dev](https://github.com/creasty/mobx-sentinel/actions/workflows/publish-dev.yml).
Run on any branch, it will publish a dev version to npm with the corresponding commit hash (`vX.Y.Z-dev-HHHHHHHH`).

## [Maintainer Only] Publishing prod version

To publish a production build, please follow these steps (apologies for the manual process):

1. Run `./script/bump X.Y.Z` (`X.Y.Z` being a new version) on your local
2. Include the changes in your PR
3. Merge the PR into the `main` branch
4. Manually trigger [publish](https://github.com/creasty/mobx-sentinel/actions/workflows/publish.yml) on the `main` branch
5. Create a new release on GH
