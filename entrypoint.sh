#!/bin/bash

set -Eeo pipefail

die() {
  echo ::error::${@}
  exit 1
}


if [ -z "${INPUT_GITHUB_TOKEN}" ]; then
  die "The INPUT_GITHUB_TOKEN env var is missing."
fi

if [ -z "${GITHUB_EVENT_PATH}" ]; then
  die "The GITHUB_EVENT_PATH env var is missing."
fi

URI="https://api.github.com/graphql"
AUTH_HEADER="Authorization: bearer ${INPUT_GITHUB_TOKEN}"

_prepare_graphql_query() {
  # Fold newlines and escape the quotes.
  echo "${1}" \
    | sed -e ':a' -e 'N' -e '$!ba' -e 's/\n/ /g' \
    | sed -e 's/"/\\"/g'
}

gql() {
  echo {\"query\": \"$(_prepare_graphql_query "${1}")\"} \
    | curl -sSL -X POST -H "${AUTH_HEADER}" -d @- "${URI}"
}

jqr() {
  jq --raw-output "${@}"
}

jqevent() {
  jqr "${@}" "${GITHUB_EVENT_PATH}"
}

is_maintainer() {
  local perm
  local request
  local user="${1}"
  local org="${2}"
  local repo="${3}"

  read -r -d '' request <<EOF
    {
      organization(login: "${org}") {
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
EOF
  perm=$(gql "${request}" \
          | jqr ".data.organization.teams.edges[]?
                 | .node.repositories.edges[]
                 | select(.node.name == \"${repo}\")
                 | .permission")

  test "${perm}" == "MAINTAIN" -o "${perm}" == "ADMIN"
}

org="$(jqevent .organization.login)"
repo="$(jqevent .repository.name)"
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