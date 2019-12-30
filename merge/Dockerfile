#
# NOTE: THIS DOCKERFILE IS GENERATED VIA "update-dockerfiles.sh"
#
# PLEASE DO NOT EDIT IT DIRECTLY.
#

FROM alpine:3.10

RUN apk add bash curl git gnupg jq

COPY README.md entrypoint.sh /

COPY lib.sh /
RUN chmod +x /lib.sh
COPY gpg-wrapper /
RUN chmod +x /gpg-wrapper


ENTRYPOINT ["/entrypoint.sh"]
