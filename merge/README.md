# action-relase/merge

This action is intended to be used as on of the final steps in the release PR
automation.  It merges the release PR, and tags the resulting commit.

## Usage

For the full list of inputs and outputs see [action.yml](action.yml).

Basic example:

```yaml
on: pull_request
steps:
- uses: edgedb/action-release/merge@master
  with:
    tag_name: v${{ steps.verstep.outputs.version }}
```
