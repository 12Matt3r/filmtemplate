FROM mcr.microsoft.com/devcontainers/python:1-3.12-bookworm

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg util-linux \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
USER vscode
