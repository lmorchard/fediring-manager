#!/usr/bin/env node

/*
TODO:

- [x] periodic promo of 5 random members to follow
- [ ] request an add via mention or DM
- [ ] approve an add via mention or DM
- [ ] request removal by member
- [ ] perform removal by admin
- [ ] alter role for a member (member, admin, etc)
*/

import fs, { constants } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { exec as execCb } from "child_process";
import { parse as csvParser } from "csv-parse";
import mkdirp from "mkdirp";
import rmfr from "rmfr";
import * as Cheerio from "cheerio";
import Mastotron from "mastotron";

const MEMBER_MENTION_TEMPLATE = ({ selectedMembers = [] }) =>
  `
Say hello to a few of our members!

${selectedMembers.map((member) => `- @${member}`).join("\n")}
`.trim();

async function main() {
  return new FediringManager().run();
}

class PermissionDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

class FediringManager extends Mastotron {
  static dataName = "fediring";

  constructor(options) {
    super(options);
    const { program } = this;
    program.command("play").action(() => this.actionPlay());
  }

  async actionPlay() {
    const { profilesFn } = this.gitConfig();
    const log = this.logBot();

    /*
    const selection = await this.selectRandomMembers();
    log.debug({ selection });
    */

    await this.mentionMembers();

    /*
     */
  }

  configSchema() {
    return {
      ...super.configSchema(),
      adminAccounts: {
        doc: "list of accounts permitted to use administrative commands",
        format: Array,
        nullable: true,
        default: null,
      },
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
      memberMentionInterval: {
        doc: "maximum interval between tooting mention of members",
        env: "MEMBER_MENTION_INTERVAL",
        format: Number,
        default: 1000 * 60 * 60 * 24 * 7,
      },
      memberMentionCount: {
        doc: "number of random members to select for mention",
        env: "MEMBER_MENTION_COUNT",
        format: Number,
        default: 5,
      },
    };
  }

  logBot() {
    return this.log({ module: "fediring-manager" });
  }

  async onInterval() {
    const { dataName } = this.constructor;
    const { config } = this;
    const log = this.logBot();
    log.trace({ msg: "interval" });

    await this.scheduleCallback(
      "lastGitUpdate",
      dataName,
      config.get("gitUpdateInterval"),
      () => this.gitUpdateClone()
    );

    await this.scheduleCallback(
      "lastMemberMention",
      dataName,
      config.get("memberMentionInterval"),
      () => this.mentionMembers()
    );
  }

  async onMentioned({ account, status }) {
    const { commandTokens } = this.constructor;
    const { content } = status;
    const log = this.logBot();

    const tokens = Cheerio.load(content.replaceAll("<br />", "\n"))
      .text()
      .split(/[\n\r\s]+/g)
      .filter((word) => !word.startsWith("@"));

    const commandTokenIdx = tokens.findIndex((token) => !!commandTokens[token]);
    if (commandTokenIdx == -1) {
      log.debug({ msg: "unknown command", tokens });
      return;
    }

    const [command, ...params] = tokens.slice(commandTokenIdx);
    const handlerName = commandTokens[command];
    const handler = this[handlerName];
    const args = { command, params, account, status };

    try {
      log.debug({ msg: "mentioned", command, params, content });
      await handler.apply(this, [args]);
    } catch (error) {
      console.error(error);
      log.error({
        msg: "command failed",
        errorName: error.name,
        errorMessage: error.message,
      });
    }
  }

  async requireAdminAccount({ account }) {
    const { config } = this;
    const { acct } = account;
    const log = this.logBot();

    log.debug({ msg: "requireAdminAccount", account });

    const adminAccounts = config.get("adminAccounts");
    if (!adminAccounts.includes(acct)) {
      throw new PermissionDeniedError(`${acct} is not an admin account`);
    }
  }

  static commandTokens = {
    add: "handleCommandAdd",
    remove: "handleCommandRemove",
    mention: "handleCommandMention",
  };

  async handleCommandMention({ account }) {
    await this.requireAdminAccount({ account });
    await this.mentionMembers();
  }

  async handleCommandAdd({ params, account }) {
    const { profilesFn } = this.gitConfig();
    const log = this.logBot();

    let members;
    if (params[0] == "me") {
      members = [account.acct];
    } else {
      await this.requireAdminAccount({ account });
      members = params;
    }

    await this.gitUpdateClone();

    const readStream = createReadStream(profilesFn);
    const profiles = await this.parseCSV(readStream);
    const out = [...profiles, ...members.map((member) => [member])]
      .map((row) => row.join(","))
      .join("\n");

    await fs.writeFile(profilesFn, out);

    await this.gitPush();
  }

  async handleCommandRemove({ params, account }) {
    const { profilesFn } = this.gitConfig();
    const log = this.logBot();

    let members;
    if (params[0] == "me") {
      members = [account.acct];
    } else {
      await this.requireAdminAccount({ account });
      members = params;
    }

    await this.gitUpdateClone();

    const readStream = createReadStream(profilesFn);
    const profiles = await this.parseCSV(readStream);
    const out = profiles
      .filter((row) => !members.includes(row[0]))
      .map((row) => row.join(","))
      .join("\n");

    await fs.writeFile(profilesFn, out);

    await this.gitPush();
  }

  async mentionMembers() {
    const { config } = this;
    const log = this.logBot();

    const selectedMembers = await this.selectRandomMembers({
      count: config.get("memberMentionCount"),
    });
    const status = MEMBER_MENTION_TEMPLATE({ selectedMembers });

    log.debug({ status });
    console.log(status);

    /*
    const resp = this.postStatus({ status, visibility: "public" });
    log.trace({ msg: "mentionMembersPosted", resp });
    */
  }

  async selectRandomMembers({ count = 5, maxHistoryRatio = 0.5 } = {}) {
    const { dataName } = this.constructor;
    const { profilesFn } = this.gitConfig();

    await this.gitUpdateClone();
    const readStream = createReadStream(profilesFn);
    const profiles = await this.parseCSV(readStream);
    profiles.shift();

    const { selectionHistory = [] } = await this.loadJSON(dataName);

    const selection = profiles
      .map((row) => row[0])
      .filter((addr) => !selectionHistory.includes(addr))
      .sort(() => Math.random() - 0.5)
      .slice(0, count);

    const maxHistory = Math.floor(profiles.length * maxHistoryRatio);
    await this.updateJSON(dataName, {
      selectionHistory: [...selection, ...selectionHistory].slice(
        0,
        maxHistory
      ),
    });

    return selection;
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
