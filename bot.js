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

import GitPlugin from "./plugins/git.js";
import TemplatesPlugin from "./plugins/templates.js";
import ProfilesPlugin from "./plugins/profiles.js";
import MentionCommandsIndexPlugin from "./plugins/mention-commands/index.js";

export default class FediringManager extends Mastotron {
  static dataName = "fediring";

  constructor(options) {
    super(options);

    this.git = new GitPlugin(this);
    this.templates = new TemplatesPlugin(this);
    this.profiles = new ProfilesPlugin(this);
    this.mentionCommands = new MentionCommandsIndexPlugin(this);
  }

  logBot() {
    return this.logger.log({ module: "fediring-manager" });
  }

  async onMentioned(...args) {
    return this.mentionCommands.onMentioned(...args);
  }

  async onInterval() {
    await this.git.onInterval();
    await this.mentionCommands.members.onInterval();
  }  
}
