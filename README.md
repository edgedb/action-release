# action-release

A collection if Github Actions to fully automate the process of releasing
a simple software package.

The component actions in this repository facilitate the following workflow:

1. A project maintainer opens a pull request that bumps the package version.
   In the body of a pull request they include the release notes pretaining
   to the release.

2. The [validate-pr](validate-pr) action checks if the pull request is
   a valid release PR, and if the submitter has the necessary permissions
   to release the package (Owner or Maintainer access to the repository).

3. The release PR is approved by a collaborator with an equal or higher
   access to the repository.  This runs the [trigger](trigger) action
   that launches the release process.

4. The actual packaging, testing, and publishing steps are project-specific,
   but in the end the [merge](merge) action merges the release PR, tags
   the resulting commit and publishes a Github release entry.

Some of the actions in this workflow require write access to the target
repository, so an appropriate access token and SSH key must be used.
It is recommended to use a separate bot account for this purpose.

## License

The scripts and documentation in this project are released under the
[Apache 2.0 License](LICENSE).
