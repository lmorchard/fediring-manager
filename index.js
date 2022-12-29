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

import GitMixin from "./mixins/git.js";
import CommandsMixin from "./mixins/commands.js";

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

class FediringManagerBase extends Mastotron {
  static dataName = "fediring";

  constructor(options) {
    super(options);
    const { program } = this;
    // program.command("play").action(() => this.actionPlay());
  }

  async actionPlay() {
    const { profilesFn } = this.gitConfig();
    const log = this.logBot();
    await this.mentionMembers();
  }

  configSchema() {
    return {
      ...super.configSchema(),
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

export const FediringManager = [GitMixin, CommandsMixin].reduce(
  (base, mixin) => mixin(base),
  FediringManagerBase
);

export default FediringManager;

await main();
