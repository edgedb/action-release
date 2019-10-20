FROM python:3.7-alpine

RUN apk add bash curl jq \
    && pip install distlib~=0.2.9.post0 whatthepatch~=0.0.6

COPY LICENSE NOTICE README.md entrypoint.sh checkver.py /

ENTRYPOINT ["/entrypoint.sh"]
