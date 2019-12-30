#
# NOTE: THIS DOCKERFILE IS GENERATED VIA "update-dockerfiles.sh"
#
# PLEASE DO NOT EDIT IT DIRECTLY.
#

FROM python:3.7-alpine

RUN apk add bash curl jq \
    && pip install distlib~=0.2.9.post0 whatthepatch~=0.0.6

COPY README.md entrypoint.sh checkver.py /

COPY lib.sh /
RUN chmod +x /lib.sh
COPY gpg-wrapper /
RUN chmod +x /gpg-wrapper


ENTRYPOINT ["/entrypoint.sh"]
