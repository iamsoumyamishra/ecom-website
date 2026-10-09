import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Docker = (
  args: string[],
  env: NodeJS.ProcessEnv,
  capture?: boolean,
) => string;
const runDocker: Docker = (args, env, capture = true) => {
  const result = spawnSync("docker", ["compose", ...args], {
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(
      capture
        ? result.stderr?.trim() || "Docker Compose failed"
        : "Docker Compose failed",
    );
  return result.stdout?.trim() ?? "";
};
function setValue(text: string, key: string, value: string) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(text)
    ? text.replace(pattern, () => `${key}=${value}`)
    : `${text.trimEnd()}\n${key}=${value}\n`;
}
function portFrom(mapping: string) {
  const port = Number(mapping.match(/:(\d+)\s*$/)?.[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("Docker did not report a valid PostgreSQL host port");
  return String(port);
}
export function startInfrastructure({
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  docker = runDocker,
}: { root?: string; docker?: Docker } = {}) {
  const apiFile = path.join(root, "apps/api/.env");
  if (!existsSync(apiFile))
    throw Error(
      "Create apps/api/.env from apps/api/.env.example before starting infrastructure",
    );
  const apiText = readFileSync(apiFile, "utf8");
  const databaseValue = apiText
    .match(/^DATABASE_URL=(.+)$/m)?.[1]
    ?.trim()
    .replace(/^(['"])(.*)\1$/, "$2");
  if (!databaseValue) throw Error("DATABASE_URL is missing in apps/api/.env");
  const database = new URL(databaseValue);
  const previousCwd = process.cwd();
  process.chdir(root);
  try {
    const env = { ...process.env };
    // Keep an already-running database's port. Otherwise let Docker allocate one
    // atomically, avoiding both occupied ports and probe/bind races.
    const running = docker(
      ["ps", "--status", "running", "--quiet", "postgres"],
      env,
    );
    env.POSTGRES_PORT = running
      ? portFrom(docker(["port", "postgres", "5432"], env))
      : "0";
    docker(["up", "-d"], env, false);
    const port = portFrom(docker(["port", "postgres", "5432"], env));
    const rootFile = path.join(root, ".env");
    const rootText = existsSync(rootFile)
      ? readFileSync(rootFile, "utf8")
      : "# Local Docker Compose configuration\n";
    writeFileSync(rootFile, setValue(rootText, "POSTGRES_PORT", port), {
      mode: 0o600,
    });
    if (["127.0.0.1", "localhost", "[::1]"].includes(database.hostname)) {
      database.port = port;
      writeFileSync(
        apiFile,
        setValue(apiText, "DATABASE_URL", database.toString()),
        { mode: 0o600 },
      );
    }
    console.log(
      `PostgreSQL is available on 127.0.0.1:${port}. Local connection settings are synchronized.`,
    );
    return port;
  } finally {
    process.chdir(previousCwd);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    startInfrastructure();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Infrastructure startup failed",
    );
    process.exitCode = 1;
  }
}
