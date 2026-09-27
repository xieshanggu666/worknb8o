// 一键启动脚本：python 环境 + 自动初始化数据库 + 自动选可用端口 + 打开浏览器
const { spawn, execSync } = require("child_process");
const net = require("net");
const path = require("path");
const { spawn: spawnOpen } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || "127.0.0.1";

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const candidates = ["python", "python3", "py"];
  for (const c of candidates) {
    try {
      execSync(c + " --version", { stdio: "ignore" });
      return c;
    } catch (_) {}
  }
  throw new Error("未找到 Python，请先安装 Python 3.10+ 并加入 PATH");
}

// 找到一个空闲端口（默认从 8000 开始递增）
function findFreePort(start) {
  return new Promise((resolve, reject) => {
    const probe = (port, cb) => {
      const srv = net.createServer();
      srv.once("error", () => cb(false));
      srv.once("listening", () => srv.close(() => cb(true)));
      srv.listen(port, HOST);
    };
    const next = (port) => {
      if (port > start + 100) return reject(new Error("未找到可用端口"));
      probe(port, (free) => (free ? resolve(port) : next(port + 1)));
    };
    next(start);
  });
}

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  try {
    execSync(cmd, { stdio: "ignore", shell: true });
  } catch (_) {}
}

async function main() {
  const python = resolvePython();
  console.log("");
  console.log("==============================================");
  console.log("  无人机电力巡检任务规划系统 · 一键启动");
  console.log("==============================================");

  // 1. 初始化数据库（幂等）
  console.log("\n[1/3] 初始化数据库（已有数据则跳过）…");
  try {
    execSync(`${python} scripts/init_db.py`, { cwd: ROOT, stdio: "inherit" });
  } catch (e) {
    console.error("数据库初始化失败：", e.message);
    process.exit(1);
  }

  // 2. 选择可用端口
  console.log("\n[2/3] 检测端口占用…");
  const port = await findFreePort(DEFAULT_PORT);
  const url = `http://${HOST}:${port}/`;
  console.log(port === DEFAULT_PORT ? `使用端口 ${port}` : `端口 ${DEFAULT_PORT} 被占用，已切换至端口 ${port}`);

  // 3. 启动服务
  console.log("\n[3/3] 启动服务…");
  const server = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", HOST, "--port", String(port)], {
    cwd: ROOT,
    stdio: "inherit",
  });

  console.log("");
  console.log("  访问地址：", url);
  console.log("  按 Ctrl+C 停止服务");
  console.log("");
  setTimeout(() => openBrowser(url), 1200);

  server.on("error", (e) => {
    console.error("启动失败：", e.message);
    process.exit(1);
  });
  server.on("exit", (code) => process.exit(code || 0));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});