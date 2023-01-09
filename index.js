#!/usr/bin/env node
/*
TODO:
- [ ] alter role for a member (member, admin, etc)
- [ ] Split up longer messages into several, to not run afoul of character limit
- [ ] queue up git changes serially, so that two simultaneous operations don't collide
- [ ] notify user when added as member
- [ ] notify all admins when a new request has been deferred
- [ ] resolve all addresses to include server host
- [ ] don't add if already present in list
- [ ] don't remove if not present in list
*/
import Mastotron from "mastotron";

import GitMixin from "./mixins/git.js";
import TemplatesMixin from "./mixins/templates.js";
import ProfilesMixin from "./mixins/profiles.js";
import CommandsMixin from "./mixins/commands/index.js";

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
}

export const FediringManager = [
  GitMixin,
  TemplatesMixin,
  ProfilesMixin,
  CommandsMixin,
].reduce((base, mixin) => mixin(base), FediringManagerBase);

export default FediringManager;

await main();
