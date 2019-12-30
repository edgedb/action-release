#!/bin/bash

set -Eeo pipefail

. /lib.sh

check_event_env
check_input github_token release_validation_check

reviewer="$(jqevent .review.user.login)"
org="$(jqevent .pull_request.base.repo.owner.login)"
repo="$(jqevent .pull_request.base.repo.name)"
head_repo_url="$(jqevent .pull_request.head.repo.clone_url)"
head_branch="$(jqevent .pull_request.head.ref)"
pr_commit="$(jqevent .pull_request.head.sha)"

action="$(jqevent .action)"
state="$(jqevent .review.state)"

# Check if this is actually an approval submission.
if [ "${action}" != "submitted" -o "${state}" != "approved" ]; then
  echo "::warning::Not an approving review, not triggering a release."
  exit 0
fi

# Check if the approver is a maintainer of the target repo.
if ! is_maintainer "${reviewer}" "${org}" "${repo}"; then
  echo "::warning::Approving user \"${reviewer}\" is not a maintainer " \
       "of the \"${repo}\" repository, not triggering a release."
  exit 0
fi

release_suite_id=""
checks=$(get "/repos/${org}/${repo}/commits/${pr_commit}/check-runs")
validation_check="${INPUT_RELEASE_VALIDATION_CHECK}"
last_validation=$(echo "${checks}" \
                  | jqr ".check_runs \
                         | map(select(.name == \"${validation_check}\")) \
                         | sort_by(.started_at) \
                         | reverse \
                         | .[0]")

if [ -z "${last_validation}" ]; then
  echo "::warning::Could not find the check suite performing the release."
  exit 1
fi

last_validation_conclusion=$(echo "${last_validation}" | jqr '.conclusion')
if [ "${last_validation_conclusion}" = "failure" ]; then
  release_suite_id=$(echo "${last_validation}" | jqr '.check_suite.id')
else
  echo "::warning::Release suite status is not in the failure state: " \
       "${last_validation_conclusion}, not triggering release."
fi

rerequest="/repos/${org}/${repo}/check-suites/${release_suite_id}/rerequest"
output=$(post "${rerequest}")
status=$(echo "${output}" | tail -1)
if [ "${status}" != "201" ]; then
  echo "${output}" >@2
  die "Unexpected status returned from check suite rerequest: ${status}"
fi

echo "Triggered PR release suite."
