#!/bin/bash

set -Eeo pipefail

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

git fetch origin "${GITHUB_REF}"
echo "${message}" | git tag --sign --file=- "${INPUT_TAG_NAME}" "${pr_sha}"
git push --follow-tags origin "${pr_sha}":"${base_ref}"
