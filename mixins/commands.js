import * as Cheerio from "cheerio";

class PermissionDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export default (Base) =>
  class extends Base {
    configSchema() {
      return {
        ...super.configSchema(),
        adminAccounts: {
          doc: "list of accounts permitted to use administrative commands",
          format: Array,
          nullable: true,
          default: null,
        },
      };
    }

    mentionCommands() {
      return [
        {
          token: "help",
          method: "commandHelp",
          description: "get help on supported commands",
          usage: "help",
        },
        {
          token: "random",
          method: "commandRandom",
          description: "Mention one random member from the ring",
          usage: "random",
        },
        {
          token: "add",
          method: "commandAdd",
          description: "Add a new member to the ring",
          usage: "add me",
        },
        {
          token: "remove",
          method: "commandRemove",
          description: "Remote an existing member from the ring",
          usage: "remove me",
        },
        {
          token: "mention",
          method: "commandMention",
          description: "Mention a random selection of members from the ring",
          usage: "mention",
          admin: true,
        },
      ];
    }

    async onMentioned({ account, status }) {
      const { id, visibility } = status;
      const { content } = status;
      const log = this.logBot();

      const tokens = Cheerio.load(content.replaceAll("<br />", "\n"))
        .text()
        .split(/[\n\r\s]+/g)
        .filter((word) => !word.startsWith("@"));

      for (const command of this.mentionCommands()) {
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

    async commandHelp({ account, status }) {
      const { id, visibility } = status;
      const isAdmin = this.isAdminAccount({ account });
      const commands = this.mentionCommands().filter(
        (command) => !command.admin || isAdmin
      );
      await this.postTemplatedStatus({
        name: "command-help",
        variables: { commands, account },
        options: { visibility, in_reply_to_id: id },
      });
    }

    async commandRandom({ account, status }) {
      const { id, visibility } = status;
      const [member] = await this.selectRandomMembers({ count: 1 });
      await this.postTemplatedStatus({
        name: "command-random",
        variables: { member, account },
        options: { visibility, in_reply_to_id: id },
      });
    }

    async commandMention({ account }) {
      await this.requireAdminAccount({ account });
      await this.mentionMembers();
    }

    async mentionMembers() {
      const { config } = this;
      const members = await this.selectRandomMembers({
        count: config.get("memberMentionCount"),
      });
      await this.postTemplatedStatus({
        name: "mention-members",
        variables: { members },
      });
    }

    async commandAdd({ params, account }) {
      const members = await this.acceptMembersFromParams({ params, account });
      const profiles = await this.fetchProfiles();
      await this.writeProfiles([
        ...profiles,
        ...members.map((member) => [member]),
      ]);
    }

    async commandRemove({ params, account }) {
      const members = await this.acceptMembersFromParams({ params, account });
      const profiles = await this.fetchProfiles();
      await this.writeProfiles(
        profiles.filter((row) => !members.includes(row[0]))
      );
    }

    async isAdminAccount({ account }) {
      const { config } = this;
      const { acct } = account;
      const log = this.logBot();
      log.trace({ msg: "isAdminAccount", account });
      const adminAccounts = config.get("adminAccounts");
      return adminAccounts.includes(acct);
    }

    async requireAdminAccount({ account }) {
      const log = this.logBot();
      log.trace({ msg: "requireAdminAccount", account });
      if (!this.isAdminAccount({ account })) {
        throw new PermissionDeniedError(
          `${account.acct} is not an admin account`
        );
      }
    }

    async acceptMembersFromParams({ params, account }) {
      if (params[0] == "me") {
        return [account.acct];
      }
      await this.requireAdminAccount({ account });
      return params;
    }
  };
