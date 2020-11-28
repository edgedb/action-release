import * as core from '@actions/core'
import {GitHub, context} from '@actions/github'
import parseDiff from 'parse-diff'
import * as request from 'request-promise-native'
import * as pep440 from '@renovate/pep440'

async function isMaintainer({
  github,
  user,
  owner,
  repo,
  teamName = '',
  accessLevel = 'MAINTAIN'
}: {
  github: GitHub
  user: string
  owner: string
  repo: string
  teamName?: string
  accessLevel?: string
}): Promise<boolean> {
  const response = await github.graphql(
    teamName !== '' ?
      `
      {
        organization(login: "${owner}") {
          teams(first: 100, query: "${teamName}") {
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
      :
      `
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

  const requiredPermission = (
    permissionMap[accessLevel !== '' ? accessLevel : 'MAINTAIN']);
  const teams: Array<any> = response.organization.teams.edges
  let permission = 0
  for (const team of teams) {
    const repos = team.node.repositories.edges
    if (teamName !== '' && team.node.name !== teamName) {
      continue;
    }
    for (const teamRepo of repos) {
      if (teamRepo.node.name == repo) {
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
  verPattern: string
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
    throw new Error(
      'the diff does not contain a hunk matching the version expression'
    )
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
  github: GitHub,
  pullRequest: {[key: string]: any}
): Promise<boolean> {
  const owner = pullRequest.base.repo.owner.login
  const repo = pullRequest.base.repo.name

  const reviews = await github.pulls.listReviews({
    owner,
    repo,
    pull_number: pullRequest.number
  })

  const requestedReviews = await github.pulls.listReviewRequests({
    owner,
    repo,
    pull_number: pullRequest.number
  })

  const requestedReviewers = new Set(
    requestedReviews.data.users.map(user => user.login)
  )

  const requireTeam = core.getInput('require_team')
  const requireAccessLevel = core.getInput('require_access_level')

  for (const review of reviews.data) {
    const reviewer = review.user.login
    const state = review.state

    if (
      isMaintainer({
        github,
        owner,
        repo,
        user: reviewer,
        teamName: requireTeam,
        accessLevel: requireAccessLevel
      }) &&
      state == 'APPROVED' &&
      !requestedReviewers.has(reviewer)
    ) {
      return true
    }
  }

  return false
}

async function approve({
  github,
  owner,
  repo,
  pullRequest
}: {
  github: GitHub,
  owner: string,
  repo: string,
  pullRequest: {[key: string]: any}
}): Promise<boolean> {
  await github.pulls.createReview({
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
    const token = core.getInput('github_token', {required: true})
    const requireApproval = core.getInput('require_approval')
    const requireTeam = core.getInput('require_team')
    const requireAccessLevel = core.getInput('require_access_level')

    const github = new GitHub(token)
    const {owner, repo} = context.repo
    const pullRequest = context.payload.pull_request

    if (!pullRequest) {
      throw new Error('Not a pull request event.')
    }

    const submitter = pullRequest.user.login

    if (!(await isMaintainer({
      github,
      user: submitter,
      owner,
      repo,
      teamName: requireTeam,
      accessLevel: requireAccessLevel
    }))) {
      core.setFailed(
        `User ${submitter} does not belong to any team that is ` +
          `authorized to make releases in the "${repo}" repository`
      )
    } else {
      const diffText = await request.get(pullRequest.diff_url)

      const version = getVersionFromDiff(diffText, verFile, verPattern)
      core.setOutput('version', version)
      let approved = 'false'

      if (await isApproved(github, pullRequest)) {
        approved = 'true'
      } else if (requireApproval === 'no') {
        await approve({github, owner, repo, pullRequest})
        // Recheck the approval status
        approved = await isApproved(github, pullRequest) ? 'true' : 'false'
      }

      core.setOutput('approved', approved)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

export default run
