"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const parse_diff_1 = __importDefault(require("parse-diff"));
const fetch = __importStar(require("node-fetch"));
const pep440 = __importStar(require("@renovate/pep440"));
function isMaintainer(_a) {
    return __awaiter(this, arguments, void 0, function* ({ octokit, user, owner, repo, teamName = '', accessLevel = 'MAINTAIN' }) {
        var _b, _c;
        const response = yield octokit.graphql(teamName !== ''
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
      `);
        const permissionMap = {
            NONE: 0,
            READ: 1,
            TRIAGE: 2,
            WRITE: 3,
            MAINTAIN: 4,
            ADMIN: 5
        };
        const requiredPermission = permissionMap[accessLevel !== '' ? accessLevel : 'MAINTAIN'];
        const teams = response.organization.teams.edges;
        let permission = 0;
        if (teams) {
            for (const team of teams) {
                const repos = (_b = team === null || team === void 0 ? void 0 : team.node) === null || _b === void 0 ? void 0 : _b.repositories.edges;
                if (!repos || (teamName !== '' && ((_c = team === null || team === void 0 ? void 0 : team.node) === null || _c === void 0 ? void 0 : _c.name) !== teamName)) {
                    continue;
                }
                for (const teamRepo of repos) {
                    if ((teamRepo === null || teamRepo === void 0 ? void 0 : teamRepo.node.name) == repo) {
                        const repoPermissionString = teamRepo.permission;
                        const repoPermission = permissionMap[repoPermissionString];
                        if (repoPermission > permission) {
                            permission = repoPermission;
                            if (permission >= requiredPermission) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
        return false;
    });
}
const PEP440_SUFFIXES = '[._-]?' +
    '((?!post)(?:beta|b|c|pre|RC|alpha|a|patch|pl|p|dev)(?:(?:[.-]?\\d+)*)?)?' +
    '([+-]?([0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*))?';
const PEP440_VERSION = '(\\d+)(?:\\.(\\d+))?(?:\\.(\\d+))?(?:\\.(\\d+))?' +
    PEP440_SUFFIXES +
    '(?:\\+[^\\s]+)?';
const SEMVER = '(0|[1-9]\\d*).(0|[1-9]\\d*)\\.(0|[1-9]\\d*)' +
    '(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)' +
    '(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?' +
    '(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?';
function getVersionFromDiff(diffText, verFile, verPattern, verDiffRequired) {
    let regexp = new RegExp(verPattern
        .replace('[[:PEP440:]]', PEP440_VERSION)
        .replace('[[:SEMVER:]]', SEMVER));
    let newVersion = '';
    let oldVersion = '';
    for (const file of (0, parse_diff_1.default)(diffText)) {
        if (file.to == verFile) {
            for (const chunk of file.chunks) {
                for (const change of chunk.changes) {
                    if (change.type == 'del') {
                        const match = regexp.exec(change.content);
                        if (match) {
                            oldVersion = match[1];
                        }
                    }
                    if (change.type == 'add') {
                        const match = regexp.exec(change.content);
                        if (match) {
                            newVersion = match[1];
                            break;
                        }
                    }
                }
                if (newVersion !== '') {
                    break;
                }
            }
        }
    }
    if (newVersion === '') {
        if (verDiffRequired) {
            throw new Error('the diff does not contain a hunk matching the version expression');
        }
        else {
            return newVersion;
        }
    }
    if (oldVersion !== '') {
        if (verPattern.includes('[[:PEP440:]]') ||
            verPattern.includes('[[:SEMVER:]]')) {
            if (pep440.lt(newVersion, oldVersion)) {
                throw new Error('new version is SMALLER than the old');
            }
        }
        else {
            console.log('custom version pattern, skipping version comparison check.');
        }
    }
    return newVersion;
}
function isApproved(octokit, pullRequest) {
    return __awaiter(this, void 0, void 0, function* () {
        const owner = pullRequest.base.repo.owner.login;
        const repo = pullRequest.base.repo.name;
        const reviews = yield octokit.rest.pulls.listReviews({
            owner,
            repo,
            pull_number: pullRequest.number
        });
        const requestedReviewers = yield octokit.rest.pulls.listRequestedReviewers({
            owner,
            repo,
            pull_number: pullRequest.number
        });
        const requestedReviewerNames = new Set(requestedReviewers.data.users.map(user => user.login));
        const requireTeam = core.getInput('require_team');
        const requireAccessLevel = core.getInput('require_access_level');
        for (const review of reviews.data) {
            if (review.user == null) {
                continue;
            }
            const reviewer = review.user.login;
            const state = review.state;
            const reviewerIsMaintainer = yield isMaintainer({
                octokit,
                owner,
                repo,
                user: reviewer,
                teamName: requireTeam,
                accessLevel: requireAccessLevel
            });
            if (reviewerIsMaintainer &&
                state == 'APPROVED' &&
                !requestedReviewerNames.has(reviewer)) {
                return true;
            }
        }
        return false;
    });
}
function approve(_a) {
    return __awaiter(this, arguments, void 0, function* ({ octokit, owner, repo, pullRequest }) {
        yield octokit.rest.pulls.createReview({
            owner,
            repo,
            pull_number: pullRequest.number,
            event: 'APPROVE'
        });
        return true;
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const verFile = core.getInput('version_file', { required: true });
            const verPattern = core.getInput('version_line_pattern', { required: true });
            const token = core.getInput('github_token');
            const requireApproval = core.getInput('require_approval');
            const requireTeam = core.getInput('require_team');
            const requireAccessLevel = core.getInput('require_access_level');
            const verDiffRequired = core.getInput('missing_version_ok') !== 'yes';
            if (!token) {
                core.info('GITHUB_TOKEN not set, assuming this is a PR from a fork');
                return;
            }
            const octokit = github.getOctokit(token);
            const { owner, repo } = github.context.repo;
            const pullRequest = github.context.payload.pull_request;
            if (!pullRequest) {
                if (verDiffRequired) {
                    throw new Error('Not a pull request event.');
                }
                else {
                    return;
                }
            }
            const submitter = pullRequest.user.login;
            const submitterIsMaintainer = yield isMaintainer({
                octokit,
                user: submitter,
                owner,
                repo,
                teamName: requireTeam,
                accessLevel: requireAccessLevel
            });
            const diffTextRequest = yield fetch.default(pullRequest.diff_url);
            const diffText = yield diffTextRequest.text();
            const version = getVersionFromDiff(diffText, verFile, verPattern, verDiffRequired);
            core.setOutput('version', version);
            if (version === '') {
                core.setOutput('approved', 'false');
                core.setOutput('is_release', '');
                return;
            }
            let approved = 'false';
            if (yield isApproved(octokit, pullRequest)) {
                approved = 'true';
            }
            else if (requireApproval === 'no' && submitterIsMaintainer) {
                yield approve({ octokit, owner, repo, pullRequest });
                // Recheck the approval status
                approved = (yield isApproved(octokit, pullRequest)) ? 'true' : 'false';
            }
            else if (verDiffRequired) {
                core.setFailed(`Release pull requests require maintainer approval.`);
            }
            core.setOutput('approved', approved);
            core.setOutput('is_release', 'true');
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
exports.default = run;
