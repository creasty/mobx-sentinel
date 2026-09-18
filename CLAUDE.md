# CLAUDE.md

## Writing for GitHub

Put annotations in backticks, such as `@observable`, `@computed` and `@watch.ref`, in anything that ends up on GitHub. GitHub turns a bare `@computed` into a mention of the GitHub user named computed. Any other `@name` that isn't meant as a mention goes in backticks too, such as a JSDoc tag or a scoped package name.

Two places are easy to miss:

- **Commit messages**, title and body, including the ones on a pull request branch, since a squash merge lists them in its body. Backticks keep a name unlinked there too.
- **Pull request titles.** The pull request page doesn't link mentions in its title, but a squash merge of several commits makes it the commit's title, where GitHub links them.
