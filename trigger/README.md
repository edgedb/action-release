# action-release/trigger

This action is intended to be used as a `pull_request_review` event
handler for a release PR.  Upon approval of the PR, it triggers the remainder
of the release process.

## Usage

For the full list of inputs and outputs see [action.yml](action.yml).

Basic example:

```yaml
on:
  pull_request_review:
    types: [submitted]
steps:
- uses: edgedb/action-release/trigger@master
  with:
    github_token: "..."
    release_validation_check: "validate-release-request"
```
