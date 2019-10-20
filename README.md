# action-validate-release-pr

This action is intended to be used as the first step in the release PR
automation.  It performs permission and sanity checks of the PR _before_
any of the actual release machinery is run.

## Usage

For the full list of inputs and outputs see [action.yml](action.yml).

Basic example:

```yaml
on: pull_request
steps:
- uses: edgedb/action-validate-release-pr
  with:
    version-file: project/_version.py
- run: <release-script>
```

## License

The scripts and documentation in this project are released under the
[Apache 2.0 License](LICENSE).
