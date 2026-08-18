const { docker } = require("./docker");

/** Runs a command inside an arbitrary running container (used to simulate node-level
 * failures for troubleshooting questions, e.g. stopping kubelet on a kind node). */
async function execInContainer(containerName, cmd) {
  const container = docker.getContainer(containerName);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise((resolve, reject) => {
    let output = "";
    const sink = { write: (chunk) => (output += chunk.toString()) };
    docker.modem.demuxStream(stream, sink, sink);
    stream.on("end", async () => {
      try {
        const info = await exec.inspect();
        resolve({ exitCode: info.ExitCode, output });
      } catch (err) {
        reject(err);
      }
    });
    stream.on("error", reject);
  });
}

module.exports = { execInContainer };
