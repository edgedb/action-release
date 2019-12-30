#!/usr/bin/env bash
set -Eeuo pipefail
shopt -s nullglob

generated_warning() {
	cat <<-EOH
		#
		# NOTE: THIS DOCKERFILE IS GENERATED VIA "update-dockerfiles.sh"
		#
		# PLEASE DO NOT EDIT IT DIRECTLY.
		#

	EOH
}

template="${1}"
dir="$(dirname ${template})"

{ generated_warning; cat "$template"; } > "${2}"

tmp=$(mktemp /tmp/dockerfile-update.XXXXXX)

scripts="lib.sh gpg-wrapper"

for f in ${scripts}; do
	cp -f "${f}" "${dir}/"
	script_cmd="COPY ${f} /"
	script_cmd+="
RUN chmod +x /${f}"

	echo "${script_cmd}" >>"${tmp}"
done

awk -i inplace '@load "readfile"; BEGIN{l = readfile("'"${tmp}"'")}/%%WRITE_SCRIPTS%%/{gsub("%%WRITE_SCRIPTS%%", l)}1' "${2}"

rm "${tmp}"
