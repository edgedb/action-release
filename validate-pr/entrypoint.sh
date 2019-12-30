#!/bin/bash

set -Eeo pipefail

. /lib.sh

check_event_env
check_input github_token

prno="$(jqevent .pull_request.number)"
org="$(jqevent .pull_request.base.repo.owner.login)"
repo="$(jqevent .pull_request.base.repo.name)"
user="$(jqevent .pull_request.user.login)"

if ! is_maintainer "${user}" "${org}" "${repo}"; then
  die "User \"${user}\" does not belong to any team that is " \
      "authorized to make releases in the \"${repo}\" repository"
fi

diff_url="$(jqevent .pull_request.diff_url)"
verargs=""
if [ -n "${INPUT_VERSION_FILE}" ]; then
    verargs+=" --version-file=${INPUT_VERSION_FILE}"
fi
if [ -n "${INPUT_VERSION_LINE_PATTERN}" ]; then
    verargs+=" --version-line-pattern=${INPUT_VERSION_LINE_PATTERN}"
fi
verargs+=" -"
ver=$(curl -sSL "${diff_url}" | python /checkver.py ${verargs})
echo ::set-output name=version::${ver}

approved="false"
reviews="$(get /repos/${org}/${repo}/pulls/${prno}/reviews)"
# Re-fetching the PR her instead of reading from the event to
# make sure we get the freshest data.
requested_reviewers=$(get /repos/${org}/${repo}/pulls/${prno} \
                      | jqr '.requested_reviewers[]')
for review in $(echo "${reviews}" | jqr '.[] | @base64'); do
  review=$(echo "${review}" | base64 -d)
  reviewer=$(echo "${review}" | jqr '.user.login')
  state=$(echo "${review}" | jqr '.state')

  if is_maintainer "${reviewer}" "${org}" "${repo}" \
      && [ "${state}" = "APPROVED" ]; then
    rereview=$(echo "${requested_reviewers}" \
               | jqr "select(.login == \"${reviewer}\") | .login")
    if [ -z "${rereview}" ]; then
      approved="true"
      break
    fi
  fi
done

echo ::set-output name=approved::"${approved}"
