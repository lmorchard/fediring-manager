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
          description: "List supported commands",
          usage: "help",
        },
        {
          token: "random",
          method: "commandRandom",
          description: "Mention one random member",
          usage: "random",
        },
        {
          token: "add",
          method: "commandAdd",
          description: "Add a new member",
          usage: "add me",
        },
        {
          token: "remove",
          method: "commandRemove",
          description: "Remote an existing member",
          usage: "remove me",
        },
        {
          token: "mention",
          method: "commandMention",
          description: "Mention a random selection of members",
          usage: "mention",
          admin: true,
        },
        {
          token: "pending",
          method: "commandPendingRequests",
          description: "List pending requests",
          usage: "pending",
          admin: true,
        },
        {
          token: "defer",
          method: "commandDeferRequest",
          description: "Add request to the pending list",
          usage: "defer add me",
          admin: true,
        },
        {
          token: "flush",
          method: "commandPendingFlush",
          description: "Clear out the list of pending requests",
          usage: "flush",
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
          log.trace({ msg: "command", command: commandToken, params, content });
          log.info({ msg: "command", command: commandToken, params });
          return await handler.apply(this, [args]);
        } catch (error) {
          log.error({
            msg: "command failed",
            errorName: error.name,
            errorMessage: error.message,
          });
          return this.commandUnknown({ account, status });
        }
      }

      log.debug({ msg: "unknown command", tokens });
      return this.commandUnknown({ account, status });
    }

    async commandUnknown({ account, status }) {
      const { id, visibility } = status;

      await this.postTemplatedStatus({
        name: "unknown-command",
        variables: { account },
        options: { visibility, in_reply_to_id: id },
      });
    }

    async commandHelp({ account, status }) {
      const { id, visibility } = status;
      const isAdmin = await this.isAdminAccount({ account });
      const commands = this.mentionCommands().filter(
        (command) => !command.admin || isAdmin
      );

      await this.postTemplatedStatus({
        name: "command-help",
        variables: { commands, account },
        options: { visibility, in_reply_to_id: id },
      });
    }

    async commandAdd({ params, account, status }) {
      const { id, visibility } = status;
      const members = await this.acceptMembersFromParams({ params, account });
      const isAdmin = await this.isAdminAccount({ account });

      const request = ["add", ...members, "for", account.acct].join(" ");
      const templateOptions = {
        variables: { members: members.join(" "), account },
        options: { visibility, in_reply_to_id: id },
      };

      if (!isAdmin) {
        await this.deferRequest(request);
        return this.postTemplatedStatus({
          name: "command-add-deferred",
          ...templateOptions,
        });
      }

      await this.addMembers({ members });
      await this.fulfillRequest(request);

      return this.postTemplatedStatus({
        name: "command-add",
        ...templateOptions,
      });
    }

    async commandRemove({ params, account, status }) {
      const { id, visibility } = status;
      const members = await this.acceptMembersFromParams({ params, account });
      const isAdmin = await this.isAdminAccount({ account });

      const request = ["remove", ...members, "for", account.acct].join(" ");
      const templateOptions = {
        variables: { members: members.join(" "), account },
        options: { visibility, in_reply_to_id: id },
      };

      if (!isAdmin) {
        await this.deferRequest(request);
        return this.postTemplatedStatus({
          name: "command-remove-deferred",
          ...templateOptions,
        });
      }

      await this.removeMembers({ members });
      return this.postTemplatedStatus({
        name: "command-remove",
        ...templateOptions,
      });
    }

    async addMembers({ members }) {
      const profiles = await this.fetchProfiles();
      // TODO: dedupe members after add?
      await this.writeProfiles([
        ...profiles,
        // TODO: support CSV with multiple columns 😞
        ...members.map((member) => [member]),
      ]);
    }

    async removeMembers({ members }) {
      const profiles = await this.fetchProfiles();
      await this.writeProfiles(
        profiles.filter((row) => !members.includes(row[0]))
      );
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

    async commandPendingRequests({ account, status }) {
      await this.requireAdminAccount({ account });
      const { id, visibility } = status;
      const { dataName } = this.constructor;

      let { pendingRequests = [] } = await this.loadJSON(dataName);

      await this.postTemplatedStatus({
        name: "command-pending",
        variables: { pendingRequests, account },
        options: { visibility, in_reply_to_id: id },
      });
    }

    async commandDeferRequest({ account, status, params }) {
      await this.requireAdminAccount({ account });
      const { id, visibility } = status;

      const request = params.join(" ");
      await this.deferRequest(request);

      await this.postTemplatedStatus({
        name: "command-defer",
        variables: { request, account },
        options: { visibility, in_reply_to_id: id },
      });
    }

    async deferRequest(request) {
      const { dataName } = this.constructor;
      const { pendingRequests = [] } = await this.loadJSON(dataName);
      const requests = new Set(pendingRequests);
      requests.add(request);
      await this.updateJSON(dataName, {
        pendingRequests: Array.from(requests),
      });
    }

    async fulfillRequest(request) {
      const { dataName } = this.constructor;
      const { pendingRequests = [] } = await this.loadJSON(dataName);
      const requests = new Set(pendingRequests);
      requests.delete(request);
      await this.updateJSON(dataName, {
        pendingRequests: Array.from(requests),
      });
    }

    async commandPendingFlush({ account, status }) {
      await this.requireAdminAccount({ account });
      const { id, visibility } = status;
      const { dataName } = this.constructor;

      await this.updateJSON(dataName, {
        pendingRequests: [],
      });

      await this.postTemplatedStatus({
        name: "command-flush",
        variables: { account },
        options: { visibility, in_reply_to_id: id },
      });
    }

    async isAdminAccount({ account }) {
      const { config } = this;
      const { acct } = account;
      const log = this.logBot();
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
      const log = this.logBot();
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
  };
