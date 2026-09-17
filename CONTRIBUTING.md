# Contribution Guidelines

## Reporting Issues

- Search existing issues before opening a new one to avoid duplicates.
- When reporting a bug, include steps to reproduce, expected behavior, and actual behavior.
- For feature requests, describe the motivation and potential use cases.
- Use clear, descriptive titles and provide as much relevant information as possible.

## Developing

Before contributing, please familiarize yourself with the [Design Principles](https://mobx-sentinel.creasty.com/#design-principles) and the [Architecture](https://mobx-sentinel.creasty.com/docs/architecture/) to understand the project's core philosophy and structure.

### Coding Standards

- Most styles are enforced by Biome.
- JSDoc/TSDoc is mandatory for public interfaces; it's advised to write them for private ones nonetheless.
- Write clear, concise comments where necessary.
- Use descriptive variable and function names.
- Ensure your code is safe at runtime, not just during type checking.
  - e.g., Use ECMAScript private fields (`#property`) over TypeScript's `private` modifier, which only provides compile-time privacy.
  - Another notable practice you can find in the codebase is use of internal/un-exported symbols; Grep `private constructor` and `debugWatcher` for example.

### Testing Requirements

- All new features and bug fixes must include appropriate unit and/or integration tests.
- Use the existing test framework (vitest) and ensure all tests pass before submitting a PR.
- Test files should be placed alongside source files with `.test.ts` or `.test.tsx` extension (e.g., `foo.ts` and `foo.test.ts`).
- Memory leaks are tested in each package's `memory.test.ts` (`.tsx` in react) by checking whether objects get garbage collected. See `isCollected` there for how to keep a test from retaining the objects it checks.
- Integration tests live in [apps/example/](./apps/example), beside the invoice editor they drive. Each one uses the editor the way a person would, so it runs through `core`, `form` and `react` together, built as an application gets them. `pnpm test` runs them after the packages' own tests.
- Coverage rate is enforced by Codecov.

### Submitting Pull Requests

1. Fork the repository.
    - If we've worked together personally, feel free to contact me and I can invite you as a collaborator.
1. Create a new branch for your feature or bugfix.
1. Make your changes, ensuring you follow the coding standards and add/update tests as needed.
1. Run all tests locally and ensure they pass.
1. Update documentation if your changes affect the public API or behavior: the guides in [apps/site/src/content/docs/docs/](./apps/site/src/content/docs/docs), and the TSDoc comments the API reference is generated from.
1. Submit a pull request with a clear description of your changes and reference any related issues.
1. Use self-review comments to provide additional context or highlight specific areas for reviewer attention.
1. Be responsive to feedback and make requested changes promptly.

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

Packages are published to [npm](https://www.npmjs.com/org/mobx-sentinel).

### Authentication

Both workflows below authenticate with npm through
[trusted publishing](https://docs.npmjs.com/trusted-publishers/), so there is no npm token to store
or rotate: npm mints a short-lived OIDC token from the workflow's `id-token` permission and the
registry checks it against the trusted publisher configured on each package.

That configuration lives on npm, not in this repository. Each of `@mobx-sentinel/core`, `/form` and
`/react` needs a trusted publisher for this repository under Settings → Trusted Publisher, naming
the workflow that publishes it -- `publish.yml` and `publish-dev.yml` are separate entries. A
package missing its entry fails with a `404` on the upload, because npm answers unauthorized writes
to a scoped package that way rather than admitting the package exists.

`pnpm publish` performs that exchange itself, so neither workflow installs npm. That is new in pnpm
11: through pnpm 10, `pnpm publish` packed and then handed the tarball to `npm publish`, so the
exchange depended on an npm of 11.5.1 or newer being on `PATH`. pnpm tries OIDC before any
configured token, the same order as the npm CLI, and the workflows pass `--provenance` explicitly
rather than relying on pnpm's own check that the repository and package are public.

### Dev version

To test a build in your app, comment `/publish-dev` on the pull request.
[publish-dev](https://github.com/creasty/mobx-sentinel/actions/workflows/publish-dev.yml) answers on
the comment itself: 👀 while it runs, then 🚀 and a reply carrying the version and a `pnpm add` line
for all three packages.

The version is built from the **pull request's head commit**, not `main`: `X.Y.Z-dev-HHHHHHHH`, where
`X.Y.Z` is whatever the packages currently carry. Running the command again on an unchanged head
publishes nothing and replies with the version that is already there.

Two guards, each answering with 👎 and a one-line reason:

- **Write access is required.** The comment's `author_association` is only a pre-filter that avoids
  spending a runner; the job then asks the API for the commenter's actual permission, because a
  collaborator with read or triage access still reports as `COLLABORATOR`.
- **Forks are refused.** The workflow file comes from `main` and a pull request cannot change it --
  but it can change everything that file runs, from `tsup.config.ts` to dependency lifecycle
  scripts, and all of it runs with npm publish rights. The `workflow_dispatch` route never offered a
  fork's code either.

  Pushing a fork's branch to this repository turns it into a pull request `/publish-dev` will
  accept, and that push is where the trust decision actually gets made -- not the review. Even
  `pnpm install --frozen-lockfile` runs that branch's root `prepare` script, plus the install
  scripts of whichever dependencies its `pnpm-workspace.yaml` lists under `allowBuilds`, inside a
  job that can mint the npm token, because the trusted publisher checks the workflow's OIDC claims
  and not the code's. So read the build scripts and that list, not just the diff, before pushing
  someone else's branch here.

`workflow_dispatch` still works too, for a branch with no pull request open.

### Production version

Dispatch [publish](https://github.com/creasty/mobx-sentinel/actions/workflows/publish.yml) with
`bump_version` set to the new `X.Y.Z`, and it will

1. run `./script/bump X.Y.Z` and push `bump-version-X-Y-Z`,
1. draft a `vX.Y.Z` release with the notes GitHub generates from the merged pull requests,
   grouped as [Release notes](#release-notes) describes.

The run summary then hands you two links: a pull request form with the title, body and
`skip-release-notes` label already filled in, and the draft.

**Open the pull request from that link, and merge it yourself** once `test-ok` passes -- see below
for why the workflow does neither. Then check the notes and **publish the release**. Publishing it
is what ships to npm and creates the tag; merging on its own publishes nothing.

Leaving `bump_version` empty skips all of the above and publishes the dispatched ref's current
version as-is. That is the repair path for a bump that merged but never shipped, and it is also
how a version bumped by hand in an ordinary pull request gets released; on that path `publish`
creates the tag and drafts the release itself.

| Trigger | What happens |
| ------- | ------------ |
| `publish` dispatched with `bump_version` | bumps, pushes `bump-version-X-Y-Z`, and drafts `vX.Y.Z` -- the tag name is reserved but bound to no commit. Nothing is published; the run summary links a prefilled pull request form and the draft. |
| the bump pull request merging | nothing publishes, but `push` and `deploy` run on `main` as usual, so the commit you are about to tag gets its tests and its Pages deploy first. |
| the draft release being published | GitHub creates `vX.Y.Z` at main's HEAD as it stands, which fires `publish` again and ships to npm. |
| `publish` dispatched with `bump_version` empty | publishes the dispatched ref to npm straight away, then creates `vX.Y.Z` at that commit and drafts the release. The repair path, not part of the sequence above. |

#### Release notes

The notes are GitHub's list of the pull requests merged since the last release, grouped by label as
`.github/release.yml` sets out. A pull request lands under the first section whose label it carries:

| Section | Label |
| ------- | ----- |
| Breaking changes | `breaking-change` |
| Features | `enhancement` |
| Improvements | `improvement` |
| Bug fixes | `bug` |
| Other changes | any other, or none |
| *(left out)* | `skip-release-notes`, which the bump pull request gets from the prefilled form |

Label pull requests as you merge them: the list is generated once, when the draft is created. From
then on the draft is plain text, so fix anything by hand before publishing -- move a line to another
section, or add migration steps under a breaking change.

#### Why you open the pull request, and merge it, yourself

One rule accounts for both: GitHub starts no workflow run from an event caused by its own
`GITHUB_TOKEN`.

**Opening it.** A pull request the workflow opened would raise no `pull_request` event, so nothing
would report `test-ok`, and a required check that never reports leaves Merge greyed out for good.
It can be worked around -- an earlier version of this workflow opened the pull request and then
dispatched `push` on the branch, `workflow_dispatch` being one of only two triggers exempt from the
rule -- but it left the bump pull request behaving unlike every other one in the repo: its checks
came from a dispatched `push` run, and another commit to the branch left the new head with no checks
until someone re-dispatched. The event comes from the pull request being *created*, not from the
branch being pushed, so the workflow stops at the push and lets you create it. What you open is an
ordinary pull request.

**Merging it.** `GITHUB_TOKEN` can turn auto-merge on, but the merge it then performs is attributed
to `github-actions[bot]`, so `main` never sees that push: no test run, no Codecov upload, and no
production Pages deploy. Worse, the release would then ship a commit `main`'s own CI never ran.
Dispatching those runs after the publish patches the symptom in the wrong order. Merging by hand
costs one click and keeps the sequence: `push` and `deploy` run on the merge, and only then is there
a release worth publishing. Turning auto-merge on from the pull request page yourself is fine --
that merge is attributed to you, so it behaves.

#### What the guards refuse

`./script/version` asserts that the three packages agree on a plain `X.Y.Z`, which is also what
keeps a `-dev-` tree away from the `latest` tag. On top of that:

| Situation | Outcome |
| --------- | ------- |
| the version is already on npm | skips and stays green -- npm is the authority on what has shipped |
| `bump_version` names the current version, or its branch or tag already exists | refuses before touching anything |
| `bump_version` is dispatched on a branch other than `main` | refuses -- the bump PR would carry that branch's commits too |
| `vX.Y.Z` exists but npm has no such version | fails: an earlier publish stopped half way, so look before retrying |
| a release's tag does not match the tree it tagged | fails, having published nothing |

That last one is the sharp edge of publishing on the release: publish the draft before the bump
pull request has merged and GitHub tags a `main` that still carries the old version. To recover,
merge the pull request, delete the tag and the release, then dispatch `publish` with `bump_version`
empty. The draft carries that warning in a note above the release notes; delete it as you publish.

## [Maintainer Only] Deployments

Two sites are deployed to Cloudflare Pages by the [deploy](https://github.com/creasty/mobx-sentinel/actions/workflows/deploy.yml) workflow:

| Pages project | Source | Built by | Deployed to |
| ------------- | ------ | -------- | ----------- |
| `mobx-sentinel-site` | [apps/site/](./apps/site) | `pnpm --filter site build` | [mobx-sentinel.creasty.com](https://mobx-sentinel.creasty.com) |
| `mobx-sentinel-example` | [apps/example/](./apps/example) | `pnpm --filter example build` | [example.mobx-sentinel.creasty.com](https://example.mobx-sentinel.creasty.com) |

Every branch push deploys both. Pushes to `main` go to production; every other branch gets a
preview deployment, whose URL is reported back on the commit and on the pull request.

The site's leg also runs `pnpm --filter site check:api`, which fails the deploy when the API reference
loses what `apps/site/src/typedoc/` adds to it: namespaces merged into their same-named class, interface
or type alias, and the `@action`/`@computed` tags. It needs the site built first.

Deployments are direct uploads via [wrangler](https://developers.cloudflare.com/workers/wrangler/),
so they require two repository secrets: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`
(an account token with the *Cloudflare Pages: Edit* permission).

A project must exist before its first deploy, or that leg fails. Create one with wrangler; its
custom domain has no wrangler command, so attach that through the API (or the dashboard).
`--allow-build` is for pnpm 12, which `pnpm dlx` can resolve to locally and which refuses to install
wrangler while its dependencies' build scripts are unapproved; the workflow's pnpm 11 does not ask.

```sh
pnpm dlx --allow-build=esbuild --allow-build=workerd wrangler@4 pages project create <project> --production-branch=main
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/<project>/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<hostname>"}'
```

If Cloudflare does not also create the hostname's proxied `CNAME` to `<project>.pages.dev`,
adding it takes *Zone → DNS → Edit*, beyond the *Cloudflare Pages: Edit* the deploy token is described with above.

Everything else -- custom domains, production branch, compatibility flags -- remains a per-project
setting in the Cloudflare dashboard. Build-time settings do not: the Node version lives in the
workflow, and the dashboard's build variables no longer apply.
