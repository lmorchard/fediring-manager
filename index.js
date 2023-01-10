#!/usr/bin/env node
/*
TODO:
- [ ] deferred request management
  - [ ] notify all admins when a new request has been deferred
- [ ] send introductory message to new member with instructions on how to use the ring
- [ ] roles & permissions
  - [ ] alter role for a member (member, admin, etc)
- [ ] Split up longer messages into several, to not run afoul of character limit
- [ ] queue up git changes serially, so that two simultaneous operations don't collide
- [ ] resolve all addresses to include server host
- [ ] don't add if already present in list
- [ ] don't remove if not present in list
- [ ] command to broadcast to all ring members? (problematic?)
- [ ] general moderation tools?
  - [ ] user & instance ignore lists
  - [ ] lean into mastodon blocking?
*/
import Mastotron from "mastotron";

import GitMixin from "./mixins/git.js";
import TemplatesMixin from "./mixins/templates.js";
import ProfilesMixin from "./mixins/profiles.js";
import CommandsMixin from "./mixins/commands/index.js";

async function main() {
  const bot = new FediringManager();
  return bot.run();
}

export class FediringManagerBase extends Mastotron {
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

export default class FediringManager extends CommandsMixin(
  ProfilesMixin(TemplatesMixin(GitMixin(FediringManagerBase)))
) {}

// TODO: This looks cleaner, IMO, but seems to baffle type inference machinery
/*
export const FediringManager = [
  GitMixin,
  TemplatesMixin,
  ProfilesMixin,
  CommandsMixin,
].reduce((base, mixin) => mixin(base), FediringManagerBase);
export default FediringManager;
*/

await main();
