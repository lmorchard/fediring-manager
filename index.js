#!/usr/bin/env node
/*
TODO:
- [x] periodic promo of 5 random members to follow
- [ ] request an add via mention or DM
- [ ] approve an add via mention or DM
- [x] request removal by member
- [ ] perform removal by admin
- [ ] alter role for a member (member, admin, etc)
*/
import * as Cheerio from "cheerio";
import Mastotron from "mastotron";

import GitMixin from "./mixins/git.js";
import TemplatesMixin from "./mixins/templates.js";
import ProfilesMixin from "./mixins/profiles.js";
import CommandsMixin from "./mixins/commands.js";

async function main() {
  return new FediringManager().run();
}

class FediringManagerBase extends Mastotron {
  static dataName = "fediring";

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
    const { commands } = this.constructor;
    const { id, visibility } = status;
    const { content } = status;
    const log = this.logBot();

    const tokens = Cheerio.load(content.replaceAll("<br />", "\n"))
      .text()
      .split(/[\n\r\s]+/g)
      .filter((word) => !word.startsWith("@"));

    for (const command of commands) {
      const commandTokenIdx = tokens.indexOf(command.token);
      if (commandTokenIdx == -1) continue;

      const [commandToken, ...params] = tokens.slice(commandTokenIdx);
      const handler = this[command.method];
      const args = { command: commandToken, params, account, status };

      try {
        log.debug({ msg: "command", command: commandToken, params, content });
        await handler.apply(this, [args]);
      } catch (error) {
        log.error({
          msg: "command failed",
          errorName: error.name,
          errorMessage: error.message,
        });
      }

      return;
    }

    log.debug({ msg: "unknown command", tokens });
    await this.postTemplatedStatus({
      name: "unknown-command",
      variables: { account },
      options: { visibility, in_reply_to_id: id },
    });
  }
}

export const FediringManager = [
  GitMixin,
  TemplatesMixin,
  ProfilesMixin,
  CommandsMixin,
].reduce((base, mixin) => mixin(base), FediringManagerBase);

export default FediringManager;

await main();
