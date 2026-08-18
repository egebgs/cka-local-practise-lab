const Docker = require("dockerode");

const BASTION_CONTAINER = "cka-bastion";

function makeClient() {
  if (process.env.DOCKER_HOST) return new Docker();
  if (process.platform === "win32") {
    return new Docker({ socketPath: "//./pipe/docker_engine" });
  }
  return new Docker({ socketPath: "/var/run/docker.sock" });
}

const docker = makeClient();

async function ping() {
  return docker.ping();
}

async function getBastion() {
  const container = docker.getContainer(BASTION_CONTAINER);
  const info = await container.inspect(); // throws if missing entirely
  if (!info.State || !info.State.Running) {
    throw new Error(`bastion container exists but is not running (state: ${info.State && info.State.Status})`);
  }
  return container;
}

module.exports = { docker, ping, getBastion, BASTION_CONTAINER };
