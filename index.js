#!/usr/bin/env node

import fs, { constants } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { exec as execCb } from "child_process";
import { parse as csvParser } from "csv-parse";
import mkdirp from "mkdirp";
import rmfr from "rmfr";
import * as Cheerio from "cheerio";
import Mastotron from "mastotron";

async function main() {
  return new FediringManager().run();
}

class FediringManager extends Mastotron {
  static dataName = "fediring";

  constructor(options) {
    super(options);
    const { program } = this;

    program.command("gitplay").action(this.actionGitPlay.bind(this));
  }

  configSchema() {
    return {
      ...super.configSchema(),
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
        default: 1000 * 60,
      },
    };
  }

  logBot() {
    return this.log({ module: "fediring-manager" });
  }

  async onInterval() {
    const { config } = this;
    const log = this.logBot();
    log.trace({ msg: "interval" });

    await this.scheduleCallback(
      "lastGitUpdate",
      this.constructor.dataName,
      config.get("gitUpdateInterval"),
      async () => {
        await this.gitUpdateClone();
        log.debug({ msg: "updated git clone" });
      }
    );
  }

  async onMentioned({ created_at, account, status }) {
    const log = this.logBot();
    const { acct } = account;
    const { id, content, visibility } = status;
    const $content = Cheerio.load(content);

    log.info({ msg: "mentioned", created_at, acct, content: $content.text() });

    const resp = this.postStatus({
      status: `@${acct} YO`,
      visibility,
      in_reply_to_id: id,
    });
    log.trace({ msg: "postedReply", resp });
  }

  /*
  async onFavorited({ created_at, account, status }) {
    const log = this.logBot();
    const { acct } = account;
    const { id, visibility } = status;

    log.info({ msg: "favorited", created_at, acct });

    const resp = this.postStatus({
      status: `@${acct} Oh you liked that, did you? ${this.generate()}`,
      visibility,
      in_reply_to_id: id,
    });
    log.trace({ msg: "postedReply", resp });
  }

  async onBoosted({ created_at, account, status }) {
    const log = this.logBot();
    const { acct } = account;
    const { id, visibility } = status;

    log.info({ msg: "boosted", created_at, acct });

    const resp = this.postStatus({
      status: `@${acct} Thank you for the boost, ${this.generate()}`,
      visibility,
      in_reply_to_id: id,
    });
    log.trace({ msg: "postedReply", resp });
  }

  async onFollowed({ created_at, account }) {
    const log = this.logBot();
    const { acct } = account;

    log.info({ msg: "followed by", created_at, acct });

    const resp = this.postStatus({
      status: `@${acct} Thanks for the follow, ${this.generate()}`,
    });
    log.trace({ msg: "postedReply", resp });
  }
  */

  async actionGitPlay() {
    const { config } = this;
    const log = this.logBot();

    const { clonePath, profilesFn } = this.gitConfig();

    await this.gitUpdateClone();

    const readStream = createReadStream(profilesFn);
    const profiles = await this.parseCSV(readStream);

    profiles.push(["abc@example.com"]);
    const out = profiles.map((row) => row.join(",")).join("\n");
    await fs.writeFile(profilesFn, out);

    await this.gitPush();
  }

  gitConfig() {
    const { config } = this;

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

  async gitUpdateClone() {
    const log = this.logBot();
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
    const { gitRepoUrl, dataPath, git, gitTimeout, cloneDirname, clonePath } =
      this.gitConfig();
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

  exec(command, options) {
    const log = this.logBot();
    log.trace({ msg: "exec", command, options });
    return new Promise((resolve, reject) => {
      const child = execCb(command, options, (error, stdout, stderr) => {
        log.trace({ msg: "execComplete", command, error, stdout, stderr });
        const callback = error ? reject : resolve;
        return callback({ child, error, stdout, stderr });
      });
    });
  }

  parseCSV(readStream) {
    return new Promise((resolve, reject) => {
      const parser = csvParser({}, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
      readStream.pipe(parser);
    });
  }
}

await main();
