import { BasePlugin } from "mastotron";

export default class MembersMentionCommandsPlugin extends BasePlugin {
  static configSchema = {
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

  static mentionCommands = [
    {
      token: "add",
      method: "commandAdd",
      description: "Add a new member (e.g. add me)",
      usage: "add me",
    },
    {
      token: "remove",
      method: "commandRemove",
      description: "Remote an existing member (e.g. remove me)",
      usage: "remove me",
    },
    {
      token: "random",
      method: "commandRandom",
      description: "Mention one random member",
      usage: "random",
    },
    {
      token: "mention",
      method: "commandMention",
      description: "Mention a random selection of members",
      usage: "mention",
      admin: true,
    },
  ];

  /** @param {import("../../bot.js").default} parent */
  constructor(parent) {
    super(parent);
    this.parent = parent;
  }

  async onInterval() {
    const { dataName } = this.parent.constructor;
    const { config, bot } = this.parent;

    const log = this.parent.logBot();
    log.trace({ msg: "interval" });

    await bot.scheduleCallback(
      "lastMemberMention",
      dataName,
      config.get("memberMentionInterval"),
      () => this.mentionMembers()
    );
  }

  async commandAdd({ params, account, status }) {
    const { id, visibility } = status;
    const { mentionCommands, templates, profiles } = this.parent;
    const { requests } = mentionCommands;

    const members = await mentionCommands.acceptMembersFromParams({ params, account });
    const isAdmin = await mentionCommands.isAdminAccount({ account });

    const request = ["add", ...members].join(" ");
    const templateOptions = {
      variables: { members: members.join(" "), account },
      options: { visibility, in_reply_to_id: id },
    };

    if (!isAdmin) {
      await requests.addPendingRequest({ request, from: account.acct });
      return templates.postTemplatedStatus({
        name: "command-add-deferred",
        ...templateOptions,
      });
    }

    await profiles.addMembers({ members });
    await requests.cancelPendingRequest({ request, from: account.acct });

    return templates.postTemplatedStatus({
      name: "command-add",
      ...templateOptions,
    });
  }

  async commandRemove({ params, account, status }) {
    const { id, visibility } = status;
    const { mentionCommands, templates, profiles } = this.parent;
    const { requests } = mentionCommands;

    const members = await mentionCommands.acceptMembersFromParams({ params, account });
    const isAdmin = await mentionCommands.isAdminAccount({ account });

    const request = ["remove", ...members].join(" ");
    const templateOptions = {
      variables: { members: members.join(" "), account },
      options: { visibility, in_reply_to_id: id },
    };

    if (!isAdmin) {
      await requests.addPendingRequest({ request, from: account.acct });
      return templates.postTemplatedStatus({
        name: "command-remove-deferred",
        ...templateOptions,
      });
    }

    await profiles.removeMembers({ members });
    await requests.cancelPendingRequest({ request, from: account.acct });

    return templates.postTemplatedStatus({
      name: "command-remove",
      ...templateOptions,
    });
  }

  async commandRandom({ account, status }) {
    const { id, visibility } = status;
    const { templates, profiles } = this.parent;
    const [member] = await profiles.selectRandomMembers({ count: 1 });
    await templates.postTemplatedStatus({
      name: "command-random",
      variables: { member, account },
      options: { visibility, in_reply_to_id: id },
    });
  }

  async commandMention({ account }) {
    await this.parent.mentionCommands.requireAdminAccount({ account });
    await this.mentionMembers();
  }

  async mentionMembers() {
    const { config, templates, profiles } = this.parent;
    const members = await profiles.selectRandomMembers({
      count: config.get("memberMentionCount"),
    });
    await templates.postTemplatedStatus({
      name: "mention-members",
      variables: { members },
    });
  }
}
