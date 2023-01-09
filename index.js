#!/usr/bin/env node
/*
TODO:
- [ ] request an add via mention or DM
- [ ] approve an add via mention or DM
- [x] request removal by member
- [ ] perform removal by admin
- [ ] alter role for a member (member, admin, etc)
*/
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
      "lastMemberMention",
      dataName,
      config.get("memberMentionInterval"),
      () => this.mentionMembers()
    );
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
