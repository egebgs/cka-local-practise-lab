FROM debian:bookworm-slim

ARG KUBECTL_VERSION=v1.30.0

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl vim less jq git bash-completion ca-certificates iproute2 \
      dnsutils procps openssh-client tree nano tmux \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /usr/local/bin/kubectl \
      "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
    && chmod +x /usr/local/bin/kubectl

# Static docker CLI (client only) so the exam terminal can `docker exec` into
# kind node containers -- this is the local equivalent of SSH-ing into a node.
ARG DOCKER_CLI_VERSION=25.0.5
RUN curl -fsSL -o /tmp/docker.tgz \
      "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz" \
    && tar -xzf /tmp/docker.tgz -C /tmp \
    && mv /tmp/docker/docker /usr/local/bin/docker \
    && rm -rf /tmp/docker /tmp/docker.tgz

RUN mkdir -p /root/.kube

COPY bashrc /root/.bashrc
COPY tmux.conf /root/.tmux.conf

WORKDIR /root
CMD ["sleep", "infinity"]
