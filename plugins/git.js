import { BasePlugin } from "mastotron";

import fs, { constants } from "fs/promises";
import path from "path";
import { exec as execCb } from "child_process";
import mkdirp from "mkdirp";
import rmfr from "rmfr";

export default class GitPlugin extends BasePlugin {
  static configSchema = {
    gitCommandPath: {
      doc: "path to installed git binary",
      env: "GIT_COMMAND_PATH",
      format: String,
      default: "/usr/bin/git",
    },
    gitCommandTimeout: {
      doc: "timeout for executing git commands (in ms)",
      env: "GIT_COMMAND_TIMEOUT",
      format: Number,
      default: 1000 * 10,
    },
    gitRepoUrl: {
      doc: "URL for fediring git repository, with authentication",
      env: "GIT_REPO_URL",
      format: String,
      default: "https://8675309@api.glitch.com/git/some-project-here",
    },
    gitUpdateInterval: {
      doc: "interval between attempts at updating the local fediring clone",
      env: "GIT_UPDATE_INTERVAL",
      format: Number,
      default: 1000 * 60 * 10,
    },
  };

  /** @param {import("../bot.js").default} parent */
  constructor(parent) {
    super(parent);
    this.parent = parent;
  }

  async onInterval() {
    const { dataName } = this.parent.constructor;
    const { config, bot, git } = this.parent;

    await bot.scheduleCallback(
      "lastGitUpdate",
      dataName,
      config.get("gitUpdateInterval"),
      () => git.gitUpdateClone()
    );
  }

  gitConfig() {
    const { config } = this.parent;

    const gitRepoUrl = config.get("gitRepoUrl");
    const dataPath = config.get("dataPath");
    const git = config.get("gitCommandPath");
    const gitTimeout = config.get("gitCommandTimeout");

    const cloneDirname = "project";
    const clonePath = path.join(dataPath, cloneDirname);
    const profilesPath = path.join("content", "profiles.csv");
    const profilesFn = path.join(clonePath, profilesPath);

    return {
      gitRepoUrl,
      dataPath,
      git,
      gitTimeout,
      cloneDirname,
      clonePath,
      profilesPath,
      profilesFn,
    };
  }

  exec(command, options) {
    const log = this.parent.logBot();
    log.trace({ msg: "exec", command, options });
    return new Promise((resolve, reject) => {
      const child = execCb(command, options, (error, stdout, stderr) => {
        log.trace({ msg: "execComplete", command, error, stdout, stderr });
        const callback = error ? reject : resolve;
        return callback({ child, error, stdout, stderr });
      });
    });
  }

  async gitUpdateClone() {
    const log = this.parent.logBot();
    const { clonePath } = this.gitConfig();
    try {
      await fs.access(clonePath, constants.R_OK | constants.W_OK);
      await this.gitPull();
    } catch (err) {
      log.trace({ msg: "clone access failed", err });
      await this.gitClone();
    }
  }

  async gitClone() {
    const { gitRepoUrl, dataPath, git, gitTimeout, cloneDirname, clonePath } =
      this.gitConfig();
    await rmfr(clonePath);
    await mkdirp(dataPath);

    const execOptions = {
      cwd: dataPath,
      timeout: gitTimeout,
    };

    await this.exec(`${git} clone ${gitRepoUrl} ${cloneDirname}`, execOptions);
  }

  async gitPull() {
    const { git, gitTimeout, clonePath } = this.gitConfig();
    const execOptions = {
      cwd: clonePath,
      timeout: gitTimeout,
    };

    await this.exec(`${git} reset --hard`, execOptions);
    await this.exec(`${git} pull --rebase`, execOptions);
  }

  async gitPush() {
    const { git, gitTimeout, clonePath, profilesPath } = this.gitConfig();
    const execOptions = {
      cwd: clonePath,
      timeout: gitTimeout,
    };

    await this.exec(`${git} add ${profilesPath}`, execOptions);
    await this.exec(`${git} commit -m'add new member'`, execOptions);
    await this.exec(`${git} push`, execOptions);
  }
}
