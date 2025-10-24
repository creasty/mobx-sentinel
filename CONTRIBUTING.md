# Contribution Guidelines

## Reporting Issues

- Search existing issues before opening a new one to avoid duplicates.
- When reporting a bug, include steps to reproduce, expected behavior, and actual behavior.
- For feature requests, describe the motivation and potential use cases.
- Use clear, descriptive titles and provide as much relevant information as possible.

## Developing

Before contributing, please familiarize yourself with the [Design principles](README.md#design-principles) and [Architecture](README.md#architecture) sections to understand the project's core philosophy and structure.

### Coding Standards

- Most styles are enforced by Prettier and ESLint.
- JSDoc/TSDoc is mandatory for public interfaces; it's advised to write them for private ones anyway.
- Write clear, concise comments where necessary.
- Use descriptive variable and function names.

### Testing Requirements

- All new features and bug fixes must include appropriate unit and/or integration tests.
- Use the existing test framework (vitest) and ensure all tests pass before submitting a PR.
- Test files should be placed alongside source files with `.test.ts` or `.test.tsx` extension (e.g., `foo.ts` and `foo.test.ts`).
- Coverage rate is enforced by Codecov.

### Submitting Pull Requests

1. Fork the repository and create a new branch for your feature or bugfix.
2. Make your changes, ensuring you follow the coding standards and add/update tests as needed.
3. Run all tests locally and ensure they pass.
4. Update documentation if your changes affect the public API or behavior.
5. Submit a pull request with a clear description of your changes and reference any related issues.
6. Use self-review comments to provide additional context or highlight specific areas for reviewer attention.
7. Be responsive to feedback and make requested changes promptly.

<details><summary>Checklist to reduce the burden on reviewers</summary>

Please ensure you cover the points in the following checklist:

- **Information Quality**
    - [ ] The title and description (Why & What) clearly explain the background and purpose of the proposal.
        - The goal is to help reviewers efficiently understand the details by providing an overview first. You don't need to explain every detail.
        - Example: Include the implementation purpose, PR goals (acceptance criteria), what was done, and what was deferred.
        - Example: Link to the original discussion issue if one exists.
    - [ ] Necessary information for understanding the implementation is provided.
        - Anticipate questions and proactively answer them in comments. Keep communication concise to maintain velocity.
        - Example: Link to reference articles and quote relevant content.
        - Example: List patterns that need to be considered. For complex combinations, create a matrix.
    - [ ] Summarize your research and findings so the thought process is clear.
        - Make it possible for others to follow what you investigated, which sites you referenced, what others are saying, and what conclusions you reached.
- **Handling the Unknown**
    - [ ] Explain unclear code or terminology.
        - Spatial unknowns: Things requiring knowledge not visible in the diff.
            - Example: Explain unusual library functions being used and link to their documentation.
            - Example: When removing existing code, explain why it existed originally and justify why it's safe to remove.
        - Temporal unknowns: Things requiring imagination about the future.
            - Explain future extensibility or constraints.
            - Example: Is it properly abstracted? Will it become technical debt?
            - Example: Will it perform efficiently as data volume grows?
- **Accuracy and Communication**
    - [ ] All necessary considerations have been addressed.
        - Example: Pattern coverage, race conditions, null pointer exceptions, division by zero, etc.
    - [ ] Point out any ambiguities in scope or specifications.
        - Example: "I don't think we've discussed when this situation occurs yet - what should we do?"

</details>

## [Maintainer Only] Publishing Packages

### Dev version

To test a build in your app, use [publish-dev](https://github.com/creasty/mobx-sentinel/actions/workflows/publish-dev.yml).\
Run on any branch, it will publish a dev version to npm with the corresponding commit hash (`vX.Y.Z-dev-HHHHHHHH`).

### Production version

To publish a production build, please follow these steps (apologies for the manual process):

1. Run `./script/bump X.Y.Z` (`X.Y.Z` being a new version) on your local
2. Include the changes in your PR
3. Merge the PR into the `main` branch
4. Manually trigger [publish](https://github.com/creasty/mobx-sentinel/actions/workflows/publish.yml) on the `main` branch
5. Create a new release on GH
