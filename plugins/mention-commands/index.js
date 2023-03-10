import { BasePlugin } from "mastotron";

import * as Cheerio from "cheerio";

import MembersMentionCommandsPlugin from "./members.js";
import RequestsStatusCommandsPlugin from "./requests.js";

class PermissionDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export default class MentionCommandsIndexPlugin extends BasePlugin {
  static configSchema = {
    adminAccounts: {
      doc: "list of accounts permitted to use administrative commands",
      format: Array,
      nullable: true,
      default: null,
    },
  };

  /** @param {import("../../bot.js").default} parent */
  constructor(parent) {
    super(parent);
    this.parent = parent;

    this.members = new MembersMentionCommandsPlugin(parent);
    this.requests = new RequestsStatusCommandsPlugin(parent);

    this.mentionCommands = [];
    for (const plugin of [this, this.members, this.requests]) {
      for (const command of plugin.constructor.mentionCommands) {
        const handler = plugin[command.method].bind(plugin);
        this.mentionCommands.push({ ...command, handler });
      }
    }
  }

  static mentionCommands = [
    {
      token: "help",
      method: "commandHelp",
      description: "List supported commands",
      usage: "help",
    },
  ];

  async onMentioned({ account, status }) {
    const { id, visibility } = status;
    const { content } = status;

    const log = this.parent.logBot();
    const { templates } = this.parent;

    const tokens = Cheerio.load(content.replaceAll("<br />", "\n"))
      .text()
      .split(/[\n\r\s]+/g)
      .filter((word) => !word.startsWith("@"));

    const templateOptions = {
      variables: { account },
      options: { visibility, in_reply_to_id: id },
    };

    for (const command of this.mentionCommands) {
      const commandTokenIdx = tokens.indexOf(command.token);
      if (commandTokenIdx == -1) continue;

      const [commandToken, ...params] = tokens.slice(commandTokenIdx);
      const { handler } = command;
      const args = { command: commandToken, params, account, status };

      try {
        log.trace({ msg: "command", command: commandToken, params, content });
        log.info({ msg: "command", command: commandToken, params });
        return await handler(args);
      } catch (error) {
        throw error;
        log.error({
          msg: "command failed",
          errorName: error.name,
          errorMessage: error.message,
        });
        return await templates.postTemplatedStatus({
          name: "error",
          ...templateOptions,
        });
      }
    }

    log.debug({ msg: "unknown command", tokens });
    return await templates.postTemplatedStatus({
      name: "unknown-command",
      ...templateOptions,
    });
  }

  async unknownCommand({ account, status }) {
    const { id, visibility } = status;
  }

  async commandHelp({ account, status }) {
    const log = this.parent.logBot();
    const { templates } = this.parent;
    
    const { id, visibility } = status;
    const isAdmin = await this.isAdminAccount({ account });
    const commands = this.mentionCommands.filter(
      (command) => !command.admin || isAdmin
    );

    await templates.postTemplatedStatus({
      name: "command-help",
      variables: { commands, account },
      options: { visibility, in_reply_to_id: id },
    });
  }

  async isAdminAccount({ account }) {
    const { config } = this.parent;
    const { acct } = account;
    const log = this.parent.logBot();
    const adminAccounts = config.get("adminAccounts");
    const isAdmin = adminAccounts.includes(acct);
    log.trace({
      msg: "isAdminAccount",
      account: acct,
      adminAccounts,
      isAdmin,
    });
    return isAdmin;
  }

  async requireAdminAccount({ account }) {
    const log = this.parent.logBot();
    log.trace({ msg: "requireAdminAccount", account });
    if (!(await this.isAdminAccount({ account }))) {
      throw new PermissionDeniedError(
        `${account.acct} is not an admin account`
      );
    }
  }

  async acceptMembersFromParams({ params, account }) {
    if (params[0] == "me") {
      return [account.acct, ...params.slice(1)];
    }
    return params;
  }
}
