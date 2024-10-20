#!/bin/bash

set -Eeox pipefail

. /lib.sh

check_event_env
check_input github_token tag_name

gpg_key_id=$(import_gpg_key "${INPUT_GPG_KEY}" "${INPUT_GPG_KEY_ID}")
import_ssh_key "${INPUT_SSH_KEY}"
configure_git "${gpg_key_id}"

pr_sha=$(jqevent .pull_request.head.sha)
base_ref=$(jqevent .pull_request.base.ref)
message="${INPUT_TAG_MESSAGE}"
if [ -z "${message}" ]; then
  message="$(jqevent .pull_request.title)

$(jqevent .pull_request.body)"
fi

git fetch origin "${pr_sha}"
echo "${message}" | git tag --sign --file=- "${INPUT_TAG_NAME}" "${pr_sha}"

git config --list
env GCM_TRACE=1 GIT_TRACE=1 GIT_TRANSFER_TRACE=1 GIT_CURL_VERBOSE=1 \
  git \
    -c "http.https://github.com/.extraheader=" \
    push --force --follow-tags origin "${pr_sha}":"${base_ref}"
