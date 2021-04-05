import * as core from '@actions/core'
import * as github from '@actions/github'
import parseDiff from 'parse-diff'
import * as request from 'request-promise-native'
import * as pep440 from '@renovate/pep440'
import * as githubGraphql from './generated/graphql'

async function isMaintainer({
  octokit,
  user,
  owner,
  repo,
  teamName = '',
  accessLevel = 'MAINTAIN'
}: {
  octokit: ReturnType<typeof github.getOctokit>
  user: string
  owner: string
  repo: string
  teamName?: string
  accessLevel?: string
}): Promise<boolean> {
  const response = await octokit.graphql<{
    organization: githubGraphql.Organization
  }>(
    teamName !== ''
      ? `
      {
        organization(login: "${owner}") {
          teams(first: 100, userLogins: ["${user}"], query: "${teamName}") {
            edges {
              node {
                name
                repositories(first: 100, query: "${repo}") {
                  edges {
                    node {
                      name
                    }
                    permission
                  }
                }
              }
            }
          }
        }
      }
      `
      : `
      {
        organization(login: "${owner}") {
          teams(first: 100, userLogins: ["${user}"]) {
            edges {
              node {
                name
                repositories(first: 100, query: "${repo}") {
                  edges {
                    node {
                      name
                    }
                    permission
                  }
                }
              }
            }
          }
        }
      }
      `
  )

  interface PermissionMap {
    [key: string]: number
  }

  const permissionMap: PermissionMap = {
    NONE: 0,
    READ: 1,
    TRIAGE: 2,
    WRITE: 3,
    MAINTAIN: 4,
    ADMIN: 5
  }

  const requiredPermission =
    permissionMap[accessLevel !== '' ? accessLevel : 'MAINTAIN']
  const teams = response.organization.teams.edges
  let permission = 0
  if (teams) {
    for (const team of teams) {
      const repos = team?.node?.repositories.edges
      if (!repos || (teamName !== '' && team?.node?.name !== teamName)) {
        continue
      }
      for (const teamRepo of repos) {
        if (teamRepo?.node.name == repo) {
          const repoPermissionString: string = teamRepo.permission
          const repoPermission = permissionMap[repoPermissionString]
          if (repoPermission > permission) {
            permission = repoPermission
            if (permission >= requiredPermission) {
              return true
            }
          }
        }
      }
    }
  }

  return false
}

const PEP440_SUFFIXES =
  '[._-]?' +
  '((?!post)(?:beta|b|c|pre|RC|alpha|a|patch|pl|p|dev)(?:(?:[.-]?\\d+)*)?)?' +
  '([+-]?([0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*))?'

const PEP440_VERSION =
  '(\\d+)(?:\\.(\\d+))?(?:\\.(\\d+))?(?:\\.(\\d+))?' +
  PEP440_SUFFIXES +
  '(?:\\+[^\\s]+)?'

const SEMVER =
  '(0|[1-9]\\d*).(0|[1-9]\\d*)\\.(0|[1-9]\\d*)' +
  '(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)' +
  '(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?' +
  '(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?'

function getVersionFromDiff(
  diffText: string,
  verFile: string,
  verPattern: string,
  verDiffRequired: boolean
): string {
  let regexp = new RegExp(
    verPattern
      .replace('[[:PEP440:]]', PEP440_VERSION)
      .replace('[[:SEMVER:]]', SEMVER)
  )

  let newVersion = ''
  let oldVersion = ''

  for (const file of parseDiff(diffText)) {
    if (file.to == verFile) {
      for (const chunk of file.chunks) {
        for (const change of chunk.changes) {
          if (change.type == 'del') {
            const match = regexp.exec(change.content)
            if (match) {
              oldVersion = match[1]
            }
          }
          if (change.type == 'add') {
            const match = regexp.exec(change.content)
            if (match) {
              newVersion = match[1]
              break
            }
          }
        }

        if (newVersion !== '') {
          break
        }
      }
    }
  }

  if (newVersion === '') {
    if (verDiffRequired) {
      throw new Error(
        'the diff does not contain a hunk matching the version expression'
      )
    } else {
      return newVersion
    }
  }

  if (oldVersion !== '') {
    if (
      verPattern.includes('[[:PEP440:]]') ||
      verPattern.includes('[[:SEMVER:]]')
    ) {
      if (pep440.lt(newVersion, oldVersion)) {
        throw new Error('new version is SMALLER than the old')
      }
    } else {
      console.log('custom version pattern, skipping version comparison check.')
    }
  }

  return newVersion
}

async function isApproved(
  octokit: ReturnType<typeof github.getOctokit>,
  pullRequest: {[key: string]: any}
): Promise<boolean> {
  const owner = pullRequest.base.repo.owner.login
  const repo = pullRequest.base.repo.name

  const reviews = await octokit.pulls.listReviews({
    owner,
    repo,
    pull_number: pullRequest.number
  })

  const requestedReviewers = await octokit.pulls.listRequestedReviewers({
    owner,
    repo,
    pull_number: pullRequest.number
  })

  const requestedReviewerNames = new Set(
    requestedReviewers.data.users.map(user => user.login)
  )

  const requireTeam = core.getInput('require_team')
  const requireAccessLevel = core.getInput('require_access_level')

  for (const review of reviews.data) {
    const reviewer = review.user.login
    const state = review.state

    if (
      isMaintainer({
        octokit,
        owner,
        repo,
        user: reviewer,
        teamName: requireTeam,
        accessLevel: requireAccessLevel
      }) &&
      state == 'APPROVED' &&
      !requestedReviewerNames.has(reviewer)
    ) {
      return true
    }
  }

  return false
}

async function approve({
  octokit,
  owner,
  repo,
  pullRequest
}: {
  octokit: ReturnType<typeof github.getOctokit>
  owner: string
  repo: string
  pullRequest: {[key: string]: any}
}): Promise<boolean> {
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: pullRequest.number,
    event: 'APPROVE'
  })
  return true
}

async function run() {
  try {
    const verFile = core.getInput('version_file', {required: true})
    const verPattern = core.getInput('version_line_pattern', {required: true})
    const token = core.getInput('github_token')
    const requireApproval = core.getInput('require_approval')
    const requireTeam = core.getInput('require_team')
    const requireAccessLevel = core.getInput('require_access_level')
    const verDiffRequired = core.getInput('missing_version_ok') !== 'yes'

    if (!token) {
      core.info('GITHUB_TOKEN not set, assuming this is a PR from a fork')
      return
    }

    const octokit = github.getOctokit(token)
    const {owner, repo} = github.context.repo
    const pullRequest = github.context.payload.pull_request

    if (!pullRequest) {
      if (verDiffRequired) {
        throw new Error('Not a pull request event.')
      } else {
        return
      }
    }

    const submitter = pullRequest.user.login

    if (
      !(await isMaintainer({
        octokit,
        user: submitter,
        owner,
        repo,
        teamName: requireTeam,
        accessLevel: requireAccessLevel
      }))
    ) {
      core.setFailed(
        `User ${submitter} does not belong to any team that is ` +
          `authorized to make releases in the "${repo}" repository`
      )
    } else {
      const diffText = await request.get(pullRequest.diff_url)

      const version = getVersionFromDiff(
        diffText,
        verFile,
        verPattern,
        verDiffRequired
      )
      core.setOutput('version', version)
      if (version === '') {
        return
      }
      let approved = 'false'

      if (await isApproved(octokit, pullRequest)) {
        approved = 'true'
      } else if (requireApproval === 'no') {
        await approve({octokit, owner, repo, pullRequest})
        // Recheck the approval status
        approved = (await isApproved(octokit, pullRequest)) ? 'true' : 'false'
      }

      core.setOutput('approved', approved)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

export default run
